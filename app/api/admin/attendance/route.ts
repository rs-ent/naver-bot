import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date");

        // 날짜 파라미터 처리
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(targetDate.getDate() + 1);

        // 해당 날짜의 출근 기록 조회
        const attendanceRecords = await prisma.attendance.findMany({
            where: {
                timestamp: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
            include: {
                user: {
                    select: {
                        name: true,
                        accountId: true,
                        department: true,
                        position: true,
                    },
                },
            },
            orderBy: {
                timestamp: "desc",
            },
        });

        // 전체 사용자 수
        const totalUsers = await prisma.user.count();

        // 오늘 출근한 사용자 수 (중복 제거)
        const checkedInToday = await prisma.attendance.findMany({
            where: {
                type: "CHECKIN",
                timestamp: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
            distinct: ["userId"],
        });

        // 오늘 지각한 사용자 수
        const lateToday = await prisma.attendance.count({
            where: {
                type: "CHECKIN",
                isLate: true,
                timestamp: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
        });

        // 평균 근무시간 계산
        const workingHoursData = await prisma.attendance.findMany({
            where: {
                timestamp: {
                    gte: targetDate,
                    lt: nextDay,
                },
            },
            include: {
                user: true,
            },
            orderBy: [{ userId: "asc" }, { timestamp: "asc" }],
        });

        // 사용자별 근무시간 계산
        const userWorkingHours: { [key: string]: number } = {};
        let currentCheckin: { [key: string]: Date } = {};

        workingHoursData.forEach((record) => {
            const userId = record.userId;

            if (record.type === "CHECKIN") {
                currentCheckin[userId] = record.timestamp;
            } else if (record.type === "CHECKOUT" && currentCheckin[userId]) {
                const hours =
                    (record.timestamp.getTime() -
                        currentCheckin[userId].getTime()) /
                    (1000 * 60 * 60);
                userWorkingHours[userId] =
                    (userWorkingHours[userId] || 0) + hours;
                delete currentCheckin[userId];
            }
        });

        const totalWorkingHours = Object.values(userWorkingHours).reduce(
            (sum, hours) => sum + hours,
            0
        );
        const averageWorkingHours =
            Object.keys(userWorkingHours).length > 0
                ? Math.round(
                      (totalWorkingHours /
                          Object.keys(userWorkingHours).length) *
                          10
                  ) / 10
                : 0;

        // 통계 데이터
        const stats = {
            totalUsers,
            checkedInToday: checkedInToday.length,
            lateToday,
            averageWorkingHours,
        };

        // 응답 데이터 형식 변환
        const records = attendanceRecords.map((record) => ({
            id: record.id,
            user: {
                name: record.user.name,
                accountId: record.user.accountId,
                department: record.user.department,
            },
            type: record.type,
            timestamp: record.timestamp.toISOString(),
            method: record.method,
            isLate: record.isLate,
            notes: record.notes,
            workingHours: userWorkingHours[record.userId],
        }));

        return NextResponse.json({
            success: true,
            records,
            stats,
        });
    } catch (error) {
        console.error("관리자 출근 데이터 조회 오류:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
