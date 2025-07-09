import jwt from "jsonwebtoken";

// Access Token 캐시 (메모리에 저장)
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// JWT 생성 및 Access Token 발급
export async function getAccessToken(): Promise<string> {
    // 캐시된 토큰이 있고 아직 유효하면 반환
    if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
        // 1분 여유
        return cachedAccessToken;
    }

    try {
        // 1. JWT 생성
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: process.env.NAVER_WORKS_CLIENT_ID!, // Client ID
            sub: process.env.NAVER_WORKS_SERVICE_ACCOUNT!, // Service Account
            iat: now, // 발급 시간
            exp: now + 3600, // 1시간 후 만료
        };

        const privateKey = process.env.NAVER_WORKS_PRIVATE_KEY!.replace(
            /\\n/g,
            "\n"
        );
        const assertion = jwt.sign(payload, privateKey, {
            algorithm: "RS256",
            header: { alg: "RS256", typ: "JWT" },
        });

        console.log("JWT 생성 완료");

        // 2. Access Token 요청
        const tokenResponse = await fetch(
            "https://auth.worksmobile.com/oauth2/v2.0/token",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    client_id: process.env.NAVER_WORKS_CLIENT_ID!,
                    client_secret: process.env.NAVER_WORKS_CLIENT_SECRET!,
                    assertion: assertion,
                    scope: "bot user.read",
                }),
            }
        );

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(
                "Access Token 발급 실패:",
                tokenResponse.status,
                errorText
            );
            throw new Error(`Access Token 발급 실패: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        console.log("Access Token 발급 성공");

        // 3. 캐시에 저장
        cachedAccessToken = tokenData.access_token;
        tokenExpiresAt = Date.now() + tokenData.expires_in * 1000; // 밀리초로 변환

        return cachedAccessToken!;
    } catch (error) {
        console.error("Access Token 발급 오류:", error);
        throw error;
    }
}
