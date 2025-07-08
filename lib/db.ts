import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// 타입 정의
export interface AttendanceRecord {
    id: string;
    userId: string;
    type: "CHECKIN" | "CHECKOUT" | "BREAK";
    timestamp: Date;
    method: "LOCATION" | "PHOTO" | "TEXT" | "MANUAL";
    location?: string;
    photoUrl?: string;
    notes?: string;
    isLate: boolean;
}

// 사용자 관련 함수들
export async function findOrCreateUser(
    accountId: string,
    userData?: {
        name?: string;
        email?: string;
        department?: string;
        position?: string;
    }
) {
    let user = await prisma.user.findUnique({
        where: { accountId },
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                accountId,
                ...userData,
            },
        });
    }

    return user;
}

// 출근 기록 함수들
export async function createAttendance(
    accountId: string,
    type: "CHECKIN" | "CHECKOUT" | "BREAK",
    method: "LOCATION" | "PHOTO" | "TEXT" | "MANUAL",
    options?: {
        location?: string;
        photoUrl?: string;
        notes?: string;
    }
) {
    // 사용자 찾기 또는 생성
    const user = await findOrCreateUser(accountId);

    // 지각 여부 확인 (출근인 경우만)
    let isLate = false;
    if (type === "CHECKIN") {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const workStartTime = 9 * 60; // 09:00을 분으로 변환
        isLate = currentTime > workStartTime;
    }

    const attendance = await prisma.attendance.create({
        data: {
            userId: user.id,
            type,
            method,
            location: options?.location,
            photoUrl: options?.photoUrl,
            notes: options?.notes,
            isLate,
        },
        include: {
            user: true,
        },
    });

    return attendance;
}

// 오늘의 출근 기록 조회
export async function getTodayAttendance(accountId: string) {
    const user = await prisma.user.findUnique({
        where: { accountId },
    });

    if (!user) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendances = await prisma.attendance.findMany({
        where: {
            userId: user.id,
            timestamp: {
                gte: today,
                lt: tomorrow,
            },
        },
        orderBy: {
            timestamp: "asc",
        },
    });

    return attendances;
}

// 이번 주 출근 현황 조회
export async function getWeeklyAttendance(accountId: string) {
    const user = await prisma.user.findUnique({
        where: { accountId },
    });

    if (!user) return [];

    // 이번 주 월요일부터 일요일까지
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    monday.setHours(0, 0, 0, 0);

    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const attendances = await prisma.attendance.findMany({
        where: {
            userId: user.id,
            timestamp: {
                gte: monday,
                lt: nextMonday,
            },
        },
        orderBy: {
            timestamp: "asc",
        },
    });

    return attendances;
}

// 출근 현황 통계
export async function getAttendanceStats(accountId: string) {
    const user = await prisma.user.findUnique({
        where: { accountId },
    });

    if (!user) return null;

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const nextMonth = new Date(thisMonth);
    nextMonth.setMonth(thisMonth.getMonth() + 1);

    const stats = await prisma.attendance.groupBy({
        by: ["type"],
        where: {
            userId: user.id,
            timestamp: {
                gte: thisMonth,
                lt: nextMonth,
            },
        },
        _count: {
            id: true,
        },
    });

    const lateCount = await prisma.attendance.count({
        where: {
            userId: user.id,
            type: "CHECKIN",
            isLate: true,
            timestamp: {
                gte: thisMonth,
                lt: nextMonth,
            },
        },
    });

    return {
        checkinCount: stats.find((s) => s.type === "CHECKIN")?._count.id || 0,
        checkoutCount: stats.find((s) => s.type === "CHECKOUT")?._count.id || 0,
        lateCount,
    };
}

// 근무시간 계산
export async function calculateWorkingHours(accountId: string, date?: Date) {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(targetDate.getDate() + 1);

    const user = await prisma.user.findUnique({
        where: { accountId },
    });

    if (!user) return 0;

    const attendances = await prisma.attendance.findMany({
        where: {
            userId: user.id,
            timestamp: {
                gte: targetDate,
                lt: nextDay,
            },
        },
        orderBy: {
            timestamp: "asc",
        },
    });

    let workingHours = 0;
    let checkinTime: Date | null = null;

    for (const attendance of attendances) {
        if (attendance.type === "CHECKIN") {
            checkinTime = attendance.timestamp;
        } else if (attendance.type === "CHECKOUT" && checkinTime) {
            const hours =
                (attendance.timestamp.getTime() - checkinTime.getTime()) /
                (1000 * 60 * 60);
            workingHours += hours;
            checkinTime = null;
        }
    }

    return Math.round(workingHours * 10) / 10; // 소수점 1자리까지
}
