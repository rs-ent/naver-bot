import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAccessToken } from "@/lib/auth";
import { put } from "@vercel/blob";
import sharp from "sharp";
import {
    verifySignature,
    validateWebhookData,
    extractWebhookHeaders,
    logWebhookEvent,
} from "@/lib/webhook";
import { routeMessage } from "@/lib/message-handlers";

const userLastCheckinTime = new Map<string, number>();

function extractSheetId(url: string | undefined): string {
    if (!url) {
        console.error("GOOGLE_SHEET_URL 환경 변수가 설정되지 않았습니다.");
        return "";
    }
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : "";
}

function createJWT(serviceAccount: any): string {
    const header = {
        alg: "RS256",
        typ: "JWT",
        kid: serviceAccount.private_key_id,
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        "base64url"
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        "base64url"
    );

    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const privateKey = serviceAccount.private_key;

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

async function ensureHeaderExists(
    sheetId: string,
    sheetName: string,
    accessToken: string
) {
    try {
        console.log(`헤더 확인: ${sheetName} 시트`);

        const checkResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                sheetName
            )}!A1:L1`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (checkResponse.ok) {
            const data = await checkResponse.json();

            if (
                !data.values ||
                data.values.length === 0 ||
                !data.values[0] ||
                data.values[0][0] !== "타임스탬프"
            ) {
                console.log("헤더가 없습니다. 헤더를 추가합니다.");

                const headerResponse = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                        sheetName
                    )}!A1:L1?valueInputOption=RAW`,
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

async function getGoogleAccessToken(): Promise<string> {
    try {
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

async function getUserInfo(userId: string): Promise<any> {
    try {
        console.log(`사용자 정보 조회 시작: ${userId}`);

        const accessToken = await getAccessToken();

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
            return {
                name: userId.substring(0, 8) + "...",
                email: "정보없음",
                department: "정보없음",
                level: "정보없음",
                position: "정보없음",
                employeeNumber: "정보없음",
            };
        }

        const userData = await response.json();

        const fullName =
            `${userData.userName?.lastName || ""} ${
                userData.userName?.firstName || ""
            }`.trim() || "이름없음";

        const primaryOrg =
            userData.organizations?.find((org: any) => org.primary) ||
            userData.organizations?.[0];
        const primaryOrgUnit =
            primaryOrg?.orgUnits?.find((unit: any) => unit.primary) ||
            primaryOrg?.orgUnits?.[0];

        console.log("사용자 정보 조회 성공:", {
            name: fullName,
            email: userData.email,
            department: primaryOrgUnit?.orgUnitName,
            level: primaryOrg?.levelName,
            position: primaryOrgUnit?.positionName,
        });

        return {
            name: fullName,
            email: userData.email || "이메일없음",
            department: primaryOrgUnit?.orgUnitName || "부서없음",
            level: primaryOrg?.levelName || "직급없음",
            position: primaryOrgUnit?.positionName || "직책없음",
            employeeNumber: userData.employeeNumber || "사번없음",
        };
    } catch (error) {
        console.error("사용자 정보 조회 오류:", error);
        return {
            name: userId.substring(0, 8) + "...",
            email: "정보없음",
            department: "정보없음",
            level: "정보없음",
            position: "정보없음",
            employeeNumber: "정보없음",
        };
    }
}

async function saveImageToBlob(
    imageBuffer: Buffer,
    userId: string,
    timestamp: string
): Promise<string> {
    try {
        console.log("=== 이미지 압축 및 Blob 저장 시작 ===");
        console.log("- 원본 이미지 크기:", imageBuffer.length, "bytes");

        const compressedImage = await sharp(imageBuffer)
            .webp({
                quality: 80,
                effort: 6,
            })
            .resize({
                width: 1920,
                height: 1920,
                fit: "inside",
                withoutEnlargement: true,
            })
            .toBuffer();

        console.log("- 압축된 이미지 크기:", compressedImage.length, "bytes");
        console.log(
            "- 압축률:",
            Math.round(
                (1 - compressedImage.length / imageBuffer.length) * 100
            ) + "%"
        );

        const filename = `attendance_${userId}_${Date.now()}.webp`;

        const blob = await put(filename, compressedImage, {
            access: "public",
            contentType: "image/webp",
        });

        console.log("- Blob 업로드 성공:", blob.url);

        return blob.url;
    } catch (error) {
        console.error("이미지 Blob 저장 오류:", error);
        throw error;
    }
}

async function saveToGoogleSheet(attendanceData: {
    userId: string;
    domainId: number;
    action: string;
    timestamp: string;
    imageUrl?: string;
}) {
    try {
        console.log("=== Google Service Account 인증 시작 ===");

        const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
        if (!sheetId) {
            throw new Error("구글 시트 ID를 추출할 수 없습니다.");
        }

        const accessToken = await getGoogleAccessToken();

        const userInfo = await getUserInfo(attendanceData.userId);

        const values = [
            [
                attendanceData.timestamp,
                new Date(attendanceData.timestamp).toLocaleString("ko-KR"),
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
            ],
        ];

        const worksheet = process.env.GOOGLE_SHEET_WORKSHEET || "0";
        let sheetName = "Sheet1";

        if (/^\d+$/.test(worksheet)) {
            try {
                console.log(
                    `시트 인덱스 ${worksheet}에 해당하는 시트 이름 조회 중...`
                );

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
            sheetName = worksheet;
        }

        console.log(`사용할 시트 이름: ${sheetName}`);

        await ensureHeaderExists(sheetId, sheetName, accessToken);

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

async function sendMessage(userId: string, message: any, channelId?: string) {
    try {
        const endpoint = channelId
            ? `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/channels/${channelId}/messages`
            : `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/users/${userId}/messages`;

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
        const { signature, isValid } = extractWebhookHeaders(request.headers);

        console.log("=== 웹훅 수신 시작 ===");
        console.log("Body 길이:", body.length);
        console.log("Signature 존재 여부:", isValid);

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

        if (!validateWebhookData(data)) {
            console.error("웹훅 데이터 유효성 검증 실패");
            return NextResponse.json(
                { error: "Invalid webhook data" },
                { status: 400 }
            );
        }

        logWebhookEvent(data);

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
