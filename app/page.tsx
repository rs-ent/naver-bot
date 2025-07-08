import Link from "next/link";

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
                    {/* 헤더 */}
                    <div className="text-center mb-12">
                        <div className="flex justify-center items-center mb-6">
                            <span className="text-6xl mr-4">🏢</span>
                            <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
                                출근 관리 봇
                            </h1>
                        </div>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            네이버웍스 채팅에서 간편하게 출근/퇴근을 관리하세요.
                            다양한 인증 방법과 실시간 현황 조회를 지원합니다.
                        </p>
                    </div>

                    {/* 기능 소개 */}
                    <div className="grid md:grid-cols-3 gap-8 mb-12">
                        <div className="text-center p-6 bg-green-50 rounded-xl">
                            <div className="text-4xl mb-4">📍</div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                위치 인증
                            </h3>
                            <p className="text-gray-600">
                                회사 위치에서 간편하게 출근 인증을 완료하세요
                            </p>
                        </div>

                        <div className="text-center p-6 bg-purple-50 rounded-xl">
                            <div className="text-4xl mb-4">📷</div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                사진 인증
                            </h3>
                            <p className="text-gray-600">
                                출근 증명 사진을 업로드하여 인증을 완료하세요
                            </p>
                        </div>

                        <div className="text-center p-6 bg-yellow-50 rounded-xl">
                            <div className="text-4xl mb-4">✏️</div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                텍스트 인증
                            </h3>
                            <p className="text-gray-600">
                                오늘의 업무 계획을 작성하며 출근을 인증하세요
                            </p>
                        </div>
                    </div>

                    {/* 사용 방법 */}
                    <div className="bg-gray-50 rounded-xl p-8 mb-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                            🎯 사용 방법
                        </h2>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    📱 직원용 (네이버웍스 채팅)
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-start">
                                        <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            1
                                        </span>
                                        <p className="text-gray-700">
                                            네이버웍스에서 출근 관리 봇과 채팅
                                            시작
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            2
                                        </span>
                                        <p className="text-gray-700">
                                            <code className="bg-gray-200 px-2 py-1 rounded">
                                                /출근
                                            </code>{" "}
                                            명령어 입력
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            3
                                        </span>
                                        <p className="text-gray-700">
                                            원하는 인증 방법 선택
                                            (위치/사진/텍스트)
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            4
                                        </span>
                                        <p className="text-gray-700">
                                            출근 인증 완료! 📊 현황 조회도 가능
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    👔 관리자용 (웹 대시보드)
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-start">
                                        <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            1
                                        </span>
                                        <p className="text-gray-700">
                                            관리자 대시보드 접속
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            2
                                        </span>
                                        <p className="text-gray-700">
                                            실시간 출근 현황 모니터링
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            3
                                        </span>
                                        <p className="text-gray-700">
                                            출근률, 지각률 등 통계 확인
                                        </p>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-3 mt-0.5">
                                            4
                                        </span>
                                        <p className="text-gray-700">
                                            날짜별 출근 기록 조회
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href="/admin"
                            className="inline-flex items-center justify-center px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors duration-200 shadow-lg"
                        >
                            <span className="mr-2">👔</span>
                            관리자 대시보드
                        </Link>

                        <div className="inline-flex items-center justify-center px-8 py-4 bg-gray-100 text-gray-700 font-semibold rounded-xl border-2 border-dashed border-gray-300">
                            <span className="mr-2">📱</span>
                            네이버웍스에서 봇 사용
                        </div>
                    </div>

                    {/* 설정 안내 */}
                    <div className="mt-12 p-6 bg-blue-50 rounded-xl border border-blue-200">
                        <h3 className="text-lg font-semibold text-blue-900 mb-3">
                            🔧 설정이 필요하신가요?
                        </h3>
                        <div className="text-blue-800 space-y-2">
                            <p>• 네이버웍스 Developer Console에서 봇 등록</p>
                            <p>
                                • Callback URL 설정:{" "}
                                <code className="bg-blue-100 px-2 py-1 rounded text-sm">
                                    https://your-domain.com/api/webhook
                                </code>
                            </p>
                            <p>
                                • 환경변수 설정 (
                                <code className="bg-blue-100 px-2 py-1 rounded text-sm">
                                    .env.local
                                </code>
                                )
                            </p>
                            <p>• 데이터베이스 마이그레이션 실행</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
