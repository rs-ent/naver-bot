// 출근 기준 시각 관련 로직 (모든 지각 판정은 이 파일을 통해서만 한다)

// 요일별 출근 기준 시각 (한국 시간, 0=일요일 ... 6=토요일)
// 여기에 값을 추가하면 해당 요일만 다른 시각이 적용된다.
const WORK_START_HOUR_BY_DAY: { [dayOfWeek: number]: number } = {
    1: 11, // 월요일은 11시 출근
};

// 위에 지정되지 않은 요일의 기본 출근 시각
const DEFAULT_WORK_START_HOUR = 10;

// UTC 기준 Date를 한국 시간으로 해석한 Date로 변환
export function toKoreanTime(timestamp: Date): Date {
    return new Date(
        timestamp.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
    );
}

// 한국 시간 기준 요일 (0=일요일 ... 6=토요일)
export function getKoreanDayOfWeek(timestamp: Date): number {
    return toKoreanTime(timestamp).getDay();
}

// 한국 시간 기준 날짜 문자열 (YYYY-MM-DD)
export function getKoreanDateString(timestamp: Date): string {
    // en-CA 로케일이 YYYY-MM-DD 형식을 준다
    return timestamp.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

// 해당 시점에 적용되는 출근 기준 시각(시)
export function getWorkStartHour(timestamp: Date): number {
    const dayOfWeek = getKoreanDayOfWeek(timestamp);
    return WORK_START_HOUR_BY_DAY[dayOfWeek] ?? DEFAULT_WORK_START_HOUR;
}

// 한국 시간 기준 지각 여부 판단
export function isLateForWork(timestamp: Date): boolean {
    const koreanTime = toKoreanTime(timestamp);
    const startHour = getWorkStartHour(timestamp);
    const hour = koreanTime.getHours();
    const minute = koreanTime.getMinutes();

    return hour > startHour || (hour === startHour && minute > 0);
}

// 기준 시각 대비 지각한 분(分). 정시 출근이면 0 이하가 될 수 있다.
export function getLateMinutes(timestamp: Date): number {
    const koreanTime = toKoreanTime(timestamp);
    const standardTime = new Date(koreanTime);
    standardTime.setHours(getWorkStartHour(timestamp), 0, 0, 0);

    return Math.floor(
        (koreanTime.getTime() - standardTime.getTime()) / (1000 * 60)
    );
}

// 안내 문구용 기준 시각 표기 (예: "오전 10시")
export function formatWorkStartTime(timestamp: Date): string {
    return `오전 ${getWorkStartHour(timestamp)}시`;
}

// 안내 문구용 날짜 표기 (예: "7/31")
export function formatKoreanMonthDay(timestamp: Date): string {
    const [, month, day] = getKoreanDateString(timestamp).split("-");
    return `${Number(month)}/${Number(day)}`;
}
