import { getChannelMembers, getUserInfo, sendMessage } from "./naver-works";
import {
    extractSheetId,
    getGoogleAccessToken,
    getTodayCheckedInIdentities,
    normalizeName,
    resolveSheetName,
} from "./google-sheets";
import {
    formatKoreanMonthDay,
    getKoreanDateString,
    getKoreanDayOfWeek,
} from "./work-schedule";

// 알림을 보낼 단체 메시지방.
// 채널 ID는 봇 인증 정보 없이는 사용할 수 없어 코드에 직접 둔다.
// 방을 바꾸려면 새 방에서 봇에게 /channelid 를 입력해 나온 값으로 교체하면 된다.
const DEFAULT_REMINDER_CHANNEL_ID = "1c27c84d-a943-5c87-cfc0-f99b2e0a0619";

// 출근 기록 의무가 없어 알림에서 제외하는 인원 (공백은 무시하고 대조)
const DEFAULT_EXCLUDED_NAMES = [
    "이성환",
    "김호영",
    "이상진",
    "박대은",
    "조현곤",
    "김주화",
];

// 명단에 표시할 순서. 여기에 없는 사람은 뒤쪽에 이름순으로 붙는다.
const MEMBER_ORDER = [
    "이찬주",
    "김하빈",
    "차동훈",
    "허청",
    "김민정",
    "이수빈",
    "박현진",
    "홍유정",
];

// 네이버웍스 메시지 1건당 멘션 가능 인원 상한
const MAX_MENTIONS = 50;

// 사용자 정보 조회 동시 실행 개수 (API 부하 방지)
const USER_LOOKUP_CONCURRENCY = 5;

// mention: 출근 5분 전, 단체방에 @멘션으로 독촉
// report: 출근 시각 정각, 멘션 없이 명단만 공지
export type NoticeMode = "mention" | "report";

export interface NoticeTarget {
    userId: string;
    name: string;
}

export interface NoticeResult {
    mode: NoticeMode;
    date: string;
    channelId: string;
    totalMembers: number;
    // 알림 면제 인원 수
    excludedCount: number;
    // 프로필(이메일)을 확인할 수 없어 대조에서 제외한 대상 — 봇 계정 등
    unresolved: string[];
    checkedInCount: number;
    missing: NoticeTarget[];
    sent: boolean;
    // 전송하지 않은 경우의 사유
    skipped?: string;
    message?: string;
}

// 배열을 chunk 단위로 나눠 순차 처리 (동시 요청 수 제한)
async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        results.push(...(await Promise.all(chunk.map(fn))));
    }

    return results;
}

// 환경 변수의 쉼표 구분 목록 파싱
function parseList(value: string | undefined): string[] {
    return (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

// MEMBER_ORDER 기준 정렬 순위. 목록에 없으면 맨 뒤로 보낸다.
function getMemberRank(name: string): number {
    const index = MEMBER_ORDER.indexOf(normalizeName(name));
    return index === -1 ? MEMBER_ORDER.length : index;
}

// 지정한 계층 순서대로 정렬 (목록에 없는 사람은 뒤쪽에 이름순)
function sortByMemberOrder(targets: NoticeTarget[]): NoticeTarget[] {
    return [...targets].sort((a, b) => {
        const rankDiff = getMemberRank(a.name) - getMemberRank(b.name);
        if (rankDiff !== 0) return rankDiff;

        return normalizeName(a.name).localeCompare(normalizeName(b.name), "ko");
    });
}

// 알림 대상에서 제외할 이름 집합
function getExcludedNames(): Set<string> {
    const extra = parseList(process.env.ATTENDANCE_EXCLUDE_NAMES);
    return new Set(
        [...DEFAULT_EXCLUDED_NAMES, ...extra].map((name) =>
            normalizeName(name)
        )
    );
}

// 오늘 출근을 찍지 않은 메시지방 구성원 조회
async function findMissingMembers(
    channelId: string,
    now: Date
): Promise<{
    missing: NoticeTarget[];
    totalMembers: number;
    excludedCount: number;
    unresolved: string[];
    // 오늘 출근을 찍은 전체 인원 수 (면제 대상 포함, 휴무일 판단에 사용)
    checkedInToday: number;
}> {
    // 1. 메시지방 구성원 조회
    const memberIds = await getChannelMembers(channelId);

    // 2. 오늘 출근 절차를 마친 사람들 조회
    const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
    if (!sheetId) {
        throw new Error("구글 시트 ID를 추출할 수 없습니다.");
    }

    const accessToken = await getGoogleAccessToken();
    const sheetName = await resolveSheetName(sheetId, accessToken);
    const checkedIn = await getTodayCheckedInIdentities(
        sheetId,
        sheetName,
        accessToken,
        now
    );

    // 3. 구성원 프로필 조회
    //    시트에 userId 컬럼이 없으므로 이메일(없으면 이름)로 대조한다.
    const profiles = await mapWithConcurrency(
        memberIds,
        USER_LOOKUP_CONCURRENCY,
        async (userId) => ({ userId, info: await getUserInfo(userId) })
    );

    // 4. 이메일을 확인할 수 없는 대상은 대조가 불가능하므로 제외한다.
    //    봇 계정이나 조회 실패 계정이 여기에 걸린다.
    //    (제외하지 않으면 실존하지 않는 대상을 멘션하게 된다)
    const unresolved: string[] = [];
    const identified = profiles.filter(({ userId, info }) => {
        if ((info.email || "").includes("@")) return true;

        unresolved.push(`${info.name} (${userId})`);
        return false;
    });

    if (unresolved.length > 0) {
        console.warn("이메일을 확인할 수 없어 제외한 대상:", unresolved);
    }

    // 5. 알림 면제 대상 걸러내기
    const excludedNames = getExcludedNames();
    const excludedUserIds = new Set(
        parseList(process.env.ATTENDANCE_EXCLUDE_USER_IDS)
    );

    const candidates = identified.filter(
        ({ userId, info }) =>
            !excludedUserIds.has(userId) &&
            !excludedNames.has(normalizeName(info.name))
    );

    // 6. 미체크 인원 추출 후 지정된 계층 순서로 정렬
    const missing = sortByMemberOrder(
        candidates
            .filter(({ info }) => !checkedIn.emails.has((info.email || "").trim()))
            .map(({ userId, info }) => ({ userId, name: info.name }))
    );

    return {
        missing,
        totalMembers: memberIds.length,
        excludedCount: identified.length - candidates.length,
        unresolved,
        checkedInToday: checkedIn.emails.size,
    };
}

// 출근 5분 전: 미체크 인원을 @멘션으로 독촉
function buildMentionMessage(missing: NoticeTarget[]): string {
    const mentioned = missing.slice(0, MAX_MENTIONS);
    const overflow = missing.length - mentioned.length;

    // <m userId="..."> 는 네이버웍스가 클릭 가능한 @이름 으로 변환한다
    let text =
        "🚨출근 스탬프를 찍어주세요\n" +
        mentioned.map((target) => `<m userId="${target.userId}">`).join(" ");

    if (overflow > 0) {
        text += ` 외 ${overflow}명`;
    }

    return text;
}

// 출근 시각 정각: 멘션 없이 미체크 명단만 공지
function buildReportMessage(missing: NoticeTarget[], now: Date): string {
    const date = formatKoreanMonthDay(now);

    if (missing.length === 0) {
        return `⏰ ${date} 지각/휴무 인원 (0명)\n\n🎉 전원 출근 완료했습니다!`;
    }

    return (
        `⏰ ${date} 지각/휴무 인원 (${missing.length}명)\n` +
        // 네이버웍스가 "홍 유정"처럼 공백을 넣어 주므로 표시할 때는 붙인다
        missing.map((target) => normalizeName(target.name)).join(", ")
    );
}

// 오늘 알림을 건너뛰어야 하면 그 사유를, 보내야 하면 null을 반환
export function getSkipReason(now: Date): string | null {
    const dayOfWeek = getKoreanDayOfWeek(now);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return "주말에는 출근 알림을 보내지 않습니다.";
    }

    const holidays = parseList(process.env.ATTENDANCE_HOLIDAYS);
    if (holidays.includes(getKoreanDateString(now))) {
        return "공휴일에는 출근 알림을 보내지 않습니다.";
    }

    return null;
}

// 출근 알림 전송
export async function sendAttendanceNotice(
    mode: NoticeMode,
    options: { dryRun?: boolean } = {}
): Promise<NoticeResult> {
    const channelId =
        process.env.NAVER_WORKS_REMINDER_CHANNEL_ID ||
        DEFAULT_REMINDER_CHANNEL_ID;

    const now = new Date();
    const { missing, totalMembers, excludedCount, unresolved, checkedInToday } =
        await findMissingMembers(channelId, now);

    const result: NoticeResult = {
        mode,
        date: getKoreanDateString(now),
        channelId,
        totalMembers,
        excludedCount,
        unresolved,
        checkedInCount:
            totalMembers - unresolved.length - excludedCount - missing.length,
        missing,
        sent: false,
    };

    // 아무도 출근을 찍지 않았다면 회사 전체 휴무일로 보고 두 알림 모두 보내지 않는다.
    // 공휴일 목록을 따로 관리하지 않아도 대체공휴일·창립기념일 등이 자동으로 걸러진다.
    if (checkedInToday === 0) {
        console.log("오늘 출근 기록이 한 건도 없어 휴무일로 판단, 알림 생략");
        result.skipped = "출근 기록이 한 건도 없어 휴무일로 판단했습니다.";
        return result;
    }

    // 독촉 알림은 대상이 없으면 아무것도 보내지 않는다.
    // 정각 현황 공지는 "전원 완료"도 알릴 가치가 있어 항상 보낸다.
    if (mode === "mention" && missing.length === 0) {
        console.log("미체크 인원이 없어 독촉 알림을 보내지 않습니다.");
        result.skipped = "미체크 인원이 없습니다.";
        return result;
    }

    const text =
        mode === "mention"
            ? buildMentionMessage(missing)
            : buildReportMessage(missing, now);

    result.message = text;

    if (options.dryRun) {
        console.log("[dryRun] 전송하지 않고 결과만 반환합니다:\n" + text);
        return result;
    }

    await sendMessage("", { content: { type: "text", text } }, channelId);

    console.log(`출근 알림(${mode}) 전송 완료: 미체크 ${missing.length}명`);
    result.sent = true;
    return result;
}
