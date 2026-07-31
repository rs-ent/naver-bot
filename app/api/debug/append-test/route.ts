import { NextRequest, NextResponse } from "next/server";
import {
    extractSheetId,
    getGoogleAccessToken,
    resolveSheetName,
    saveToGoogleSheet,
} from "@/lib/google-sheets";

// ⚠️ 임시 검증용 엔드포인트입니다. 동시 저장 수정 확인이 끝나면 삭제합니다.
//
// 실제 출근 저장 경로(saveToGoogleSheet)를 그대로 타면서
// 여러 건을 동시에 저장해 행이 겹치지 않는지 확인한다.

const TEST_NAME_PREFIX = "[동시저장테스트]";

// 시트 이름으로 숫자 sheetId(gid) 조회 — 행 삭제에 필요
async function getSheetGid(
    sheetId: string,
    sheetName: string,
    accessToken: string
): Promise<number | null> {
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;

    const metadata = await response.json();
    const sheet = (metadata.sheets || []).find(
        (s: any) => s.properties?.title === sheetName
    );

    return sheet?.properties?.sheetId ?? null;
}

// 테스트로 남긴 행을 모두 삭제
async function cleanupTestRows(
    sheetId: string,
    sheetName: string,
    accessToken: string
) {
    const readResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
            sheetName
        )}!A:Z`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!readResponse.ok) {
        throw new Error(`시트 조회 실패: ${readResponse.status}`);
    }

    const data = await readResponse.json();
    const rows: any[][] = data.values || [];

    // 이름(C열)이 테스트 표식으로 시작하는 행 번호 수집
    const targetRows: number[] = [];
    rows.forEach((row, index) => {
        if ((row[2] || "").startsWith(TEST_NAME_PREFIX)) {
            targetRows.push(index + 1); // 1-based 행 번호
        }
    });

    if (targetRows.length === 0) {
        return { deletedRows: [], message: "삭제할 테스트 행이 없습니다." };
    }

    const gid = await getSheetGid(sheetId, sheetName, accessToken);
    if (gid === null) {
        throw new Error("시트 gid를 찾을 수 없어 삭제할 수 없습니다.");
    }

    // 아래쪽부터 지워야 위쪽 행 번호가 밀리지 않는다
    const requests = [...targetRows]
        .sort((a, b) => b - a)
        .map((rowNumber) => ({
            deleteDimension: {
                range: {
                    sheetId: gid,
                    dimension: "ROWS",
                    startIndex: rowNumber - 1,
                    endIndex: rowNumber,
                },
            },
        }));

    const deleteResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ requests }),
        }
    );

    if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        throw new Error(`행 삭제 실패: ${deleteResponse.status} ${errorText}`);
    }

    return { deletedRows: targetRows, message: `${targetRows.length}개 행 삭제` };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);

        // 실수로 호출되는 것을 막기 위한 확인 파라미터
        if (searchParams.get("confirm") !== "append-test") {
            return NextResponse.json(
                { error: "confirm=append-test 가 필요합니다." },
                { status: 400 }
            );
        }

        const sheetId = extractSheetId(process.env.GOOGLE_SHEET_URL);
        if (!sheetId) {
            return NextResponse.json(
                { error: "구글 시트 ID를 추출할 수 없습니다." },
                { status: 500 }
            );
        }

        const accessToken = await getGoogleAccessToken();
        const sheetName = await resolveSheetName(sheetId, accessToken);

        // 정리 모드
        if (searchParams.get("cleanup") === "true") {
            const result = await cleanupTestRows(
                sheetId,
                sheetName,
                accessToken
            );
            return NextResponse.json({ success: true, sheetName, ...result });
        }

        // 동시 저장 테스트
        const count = Math.min(
            Math.max(parseInt(searchParams.get("count") || "5", 10), 2),
            10
        );

        const results = await Promise.all(
            Array.from({ length: count }, (_, i) =>
                saveToGoogleSheet({
                    userId: `test-user-${i}`,
                    domainId: 0,
                    action: "테스트",
                    timestamp: new Date().toISOString(),
                    userInfo: {
                        name: `${TEST_NAME_PREFIX} ${i}`,
                        email: `append-test-${i}@invalid.test`,
                        department: "테스트",
                        level: "테스트",
                        position: "테스트",
                        employeeNumber: `T${i}`,
                    },
                })
                    .then((r: any) => ({
                        index: i,
                        // append 응답은 updates.updatedRange 에 실제 기록된 범위가 들어온다
                        updatedRange:
                            r?.updates?.updatedRange ?? r?.updatedRange ?? null,
                        raw: r?.updates ? "append" : "put/fallback",
                    }))
                    .catch((e: any) => ({
                        index: i,
                        error: e instanceof Error ? e.message : String(e),
                    }))
            )
        );

        // 서로 다른 행에 기록됐는지 확인
        const ranges = results
            .map((r: any) => r.updatedRange)
            .filter(Boolean) as string[];
        const uniqueRanges = new Set(ranges);

        return NextResponse.json({
            success: true,
            sheetName,
            requested: count,
            written: ranges.length,
            uniqueRows: uniqueRanges.size,
            collision: ranges.length !== uniqueRanges.size,
            verdict:
                ranges.length === count && uniqueRanges.size === count
                    ? "통과: 동시 저장 " + count + "건이 모두 다른 행에 기록됨"
                    : "확인 필요",
            results,
        });
    } catch (error) {
        console.error("append 테스트 오류:", error);
        return NextResponse.json(
            {
                error: "테스트 중 오류가 발생했습니다.",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
