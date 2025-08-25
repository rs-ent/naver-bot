"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AttendanceRecord {
    id: string;
    user: {
        name?: string;
        accountId: string;
        department?: string;
    };
    type: "CHECKIN" | "CHECKOUT" | "BREAK";
    timestamp: string;
    method: "LOCATION" | "PHOTO" | "TEXT" | "MANUAL";
    isLate: boolean;
    notes?: string;
    workingHours?: number;
}

interface AttendanceStats {
    totalUsers: number;
    checkedInToday: number;
    lateToday: number;
    averageWorkingHours: number;
}

export default function AdminDashboard() {
    const [attendanceRecords, setAttendanceRecords] = useState<
        AttendanceRecord[]
    >([]);
    const [stats, setStats] = useState<AttendanceStats>({
        totalUsers: 0,
        checkedInToday: 0,
        lateToday: 0,
        averageWorkingHours: 0,
    });
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );

    useEffect(() => {
        fetchAttendanceData();
    }, [selectedDate]);

    const fetchAttendanceData = async () => {
        try {
            setLoading(true);
            const response = await fetch(
                `/api/admin/attendance?date=${selectedDate}`
            );
            const data = await response.json();
            setAttendanceRecords(data.records || []);
            setStats(data.stats || stats);
        } catch (error) {
            console.error("출근 데이터 로딩 오류:", error);
        } finally {
            setLoading(false);
        }
    };

    const getMethodIcon = (method: string) => {
        switch (method) {
            case "LOCATION":
                return "📍";
            case "PHOTO":
                return "📷";
            case "TEXT":
                return "✏️";
            case "MANUAL":
                return "👤";
            default:
                return "❓";
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case "CHECKIN":
                return "text-green-600";
            case "CHECKOUT":
                return "text-red-600";
            case "BREAK":
                return "text-yellow-600";
            default:
                return "text-gray-600";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* 헤더 */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">
                                🏢 출근 관리 대시보드
                            </h1>
                            <p className="text-gray-600">
                                직원들의 출근 현황을 실시간으로 확인하세요
                            </p>
                        </div>
                        <div className="flex space-x-4">
                            <Link
                                href="/admin/weekly-summary"
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                            >
                                📊 주간 결산 보기
                            </Link>
                            <Link
                                href="/admin/scheduler"
                                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors"
                            >
                                ⏰ 스케줄러 관리
                            </Link>
                        </div>
                    </div>
                </div>

                {/* 날짜 선택 */}
                <div className="mb-6">
                    <label
                        htmlFor="date"
                        className="block text-sm font-medium text-gray-700 mb-2"
                    >
                        날짜 선택
                    </label>
                    <input
                        type="date"
                        id="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                {/* 통계 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <span className="text-2xl">👥</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">
                                    전체 직원
                                </p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {stats.totalUsers}명
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <span className="text-2xl">✅</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">
                                    오늘 출근
                                </p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {stats.checkedInToday}명
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">
                                    지각
                                </p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {stats.lateToday}명
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <span className="text-2xl">⏰</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">
                                    평균 근무시간
                                </p>
                                <p className="text-2xl font-semibold text-gray-900">
                                    {stats.averageWorkingHours}h
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 출근 기록 테이블 */}
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">
                            출근 기록
                        </h2>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            <p className="mt-2 text-gray-600">로딩 중...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            직원
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            구분
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            시간
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            인증 방법
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            상태
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            메모
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {attendanceRecords.map((record) => (
                                        <tr
                                            key={record.id}
                                            className="hover:bg-gray-50"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {record.user.name ||
                                                            "이름 없음"}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {record.user
                                                            .department ||
                                                            "부서 없음"}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`text-sm font-medium ${getTypeColor(
                                                        record.type
                                                    )}`}
                                                >
                                                    {record.type === "CHECKIN"
                                                        ? "출근"
                                                        : record.type ===
                                                          "CHECKOUT"
                                                        ? "퇴근"
                                                        : "휴식"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {new Date(
                                                    record.timestamp
                                                ).toLocaleString("ko-KR")}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                <span className="flex items-center">
                                                    {getMethodIcon(
                                                        record.method
                                                    )}
                                                    <span className="ml-2">
                                                        {record.method ===
                                                        "LOCATION"
                                                            ? "위치"
                                                            : record.method ===
                                                              "PHOTO"
                                                            ? "사진"
                                                            : record.method ===
                                                              "TEXT"
                                                            ? "텍스트"
                                                            : "수동"}
                                                    </span>
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {record.isLate ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                        지각
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        정상
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                                                {record.notes || "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {attendanceRecords.length === 0 && (
                                <div className="p-8 text-center text-gray-500">
                                    해당 날짜에 출근 기록이 없습니다.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
