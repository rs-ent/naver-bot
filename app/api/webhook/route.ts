import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
    createAttendance,
    getTodayAttendance,
    getWeeklyAttendance,
    getAttendanceStats,
    calculateWorkingHours,
} from "@/lib/db";

// 네이버웍스 웹훅 시그니처 검증
function verifySignature(
    signature: string,
    body: string,
    secret: string
): boolean {
    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("base64");

    return signature === expectedSignature;
}

// 버튼 템플릿 메시지 생성
function createAttendanceButtons() {
    return {
        content: {
            type: "button_template",
            contentText:
                "🏢 출근 관리 시스템\n안녕하세요! 오늘도 화이팅하세요 💪",
            i18nContentTexts: [
                {
                    language: "ko_KR",
                    contentText:
                        "🏢 출근 관리 시스템\n안녕하세요! 오늘도 화이팅하세요 💪",
                },
            ],
            actions: [
                {
                    type: "message",
                    label: "🟢 출근하기",
                    postback: "CHECKIN_START",
                },
                {
                    type: "message",
                    label: "🔴 퇴근하기",
                    postback: "CHECKOUT_START",
                },
                {
                    type: "message",
                    label: "📊 출근 현황",
                    postback: "ATTENDANCE_STATUS",
                },
                {
                    type: "message",
                    label: "📷 인증 사진",
                    postback: "PHOTO_AUTH",
                },
            ],
        },
    };
}

// 출근 인증 옵션 버튼
function createCheckinOptions() {
    return {
        content: {
            type: "button_template",
            contentText: `출근 인증을 시작합니다!\n현재 시간: ${new Date().toLocaleString(
                "ko-KR"
            )}\n\n인증 방법을 선택해주세요:`,
            actions: [
                {
                    type: "message",
                    label: "📍 위치 인증",
                    postback: "CHECKIN_LOCATION",
                },
                {
                    type: "message",
                    label: "📷 사진 인증",
                    postback: "CHECKIN_PHOTO",
                },
                {
                    type: "message",
                    label: "✏️ 텍스트 인증",
                    postback: "CHECKIN_TEXT",
                },
                {
                    type: "message",
                    label: "🔄 취소",
                    postback: "CANCEL",
                },
            ],
        },
    };
}

// 네이버웍스로 메시지 전송 - 1:1 채팅과 그룹 채팅 모두 지원
async function sendMessage(userId: string, message: any, channelId?: string) {
    try {
        // channelId가 있으면 채널 메시지, 없으면 사용자 직접 메시지
        const endpoint = channelId
            ? `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/channels/${channelId}/messages`
            : `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/users/${userId}/messages`;

        console.log(
            `메시지 전송 시도: ${channelId ? "채널" : "사용자"} - ${endpoint}`
        );

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.NAVER_WORKS_BOT_SECRET}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("메시지 전송 실패:", response.status, errorText);
            throw new Error(`메시지 전송 실패: ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error("sendMessage 오류:", error);
        throw error;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const signature =
            request.headers.get("X-WORKS-Signature") ||
            request.headers.get("x-works-signature") ||
            "";

        console.log("=== 웹훅 수신 ===");
        console.log("Body:", body);
        console.log("Signature:", signature);

        // Bot Secret을 시그니처 검증에 사용
        if (
            !verifySignature(
                signature,
                body,
                process.env.NAVER_WORKS_BOT_SECRET!
            )
        ) {
            console.log("시그니처 검증 실패");
            return NextResponse.json(
                { error: "Invalid signature" },
                { status: 401 }
            );
        }

        console.log("시그니처 검증 성공");

        const data = JSON.parse(body);
        console.log("파싱된 데이터:", JSON.stringify(data, null, 2));

        const { type, source, content } = data;

        // 메시지 타입별 처리
        if (type === "message") {
            const { userId, channelId } = source;
            const accountId = userId; // userId를 accountId로 사용
            const { text, postback } = content;

            console.log(
                `메시지 수신: ${
                    channelId ? "채널" : "1:1 채팅"
                } - userId: ${userId}${
                    channelId ? ", channelId: " + channelId : ""
                }`
            );

            // 텍스트 명령어 처리
            if (text === "/출근" || text === "/attendance") {
                await sendMessage(
                    accountId,
                    createAttendanceButtons(),
                    channelId
                );
            }

            // 버튼 postback 처리
            else if (postback) {
                switch (postback) {
                    case "CHECKIN_START":
                        await sendMessage(
                            accountId,
                            createCheckinOptions(),
                            channelId
                        );
                        break;

                    case "CHECKIN_PHOTO":
                        await sendMessage(
                            accountId,
                            {
                                content: {
                                    type: "button_template",
                                    contentText:
                                        "📷 출근 인증 사진을 업로드해주세요!\n\n사진을 채팅창에 올려주시면 자동으로 인증됩니다.",
                                    actions: [
                                        {
                                            type: "message",
                                            label: "✅ 사진 업로드 완료",
                                            postback: "PHOTO_UPLOADED",
                                        },
                                        {
                                            type: "message",
                                            label: "🔄 다시 선택",
                                            postback: "CHECKIN_START",
                                        },
                                    ],
                                },
                            },
                            channelId
                        );
                        break;

                    case "CHECKIN_LOCATION":
                        try {
                            const attendance = await createAttendance(
                                accountId,
                                "CHECKIN",
                                "LOCATION"
                            );
                            const timeStr =
                                attendance.timestamp.toLocaleString("ko-KR");
                            const lateMessage = attendance.isLate
                                ? "\n⚠️ 지각 처리되었습니다."
                                : "";

                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: `📍 위치 인증이 완료되었습니다!\n출근 시간: ${timeStr}${lateMessage}\n\n오늘도 좋은 하루 되세요! 😊`,
                                    },
                                },
                                channelId
                            );
                        } catch (error) {
                            console.error("출근 처리 오류:", error);
                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: "❌ 출근 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
                                    },
                                },
                                channelId
                            );
                        }
                        break;

                    case "CHECKIN_TEXT":
                        await sendMessage(
                            accountId,
                            {
                                content: {
                                    type: "text",
                                    text: "✏️ 오늘의 업무 계획을 입력해주세요!\n\n메시지를 보내주시면 텍스트 인증이 완료됩니다.",
                                },
                            },
                            channelId
                        );
                        // 텍스트 입력 대기 상태 저장 (실제로는 세션 관리가 필요)
                        break;

                    case "PHOTO_UPLOADED":
                        await sendMessage(
                            accountId,
                            {
                                content: {
                                    type: "text",
                                    text: "📷 사진을 채팅창에 업로드해주세요!",
                                },
                            },
                            channelId
                        );
                        break;

                    case "ATTENDANCE_STATUS":
                        try {
                            const todayAttendance = await getTodayAttendance(
                                accountId
                            );
                            const stats = await getAttendanceStats(accountId);
                            const workingHours = await calculateWorkingHours(
                                accountId
                            );

                            let statusText = "📊 출근 현황\n\n";
                            statusText += `📅 오늘: ${
                                todayAttendance && todayAttendance.length > 0
                                    ? `✅ ${todayAttendance[0].timestamp.toLocaleTimeString(
                                          "ko-KR",
                                          { hour: "2-digit", minute: "2-digit" }
                                      )} 출근`
                                    : "⏰ 미출근"
                            }\n`;
                            statusText += `⏰ 근무시간: ${workingHours}시간\n\n`;
                            statusText += `📈 이번 달 통계:\n`;
                            statusText += `• 출근: ${
                                stats?.checkinCount || 0
                            }일\n`;
                            statusText += `• 퇴근: ${
                                stats?.checkoutCount || 0
                            }일\n`;
                            statusText += `• 지각: ${stats?.lateCount || 0}일`;

                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: statusText,
                                    },
                                },
                                channelId
                            );
                        } catch (error) {
                            console.error("출근 현황 조회 오류:", error);
                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: "❌ 출근 현황을 조회하는 중 오류가 발생했습니다.",
                                    },
                                },
                                channelId
                            );
                        }
                        break;

                    case "CHECKOUT_START":
                        try {
                            const attendance = await createAttendance(
                                accountId,
                                "CHECKOUT",
                                "MANUAL"
                            );
                            const timeStr =
                                attendance.timestamp.toLocaleString("ko-KR");
                            const workingHours = await calculateWorkingHours(
                                accountId
                            );

                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: `🔴 퇴근 처리가 완료되었습니다!\n퇴근 시간: ${timeStr}\n오늘 근무시간: ${workingHours}시간\n\n오늘도 수고하셨습니다! 👏`,
                                    },
                                },
                                channelId
                            );
                        } catch (error) {
                            console.error("퇴근 처리 오류:", error);
                            await sendMessage(
                                accountId,
                                {
                                    content: {
                                        type: "text",
                                        text: "❌ 퇴근 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
                                    },
                                },
                                channelId
                            );
                        }
                        break;

                    default:
                        await sendMessage(
                            accountId,
                            createAttendanceButtons(),
                            channelId
                        );
                }
            }

            // 일반 텍스트 메시지
            else {
                // 텍스트가 업무 계획인지 확인 (실제로는 세션 관리 필요)
                if (text && text.length > 5 && !text.startsWith("/")) {
                    try {
                        // 텍스트 인증으로 출근 처리
                        const attendance = await createAttendance(
                            accountId,
                            "CHECKIN",
                            "TEXT",
                            {
                                notes: text,
                            }
                        );
                        const timeStr =
                            attendance.timestamp.toLocaleString("ko-KR");
                        const lateMessage = attendance.isLate
                            ? "\n⚠️ 지각 처리되었습니다."
                            : "";

                        await sendMessage(
                            accountId,
                            {
                                content: {
                                    type: "text",
                                    text: `✏️ 텍스트 인증이 완료되었습니다!\n출근 시간: ${timeStr}${lateMessage}\n업무 계획: ${text}\n\n오늘도 좋은 하루 되세요! 😊`,
                                },
                            },
                            channelId
                        );
                    } catch (error) {
                        console.error("텍스트 인증 처리 오류:", error);
                        await sendMessage(
                            accountId,
                            {
                                content: {
                                    type: "text",
                                    text: "안녕하세요! 출근 관리 봇입니다. '/출근' 명령어를 입력해보세요!",
                                },
                            },
                            channelId
                        );
                    }
                } else {
                    await sendMessage(
                        accountId,
                        {
                            content: {
                                type: "text",
                                text: "안녕하세요! 출근 관리 봇입니다. '/출근' 명령어를 입력해보세요!",
                            },
                        },
                        channelId
                    );
                }
            }
        }

        // 이미지 메시지 처리
        else if (type === "image") {
            const { userId, channelId } = source;
            const accountId = userId;

            console.log(
                `이미지 수신: ${
                    channelId ? "채널" : "1:1 채팅"
                } - userId: ${userId}${
                    channelId ? ", channelId: " + channelId : ""
                }`
            );

            try {
                // 이미지 URL 처리 (실제로는 content에서 이미지 정보를 가져와야 함)
                const photoUrl =
                    content?.originalContentUrl || "image_uploaded";
                const attendance = await createAttendance(
                    accountId,
                    "CHECKIN",
                    "PHOTO",
                    {
                        photoUrl: photoUrl,
                    }
                );
                const timeStr = attendance.timestamp.toLocaleString("ko-KR");
                const lateMessage = attendance.isLate
                    ? "\n⚠️ 지각 처리되었습니다."
                    : "";

                await sendMessage(
                    accountId,
                    {
                        content: {
                            type: "text",
                            text: `📷 출근 인증 사진이 등록되었습니다!\n출근 시간: ${timeStr}${lateMessage}\n\n오늘도 좋은 하루 되세요! 😊`,
                        },
                    },
                    channelId
                );
            } catch (error) {
                console.error("사진 인증 처리 오류:", error);
                await sendMessage(
                    accountId,
                    {
                        content: {
                            type: "text",
                            text: "❌ 사진 인증 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
                        },
                    },
                    channelId
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Webhook error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
