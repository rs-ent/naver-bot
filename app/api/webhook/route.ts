import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccessToken } from "@/lib/auth";

// 구글 시트 ID 추출 함수
function extractSheetId(url: string | undefined): string {
    if (!url) {
        console.error("GOOGLE_SHEET_URL 환경 변수가 설정되지 않았습니다.");
        return "";
    }
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : "";
}

// Google Service Account JWT 토큰 생성
function createJWT(serviceAccount: any): string {
    // JWT 헤더
    const header = {
        alg: "RS256",
        typ: "JWT",
        kid: serviceAccount.private_key_id, // Key ID 추가
    };

    // JWT 페이로드
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600, // 1시간
    };

    // Base64URL 인코딩
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        "base64url"
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        "base64url"
    );

    // 서명할 데이터
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // 개인키로 서명 생성
    const privateKey = serviceAccount.private_key;
    const signature = crypto.sign(
        "RSA-SHA256",
        Buffer.from(signatureInput),
        privateKey
    );
    const encodedSignature = signature.toString("base64url");

    return `${signatureInput}.${encodedSignature}`;
}

// Google Access Token 획득
async function getGoogleAccessToken(): Promise<string> {
    try {
        // 필수 환경변수 확인
        const requiredEnvs = [
            "GOOGLE_SERVICE_ACCOUNT_TYPE",
            "GOOGLE_SERVICE_ACCOUNT_PROJECT_ID",
            "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID",
            "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
            "GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL",
            "GOOGLE_SERVICE_ACCOUNT_CLIENT_ID",
        ];

        for (const env of requiredEnvs) {
            if (!process.env[env]) {
                throw new Error(`${env} 환경 변수가 설정되지 않았습니다.`);
            }
        }

        // 환경변수로부터 Service Account 객체 구성
        const serviceAccount = {
            type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
            project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
            private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_ID,
            auth_uri:
                process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI ||
                "https://accounts.google.com/o/oauth2/auth",
            token_uri:
                process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI ||
                "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url:
                process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_CERT_URL ||
                "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url:
                process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_CERT_URL,
            universe_domain:
                process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN ||
                "googleapis.com",
        };

        console.log("Service Account 정보 확인:");
        console.log("- 프로젝트 ID:", serviceAccount.project_id);
        console.log("- 클라이언트 이메일:", serviceAccount.client_email);
        console.log("- Private Key ID:", serviceAccount.private_key_id);

        const jwt = createJWT(serviceAccount);

        // Google OAuth2 서버에서 액세스 토큰 요청
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                "Google OAuth2 토큰 요청 실패:",
                response.status,
                errorText
            );
            throw new Error(`Google OAuth2 토큰 요청 실패: ${response.status}`);
        }

        const data = await response.json();
        console.log("Google Access Token 발급 성공");
        return data.access_token;
    } catch (error) {
        console.error("Google Access Token 발급 오류:", error);
        throw error;
    }
}

// 구글 시트에 출근 기록 저장
async function saveToGoogleSheet(attendanceData: {
    userId: string;
    domainId: number;
    action: string;
    timestamp: string;
}) {
    try {
        console.log("=== Google Service Account 인증 시작 ===");

        const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
        if (!sheetId) {
            throw new Error("구글 시트 ID를 추출할 수 없습니다.");
        }

        // Google Access Token 획득
        const accessToken = await getGoogleAccessToken();

        // 시트에 기록할 데이터 준비
        const values = [
            [
                attendanceData.timestamp, // A열: 날짜/시간
                attendanceData.userId, // B열: 사용자 ID
                attendanceData.domainId, // C열: 도메인 ID
                attendanceData.action, // D열: 액션 (출근/퇴근)
                new Date().toLocaleString("ko-KR"), // E열: 한국 시간
                "네이버웍스 봇", // F열: 출처
            ],
        ];

        // Google Sheets API 호출 (OAuth2 토큰 사용)
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1:append?valueInputOption=RAW`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    values: values,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                "Google Sheets API 오류:",
                response.status,
                errorText
            );
            throw new Error(`Google Sheets API 오류: ${response.status}`);
        }

        const result = await response.json();
        console.log("구글 시트 기록 성공:", result);
        return result;
    } catch (error) {
        console.error("구글 시트 저장 오류:", error);
        throw error;
    }
}

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

// Persistent Menu 등록 함수
async function createPersistentMenu() {
    try {
        const accessToken = await getAccessToken();

        const menuData = {
            content: {
                actions: [
                    {
                        type: "message",
                        label: "출근하기",
                        text: "출근하기",
                        postback: "CHECKIN_ACTION",
                        i18nLabels: [
                            {
                                language: "ko_KR",
                                label: "출근하기",
                            },
                        ],
                        i18nTexts: [
                            {
                                language: "ko_KR",
                                text: "출근하기",
                            },
                        ],
                    },
                ],
            },
        };

        const response = await fetch(
            `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/persistentmenu`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(menuData),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(
                "Persistent Menu 등록 실패:",
                response.status,
                errorText
            );
            throw new Error(`Persistent Menu 등록 실패: ${response.status}`);
        }

        let result;
        try {
            const responseText = await response.text();
            if (responseText) {
                result = JSON.parse(responseText);
            } else {
                result = { success: true };
            }
        } catch (parseError) {
            console.log("JSON 파싱 오류, 하지만 요청은 성공:", parseError);
            result = { success: true };
        }
        console.log("Persistent Menu 등록 성공:", result);
        return result;
    } catch (error) {
        console.error("createPersistentMenu 오류:", error);
        throw error;
    }
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

        try {
            const responseText = await response.text();
            if (responseText) {
                return JSON.parse(responseText);
            } else {
                return { success: true };
            }
        } catch (parseError) {
            console.log(
                "메시지 전송 JSON 파싱 오류, 하지만 전송은 성공:",
                parseError
            );
            return { success: true };
        }
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
            const { text, postback } = content;

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

            // /menu 명령어 처리 (Persistent Menu 등록)
            else if (text === "/menu") {
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
            }

            // Persistent Menu 버튼 postback 처리
            else if (postback) {
                if (postback === "CHECKIN_ACTION") {
                    try {
                        // 구글 시트에 출근 기록 저장
                        await saveToGoogleSheet({
                            userId: userId,
                            domainId: source.domainId,
                            action: "출근",
                            timestamp: data.issuedTime,
                        });

                        await sendMessage(
                            userId,
                            {
                                content: {
                                    type: "text",
                                    text:
                                        "🟢 출근이 완료되었습니다!\n\n📊 출근 정보:\n• 시간: " +
                                        new Date(
                                            data.issuedTime
                                        ).toLocaleString("ko-KR") +
                                        "\n• 사용자: " +
                                        userId.substring(0, 8) +
                                        "...\n• 도메인: " +
                                        source.domainId +
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
                }
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
