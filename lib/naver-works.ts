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
                        type: "location",
                        label: "출근하기",
                        i18nLabels: [
                            {
                                language: "ko_KR",
                                label: "출근하기",
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

// 파일 ID를 사용해서 콘텐츠 다운로드 (이미지, 파일, 오디오, 비디오)
export async function downloadContent(fileId: string): Promise<Buffer> {
    try {
        console.log(`콘텐츠 다운로드 시작: ${fileId}`);

        const accessToken = await getAccessToken();

        // 1단계: 네이버웍스 콘텐츠 다운로드 API에서 리다이렉트 URL 얻기
        const downloadApiUrl = `${process.env.NAVER_WORKS_API_URL}/bots/${process.env.NAVER_WORKS_BOT_ID}/attachments/${fileId}`;

        console.log("1단계: 리다이렉트 URL 요청...");
        const redirectResponse = await fetch(downloadApiUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            redirect: "manual", // 자동 리다이렉트 비활성화 (중요!)
        });

        // HTTP 302 응답에서 실제 파일 URL 추출
        if (redirectResponse.status !== 302) {
            const errorText = await redirectResponse.text();
            console.error(
                "리다이렉트 응답 오류:",
                redirectResponse.status,
                errorText
            );
            throw new Error(
                `리다이렉트 응답 오류: ${redirectResponse.status} - ${errorText}`
            );
        }

        const actualFileUrl = redirectResponse.headers.get("location");
        if (!actualFileUrl) {
            throw new Error("Location 헤더에서 파일 URL을 찾을 수 없습니다.");
        }

        console.log(
            "리다이렉트 URL 획득 성공:",
            actualFileUrl.substring(0, 100) + "..."
        );

        // 2단계: 실제 파일 다운로드
        console.log("2단계: 실제 파일 다운로드...");
        const fileResponse = await fetch(actualFileUrl, {
            method: "GET",
        });

        if (!fileResponse.ok) {
            const errorText = await fileResponse.text();
            console.error(
                "파일 다운로드 실패:",
                fileResponse.status,
                errorText
            );
            throw new Error(
                `파일 다운로드 실패: ${fileResponse.status} - ${errorText}`
            );
        }

        const buffer = Buffer.from(await fileResponse.arrayBuffer());
        console.log(`콘텐츠 다운로드 성공: ${buffer.length} bytes`);

        return buffer;
    } catch (error) {
        console.error("콘텐츠 다운로드 오류:", error);
        throw error;
    }
}

// 기존 함수명 유지 (하위 호환성)
export async function downloadImage(fileId: string): Promise<Buffer> {
    return downloadContent(fileId);
}
