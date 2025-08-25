import { NextRequest, NextResponse } from "next/server";
import {
    extractSheetId,
    getGoogleAccessToken,
    generateWeeklySummary,
    saveWeeklySummaryToSheet,
} from "../../../lib/google-sheets";

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRun = searchParams.get("force") === "true";
        const targetDateParam = searchParams.get("date");

        let targetDate = new Date();
        if (targetDateParam) {
            const parsedDate = new Date(targetDateParam);
            if (!isNaN(parsedDate.getTime())) {
                targetDate = parsedDate;
            }
        }

        const today = new Date();
        const isFriday = today.getDay() === 5;
        const isAfternoon = today.getHours() >= 14;

        if (!forceRun && (!isFriday || !isAfternoon)) {
            return NextResponse.json({
                success: false,
                message:
                    "주간 결산은 매주 금요일 오후 2시 이후에만 자동 실행됩니다.",
                currentTime: today.toISOString(),
                isFriday,
                isAfternoon,
            });
        }

        const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
        if (!sheetId) {
            return NextResponse.json(
                { error: "구글 시트 ID를 추출할 수 없습니다." },
                { status: 400 }
            );
        }

        const accessToken = await getGoogleAccessToken();
        const worksheet = process.env.GOOGLE_SHEET_WORKSHEET || "0";
        let sheetName = "Sheet1";

        if (/^\d+$/.test(worksheet)) {
            try {
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
                    }
                }
            } catch (error) {
                console.warn("시트 이름 조회 실패, 기본값 사용:", error);
            }
        } else {
            sheetName = worksheet;
        }

        const summary = await generateWeeklySummary(
            sheetId,
            sheetName,
            accessToken,
            targetDate
        );

        await saveWeeklySummaryToSheet(summary, sheetId, accessToken);

        return NextResponse.json({
            success: true,
            message: "주간 결산이 성공적으로 생성되고 저장되었습니다.",
            data: {
                weekStart: summary.weekStart,
                weekEnd: summary.weekEnd,
                totalEmployees: summary.totalEmployees,
                totalCheckins: summary.totalCheckins,
                averageCheckinTime: summary.averageCheckinTime,
                latestCheckin: summary.latestCheckin,
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("주간 결산 스케줄러 오류:", error);
        return NextResponse.json(
            {
                error: "주간 결산 스케줄러 실행 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const today = new Date();
        const isFriday = today.getDay() === 5;
        const isAfternoon = today.getHours() >= 14;
        const nextFriday = new Date(today);

        if (isFriday) {
            nextFriday.setDate(today.getDate() + 7);
        } else {
            const daysUntilFriday = (5 - today.getDay() + 7) % 7;
            nextFriday.setDate(today.getDate() + daysUntilFriday);
        }
        nextFriday.setHours(14, 0, 0, 0);

        return NextResponse.json({
            success: true,
            currentTime: today.toISOString(),
            isFriday,
            isAfternoon,
            nextExecution: nextFriday.toISOString(),
            canRunNow: isFriday && isAfternoon,
            message:
                isFriday && isAfternoon
                    ? "지금 주간 결산을 실행할 수 있습니다."
                    : `다음 실행 시간: ${nextFriday.toLocaleString("ko-KR")}`,
        });
    } catch (error) {
        console.error("스케줄러 상태 조회 오류:", error);
        return NextResponse.json(
            {
                error: "스케줄러 상태 조회 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
