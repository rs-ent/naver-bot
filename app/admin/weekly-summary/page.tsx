"use client";

import { useState, useEffect } from "react";
import { WeeklySummary } from "../../../lib/google-sheets";

export default function WeeklySummaryPage() {
    const [summary, setSummary] = useState<WeeklySummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split("T")[0]
    );
    const [saving, setSaving] = useState(false);

    const fetchWeeklySummary = async (date?: string) => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (date) {
                params.append("date", date);
            }

            const response = await fetch(`/api/weekly-summary?${params}`);
            const data = await response.json();

            if (data.success) {
                setSummary(data.data);
            } else {
                setError(data.error || "주간 결산을 불러올 수 없습니다.");
            }
        } catch (err) {
            setError("주간 결산 조회 중 오류가 발생했습니다.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const saveToSheet = async () => {
        setSaving(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (selectedDate) {
                params.append("date", selectedDate);
            }
            params.append("save", "true");

            const response = await fetch("/api/weekly-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (data.success) {
                setSummary(data.data);
                alert("주간 결산이 구글 시트에 저장되었습니다!");
            } else {
                setError(data.error || "주간 결산 저장에 실패했습니다.");
            }
        } catch (err) {
            setError("주간 결산 저장 중 오류가 발생했습니다.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        fetchWeeklySummary();
    }, []);

    const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedDate(event.target.value);
    };

    const handleRefresh = () => {
        fetchWeeklySummary(selectedDate);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">
                        주간 결산을 불러오는 중...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">
                            주간 결산 관리
                        </h1>
                        <div className="flex items-center space-x-4">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={handleDateChange}
                                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleRefresh}
                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                새로고침
                            </button>
                            <button
                                onClick={saveToSheet}
                                disabled={saving}
                                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                            >
                                {saving ? "저장 중..." : "구글 시트에 저장"}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                            <p className="text-red-800">{error}</p>
                        </div>
                    )}

                    {summary && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                                <h2 className="text-xl font-semibold text-blue-900 mb-4">
                                    📅 {summary.weekStart} ~ {summary.weekEnd}{" "}
                                    주간 결산
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-white rounded-lg p-4 text-center">
                                        <div className="text-2xl font-bold text-blue-600">
                                            {summary.totalEmployees}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            총 직원 수
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-lg p-4 text-center">
                                        <div className="text-2xl font-bold text-green-600">
                                            {summary.totalCheckins}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            총 출근 횟수
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-lg p-4 text-center">
                                        <div className="text-2xl font-bold text-purple-600">
                                            {summary.averageCheckinTime}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            평균 출근 시간
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-lg p-4 text-center">
                                        <div className="text-2xl font-bold text-orange-600">
                                            {summary.latestCheckin.time}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            가장 늦은 출근
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 text-center">
                                    <p className="text-blue-800">
                                        <strong>가장 늦은 출근:</strong>{" "}
                                        {summary.latestCheckin.name} (
                                        {summary.latestCheckin.department})
                                    </p>
                                </div>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                    부서별 통계
                                </h3>

                                {Object.keys(summary.departmentStats).length >
                                0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full bg-white rounded-lg overflow-hidden">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        부서
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        출근 횟수
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        평균 출근 시간
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        가장 늦은 출근
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {Object.entries(
                                                    summary.departmentStats
                                                ).map(
                                                    ([dept, stats], index) => (
                                                        <tr
                                                            key={dept}
                                                            className={
                                                                index % 2 === 0
                                                                    ? "bg-white"
                                                                    : "bg-gray-50"
                                                            }
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                {dept}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {
                                                                    stats.totalCheckins
                                                                }
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {
                                                                    stats.averageTime
                                                                }
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {
                                                                    stats.latestCheckin
                                                                }
                                                            </td>
                                                        </tr>
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">
                                        부서별 데이터가 없습니다.
                                    </p>
                                )}
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-yellow-900 mb-4">
                                    💡 결산 활용 팁
                                </h3>
                                <ul className="text-yellow-800 space-y-2">
                                    <li>
                                        • 매주 금요일 오후에 이 페이지에서 주간
                                        결산을 확인하세요
                                    </li>
                                    <li>
                                        • '구글 시트에 저장' 버튼을 눌러 결산
                                        결과를 별도 시트에 보관하세요
                                    </li>
                                    <li>
                                        • 가장 늦은 출근자를 파악하여 업무 시간
                                        관리에 활용하세요
                                    </li>
                                    <li>
                                        • 부서별 통계를 통해 업무 패턴을
                                        분석하세요
                                    </li>
                                    <li>
                                        • 특정 날짜의 결산을 보려면 날짜를
                                        선택하고 새로고침하세요
                                    </li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {!summary && !loading && (
                        <div className="text-center py-12">
                            <p className="text-gray-500 text-lg">
                                주간 결산 데이터를 불러올 수 없습니다.
                            </p>
                            <button
                                onClick={handleRefresh}
                                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
