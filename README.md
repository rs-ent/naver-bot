# 네이버 워크스 출근 봇

네이버 워크스를 통해 직원들의 출근을 관리하고 주간 결산을 자동으로 생성하는 봇입니다.

## 주요 기능

### 🏢 출근 관리

- **위치 기반 출근**: GPS 위치 정보와 함께 출근 기록
- **이미지 업로드**: 사진과 함께 출근 기록
- **텍스트 출근**: 간단한 텍스트로 출근 기록
- **실시간 모니터링**: 관리자가 실시간으로 출근 현황 확인

### ⏱️ 출근 기준 시각

요일별 출근 기준 시각은 [`lib/work-schedule.ts`](lib/work-schedule.ts) 한 곳에서만 관리합니다.

| 요일       | 기준 시각 |
| ---------- | --------- |
| 월요일     | 오전 11시 |
| 화 ~ 금요일 | 오전 10시 |

변경하려면 `WORK_START_HOUR_BY_DAY`(요일별 예외)와 `DEFAULT_WORK_START_HOUR`(기본값)만 수정하면
지각 판정, 지각 시간(분) 계산, 안내 문구에 모두 반영됩니다.

### 🚨 출근 알림 (신규)

메시지방 구성원 중 **당일 출근 절차를 마치지 않은 사람**을 기준으로 하루 두 번 알립니다.

| 시점           | 내용                                                |
| -------------- | --------------------------------------------------- |
| 출근 5분 전    | `@이름` 멘션으로 독촉. 대상이 없으면 전송하지 않음  |
| 출근 시각 정각 | 멘션 없이 명단만 공지. 전원 완료 시에도 공지        |

```
⏰ 7/31 지각/휴무 인원 (2명)
・차동훈
・홍유정
```

- **면제 인원**: [`lib/attendance-reminder.ts`](lib/attendance-reminder.ts)의 `DEFAULT_EXCLUDED_NAMES`에서 관리
- **자동 제외**: 주말과 `ATTENDANCE_HOLIDAYS`에 등록한 공휴일에는 전송하지 않음
- **휴무일 자동 감지**: 그날 출근 기록이 **한 건도 없으면** 회사 전체 휴무일로 보고 두 알림 모두 생략합니다.
  덕분에 대체공휴일·창립기념일 등을 목록에 넣지 않아도 자동으로 걸러집니다.
- **`미기록`(절차 미완료)은 출근으로 인정하지 않아** 알림 대상에 포함됩니다

### 🔒 출근 절차 본인 확인 (신규)

단체 메시지방에서는 버튼이 모든 구성원에게 보이므로, 다른 사람이 눌러 절차를 가로챌 수 있었습니다.
이제 **'출근하기'를 누른 본인만** 이후 단계(위치 인증 / 출근 유형 선택)를 진행할 수 있습니다.

```
A: (출근하기)          → 봇: 📍 A님, 위치를 선택해주세요 [버튼]
B: (그 버튼을 누름)     → 봇: ⚠️ B님, 먼저 '출근하기'를 눌러주세요 (기록 안 됨)
A: (그 버튼을 누름)     → 정상 진행
```

### 📝 미기록 처리 (신규)

**'출근하기'를 누른 시점에 곧바로** 액션 `미기록`으로 시트에 저장됩니다.
이후 절차를 끝까지 진행하지 않고 이탈해도 기록이 남습니다.

이어지는 단계(위치 인증 / 유형 선택)는 새 행을 추가하는 대신 **그 `미기록` 행을 갱신**하므로,
**한 사람당 하루 한 행**이 유지됩니다.
당일 절차를 이미 마친 사람이 '출근하기'를 다시 누르면 기존 기록을 안내하고 중복 저장하지 않습니다.

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

# 출근 알림 (전부 선택 사항 — 기본값이 코드에 들어 있습니다)
# 알림을 보낼 단체 메시지방. 비워두면 lib/attendance-reminder.ts 의 기본값을 사용합니다.
# 다른 방으로 바꾸려면 그 방에서 봇에게 /channelid 를 입력해 나온 값을 넣으세요.
NAVER_WORKS_REMINDER_CHANNEL_ID=
# 면제 인원 추가 (기본 5명 외에 더 제외할 이름, 쉼표 구분)
ATTENDANCE_EXCLUDE_NAMES=
# 면제 인원을 userId로 지정할 경우 (쉼표 구분)
ATTENDANCE_EXCLUDE_USER_IDS=
# 알림을 보내지 않을 공휴일 (YYYY-MM-DD, 쉼표 구분)
ATTENDANCE_HOLIDAYS=2026-08-15,2026-10-03

# 크론 엔드포인트 보호 (권장)
# 설정하면 Vercel 크론이 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 붙여줍니다.
CRON_SECRET=your-random-secret
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

### 출근 알림

- `GET|POST /api/cron/attendance-reminder` - 출근 5분 전 @멘션 독촉
- `GET|POST /api/cron/attendance-report` - 출근 정각 미체크 명단 공지

두 엔드포인트 모두 아래 쿼리를 지원합니다.

- `?dryRun=true` - 실제로 보내지 않고 대상자와 메시지 내용만 반환
- `?force=true` - 주말/공휴일 건너뛰기를 무시하고 강제 실행

응답의 `unresolved`는 이메일을 확인할 수 없어 대조에서 제외한 대상(봇 계정 등)입니다.

## 자동화 설정

### Vercel Cron Jobs (권장)

프로젝트에 `vercel.json`이 포함되어 있어 자동으로 설정됩니다.
**Vercel 크론은 항상 UTC 기준이며 GET 요청만 보냅니다.**

| 스케줄(UTC)    | 한국 시간   | 대상                            |
| -------------- | ----------- | ------------------------------- |
| `55 1 * * 1`   | 월 10:55    | `/api/cron/attendance-reminder` |
| `55 0 * * 2-5` | 화~금 09:55 | `/api/cron/attendance-reminder` |
| `0 2 * * 1`    | 월 11:00    | `/api/cron/attendance-report`   |
| `0 1 * * 2-5`  | 화~금 10:00 | `/api/cron/attendance-report`   |
| `0 14 * * 5`   | 금 23:00    | `/api/scheduler/weekly-summary` |

> 분 단위 정확도는 Pro 플랜 이상에서만 보장됩니다. Hobby 플랜은 하루 1회, ±59분 오차가 있습니다.

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
5. **출근 알림 대상 매칭**: 시트에 userId 컬럼이 없어 **이메일로 대조**합니다.
   이메일을 확인할 수 없는 계정은 잘못 멘션하지 않도록 알림 대상에서 제외되며,
   응답의 `unresolved`에 표시됩니다.
6. **멘션 상한**: 한 메시지에 최대 50명까지 멘션되며, 초과분은 "외 N명"으로 표시됩니다.
7. **이름 비교**: 네이버웍스는 이름을 `"이 성환"`처럼 성과 이름 사이에 공백을 넣어 반환하므로,
   면제 인원 대조 시 공백을 모두 제거한 뒤 비교합니다.

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
