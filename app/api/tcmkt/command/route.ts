// 공연 시장조사(tc-mkt) PC 가 원격 명령을 가져가는 곳. GET = 대기 중 명령 조회, POST = 처리 완료(지움).
import { NextRequest, NextResponse } from "next/server";
import { readTcmktCommand, clearTcmktCommand, verifyTcmktPoll } from "@/lib/tcmkt-commands";

export const dynamic = "force-dynamic";

function ok(req: NextRequest) {
    return verifyTcmktPoll(req.nextUrl.searchParams.get("ts"), req.nextUrl.searchParams.get("sig"));
}

export async function GET(req: NextRequest) {
    if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ command: await readTcmktCommand() });
}

export async function POST(req: NextRequest) {
    if (!ok(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await clearTcmktCommand();
    return NextResponse.json({ ok: true });
}
