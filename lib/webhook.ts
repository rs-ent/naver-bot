import crypto from "crypto";
import { NextRequest } from "next/server";

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

// 요청 정보 타입 정의
export interface RequestInfo {
    ip: string;
    userAgent: string;
    country?: string;
    city?: string;
    timestamp: string;
    headers: Record<string, string>;
}

// IP 기반 추가 정보 추출 (향후 확장 가능)
export function analyzeRequestSource(requestInfo: RequestInfo): {
    isLikelyMobile: boolean;
    isLikelyOffice: boolean;
    locationInfo: string;
    riskLevel: "low" | "medium" | "high";
    recommendations: string[];
} {
    const recommendations: string[] = [];
    let isLikelyMobile = false;
    let isLikelyOffice = false;
    let riskLevel: "low" | "medium" | "high" = "low";

    // User-Agent 기반 분석
    const deviceCheck = detectDeviceType(requestInfo.userAgent);
    if (!deviceCheck.isDesktop) {
        isLikelyMobile = true;
        riskLevel = "medium";
        recommendations.push("데스크톱에서 출근 등록을 권장합니다");
    }

    // IP 주소 패턴 분석 (일반적인 패턴들)
    const ip = requestInfo.ip;
    if (ip !== "unknown") {
        // 사설 IP 대역 체크
        if (
            ip.startsWith("192.168.") ||
            ip.startsWith("10.") ||
            ip.startsWith("172.")
        ) {
            isLikelyOffice = true;
            recommendations.push("사내 네트워크에서 접속 중입니다");
        }
        // 모바일 통신사 IP 패턴 (한국 기준 예시)
        else if (ip.includes("mobile") || ip.includes("lte")) {
            isLikelyMobile = true;
            riskLevel = "high";
            recommendations.push("모바일 네트워크에서 접속한 것으로 보입니다");
        }
    }

    // 지리적 위치 정보
    let locationInfo = "위치 정보 없음";
    if (requestInfo.country) {
        locationInfo = requestInfo.country;
        if (requestInfo.city) {
            locationInfo += ` (${requestInfo.city})`;
        }

        // 한국 외 지역에서 접속 시 위험도 증가
        if (requestInfo.country !== "KR" && requestInfo.country !== "Korea") {
            riskLevel = "high";
            recommendations.push(
                "해외에서 접속한 것으로 보입니다. 관리자 확인 필요"
            );
        }
    }

    // User-Agent가 너무 단순하거나 이상한 경우
    if (
        requestInfo.userAgent === "unknown" ||
        requestInfo.userAgent.length < 20
    ) {
        riskLevel = "high";
        recommendations.push("비정상적인 접속 환경이 감지되었습니다");
    }

    return {
        isLikelyMobile,
        isLikelyOffice,
        locationInfo,
        riskLevel,
        recommendations,
    };
}

// 디바이스 타입 감지
export function detectDeviceType(userAgent: string): {
    type: "desktop" | "mobile" | "tablet" | "unknown";
    isDesktop: boolean;
    deviceInfo: string;
} {
    const ua = userAgent.toLowerCase();

    // 모바일 디바이스 패턴
    const mobilePatterns = [
        /android/i,
        /iphone/i,
        /ipod/i,
        /blackberry/i,
        /windows phone/i,
        /mobile/i,
    ];

    // 태블릿 디바이스 패턴
    const tabletPatterns = [/ipad/i, /android(?!.*mobile)/i, /tablet/i];

    // 데스크톱 OS 패턴
    const desktopPatterns = [
        /windows nt/i,
        /macintosh/i,
        /mac os x/i,
        /linux/i,
        /x11/i,
    ];

    let deviceInfo = "";
    let type: "desktop" | "mobile" | "tablet" | "unknown" = "unknown";

    // 태블릿 체크 (모바일보다 먼저 체크)
    if (tabletPatterns.some((pattern) => pattern.test(ua))) {
        type = "tablet";
        if (/ipad/i.test(ua)) deviceInfo = "iPad";
        else if (/android/i.test(ua)) deviceInfo = "Android Tablet";
        else deviceInfo = "Tablet";
    }
    // 모바일 체크
    else if (mobilePatterns.some((pattern) => pattern.test(ua))) {
        type = "mobile";
        if (/iphone/i.test(ua)) deviceInfo = "iPhone";
        else if (/android/i.test(ua)) deviceInfo = "Android Phone";
        else if (/blackberry/i.test(ua)) deviceInfo = "BlackBerry";
        else if (/windows phone/i.test(ua)) deviceInfo = "Windows Phone";
        else deviceInfo = "Mobile Device";
    }
    // 데스크톱 체크
    else if (desktopPatterns.some((pattern) => pattern.test(ua))) {
        type = "desktop";
        if (/windows nt/i.test(ua)) deviceInfo = "Windows PC";
        else if (/macintosh|mac os x/i.test(ua)) deviceInfo = "Mac";
        else if (/linux/i.test(ua)) deviceInfo = "Linux PC";
        else deviceInfo = "Desktop";
    }

    return {
        type,
        isDesktop: type === "desktop",
        deviceInfo,
    };
}

// 요청 정보 추출
export function extractRequestInfo(request: NextRequest): RequestInfo {
    const headers = Object.fromEntries(request.headers.entries());

    const ip =
        headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        headers["x-real-ip"] ||
        headers["cf-connecting-ip"] ||
        headers["x-client-ip"] ||
        "unknown";

    const userAgent = headers["user-agent"] || "unknown";

    const country = headers["cf-ipcountry"] || headers["x-vercel-ip-country"];
    const city = headers["x-vercel-ip-city"];

    return {
        ip,
        userAgent,
        country,
        city,
        timestamp: new Date().toISOString(),
        headers: {
            "x-forwarded-for": headers["x-forwarded-for"] || "",
            "user-agent": userAgent,
            "accept-language": headers["accept-language"] || "",
            "cf-ipcountry": headers["cf-ipcountry"] || "",
            "x-vercel-ip-country": headers["x-vercel-ip-country"] || "",
            "x-vercel-ip-city": headers["x-vercel-ip-city"] || "",
            // 추가 헤더들 (디버깅용)
            "x-real-ip": headers["x-real-ip"] || "",
            "cf-connecting-ip": headers["cf-connecting-ip"] || "",
            "x-client-ip": headers["x-client-ip"] || "",
            "cf-ray": headers["cf-ray"] || "",
            "x-vercel-deployment-url": headers["x-vercel-deployment-url"] || "",
            "x-vercel-proxy-signature":
                headers["x-vercel-proxy-signature"] || "",
        },
    };
}

// 웹훅 로깅 도우미
export function logWebhookEvent(
    data: WebhookData,
    requestInfo?: RequestInfo
): void {
    console.log("=== 웹훅 이벤트 수신 ===");
    console.log("- 타입:", data.type);
    console.log("- 사용자 ID:", data.source.userId);
    console.log("- 채널 ID:", data.source.channelId || "없음");
    console.log("- 도메인 ID:", data.source.domainId);
    console.log("- 콘텐츠 타입:", data.content.type);
    console.log("- 시간:", data.issuedTime);

    if (requestInfo) {
        console.log("=== 요청 정보 ===");
        console.log("- IP 주소:", requestInfo.ip);
        console.log("- User Agent:", requestInfo.userAgent);
        if (requestInfo.country) {
            console.log("- 국가:", requestInfo.country);
        }
        if (requestInfo.city) {
            console.log("- 도시:", requestInfo.city);
        }

        // 모든 헤더 정보 로깅 (디버깅용)
        console.log("=== 모든 헤더 정보 ===");
        Object.entries(requestInfo.headers).forEach(([key, value]) => {
            if (value) {
                console.log(`- ${key}: ${value}`);
            }
        });
    }

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
