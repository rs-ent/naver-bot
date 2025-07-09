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

    // Private Key 유효성 검사
    if (!privateKey || !privateKey.includes("BEGIN PRIVATE KEY")) {
        throw new Error("Private Key 형식이 올바르지 않습니다.");
    }

    console.log("JWT 서명 생성:");
    console.log("- Private Key 시작:", privateKey.substring(0, 30) + "...");
    console.log(
        "- Private Key 포함 여부:",
        privateKey.includes("-----BEGIN PRIVATE KEY-----")
    );
    console.log("- Signature Input:", signatureInput.substring(0, 100) + "...");

    try {
        const signature = crypto.sign(
            "RSA-SHA256",
            Buffer.from(signatureInput),
            {
                key: privateKey,
                format: "pem",
                type: "pkcs8",
            }
        );
        const encodedSignature = signature.toString("base64url");
        console.log("서명 생성 성공");

        return `${signatureInput}.${encodedSignature}`;
    } catch (signError) {
        console.error("JWT 서명 생성 오류:", signError);

        // 대안: 더 간단한 서명 방식 시도
        try {
            console.log("대안 서명 방식 시도...");
            const signature = crypto.sign(
                "sha256",
                Buffer.from(signatureInput),
                privateKey
            );
            const encodedSignature = signature.toString("base64url");
            console.log("대안 서명 생성 성공");

            return `${signatureInput}.${encodedSignature}`;
        } catch (altError) {
            console.error("대안 서명도 실패:", altError);
            const errorMessage =
                signError instanceof Error
                    ? signError.message
                    : String(signError);
            throw new Error(`JWT 서명 생성 실패: ${errorMessage}`);
        }
    }
}

// 구글 시트 헤더 확인 및 추가
async function ensureHeaderExists(
    sheetId: string,
    sheetName: string,
    accessToken: string
) {
    try {
        console.log(`헤더 확인: ${sheetName} 시트`);

        // 첫 번째 행 데이터 조회
        const checkResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                sheetName
            )}!A1:H1`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (checkResponse.ok) {
            const data = await checkResponse.json();

            // 첫 번째 행에 데이터가 없거나 헤더가 아닌 경우
            if (
                !data.values ||
                data.values.length === 0 ||
                !data.values[0] ||
                data.values[0][0] !== "타임스탬프"
            ) {
                console.log("헤더가 없습니다. 헤더를 추가합니다.");

                // 헤더 추가
                const headerResponse = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                        sheetName
                    )}!A1:H1?valueInputOption=RAW`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            values: [
                                [
                                    "타임스탬프", // A열
                                    "한국시간", // B열
                                    "이름", // C열
                                    "이메일", // D열
                                    "부서", // E열
                                    "액션", // F열
                                    "도메인ID", // G열
                                    "출처", // H열
                                ],
                            ],
                        }),
                    }
                );

                if (headerResponse.ok) {
                    console.log("헤더 추가 완료");
                } else {
                    console.log("헤더 추가 실패:", await headerResponse.text());
                }
            } else {
                console.log("헤더가 이미 존재합니다.");
            }
        } else {
            console.log("헤더 확인 실패:", await checkResponse.text());
        }
    } catch (error) {
        console.error("헤더 처리 오류:", error);
    }
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

        // Private Key 개행 문자 처리
        const privateKey =
            process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
                /\\n/g,
                "\n"
            );

        console.log("Private Key 처리:");
        console.log(
            "- 원본 길이:",
            process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.length
        );
        console.log("- 처리 후 길이:", privateKey?.length);
        console.log("- 시작 부분:", privateKey?.substring(0, 50) + "...");
        console.log("- 끝 부분:", "..." + privateKey?.slice(-50));

        // 환경변수로부터 Service Account 객체 구성
        const serviceAccount = {
            type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
            project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
            private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
            private_key: privateKey,
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

// 네이버웍스 사용자 정보 조회
async function getUserInfo(userId: string): Promise<any> {
    try {
        console.log(`사용자 정보 조회 시작: ${userId}`);

        // 네이버웍스 Access Token 발급
        const accessToken = await getAccessToken();

        // 사용자 정보 조회 (프로필 정보)
        const response = await fetch(
            `${process.env.NAVER_WORKS_API_URL}/users/${userId}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("사용자 정보 조회 실패:", response.status, errorText);
            // 실패 시 기본 정보 반환
            return {
                name: userId.substring(0, 8) + "...",
                email: "정보없음",
                department: "정보없음",
            };
        }

        const userData = await response.json();
        console.log("사용자 정보 조회 성공:", {
            name: userData.name,
            email: userData.email,
            department: userData.department,
        });

        return {
            name: userData.name || "이름없음",
            email: userData.email || "이메일없음",
            department: userData.department || "부서없음",
            position: userData.position || "직급없음",
        };
    } catch (error) {
        console.error("사용자 정보 조회 오류:", error);
        // 오류 시 기본 정보 반환
        return {
            name: userId.substring(0, 8) + "...",
            email: "정보없음",
            department: "정보없음",
        };
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

        // 사용자 정보 조회
        const userInfo = await getUserInfo(attendanceData.userId);

        // 시트에 기록할 데이터 준비
        const values = [
            [
                attendanceData.timestamp, // A열: ISO 타임스탬프
                new Date(attendanceData.timestamp).toLocaleString("ko-KR"), // B열: 한국 시간
                userInfo.name, // C열: 사용자 이름
                userInfo.email, // D열: 이메일
                userInfo.department, // E열: 부서
                attendanceData.action, // F열: 액션 (출근/퇴근)
                attendanceData.domainId, // G열: 도메인 ID
                "네이버웍스 봇", // H열: 출처
            ],
        ];

        // 시트 이름 또는 인덱스 처리
        const worksheet = process.env.GOOGLE_SHEET_WORKSHEET || "0";
        let sheetName = "Sheet1"; // 기본값

        // 숫자인 경우 인덱스로 판단하여 시트 정보 조회
        if (/^\d+$/.test(worksheet)) {
            try {
                console.log(
                    `시트 인덱스 ${worksheet}에 해당하는 시트 이름 조회 중...`
                );

                // 스프레드시트 메타데이터 조회
                const metaResponse = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );

                if (metaResponse.ok) {
                    const metadata = await metaResponse.json();
                    const sheets = metadata.sheets;
                    const sheetIndex = parseInt(worksheet);

                    if (sheets && sheets[sheetIndex]) {
                        sheetName = sheets[sheetIndex].properties.title;
                        console.log(
                            `인덱스 ${sheetIndex}의 시트 이름: ${sheetName}`
                        );
                    } else {
                        console.log(
                            `인덱스 ${sheetIndex}에 해당하는 시트가 없음. 기본값 사용: ${sheetName}`
                        );
                    }
                } else {
                    console.log("시트 메타데이터 조회 실패. 기본값 사용");
                }
            } catch (metaError) {
                console.log("시트 이름 조회 오류:", metaError);
                console.log("기본값 사용:", sheetName);
            }
        } else {
            // 문자열인 경우 시트 이름으로 직접 사용
            sheetName = worksheet;
        }

        console.log(`사용할 시트 이름: ${sheetName}`);

        // 헤더 확인 및 추가
        await ensureHeaderExists(sheetId, sheetName, accessToken);

        // Google Sheets API 호출 (OAuth2 토큰 사용)
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                sheetName
            )}:append?valueInputOption=RAW`,
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
                        // 사용자 정보 조회 (메시지용)
                        const userInfo = await getUserInfo(userId);

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
                                        "\n• 이름: " +
                                        userInfo.name +
                                        "\n• 부서: " +
                                        userInfo.department +
                                        "\n• 도메인: " +
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
