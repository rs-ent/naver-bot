import crypto from "crypto";
import { RequestInfo } from "./webhook";

// 구글 시트 ID 추출 함수
export function extractSheetId(url: string | undefined): string {
    if (!url) {
        console.error("GOOGLE_SHEET_URL 환경 변수가 설정되지 않았습니다.");
        return "";
    }
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : "";
}

// Google Service Account JWT 토큰 생성
export function createJWT(serviceAccount: any): string {
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

// Google Access Token 획득
export async function getGoogleAccessToken(): Promise<string> {
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

// 구글 시트 헤더 확인 및 추가
export async function ensureHeaderExists(
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
            )}!A1:S1`,
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
                    )}!A1:S1?valueInputOption=RAW`,
                    {
                        method: "PUT",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            values: [
                                [
                                    "타임스탬프",
                                    "한국시간",
                                    "이름",
                                    "이메일",
                                    "부서",
                                    "직급",
                                    "직책",
                                    "사번",
                                    "액션",
                                    "도메인ID",
                                    "출처",
                                    "이미지URL",
                                    "IP주소",
                                    "User Agent",
                                    "국가",
                                    "도시",
                                    "출근주소",
                                    "위도",
                                    "경도",
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

// 출석 데이터 타입 정의
export interface AttendanceData {
    userId: string;
    domainId: number;
    action: string;
    timestamp: string;
    imageUrl?: string;
    userInfo?: {
        name: string;
        email: string;
        department: string;
        level: string;
        position: string;
        employeeNumber: string;
    };
    requestInfo?: RequestInfo;
    locationInfo?: {
        address?: string;
        latitude?: number;
        longitude?: number;
    };
}

// 구글 시트에 출근 기록 저장
export async function saveToGoogleSheet(attendanceData: AttendanceData) {
    try {
        console.log("=== Google Service Account 인증 시작 ===");

        const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
        if (!sheetId) {
            throw new Error("구글 시트 ID를 추출할 수 없습니다.");
        }

        // Google Access Token 획득
        const accessToken = await getGoogleAccessToken();

        // 사용자 정보가 없는 경우 기본값 사용
        const userInfo = attendanceData.userInfo || {
            name: "정보없음",
            email: "정보없음",
            department: "정보없음",
            level: "정보없음",
            position: "정보없음",
            employeeNumber: "정보없음",
        };

        // 원본 타임스탬프 (UTC 기준)
        const timestamp = new Date(attendanceData.timestamp);

        // 시트에 기록할 데이터 준비
        const values = [
            [
                timestamp.toISOString(),
                timestamp.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
                userInfo.name,
                userInfo.email,
                userInfo.department,
                userInfo.level,
                userInfo.position,
                userInfo.employeeNumber,
                attendanceData.action,
                attendanceData.domainId,
                "네이버웍스 봇",
                attendanceData.imageUrl || "",
                attendanceData.requestInfo?.ip || "",
                attendanceData.requestInfo?.userAgent || "",
                attendanceData.requestInfo?.country || "",
                attendanceData.requestInfo?.city || "",
                attendanceData.locationInfo?.address || "",
                attendanceData.locationInfo?.latitude || "",
                attendanceData.locationInfo?.longitude || "",
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
