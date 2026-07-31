import { NextRequest, NextResponse } from "next/server";
import {
    NoticeMode,
    getSkipReason,
    sendAttendanceNotice,
} from "./attendance-reminder";
import { getKoreanDateString } from "./work-schedule";

// Vercel 크론은 CRON_SECRET이 설정돼 있으면
// Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙여준다.
function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;

    // CRON_SECRET 미설정 시에는 검증하지 않는다 (설정을 권장)
    if (!secret) return true;

    return request.headers.get("authorization") === `Bearer ${secret}`;
}

// 출근 알림 크론 요청 처리 (mention / report 공통)
export async function handleAttendanceCron(
    request: NextRequest,
    mode: NoticeMode
) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const force = searchParams.get("force") === "true";
        const dryRun = searchParams.get("dryRun") === "true";

        const now = new Date();

        // 주말/공휴일에는 보내지 않는다 (force=true 로 무시 가능)
        const skipReason = force ? null : getSkipReason(now);
        if (skipReason) {
            return NextResponse.json({
                success: true,
                mode,
                skipped: skipReason,
                date: getKoreanDateString(now),
            });
        }

        const result = await sendAttendanceNotice(mode, { dryRun });

        return NextResponse.json({ success: true, dryRun, ...result });
    } catch (error) {
        console.error(`출근 알림(${mode}) 처리 오류:`, error);
        return NextResponse.json(
            {
                error: "출근 알림 전송 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
