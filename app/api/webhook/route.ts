import { NextRequest, NextResponse } from "next/server";
import {
    verifySignature,
    validateWebhookData,
    extractWebhookHeaders,
    logWebhookEvent,
} from "@/lib/webhook";
import { routeMessage } from "@/lib/message-handlers";

export async function POST(request: NextRequest) {
    try {
        // 요청 본문 및 헤더 추출
        const body = await request.text();
        const { signature, isValid } = extractWebhookHeaders(request.headers);

        console.log("=== 웹훅 수신 시작 ===");
        console.log("Body 길이:", body.length);
        console.log("Signature 존재 여부:", isValid);

        // 시그니처 검증
        if (
            !isValid ||
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

        // 요청 데이터 파싱
        let data;
        try {
            data = JSON.parse(body);
        } catch (parseError) {
            console.error("JSON 파싱 오류:", parseError);
            return NextResponse.json(
                { error: "Invalid JSON" },
                { status: 400 }
            );
        }

        // 웹훅 데이터 유효성 검증
        if (!validateWebhookData(data)) {
            console.error("웹훅 데이터 유효성 검증 실패");
            return NextResponse.json(
                { error: "Invalid webhook data" },
                { status: 400 }
            );
        }

        // 웹훅 이벤트 로깅
        logWebhookEvent(data);

        // 메시지 처리 라우팅
        await routeMessage(data);

        console.log("=== 웹훅 처리 완료 ===");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Webhook 처리 중 오류 발생:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
