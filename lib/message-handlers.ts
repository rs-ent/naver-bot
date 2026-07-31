import {
    WebhookData,
    RequestInfo,
    detectDeviceType,
    analyzeRequestSource,
} from "./webhook";
import {
    getUserInfo,
    sendMessage,
    createPersistentMenu,
    deletePersistentMenu,
    downloadImage,
    UserInfo,
} from "./naver-works";
import {
    saveToGoogleSheet,
    getTodayAttendanceStatus,
    AttendanceData,
    PENDING_ACTION,
} from "./google-sheets";
import { formatWorkStartTime, isLateForWork } from "./work-schedule";
import {
    saveImageToBlob,
    validateImageBuffer,
    extractImageMetadata,
} from "./image-processing";

const userLastCheckinTime = new Map<string, number>();

// 지각 시 보여주는 출근 유형 선택 버튼
const LATE_QUICK_REPLY_ITEMS = [
    {
        action: {
            type: "message",
            label: "늦출/반차/반반차/외근",
            text: "LATE_OPTIONS",
        },
    },
    {
        action: {
            type: "message",
            label: "지각",
            text: "LATE_ARRIVAL",
        },
    },
    {
        action: {
            type: "message",
            label: "지각 + 늦출",
            text: "LATE_AND_LATE_START",
        },
    },
];

// 출근 절차 진행 여부 확인 결과
// 단체 메시지방에서는 버튼이 모두에게 보이므로, '출근하기'를 누른 본인인지 확인해야 한다.
type SessionCheck =
    | { ok: true; targetRow: number | null }
    | { ok: false };

// '출근하기'를 눌러 진행 중인 절차가 있는지 확인한다.
// 진행 중이 아니면 안내 메시지를 보내고 절차를 중단시킨다.
async function requireCheckinSession(
    data: WebhookData,
    userInfo: UserInfo
): Promise<SessionCheck> {
    const { userId, channelId } = data.source;

    let status;
    try {
        status = await getTodayAttendanceStatus(
            { name: userInfo.name, email: userInfo.email },
            new Date(data.issuedTime)
        );
    } catch (error) {
        // 시트 조회가 실패하면 출근 자체를 막지 않는다 (기존 동작 우선)
        console.error("출근 절차 확인 실패, 검증 없이 진행:", error);
        return { ok: true, targetRow: null };
    }

    // 진행 중인 미기록 행이 있으면 본인이 시작한 절차다
    if (status.pendingRow) {
        return { ok: true, targetRow: status.pendingRow };
    }

    const text = status.hasCompletedRecord
        ? `✅ ${userInfo.name}님은 오늘 이미 '${status.completedAction}'(으)로 기록되어 있습니다.\n` +
          `• 기록 시간: ${status.completedTime}\n\n` +
          "수정이 필요하면 관리자에게 문의해주세요."
        : `⚠️ ${userInfo.name}님, 먼저 하단의 '출근하기' 버튼을 눌러주세요.\n\n` +
          "다른 분이 진행 중인 출근 절차의 버튼은 사용할 수 없습니다.";

    await sendMessage(userId, { content: { type: "text", text } }, channelId);

    return { ok: false };
}

// 지각 시간대에 출근을 시도한 경우의 처리
// 유형을 고르지 않고 이탈해도 흔적이 남도록 "미기록" 상태를 유지한 채 선택 버튼을 띄운다.
async function handleLateCheckin(
    data: WebhookData,
    requestInfo?: RequestInfo,
    extra?: {
        userInfo?: UserInfo;
        locationInfo?: AttendanceData["locationInfo"];
        targetRow?: number | null;
    }
): Promise<void> {
    const { userId, channelId, domainId } = data.source;
    const timestamp = new Date(data.issuedTime);

    try {
        const userInfo = extra?.userInfo || (await getUserInfo(userId));

        // 위치 정보 등 이번 단계에서 얻은 내용을 미기록 행에 반영해 둔다
        await saveToGoogleSheet(
            {
                userId,
                domainId,
                action: PENDING_ACTION,
                timestamp: data.issuedTime,
                userInfo,
                requestInfo,
                locationInfo: extra?.locationInfo,
            },
            {
                targetRow: extra?.targetRow,
                replacePendingRow: true,
                skipIfAlreadyRecorded: true,
            }
        );
    } catch (error) {
        // 기록에 실패하더라도 유형 선택 버튼은 띄워야 한다
        console.error("미기록 저장 오류:", error);
    }

    await sendMessage(
        userId,
        {
            content: {
                type: "text",
                text:
                    `⏰ ${formatWorkStartTime(timestamp)}가 넘었습니다.\n` +
                    "출근 유형을 선택해주세요:\n\n" +
                    "※ 선택하지 않으면 '미기록'으로 남습니다.",
                quickReply: {
                    items: LATE_QUICK_REPLY_ITEMS,
                },
            },
        },
        channelId
    );
}

function checkCooldown(
    userId: string,
    cooldownPeriodMs: number = 30000
): {
    isInCooldown: boolean;
    remainingSeconds: number;
} {
    const currentTime = Date.now();
    const lastCheckinTime = userLastCheckinTime.get(userId) || 0;
    const timeDiff = currentTime - lastCheckinTime;

    if (timeDiff < cooldownPeriodMs) {
        const remainingSeconds = Math.ceil(
            (cooldownPeriodMs - timeDiff) / 1000
        );
        return { isInCooldown: true, remainingSeconds };
    }

    return { isInCooldown: false, remainingSeconds: 0 };
}

function updateLastCheckinTime(userId: string): void {
    userLastCheckinTime.set(userId, Date.now());
}

// 텍스트 메시지 핸들러
export async function handleTextMessage(
    data: WebhookData,
    requestInfo?: RequestInfo
): Promise<void> {
    const { source, content } = data;
    const { userId, channelId, domainId } = source;
    const { text } = content;

    console.log(`텍스트 메시지 처리: ${text}`);

    // /test 명령어 처리
    if (text === "/test") {
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: "Hello, World!",
                },
            },
            channelId
        );
        return;
    }

    // /menu 명령어 처리 (Persistent Menu 등록)
    if (text === "/menu") {
        try {
            await createPersistentMenu();
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "✅ 출근하기 버튼이 등록되었습니다!\n이제 하단에 '출근하기' 버튼을 사용할 수 있습니다.",
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("메뉴 등록 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 메뉴 등록 중 오류가 발생했습니다. 다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // /delete-menu 명령어 처리 (Persistent Menu 삭제)
    if (text === "/delete-menu") {
        try {
            await deletePersistentMenu();
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "✅ 출근하기 버튼이 삭제되었습니다!\n메뉴를 다시 등록하려면 /menu 명령어를 사용하세요.",
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("메뉴 삭제 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 메뉴 삭제 중 오류가 발생했습니다. 다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // /help 명령어 처리 (도움말)
    if (text === "/help") {
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text:
                        "🤖 네이버웍스 출근 봇 도움말\n\n" +
                        "📝 사용 가능한 명령어:\n" +
                        "• /test - 연결 테스트\n" +
                        "• /menu - 위치 기반 출근 버튼 등록\n" +
                        "• /delete-menu - 출근 버튼 삭제\n" +
                        "• /channelid - 이 메시지방의 채널 ID 확인 (관리자용)\n" +
                        "• /help - 도움말 보기\n\n" +
                        "📍 위치 기반 출근:\n" +
                        "• '출근하기' 버튼을 누르면 위치 정보를 요청합니다\n" +
                        "• 위치 정보와 함께 출근이 기록되어 관리자가 확인할 수 있습니다\n" +
                        "• 재택근무와 사무실 근무를 구분할 수 있습니다\n\n" +
                        "📸 이미지 업로드:\n" +
                        "• 채팅창에 이미지를 업로드하면 자동으로 압축하여 저장됩니다\n" +
                        "• 이미지 링크가 제공되어 언제든지 확인할 수 있습니다\n\n" +
                        "📊 기록 관리:\n" +
                        "• 모든 출근 기록은 구글 시트에 자동으로 저장됩니다\n" +
                        "• 위치 정보, IP 주소, 시간 등이 함께 기록됩니다\n\n" +
                        "문의사항이 있으시면 관리자에게 문의해주세요! 😊",
                },
            },
            channelId
        );
        return;
    }

    // /channelid 명령어 처리 (출근 알림을 보낼 메시지방 ID 확인용)
    if (text === "/channelid") {
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: channelId
                        ? `📡 이 메시지방의 채널 ID입니다:\n\n${channelId}\n\n` +
                          "이 값을 NAVER_WORKS_REMINDER_CHANNEL_ID 환경 변수에 넣으면\n" +
                          "출근 시간 5분 전 미체크 인원 알림이 이 방으로 전송됩니다."
                        : "❌ 1:1 대화에는 채널 ID가 없습니다.\n알림을 보낼 단체 메시지방에서 다시 입력해주세요.",
                },
            },
            channelId
        );
        return;
    }

    // CHECKIN_LOCATION 메시지 처리 (Persistent Menu에서 온 요청 = 출근 절차 시작)
    if (text === "CHECKIN_LOCATION") {
        const userInfo = await getUserInfo(userId);

        // 절차를 시작한 사람을 "미기록"으로 먼저 남긴다.
        // 이 행은 뒤 단계에서 본인 확인용 표식으로도 쓰인다.
        try {
            const status = await getTodayAttendanceStatus(
                { name: userInfo.name, email: userInfo.email },
                new Date(data.issuedTime)
            );

            if (status.hasCompletedRecord) {
                await sendMessage(
                    userId,
                    {
                        content: {
                            type: "text",
                            text:
                                `✅ ${userInfo.name}님은 오늘 이미 '${status.completedAction}'(으)로 기록되어 있습니다.\n` +
                                `• 기록 시간: ${status.completedTime}\n\n` +
                                "수정이 필요하면 관리자에게 문의해주세요.",
                        },
                    },
                    channelId
                );
                return;
            }

            await saveToGoogleSheet(
                {
                    userId,
                    domainId,
                    action: PENDING_ACTION,
                    timestamp: data.issuedTime,
                    userInfo,
                    requestInfo,
                },
                { targetRow: status.pendingRow }
            );
        } catch (error) {
            // 기록에 실패해도 출근 절차 자체는 진행시킨다
            console.error("출근 절차 시작 기록 오류:", error);
        }

        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: `📍 ${userInfo.name}님, 위치 정보와 함께 출근을 기록하시겠습니까?\n\n⚠️ 주의: 정확한 현재 위치를 선택해주세요.\n임의 위치 선택 시 관리자가 확인할 수 있습니다.`,
                    quickReply: {
                        items: [
                            {
                                action: {
                                    type: "location",
                                    label: "📍 실제 현재 위치로 출근하기",
                                },
                            },
                            {
                                action: {
                                    type: "message",
                                    label: "🏢 위치 없이 출근하기",
                                    text: "CHECKIN_SIMPLE",
                                },
                            },
                        ],
                    },
                },
            },
            channelId
        );
        return;
    }

    // CHECKIN_SIMPLE 메시지 처리 (위치 없이 출근)
    if (text === "CHECKIN_SIMPLE") {
        try {
            const cooldownCheck = checkCooldown(userId);

            if (cooldownCheck.isInCooldown) {
                await sendMessage(
                    userId,
                    {
                        content: {
                            type: "text",
                            text: `⏰ 잠시 후 다시 눌러주세요.\n${cooldownCheck.remainingSeconds}초 후에 다시 시도할 수 있습니다.`,
                        },
                    },
                    channelId
                );
                return;
            }

            updateLastCheckinTime(userId);

            const userInfo = await getUserInfo(userId);

            // 본인이 '출근하기'로 시작한 절차인지 확인
            const session = await requireCheckinSession(data, userInfo);
            if (!session.ok) return;

            // 시간 체크 및 지각 여부 판단 (요일별 기준 시각 적용)
            if (isLateForWork(new Date(data.issuedTime))) {
                // 지각인 경우 미기록으로 남기고 추가 옵션 버튼 표시
                await handleLateCheckin(data, requestInfo, {
                    userInfo,
                    targetRow: session.targetRow,
                });
                return;
            }

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "출근",
                timestamp: data.issuedTime,
                userInfo,
                requestInfo: requestInfo,
            };

            await saveToGoogleSheet(attendanceData, {
                targetRow: session.targetRow,
            });

            // 요청 소스 분석
            const sourceAnalysis = requestInfo
                ? analyzeRequestSource(requestInfo)
                : null;

            let responseText =
                "🟢 출근이 완료되었습니다!\n\n📊 출근 정보:\n• 시간: " +
                new Date(data.issuedTime).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                }) +
                "\n• 이름: " +
                userInfo.name +
                "\n• 이메일: " +
                userInfo.email +
                "\n• 부서: " +
                userInfo.department;

            // 필요한 경우에만 지역 정보 표시
            if (requestInfo && sourceAnalysis) {
                if (
                    requestInfo.country &&
                    requestInfo.country !== "KR" &&
                    requestInfo.country !== "Korea"
                ) {
                    responseText += `\n• 접속 지역: ${sourceAnalysis.locationInfo}`;
                }
            }

            responseText += "\n\n구글 시트에 기록되었습니다! ✅";

            // 위치 정보 권장 안내
            responseText +=
                "\n\n📍 다음번에는 위치 정보와 함께 출근해보세요!\n" +
                "위치 정보가 있으면 관리자가 출근 위치를 확인할 수 있습니다.";

            // 필요한 경우에만 간단한 안내 메시지
            if (sourceAnalysis?.riskLevel === "high") {
                responseText +=
                    "\n\n🚨 해외 접속이 감지되었습니다. 관리자와 상의해주세요.";
            } else if (sourceAnalysis?.riskLevel === "medium") {
                responseText +=
                    "\n\n📱 모바일에서 출근하신 경우 관리자와 상의해주세요.";
            }

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: responseText,
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("출근 처리 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 출근 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // 지각 관련 버튼 메시지 처리
    if (text === "LATE_OPTIONS") {
        const userInfo = await getUserInfo(userId);

        // 본인이 '출근하기'로 시작한 절차인지 확인
        const session = await requireCheckinSession(data, userInfo);
        if (!session.ok) return;

        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: `${userInfo.name}님, 출근 유형을 선택해주세요:`,
                    quickReply: {
                        items: [
                            {
                                action: {
                                    type: "message",
                                    label: "늦출",
                                    text: "LATE_START",
                                },
                            },
                            {
                                action: {
                                    type: "message",
                                    label: "반차",
                                    text: "HALF_DAY",
                                },
                            },
                            {
                                action: {
                                    type: "message",
                                    label: "반반차",
                                    text: "QUARTER_DAY",
                                },
                            },
                            {
                                action: {
                                    type: "message",
                                    label: "외근",
                                    text: "BUSINESS_TRIP",
                                },
                            },
                        ],
                    },
                },
            },
            channelId
        );
        return;
    }

    if (text === "LATE_ARRIVAL") {
        try {
            const userInfo = await getUserInfo(userId);

            // 본인이 '출근하기'로 시작한 절차인지 확인
            const session = await requireCheckinSession(data, userInfo);
            if (!session.ok) return;

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "지각",
                timestamp: data.issuedTime,
                userInfo,
                requestInfo: requestInfo,
            };

            // 출근하기를 눌렀을 때 남긴 "미기록" 행을 갱신
            await saveToGoogleSheet(attendanceData, {
                targetRow: session.targetRow,
                replacePendingRow: true,
            });

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: `⏰ 지각이 기록되었습니다!\n\n📊 출근 정보:\n• 시간: ${new Date(
                            data.issuedTime
                        ).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                        })}\n• 이름: ${userInfo.name}\n• 부서: ${
                            userInfo.department
                        }\n\n구글 시트에 기록되었습니다! ✅`,
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("지각 처리 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 지각 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    if (text === "LATE_AND_LATE_START") {
        try {
            const userInfo = await getUserInfo(userId);

            // 본인이 '출근하기'로 시작한 절차인지 확인
            const session = await requireCheckinSession(data, userInfo);
            if (!session.ok) return;

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "지각",
                timestamp: data.issuedTime,
                userInfo,
                requestInfo: requestInfo,
            };

            // 출근하기를 눌렀을 때 남긴 "미기록" 행을 갱신
            await saveToGoogleSheet(attendanceData, {
                targetRow: session.targetRow,
                replacePendingRow: true,
            });

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: `⏰ 지각 + 늦출이 기록되었습니다!\n\n📊 출근 정보:\n• 시간: ${new Date(
                            data.issuedTime
                        ).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                        })}\n• 이름: ${userInfo.name}\n• 부서: ${
                            userInfo.department
                        }\n\n구글 시트에 기록되었습니다! ✅`,
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("지각+늦출 처리 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // 기존 지각 관련 버튼들 처리
    if (
        text === "LATE_START" ||
        text === "HALF_DAY" ||
        text === "QUARTER_DAY" ||
        text === "BUSINESS_TRIP"
    ) {
        try {
            const userInfo = await getUserInfo(userId);

            // 본인이 '출근하기'로 시작한 절차인지 확인
            const session = await requireCheckinSession(data, userInfo);
            if (!session.ok) return;

            const actionMap: { [key: string]: string } = {
                LATE_START: "늦출",
                HALF_DAY: "반차",
                QUARTER_DAY: "반반차",
                BUSINESS_TRIP: "외근",
            };

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: actionMap[text],
                timestamp: data.issuedTime,
                userInfo,
                requestInfo: requestInfo,
            };

            // 출근하기를 눌렀을 때 남긴 "미기록" 행을 갱신
            await saveToGoogleSheet(attendanceData, {
                targetRow: session.targetRow,
                replacePendingRow: true,
            });

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: `✅ ${
                            actionMap[text]
                        } 기록되었습니다!\n\n📊 출근 정보:\n• 시간: ${new Date(
                            data.issuedTime
                        ).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                        })}\n• 이름: ${userInfo.name}\n• 부서: ${
                            userInfo.department
                        }\n\n구글 시트에 기록되었습니다! ✅`,
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("늦출/반차/반반차/외근 처리 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // 기본 응답 (필요시 추가)
    console.log("처리되지 않은 텍스트 메시지:", text);
}

// 이미지 메시지 핸들러
export async function handleImageMessage(
    data: WebhookData,
    requestInfo?: RequestInfo
): Promise<void> {
    const { source, content, issuedTime } = data;
    const { userId, channelId, domainId } = source;
    const { fileId } = content;

    if (!fileId) {
        console.error("이미지 파일 ID가 없습니다.");
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: "❌ 이미지를 처리할 수 없습니다. 다시 시도해주세요.",
                },
            },
            channelId
        );
        return;
    }

    try {
        console.log("이미지 메시지 처리 시작:", fileId);

        // 네이버웍스에서 이미지 다운로드 (fileId 사용)
        const imageBuffer = await downloadImage(fileId);

        // 이미지 유효성 검증
        if (!validateImageBuffer(imageBuffer)) {
            throw new Error("유효하지 않은 이미지 파일입니다.");
        }

        // 이미지 메타데이터 추출
        const imageMetadata = await extractImageMetadata(imageBuffer);

        // Vercel Blob에 압축하여 저장
        const blobUrl = await saveImageToBlob(imageBuffer, userId, issuedTime);

        // 사용자 정보 조회
        const userInfo = await getUserInfo(userId);

        // 구글 시트에 이미지 기록 저장
        const attendanceData: AttendanceData = {
            userId,
            domainId,
            action: "이미지업로드",
            timestamp: issuedTime,
            imageUrl: blobUrl,
            userInfo,
            requestInfo,
        };

        await saveToGoogleSheet(attendanceData);

        // 사용자에게 완료 메시지 전송 (이미지 URL 콜백 포함)
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text:
                        `📸 이미지가 성공적으로 업로드되었습니다!\n\n` +
                        `👤 업로드 정보:\n` +
                        `• 시간: ${new Date(issuedTime).toLocaleString(
                            "ko-KR",
                            { timeZone: "Asia/Seoul" }
                        )}\n` +
                        `• 이름: ${userInfo.name}\n` +
                        `• 부서: ${userInfo.department}\n\n` +
                        `📊 이미지 정보:\n` +
                        `• 크기: ${imageMetadata.width}x${imageMetadata.height}\n` +
                        `• 형식: ${imageMetadata.format.toUpperCase()}\n` +
                        `• 파일 크기: ${Math.round(
                            imageMetadata.size / 1024
                        )}KB\n\n` +
                        `🔗 이미지 링크: ${blobUrl}\n\n` +
                        `구글 시트에 기록되었습니다! ✅`,
                },
            },
            channelId
        );

        // 추가: 이미지 링크 제공 (텍스트 메시지)
        const imageLinks =
            `📷 업로드된 이미지 (${imageMetadata.width}x${
                imageMetadata.height
            }, ${Math.round(imageMetadata.size / 1024)}KB)\n\n` +
            `🖼️ 이미지 보기/다운로드:\n${blobUrl}`;

        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: imageLinks,
                },
            },
            channelId
        );

        // 추가: 이미지 미리보기 메시지 (네이버웍스에서 지원하는 경우)
        try {
            await sendMessage(
                userId,
                {
                    content: {
                        type: "image",
                        resourceUrl: blobUrl,
                        altText: `업로드된 이미지 (${userInfo.name})`,
                    },
                },
                channelId
            );
        } catch (previewError) {
            console.warn("이미지 미리보기 전송 실패:", previewError);
            // 미리보기 실패 시 무시하고 계속 진행
        }
    } catch (error) {
        console.error("이미지 처리 오류:", error);
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: "❌ 이미지 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                },
            },
            channelId
        );
    }
}

// 위치 메시지 핸들러
export async function handleLocationMessage(
    data: WebhookData,
    requestInfo?: RequestInfo
): Promise<void> {
    const { source, content, issuedTime } = data;
    const { userId, channelId, domainId } = source;
    const { address, latitude, longitude } = content;

    console.log(`위치 메시지 처리: ${address} (${latitude}, ${longitude})`);

    try {
        // 사용자 정보 조회
        const userInfo = await getUserInfo(userId);

        // 본인이 '출근하기'로 시작한 절차인지 확인
        const session = await requireCheckinSession(data, userInfo);
        if (!session.ok) return;

        // 위치 검증 로직
        let isVerified = true;
        let verificationNotes = "";

        if (latitude && longitude) {
            // 일반적이지 않은 위치 패턴 감지
            const isRoundCoordinate =
                latitude % 1 === 0 ||
                longitude % 1 === 0 || // 정수 좌표
                latitude.toString().split(".")[1]?.length <= 2 ||
                longitude.toString().split(".")[1]?.length <= 2; // 소수점 2자리 이하

            if (isRoundCoordinate) {
                isVerified = false;
                verificationNotes =
                    "선택된 위치일 가능성 있음 (정확도 낮은 좌표)";
            }
        }

        const locationInfo = {
            address,
            latitude,
            longitude,
            isVerified,
            verificationNotes,
        };

        // 시간 체크 및 지각 여부 판단 (요일별 기준 시각 적용)
        if (isLateForWork(new Date(issuedTime))) {
            // 지각인 경우 위치 정보를 포함해 미기록으로 남기고 유형 선택 버튼 표시
            await handleLateCheckin(data, requestInfo, {
                userInfo,
                locationInfo,
                targetRow: session.targetRow,
            });
            return;
        }

        // 구글 시트에 위치 기반 출근 기록 저장
        const attendanceData: AttendanceData = {
            userId,
            domainId,
            action: "위치출근",
            timestamp: issuedTime,
            userInfo,
            requestInfo,
            locationInfo,
        };

        await saveToGoogleSheet(attendanceData, {
            targetRow: session.targetRow,
        });

        // 위치 기반 출근 완료 메시지
        let responseText =
            "🟢 출근이 완료되었습니다!\n\n" +
            "📊 출근 정보:\n" +
            `• 시간: ${new Date(issuedTime).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
            })}\n` +
            `• 이름: ${userInfo.name}\n` +
            `• 이메일: ${userInfo.email}\n` +
            `• 부서: ${userInfo.department}`;

        if (address) {
            responseText += `\n• 출근 위치: ${address}`;
        }

        if (latitude && longitude) {
            responseText += `\n• 좌표: ${latitude.toFixed(
                6
            )}, ${longitude.toFixed(6)}`;
        }

        responseText += "\n\n구글 시트에 기록되었습니다! ✅";

        // 위치 검증 경고 (관리자용 참고사항)
        if (latitude && longitude) {
            // 일반적이지 않은 위치 패턴 감지
            const isRoundCoordinate =
                latitude % 1 === 0 ||
                longitude % 1 === 0 || // 정수 좌표
                latitude.toString().split(".")[1]?.length <= 2 ||
                longitude.toString().split(".")[1]?.length <= 2; // 소수점 2자리 이하

            if (isRoundCoordinate) {
                responseText +=
                    "\n\n⚠️ 관리자 확인: 선택된 위치일 가능성이 있습니다.";
            }
        }

        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: responseText,
                },
            },
            channelId
        );

        // 추가: 위치 정보 링크 제공 (텍스트 메시지)
        if (latitude && longitude) {
            const mapLinks =
                `🗺️ 지도에서 확인하기:\n\n` +
                `📍 구글 지도: https://maps.google.com/?q=${latitude},${longitude}\n` +
                `🧭 네이버 지도: https://map.naver.com/v5/search/${latitude},${longitude}\n\n` +
                `📋 좌표: ${latitude}, ${longitude}`;

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: mapLinks,
                    },
                },
                channelId
            );
        }
    } catch (error) {
        console.error("위치 메시지 처리 오류:", error);
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: "❌ 위치 정보 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                },
            },
            channelId
        );
    }
}

// 포스트백 메시지 핸들러
export async function handlePostbackMessage(
    data: WebhookData,
    requestInfo?: RequestInfo
): Promise<void> {
    const { source, content, issuedTime } = data;
    const { userId, channelId, domainId } = source;
    const { postback } = content;

    console.log(`포스트백 메시지 처리: ${postback}`);

    // 일반 출근 버튼 처리 (기존 버튼은 더 이상 사용되지 않음)
    if (postback === "CHECKIN_ACTION" || postback === "CHECKIN_SIMPLE") {
        try {
            const cooldownCheck = checkCooldown(userId);

            if (cooldownCheck.isInCooldown) {
                await sendMessage(
                    userId,
                    {
                        content: {
                            type: "text",
                            text: `⏰ 잠시 후 다시 눌러주세요.\n${cooldownCheck.remainingSeconds}초 후에 다시 시도할 수 있습니다.`,
                        },
                    },
                    channelId
                );
                return;
            }

            updateLastCheckinTime(userId);

            // 시간 체크 및 지각 여부 판단 (요일별 기준 시각 적용)
            if (isLateForWork(new Date(issuedTime))) {
                // 지각인 경우 미기록으로 남기고 추가 옵션 버튼 표시
                await handleLateCheckin(data, requestInfo);
                return;
            }

            const userInfo = await getUserInfo(userId);

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "출근",
                timestamp: issuedTime,
                userInfo,
                requestInfo,
            };

            await saveToGoogleSheet(attendanceData);

            // 요청 소스 분석 (IP, User-Agent, 지역 등 종합 분석)
            const sourceAnalysis = requestInfo
                ? analyzeRequestSource(requestInfo)
                : null;

            let responseText =
                "🟢 출근이 완료되었습니다!\n\n📊 출근 정보:\n• 시간: " +
                new Date(issuedTime).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                }) +
                "\n• 이름: " +
                userInfo.name +
                "\n• 이메일: " +
                userInfo.email +
                "\n• 부서: " +
                userInfo.department;

            // 필요한 경우에만 지역 정보 표시
            if (requestInfo && sourceAnalysis) {
                // 해외 접속인 경우에만 지역 정보 표시
                if (
                    requestInfo.country &&
                    requestInfo.country !== "KR" &&
                    requestInfo.country !== "Korea"
                ) {
                    responseText += `\n• 접속 지역: ${sourceAnalysis.locationInfo}`;
                }
            }

            responseText += "\n\n구글 시트에 기록되었습니다! ✅";

            // 위치 정보 권장 안내
            responseText +=
                "\n\n📍 다음번에는 '출근하기' 버튼을 눌러 위치 정보와 함께 출근해주세요!\n" +
                "위치 정보가 있으면 관리자가 출근 위치를 확인할 수 있습니다.";

            // 필요한 경우에만 간단한 안내 메시지
            if (sourceAnalysis?.riskLevel === "high") {
                responseText +=
                    "\n\n🚨 해외 접속이 감지되었습니다. 관리자와 상의해주세요.";
            } else if (sourceAnalysis?.riskLevel === "medium") {
                responseText +=
                    "\n\n📱 모바일에서 출근하신 경우 관리자와 상의해주세요.";
            }

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: responseText,
                    },
                },
                channelId
            );
        } catch (error) {
            console.error("출근 처리 오류:", error);
            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 출근 처리 중 오류가 발생했습니다.\n다시 시도해주세요.",
                    },
                },
                channelId
            );
        }
        return;
    }

    // 기본 응답 (필요시 추가)
    console.log("처리되지 않은 포스트백:", postback);
}

// 메시지 라우터 - 메시지 타입에 따라 적절한 핸들러 호출
export async function routeMessage(
    data: WebhookData,
    requestInfo?: RequestInfo
): Promise<void> {
    const { type, content } = data;

    // 메시지 타입이 아닌 경우 무시
    if (type !== "message") {
        console.log("메시지 타입이 아닙니다. 무시합니다:", type);
        return;
    }

    const { type: contentType, text, postback } = content;

    try {
        // 포스트백 메시지 처리
        if (postback) {
            await handlePostbackMessage(data, requestInfo);
            return;
        }

        // 콘텐츠 타입에 따른 처리
        switch (contentType) {
            case "text":
                if (text) {
                    await handleTextMessage(data, requestInfo);
                }
                break;
            case "image":
                await handleImageMessage(data, requestInfo);
                break;
            case "location":
                await handleLocationMessage(data, requestInfo);
                break;
            default:
                console.log("지원하지 않는 콘텐츠 타입:", contentType);
        }
    } catch (error) {
        console.error("메시지 라우팅 오류:", error);
        // 오류 발생 시 사용자에게 일반적인 오류 메시지 전송
        try {
            await sendMessage(
                data.source.userId,
                {
                    content: {
                        type: "text",
                        text: "❌ 메시지 처리 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.",
                    },
                },
                data.source.channelId
            );
        } catch (sendError) {
            console.error("오류 메시지 전송 실패:", sendError);
        }
    }
}
