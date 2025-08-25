import { NextRequest, NextResponse } from "next/server";
import {
    extractSheetId,
    getGoogleAccessToken,
    generateWeeklySummary,
    saveWeeklySummaryToSheet,
} from "../../../lib/google-sheets";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date");

        let targetDate = new Date();
        if (dateParam) {
            const parsedDate = new Date(dateParam);
            if (!isNaN(parsedDate.getTime())) {
                targetDate = parsedDate;
            }
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

        return NextResponse.json({
            success: true,
            data: summary,
        });
    } catch (error) {
        console.error("주간 결산 조회 오류:", error);
        return NextResponse.json(
            {
                error: "주간 결산 조회 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date");
        const saveToSheet = searchParams.get("save") === "true";

        let targetDate = new Date();
        if (dateParam) {
            const parsedDate = new Date(dateParam);
            if (!isNaN(parsedDate.getTime())) {
                targetDate = parsedDate;
            }
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

        if (saveToSheet) {
            await saveWeeklySummaryToSheet(summary, sheetId, accessToken);
        }

        return NextResponse.json({
            success: true,
            data: summary,
            savedToSheet: saveToSheet,
        });
    } catch (error) {
        console.error("주간 결산 생성 오류:", error);
        return NextResponse.json(
            {
                error: "주간 결산 생성 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
