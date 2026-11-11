// 공연 시장조사(tc-mkt) 자동 수집 원격 명령 — 2026-11-11
// 지정 단톡방에서 "수집 멈춰 / 수집 시작 / 수집 상태" 를 받으면 Blob 에 명령을 저장하고,
// 사내 PC 의 자동 관리 프로그램(allts2_supervisor.py)이 1분마다 /api/tcmkt/command 로 가져가 실행한다.
// 출근 기능과 무관. 이 방(채널) 밖의 메시지는 건드리지 않는다.
import crypto from "crypto";
import { put, list, del } from "@vercel/blob";

export const TCMKT_CHANNEL = "27d59d70-88c8-b70b-8bb3-26e048130b03";
// 이 사용자가 봇과 1:1 로 보낸 말도 받음(알림 방이 봇 입장에선 1:1 이라 채널 ID 가 안 옴, 11-11 확인)
export const TCMKT_OWNERS = ["bb2972f1-5887-4e10-1f19-0377434bf40b"];
const KEY = "tcmkt/command.json";

const COMMANDS: Record<string, "stop" | "start" | "status"> = {
    "수집 멈춰": "stop",
    "수집 멈춤": "stop",
    "수집 정지": "stop",
    "수집 시작": "start",
    "수집 재개": "start",
    "수집 상태": "status",
};

export function parseTcmktCommand(text: string | undefined, channelId?: string, userId?: string) {
    if (!text) return null;
    const allowed = channelId ? channelId === TCMKT_CHANNEL : TCMKT_OWNERS.includes(userId ?? "");
    if (!allowed) return null;
    return COMMANDS[text.trim().replace(/\s+/g, " ")] ?? null;
}

export async function saveTcmktCommand(cmd: string, userId: string) {
    await put(KEY, JSON.stringify({ cmd, userId, at: new Date().toISOString() }), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
    });
}

export async function readTcmktCommand(): Promise<{ cmd: string; at: string } | null> {
    const { blobs } = await list({ prefix: KEY, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(`${blobs[0].url}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
}

export async function clearTcmktCommand() {
    const { blobs } = await list({ prefix: KEY, limit: 1 });
    if (blobs.length) await del(blobs[0].url);
}

// PC 쪽 인증: HMAC-SHA256(BOT_SECRET, ts) — 새 비밀값 없이 기존 봇 비밀값을 공유. 5분 넘은 ts 는 거절.
export function verifyTcmktPoll(ts: string | null, sig: string | null): boolean {
    if (!ts || !sig || !process.env.NAVER_WORKS_BOT_SECRET) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const expected = crypto.createHmac("sha256", process.env.NAVER_WORKS_BOT_SECRET).update(ts).digest("hex");
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    } catch {
        return false;
    }
}
