import { WebhookData } from "./webhook";
import {
    getUserInfo,
    sendMessage,
    createPersistentMenu,
    downloadImage,
} from "./naver-works";
import { saveToGoogleSheet, AttendanceData } from "./google-sheets";
import { saveImageToBlob, validateImageBuffer } from "./image-processing";

// 텍스트 메시지 핸들러
export async function handleTextMessage(data: WebhookData): Promise<void> {
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

    // 기본 응답 (필요시 추가)
    console.log("처리되지 않은 텍스트 메시지:", text);
}

// 이미지 메시지 핸들러
export async function handleImageMessage(data: WebhookData): Promise<void> {
    const { source, content, issuedTime } = data;
    const { userId, channelId, domainId } = source;
    const { resourceUrl } = content;

    if (!resourceUrl) {
        console.error("이미지 리소스 URL이 없습니다.");
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
        console.log("이미지 메시지 처리 시작:", resourceUrl);

        // 네이버웍스에서 이미지 다운로드
        const imageBuffer = await downloadImage(resourceUrl);

        // 이미지 유효성 검증
        if (!validateImageBuffer(imageBuffer)) {
            throw new Error("유효하지 않은 이미지 파일입니다.");
        }

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
        };

        await saveToGoogleSheet(attendanceData);

        // 사용자에게 완료 메시지 전송
        await sendMessage(
            userId,
            {
                content: {
                    type: "text",
                    text:
                        `📸 이미지가 성공적으로 업로드되었습니다!\n\n` +
                        `👤 업로드 정보:\n` +
                        `• 시간: ${new Date(issuedTime).toLocaleString(
                            "ko-KR"
                        )}\n` +
                        `• 이름: ${userInfo.name}\n` +
                        `• 부서: ${userInfo.department}\n` +
                        `• 압축된 이미지: ${blobUrl}\n\n` +
                        `구글 시트에 기록되었습니다! ✅`,
                },
            },
            channelId
        );
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

// 포스트백 메시지 핸들러
export async function handlePostbackMessage(data: WebhookData): Promise<void> {
    const { source, content, issuedTime } = data;
    const { userId, channelId, domainId } = source;
    const { postback } = content;

    console.log(`포스트백 메시지 처리: ${postback}`);

    // 출근 버튼 처리
    if (postback === "CHECKIN_ACTION") {
        try {
            // 사용자 정보 조회
            const userInfo = await getUserInfo(userId);

            // 구글 시트에 출근 기록 저장
            const attendanceData: AttendanceData = {
                userId,
                domainId,
                action: "출근",
                timestamp: issuedTime,
                userInfo,
            };

            await saveToGoogleSheet(attendanceData);

            await sendMessage(
                userId,
                {
                    content: {
                        type: "text",
                        text:
                            "🟢 출근이 완료되었습니다!\n\n📊 출근 정보:\n• 시간: " +
                            new Date(issuedTime).toLocaleString("ko-KR") +
                            "\n• 이름: " +
                            userInfo.name +
                            "\n• 이메일: " +
                            userInfo.email +
                            "\n• 부서: " +
                            userInfo.department +
                            "\n• 직급: " +
                            userInfo.level +
                            "\n• 직책: " +
                            userInfo.position +
                            "\n• 사번: " +
                            userInfo.employeeNumber +
                            "\n• 도메인: " +
                            domainId +
                            "\n\n구글 시트에 기록되었습니다! ✅",
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
export async function routeMessage(data: WebhookData): Promise<void> {
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
            await handlePostbackMessage(data);
            return;
        }

        // 콘텐츠 타입에 따른 처리
        switch (contentType) {
            case "text":
                if (text) {
                    await handleTextMessage(data);
                }
                break;
            case "image":
                await handleImageMessage(data);
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
