import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccessToken } from "@/lib/auth";

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

// 네이버웍스로 메시지 전송
async function sendMessage(userId: string, message: any, channelId?: string) {
    try {
        // channelId가 있으면 채널 메시지, 없으면 사용자 직접 메시지
        const endpoint = channelId
            ? `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/channels/${channelId}/messages`
            : `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/users/${userId}/messages`;

        // Access Token 발급받기
        const accessToken = await getAccessToken();

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
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

        // 메시지 타입 처리
        if (type === "message") {
            const { userId, channelId } = source;
            const { text } = content;

            console.log(
                `메시지 수신: ${
                    channelId ? "채널" : "1:1 채팅"
                } - userId: ${userId}${
                    channelId ? ", channelId: " + channelId : ""
                }`
            );

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
