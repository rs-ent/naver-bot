import { NextRequest } from "next/server";
import { handleAttendanceCron } from "@/lib/cron-handler";

// 출근 5분 전 독촉 알림 (단체방에 @멘션)
// 크론 스케줄은 vercel.json 참고 (UTC 기준):
//   - 월요일 10:55 KST → "55 1 * * 1"
//   - 화~금 09:55 KST → "55 0 * * 2-5"
// Vercel 크론은 GET 요청을 보내므로 GET/POST 모두 지원한다.

export async function GET(request: NextRequest) {
    return handleAttendanceCron(request, "mention");
}

export async function POST(request: NextRequest) {
    return handleAttendanceCron(request, "mention");
}
