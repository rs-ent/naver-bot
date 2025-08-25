# 네이버 워크스 출근 봇

네이버 워크스를 통해 직원들의 출근을 관리하고 주간 결산을 자동으로 생성하는 봇입니다.

## 주요 기능

### 🏢 출근 관리

- **위치 기반 출근**: GPS 위치 정보와 함께 출근 기록
- **이미지 업로드**: 사진과 함께 출근 기록
- **텍스트 출근**: 간단한 텍스트로 출근 기록
- **실시간 모니터링**: 관리자가 실시간으로 출근 현황 확인

### 📊 주간 결산 (신규)

- **자동 결산 생성**: 매주 금요일 오후 2시에 자동 실행
- **통계 분석**:
  - 총 직원 수 및 출근 횟수
  - 평균 출근 시간
  - 가장 늦은 출근자 정보
  - 부서별 상세 통계
- **구글 시트 연동**: 결산 결과를 별도 시트에 자동 저장
- **수동 실행**: 언제든지 수동으로 결산 생성 가능

### ⏰ 스케줄러 관리

- **자동화**: 매주 금요일 오후 2시 자동 실행
- **실시간 모니터링**: 스케줄러 상태 실시간 확인
- **수동 제어**: 필요시 강제 실행 가능
- **외부 스케줄러 지원**: cron, Vercel Cron Jobs 등

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Prisma ORM
- **Storage**: Vercel Blob
- **Authentication**: Google Service Account
- **Scheduling**: Vercel Cron Jobs

## 설치 및 설정

### 1. 환경 변수 설정

```bash
# Google Sheets
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit
GOOGLE_SHEET_WORKSHEET=Sheet1

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_TYPE=service_account
GOOGLE_SERVICE_ACCOUNT_PROJECT_ID=your-project-id
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_CLIENT_ID=your-client-id

# 네이버 워크스
NAVER_WORKS_BOT_TOKEN=your-bot-token
NAVER_WORKS_DOMAIN_ID=your-domain-id

# Vercel Blob
BLOB_READ_WRITE_TOKEN=your-blob-token
```

### 2. 의존성 설치

```bash
yarn install
```

### 3. 데이터베이스 설정

```bash
yarn db:generate
yarn db:push
```

### 4. 개발 서버 실행

```bash
yarn dev
```

## 사용법

### 직원용 (네이버 워크스 봇)

1. **출근하기**: 봇과 대화하여 '출근하기' 버튼 클릭
2. **위치 선택**: 실제 현재 위치 선택 또는 위치 없이 출근
3. **이미지 업로드**: 채팅창에 이미지 업로드하여 자동 저장

### 관리자용 (웹 대시보드)

1. **출근 현황**: `/admin` - 실시간 출근 현황 및 통계
2. **주간 결산**: `/admin/weekly-summary` - 주간 결산 보고서
3. **스케줄러**: `/admin/scheduler` - 자동 결산 스케줄러 관리

## API 엔드포인트

### 주간 결산

- `GET /api/weekly-summary` - 주간 결산 조회
- `POST /api/weekly-summary` - 주간 결산 생성 및 저장

### 스케줄러

- `GET /api/scheduler/weekly-summary` - 스케줄러 상태 조회
- `POST /api/scheduler/weekly-summary` - 스케줄러 실행

## 자동화 설정

### Vercel Cron Jobs (권장)

프로젝트에 `vercel.json`이 포함되어 있어 자동으로 설정됩니다.

### 수동 cron 설정

```bash
# 매주 금요일 오후 2시 실행
0 14 * * 5 curl -X POST https://your-domain.com/api/scheduler/weekly-summary
```

## 구글 시트 구조

### 출근 기록 시트

- 타임스탬프, 한국시간, 이름, 이메일, 부서, 직급, 직책, 사번
- 액션, 도메인ID, 출처, 이미지URL, IP주소, User Agent
- 국가, 도시, 출근주소, 위도, 경도, 위치검증, 검증메모

### 주간결산 시트 (자동 생성)

- 주간 통계 요약
- 부서별 상세 통계
- 가장 늦은 출근자 정보

## 주의사항

1. **위치 검증**: 정확한 GPS 좌표가 아닌 경우 관리자에게 경고 표시
2. **쿨다운**: 연속 출근 시도 방지를 위한 30초 대기 시간
3. **데이터 보안**: 모든 출근 기록은 구글 시트에 암호화되어 저장
4. **자동 실행**: 매주 금요일 오후 2시에만 자동 실행 (수동 실행 가능)

## 문제 해결

### 일반적인 문제

- **Google Sheets 연결 오류**: 서비스 계정 권한 및 환경 변수 확인
- **이미지 업로드 실패**: Vercel Blob 토큰 및 권한 확인
- **스케줄러 실행 안됨**: Vercel Cron Jobs 설정 및 시간대 확인

### 로그 확인

- 브라우저 개발자 도구 콘솔
- Vercel 대시보드 함수 로그
- 구글 시트 API 응답

## 라이선스

MIT License

## 기여

버그 리포트 및 기능 제안은 이슈로 등록해주세요.
Pull Request도 환영합니다.
