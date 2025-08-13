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
} from "./naver-works";
import { saveToGoogleSheet, AttendanceData } from "./google-sheets";
import {
    saveImageToBlob,
    validateImageBuffer,
    extractImageMetadata,
} from "./image-processing";

const userLastCheckinTime = new Map<string, number>();

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

    // CHECKIN_LOCATION 메시지 처리 (Persistent Menu에서 온 요청)
    if (text === "CHECKIN_LOCATION") {
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text: "📍 위치 정보와 함께 출근을 기록하시겠습니까?\n\n⚠️ 주의: 정확한 현재 위치를 선택해주세요.\n임의 위치 선택 시 관리자가 확인할 수 있습니다.",
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

            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "출근",
                timestamp: data.issuedTime,
                userInfo,
                requestInfo: requestInfo,
            };

            await saveToGoogleSheet(attendanceData);

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

        // 구글 시트에 위치 기반 출근 기록 저장
        const attendanceData: AttendanceData = {
            userId,
            domainId,
            action: "위치출근",
            timestamp: issuedTime,
            userInfo,
            requestInfo,
            locationInfo: {
                address,
                latitude,
                longitude,
                isVerified,
                verificationNotes,
            },
        };

        await saveToGoogleSheet(attendanceData);

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
