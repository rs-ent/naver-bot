"use client";

import { useState, useEffect } from "react";

interface SchedulerStatus {
    currentTime: string;
    isFriday: boolean;
    isAfternoon: boolean;
    nextExecution: string;
    canRunNow: boolean;
    message: string;
}

export default function SchedulerPage() {
    const [status, setStatus] = useState<SchedulerStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    const fetchStatus = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/scheduler/weekly-summary");
            const data = await response.json();

            if (data.success) {
                setStatus(data);
            } else {
                setError(data.error || "스케줄러 상태를 불러올 수 없습니다.");
            }
        } catch (err) {
            setError("스케줄러 상태 조회 중 오류가 발생했습니다.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const runScheduler = async (force: boolean = false) => {
        setRunning(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (force) {
                params.append("force", "true");
            }

            const response = await fetch("/api/scheduler/weekly-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            const data = await response.json();

            if (data.success) {
                setLastRun(new Date().toISOString());
                alert("주간 결산이 성공적으로 생성되었습니다!");
                fetchStatus();
            } else {
                setError(data.message || "스케줄러 실행에 실패했습니다.");
            }
        } catch (err) {
            setError("스케줄러 실행 중 오류가 발생했습니다.");
            console.error(err);
        } finally {
            setRunning(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">
                        스케줄러 상태를 불러오는 중...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">
                            주간 결산 스케줄러
                        </h1>
                        <div className="flex space-x-4">
                            <button
                                onClick={() => fetchStatus()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                새로고침
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                            <p className="text-red-800">{error}</p>
                        </div>
                    )}

                    {status && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                                <h2 className="text-xl font-semibold text-blue-900 mb-4">
                                    📅 스케줄러 상태
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-white rounded-lg p-4">
                                        <div className="text-sm text-gray-600 mb-2">
                                            현재 시간
                                        </div>
                                        <div className="text-lg font-semibold text-gray-900">
                                            {new Date(
                                                status.currentTime
                                            ).toLocaleString("ko-KR")}
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-4">
                                        <div className="text-sm text-gray-600 mb-2">
                                            다음 실행 시간
                                        </div>
                                        <div className="text-lg font-semibold text-gray-900">
                                            {new Date(
                                                status.nextExecution
                                            ).toLocaleString("ko-KR")}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 p-4 bg-white rounded-lg">
                                    <div className="flex items-center space-x-4">
                                        <div
                                            className={`w-4 h-4 rounded-full ${
                                                status.isFriday
                                                    ? "bg-green-500"
                                                    : "bg-gray-400"
                                            }`}
                                        ></div>
                                        <span className="text-sm">
                                            {status.isFriday
                                                ? "✅ 금요일"
                                                : "❌ 금요일 아님"}
                                        </span>

                                        <div
                                            className={`w-4 h-4 rounded-full ${
                                                status.isAfternoon
                                                    ? "bg-green-500"
                                                    : "bg-gray-400"
                                            }`}
                                        ></div>
                                        <span className="text-sm">
                                            {status.isAfternoon
                                                ? "✅ 오후 2시 이후"
                                                : "❌ 오전 또는 오후 2시 이전"}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-4 text-center">
                                    <p className="text-blue-800 font-medium">
                                        {status.message}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-green-900 mb-4">
                                    실행 제어
                                </h3>

                                <div className="flex space-x-4">
                                    <button
                                        onClick={() => runScheduler(false)}
                                        disabled={running || !status.canRunNow}
                                        className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {running ? "실행 중..." : "지금 실행"}
                                    </button>

                                    <button
                                        onClick={() => runScheduler(true)}
                                        disabled={running}
                                        className="bg-orange-600 text-white px-6 py-3 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                                    >
                                        {running ? "실행 중..." : "강제 실행"}
                                    </button>
                                </div>

                                <div className="mt-4 text-sm text-green-700">
                                    <p>
                                        • <strong>지금 실행:</strong> 금요일
                                        오후 2시 이후에만 실행 가능
                                    </p>
                                    <p>
                                        • <strong>강제 실행:</strong> 언제든지
                                        실행 가능 (테스트용)
                                    </p>
                                </div>
                            </div>

                            {lastRun && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                                        마지막 실행 기록
                                    </h3>
                                    <p className="text-gray-700">
                                        마지막 실행:{" "}
                                        {new Date(lastRun).toLocaleString(
                                            "ko-KR"
                                        )}
                                    </p>
                                </div>
                            )}

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-yellow-900 mb-4">
                                    💡 스케줄러 정보
                                </h3>
                                <ul className="text-yellow-800 space-y-2">
                                    <li>
                                        • 매주 금요일 오후 2시에 자동으로 주간
                                        결산을 생성합니다
                                    </li>
                                    <li>
                                        • 결산 결과는 구글 시트의 '주간결산'
                                        시트에 저장됩니다
                                    </li>
                                    <li>
                                        • 수동으로 언제든지 실행할 수 있습니다
                                    </li>
                                    <li>
                                        • 이 페이지에서 스케줄러 상태를
                                        실시간으로 확인할 수 있습니다
                                    </li>
                                    <li>
                                        • 자동 실행을 위해서는 외부 스케줄러(예:
                                        cron)를 설정해야 합니다
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                                <h3 className="text-lg font-semibold text-blue-900 mb-4">
                                    🔧 외부 스케줄러 설정
                                </h3>
                                <div className="bg-white p-4 rounded-lg">
                                    <p className="text-sm text-gray-700 mb-2">
                                        매주 금요일 오후 2시에 실행하려면:
                                    </p>
                                    <code className="block bg-gray-100 p-2 rounded text-sm">
                                        # crontab -e
                                        <br />0 14 * * 5 curl -X POST
                                        https://your-domain.com/api/scheduler/weekly-summary
                                    </code>
                                    <p className="text-sm text-gray-600 mt-2">
                                        또는 Vercel Cron Jobs를 사용할 수
                                        있습니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!status && !loading && (
                        <div className="text-center py-12">
                            <p className="text-gray-500 text-lg">
                                스케줄러 상태를 불러올 수 없습니다.
                            </p>
                            <button
                                onClick={fetchStatus}
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
