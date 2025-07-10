import crypto from "crypto";

// 네이버웍스 웹훅 시그니처 검증
export function verifySignature(
    signature: string,
    body: string,
    secret: string
): boolean {
    try {
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(body)
            .digest("base64");

        return signature === expectedSignature;
    } catch (error) {
        console.error("시그니처 검증 오류:", error);
        return false;
    }
}

// 웹훅 데이터 타입 정의
export interface WebhookData {
    type: string;
    source: {
        userId: string;
        channelId?: string;
        domainId: number;
    };
    content: {
        text?: string;
        postback?: string;
        type: string;
        fileId?: string; // 이미지, 파일, 오디오, 비디오 메시지의 리소스 ID
        // 위치 정보 관련 필드들
        address?: string;
        latitude?: number;
        longitude?: number;
        // 스티커 관련 필드들
        packageId?: string;
        stickerId?: string;
    };
    issuedTime: string;
}

// 웹훅 데이터 유효성 검증
export function validateWebhookData(data: any): data is WebhookData {
    try {
        // 필수 필드 검증
        if (!data.type || !data.source || !data.content || !data.issuedTime) {
            console.warn("웹훅 데이터에 필수 필드가 누락되었습니다:", data);
            return false;
        }

        // source 필드 검증
        if (!data.source.userId || !data.source.domainId) {
            console.warn(
                "웹훅 소스 데이터에 필수 필드가 누락되었습니다:",
                data.source
            );
            return false;
        }

        // content 필드 검증
        if (!data.content.type) {
            console.warn(
                "웹훅 콘텐츠 데이터에 type 필드가 누락되었습니다:",
                data.content
            );
            return false;
        }

        // 타임스탬프 유효성 검증
        const timestamp = new Date(data.issuedTime);
        if (isNaN(timestamp.getTime())) {
            console.warn(
                "웹훅 타임스탬프가 유효하지 않습니다:",
                data.issuedTime
            );
            return false;
        }

        return true;
    } catch (error) {
        console.error("웹훅 데이터 유효성 검증 오류:", error);
        return false;
    }
}

// 웹훅 헤더 추출 및 검증
export function extractWebhookHeaders(headers: Headers): {
    signature: string;
    isValid: boolean;
} {
    try {
        const signature =
            headers.get("X-WORKS-Signature") ||
            headers.get("x-works-signature") ||
            "";

        const isValid = signature.length > 0;

        return {
            signature,
            isValid,
        };
    } catch (error) {
        console.error("웹훅 헤더 추출 오류:", error);
        return {
            signature: "",
            isValid: false,
        };
    }
}

// 웹훅 로깅 도우미
export function logWebhookEvent(data: WebhookData): void {
    console.log("=== 웹훅 이벤트 수신 ===");
    console.log("- 타입:", data.type);
    console.log("- 사용자 ID:", data.source.userId);
    console.log("- 채널 ID:", data.source.channelId || "없음");
    console.log("- 도메인 ID:", data.source.domainId);
    console.log("- 콘텐츠 타입:", data.content.type);
    console.log("- 시간:", data.issuedTime);

    if (data.content.text) {
        console.log("- 텍스트:", data.content.text);
    }

    if (data.content.postback) {
        console.log("- 포스트백:", data.content.postback);
    }

    if (data.content.fileId) {
        console.log("- 파일 ID:", data.content.fileId);
    }
}
