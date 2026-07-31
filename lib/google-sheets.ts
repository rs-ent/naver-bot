import crypto from "crypto";
import { RequestInfo } from "./webhook";
import {
    getKoreanDateString,
    getLateMinutes,
    isLateForWork,
} from "./work-schedule";

// 출근하기는 눌렀지만 절차(위치 인증 / 출근 유형 선택)를 끝내지 않은 상태.
// 이 행은 "출근 절차를 진행 중"이라는 표식으로도 쓰인다.
export const PENDING_ACTION = "미기록";

// 출근 절차를 끝까지 마친 것으로 인정하는 액션들 (미기록은 포함하지 않는다)
const COMPLETED_ACTIONS = [
    "출근",
    "위치출근",
    "지각",
    "늦출",
    "반차",
    "반반차",
    "외근",
];

// 시트 컬럼 인덱스
const COL_TIMESTAMP = 0;
const COL_NAME = 2;
const COL_EMAIL = 3;
const COL_ACTION = 8;

// 네이버웍스는 이름을 "성 이름"(예: "이 성환") 형태로 주므로
// 비교할 때는 공백을 모두 제거한 뒤 대조한다.
export function normalizeName(name: string | undefined): string {
    return (name || "").replace(/\s+/g, "");
}

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

// Google Access Token 캐시 (토큰 유효기간 1시간, 여유를 두고 55분간 재사용)
let cachedGoogleToken: string | null = null;
let googleTokenExpiresAt = 0;

// Google Access Token 획득
export async function getGoogleAccessToken(): Promise<string> {
    if (cachedGoogleToken && Date.now() < googleTokenExpiresAt) {
        return cachedGoogleToken;
    }

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

        cachedGoogleToken = data.access_token;
        googleTokenExpiresAt = Date.now() + 55 * 60 * 1000;

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
            )}!A1:Z1`,
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
                    )}!A1:Z1?valueInputOption=RAW`,
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
                                    "위치검증",
                                    "검증메모",
                                    "지각여부",
                                    "지각시간(분)",
                                    "출근유형",
                                    "비고",
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
        isVerified?: boolean;
        verificationNotes?: string;
    };
}

// 액션에 따른 지각 여부 판단
function shouldMarkAsLate(action: string): boolean {
    const lateActions = ["늦출", "반차", "반반차", "외근"];
    return !lateActions.includes(action);
}

// 사용자 식별 정보 (시트에는 userId가 없어 이메일/이름으로 대조한다)
interface SheetIdentity {
    name?: string;
    email?: string;
}

// 시트의 한 행이 해당 사용자의 기록인지 판단
function matchesIdentity(row: any[], identity: SheetIdentity): boolean {
    const email = (identity.email || "").trim();
    if (email.includes("@")) {
        return (row[COL_EMAIL] || "").trim() === email;
    }

    // 이메일을 못 가져온 경우에만 이름으로 대조 (기본값 문자열은 제외)
    const name = normalizeName(identity.name);
    if (!name || name === "정보없음") return false;
    return normalizeName(row[COL_NAME]) === name;
}

// 시트 전체를 읽어 데이터 행(헤더 제외)과 각 행의 실제 행 번호를 반환
async function readSheetRows(
    sheetId: string,
    sheetName: string,
    accessToken: string
): Promise<{ row: any[]; rowNumber: number }[]> {
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
            sheetName
        )}!A:Z`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`Google Sheets API 오류: ${response.status}`);
    }

    const data = await response.json();
    if (!data.values || data.values.length < 2) return [];

    // values[0]은 헤더(1행)이므로 데이터는 인덱스 1부터, 행 번호는 인덱스 + 1
    return data.values
        .slice(1)
        .map((row: any[], index: number) => ({ row, rowNumber: index + 2 }));
}

// 오늘(한국 시간 기준) 해당 사용자의 기록 상태
export interface TodayAttendanceStatus {
    // 진행 중인 "미기록" 행 번호 (출근하기를 눌렀다는 표식)
    pendingRow: number | null;
    // 출근 절차를 끝까지 마친 기록이 있는지
    hasCompletedRecord: boolean;
    // 완료된 기록의 액션 (예: "지각", "위치출근")
    completedAction: string;
    // 완료된 기록의 한국 시간 문자열
    completedTime: string;
}

async function findTodayAttendance(
    sheetId: string,
    sheetName: string,
    accessToken: string,
    identity: SheetIdentity,
    timestamp: Date
): Promise<TodayAttendanceStatus> {
    const today = getKoreanDateString(timestamp);
    const status: TodayAttendanceStatus = {
        pendingRow: null,
        hasCompletedRecord: false,
        completedAction: "",
        completedTime: "",
    };

    const rows = await readSheetRows(sheetId, sheetName, accessToken);

    for (const { row, rowNumber } of rows) {
        if (!row[COL_TIMESTAMP]) continue;

        const rowDate = new Date(row[COL_TIMESTAMP]);
        if (isNaN(rowDate.getTime())) continue;
        if (getKoreanDateString(rowDate) !== today) continue;
        if (!matchesIdentity(row, identity)) continue;

        const action = (row[COL_ACTION] || "").trim();
        if (action === PENDING_ACTION) {
            status.pendingRow = rowNumber; // 가장 마지막 미기록 행을 사용
        } else if (COMPLETED_ACTIONS.includes(action)) {
            status.hasCompletedRecord = true;
            status.completedAction = action;
            status.completedTime = (row[1] || "").trim();
        }
    }

    return status;
}

// 오늘 해당 사용자의 기록 상태 조회 (시트 접근 정보를 내부에서 해결)
export async function getTodayAttendanceStatus(
    identity: SheetIdentity,
    timestamp: Date = new Date()
): Promise<TodayAttendanceStatus> {
    const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
    if (!sheetId) {
        throw new Error("구글 시트 ID를 추출할 수 없습니다.");
    }

    const accessToken = await getGoogleAccessToken();
    const sheetName = await resolveSheetName(sheetId, accessToken);

    return findTodayAttendance(
        sheetId,
        sheetName,
        accessToken,
        identity,
        timestamp
    );
}

// 오늘(한국 시간 기준) 출근 절차를 끝까지 마친 사람들의 이메일/이름 집합
// "미기록"(절차 미완료)은 찍지 않은 것으로 본다.
export async function getTodayCheckedInIdentities(
    sheetId: string,
    sheetName: string,
    accessToken: string,
    timestamp: Date = new Date()
): Promise<{ emails: Set<string>; names: Set<string> }> {
    const today = getKoreanDateString(timestamp);
    const emails = new Set<string>();
    const names = new Set<string>();

    const rows = await readSheetRows(sheetId, sheetName, accessToken);

    for (const { row } of rows) {
        if (!row[COL_TIMESTAMP]) continue;

        const rowDate = new Date(row[COL_TIMESTAMP]);
        if (isNaN(rowDate.getTime())) continue;
        if (getKoreanDateString(rowDate) !== today) continue;

        const action = (row[COL_ACTION] || "").trim();
        if (!COMPLETED_ACTIONS.includes(action)) continue;

        const email = (row[COL_EMAIL] || "").trim();
        if (email.includes("@")) emails.add(email);

        const name = normalizeName(row[COL_NAME]);
        if (name && name !== "정보없음") names.add(name);
    }

    return { emails, names };
}

// 시트 이름 캐시 (시트 이름은 실행 중 바뀌지 않는다)
let cachedSheetName: string | null = null;

// GOOGLE_SHEET_WORKSHEET 값(시트 이름 또는 인덱스)을 실제 시트 이름으로 변환
export async function resolveSheetName(
    sheetId: string,
    accessToken: string
): Promise<string> {
    if (cachedSheetName) return cachedSheetName;

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

    cachedSheetName = sheetName;
    return sheetName;
}

// 출근 기록 저장 옵션
export interface SaveAttendanceOptions {
    // 덮어쓸 행 번호를 이미 알고 있는 경우 (시트 재조회를 생략한다)
    targetRow?: number | null;
    // 오늘자 "미기록" 행이 있으면 새 행을 만들지 않고 그 행을 덮어쓴다
    replacePendingRow?: boolean;
    // 오늘 이미 확정된 출근 기록이 있으면 저장하지 않는다
    skipIfAlreadyRecorded?: boolean;
}

// 구글 시트에 출근 기록 저장
export async function saveToGoogleSheet(
    attendanceData: AttendanceData,
    options: SaveAttendanceOptions = {}
) {
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

        // 지각 여부 판단
        let finalAction = attendanceData.action;
        let isLate = false;
        let lateMinutes = 0;
        let attendanceType = "";
        let notes = "";

        if (isLateForWork(timestamp)) {
            isLate = true;

            // 한국 시간 기준으로 지각 시간 계산 (요일별 기준 시각 적용)
            lateMinutes = getLateMinutes(timestamp);

            // 액션에 따른 출근 유형 분류
            if (attendanceData.action === PENDING_ACTION) {
                // 출근 버튼만 누르고 유형을 고르지 않은 상태
                attendanceType = "미분류";
                notes = `지각 ${lateMinutes}분 (출근 유형 미선택)`;
            } else if (shouldMarkAsLate(attendanceData.action)) {
                finalAction = "지각";
                attendanceType = "일반";
                notes = `지각 ${lateMinutes}분`;
            } else {
                attendanceType = "늦출";
                notes = `${attendanceData.action} (지각 ${lateMinutes}분)`;
            }
        } else {
            attendanceType = "정시";
            notes = "정시 출근";
        }

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
                finalAction,
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
                attendanceData.locationInfo?.isVerified ? "검증됨" : "미검증",
                attendanceData.locationInfo?.verificationNotes || "",
                isLate ? "지각" : "정시",
                lateMinutes,
                attendanceType,
                notes,
            ],
        ];

        // 시트 이름 또는 인덱스 처리
        const sheetName = await resolveSheetName(sheetId, accessToken);

        console.log(`사용할 시트 이름: ${sheetName}`);

        // 헤더 확인 및 추가
        await ensureHeaderExists(sheetId, sheetName, accessToken);

        // 기록할 행 결정. 호출부가 행 번호를 알려준 경우 시트를 다시 읽지 않는다.
        let targetRow: number | null = options.targetRow ?? null;

        if (
            !targetRow &&
            (options.replacePendingRow || options.skipIfAlreadyRecorded)
        ) {
            try {
                const todayStatus = await findTodayAttendance(
                    sheetId,
                    sheetName,
                    accessToken,
                    { name: userInfo.name, email: userInfo.email },
                    timestamp
                );

                if (
                    options.skipIfAlreadyRecorded &&
                    todayStatus.hasCompletedRecord
                ) {
                    console.log("오늘 이미 출근 기록이 있어 저장을 건너뜁니다.");
                    return { skipped: true };
                }

                if (options.replacePendingRow && todayStatus.pendingRow) {
                    targetRow = todayStatus.pendingRow;
                    console.log(`미기록 행 ${targetRow}을(를) 갱신합니다.`);
                }
            } catch (lookupError) {
                // 조회에 실패해도 기록 자체는 남겨야 하므로 새 행 추가로 진행
                console.warn(
                    "오늘자 기록 조회 실패, 새 행으로 저장:",
                    lookupError
                );
            }
        }

        if (!targetRow) {
            const findResponse = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                    sheetName
                )}!A:A`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            targetRow = 2; // 기본값: 헤더 다음 행
            if (findResponse.ok) {
                const findData = await findResponse.json();
                if (findData.values) {
                    targetRow = findData.values.length + 1;
                }
            }

            console.log(`다음 빈 행: ${targetRow}`);
        }

        // Google Sheets API 호출 - 명시적 범위 지정
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                sheetName
            )}!A${targetRow}:Z${targetRow}?valueInputOption=RAW`,
            {
                method: "PUT",
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

// 주간 결산 데이터 타입 정의
export interface WeeklySummary {
    weekStart: string;
    weekEnd: string;
    totalEmployees: number;
    totalCheckins: number;
    averageCheckinTime: string;
    latestCheckin: {
        name: string;
        time: string;
        department: string;
    };
    departmentStats: {
        [department: string]: {
            totalCheckins: number;
            averageTime: string;
            latestCheckin: string;
        };
    };
}

// 특정 주의 출근 데이터 조회
export async function getWeeklyAttendanceData(
    sheetId: string,
    sheetName: string,
    accessToken: string,
    weekStart: Date,
    weekEnd: Date
): Promise<any[]> {
    try {
        const startDate = weekStart.toISOString().split("T")[0];
        const endDate = weekEnd.toISOString().split("T")[0];

        console.log(`주간 출근 데이터 조회: ${startDate} ~ ${endDate}`);

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                sheetName
            )}!A:Z`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Google Sheets API 오류: ${response.status}`);
        }

        const data = await response.json();
        if (!data.values || data.values.length < 2) {
            return [];
        }

        const headers = data.values[0];
        const rows = data.values.slice(1);

        const filteredRows = rows.filter((row: any[]) => {
            if (row.length < 3) return false;

            const timestamp = row[0];
            const action = row[8];

            if (!timestamp || (action !== "출근" && action !== "위치출근"))
                return false;

            try {
                const rowDate = new Date(timestamp);
                return rowDate >= weekStart && rowDate <= weekEnd;
            } catch {
                return false;
            }
        });

        return filteredRows.map((row: any[]) => {
            const result: any = {};
            headers.forEach((header: string, index: number) => {
                result[header] = row[index] || "";
            });
            return result;
        });
    } catch (error) {
        console.error("주간 출근 데이터 조회 오류:", error);
        throw error;
    }
}

// 주간 결산 생성
export async function generateWeeklySummary(
    sheetId: string,
    sheetName: string,
    accessToken: string,
    targetDate: Date = new Date()
): Promise<WeeklySummary> {
    try {
        const weekStart = new Date(targetDate);
        weekStart.setDate(targetDate.getDate() - targetDate.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const attendanceData = await getWeeklyAttendanceData(
            sheetId,
            sheetName,
            accessToken,
            weekStart,
            weekEnd
        );

        if (attendanceData.length === 0) {
            return {
                weekStart: weekStart.toISOString().split("T")[0],
                weekEnd: weekEnd.toISOString().split("T")[0],
                totalEmployees: 0,
                totalCheckins: 0,
                averageCheckinTime: "00:00",
                latestCheckin: {
                    name: "데이터 없음",
                    time: "00:00",
                    department: "데이터 없음",
                },
                departmentStats: {},
            };
        }

        const uniqueEmployees = new Set(
            attendanceData.map((row) => row["이름"])
        );
        const totalEmployees = uniqueEmployees.size;
        const totalCheckins = attendanceData.length;

        const checkinTimes: Date[] = [];
        const departmentStats: { [key: string]: any } = {};
        let latestCheckin = {
            name: "",
            time: "",
            department: "",
            timestamp: new Date(0),
        };

        attendanceData.forEach((row) => {
            try {
                const timestamp = new Date(row["타임스탬프"]);
                const name = row["이름"] || "이름없음";
                const department = row["부서"] || "부서없음";
                const koreanTime = row["한국시간"] || "";

                checkinTimes.push(timestamp);

                if (timestamp > latestCheckin.timestamp) {
                    latestCheckin = {
                        name,
                        time: koreanTime.split(" ")[1] || "00:00",
                        department,
                        timestamp,
                    };
                }

                if (!departmentStats[department]) {
                    departmentStats[department] = {
                        totalCheckins: 0,
                        times: [],
                        latestCheckin: "",
                    };
                }

                departmentStats[department].totalCheckins++;
                departmentStats[department].times.push(timestamp);

                if (koreanTime > departmentStats[department].latestCheckin) {
                    departmentStats[department].latestCheckin = koreanTime;
                }
            } catch (error) {
                console.warn("행 데이터 파싱 오류:", error);
            }
        });

        const averageTime = calculateAverageCheckinTime(checkinTimes);

        const processedDepartmentStats: { [key: string]: any } = {};
        Object.keys(departmentStats).forEach((dept) => {
            const stats = departmentStats[dept];
            processedDepartmentStats[dept] = {
                totalCheckins: stats.totalCheckins,
                averageTime: calculateAverageCheckinTime(stats.times),
                latestCheckin: stats.latestCheckin,
            };
        });

        return {
            weekStart: weekStart.toISOString().split("T")[0],
            weekEnd: weekEnd.toISOString().split("T")[0],
            totalEmployees,
            totalCheckins,
            averageCheckinTime: averageTime,
            latestCheckin: {
                name: latestCheckin.name,
                time: latestCheckin.time,
                department: latestCheckin.department,
            },
            departmentStats: processedDepartmentStats,
        };
    } catch (error) {
        console.error("주간 결산 생성 오류:", error);
        throw error;
    }
}

// 평균 출근 시간 계산
function calculateAverageCheckinTime(times: Date[]): string {
    if (times.length === 0) return "00:00";

    const totalMinutes = times.reduce((sum, time) => {
        const hours = time.getHours();
        const minutes = time.getMinutes();
        return sum + (hours * 60 + minutes);
    }, 0);

    const averageMinutes = Math.round(totalMinutes / times.length);
    const hours = Math.floor(averageMinutes / 60);
    const minutes = averageMinutes % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
}

// 주간 결산을 구글 시트에 저장
export async function saveWeeklySummaryToSheet(
    summary: WeeklySummary,
    sheetId: string,
    accessToken: string
): Promise<void> {
    try {
        const summarySheetName = "주간결산";

        const summaryData = [
            ["주간 결산 보고서"],
            [""],
            ["기간", `${summary.weekStart} ~ ${summary.weekEnd}`],
            [""],
            ["전체 통계"],
            ["총 직원 수", summary.totalEmployees],
            ["총 출근 횟수", summary.totalCheckins],
            ["평균 출근 시간", summary.averageCheckinTime],
            [
                "가장 늦은 출근",
                `${summary.latestCheckin.name} (${summary.latestCheckin.department}) - ${summary.latestCheckin.time}`,
            ],
            [""],
            ["부서별 통계"],
            ["부서", "출근 횟수", "평균 출근 시간", "가장 늦은 출근"],
        ];

        Object.entries(summary.departmentStats).forEach(([dept, stats]) => {
            summaryData.push([
                dept,
                stats.totalCheckins.toString(),
                stats.averageTime,
                stats.latestCheckin,
            ]);
        });

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                summarySheetName
            )}!A1?valueInputOption=RAW`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    values: summaryData,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`주간 결산 저장 실패: ${response.status}`);
        }

        console.log("주간 결산이 성공적으로 저장되었습니다.");
    } catch (error) {
        console.error("주간 결산 저장 오류:", error);
        throw error;
    }
}
