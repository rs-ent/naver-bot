import { NextRequest } from "next/server";
import { handleAttendanceCron } from "@/lib/cron-handler";

// 출근 시각 정각 현황 공지 (멘션 없이 미체크 명단만)
// 크론 스케줄은 vercel.json 참고 (UTC 기준):
//   - 월요일 11:00 KST → "0 2 * * 1"
//   - 화~금 10:00 KST → "0 1 * * 2-5"
// Vercel 크론은 GET 요청을 보내므로 GET/POST 모두 지원한다.

export async function GET(request: NextRequest) {
    return handleAttendanceCron(request, "report");
}

export async function POST(request: NextRequest) {
    return handleAttendanceCron(request, "report");
}
