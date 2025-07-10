import { getAccessToken } from "@/lib/auth";

// 사용자 정보 타입 정의
export interface UserInfo {
    name: string;
    email: string;
    department: string;
    level: string;
    position: string;
    employeeNumber: string;
}

// 네이버웍스 사용자 정보 조회
export async function getUserInfo(userId: string): Promise<UserInfo> {
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
                level: "정보없음",
                position: "정보없음",
                employeeNumber: "정보없음",
            };
        }

        const userData = await response.json();

        // 이름 구성 (성 + 이름)
        const fullName =
            `${userData.userName?.lastName || ""} ${
                userData.userName?.firstName || ""
            }`.trim() || "이름없음";

        // 조직 정보 추출 (primary 조직 우선)
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
        // 오류 시 기본 정보 반환
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

// 네이버웍스로 메시지 전송
export async function sendMessage(
    userId: string,
    message: any,
    channelId?: string
) {
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

// Persistent Menu 등록 함수
export async function createPersistentMenu() {
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

// 이미지 다운로드 함수
export async function downloadImage(resourceUrl: string): Promise<Buffer> {
    try {
        const accessToken = await getAccessToken();

        const response = await fetch(resourceUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`이미지 다운로드 실패: ${response.status}`);
        }

        return Buffer.from(await response.arrayBuffer());
    } catch (error) {
        console.error("이미지 다운로드 오류:", error);
        throw error;
    }
}
