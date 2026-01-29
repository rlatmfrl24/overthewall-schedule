# 스케줄 자동 업데이트

## 개요

오버더월 스케줄은 사용자들이 직접 업데이트하는 방식으로 운영된다. 하지만 매주 초기에는 멤버들의 스케줄 공지 및 업데이트가 늦어지는 문제가 있어, 치지직 라이브/VOD 상태를 기반으로 스케줄을 자동 업데이트하는 기능을 구현했다.

## 기능 요구사항

### 1. 자동 업데이트 대상

- 미정, 휴방, 게릴라 상태의 스케줄

### 2. 자동 업데이트 주기

- 관리자 UI에서 설정 가능 (1시간 / 2시간 / 4시간)
- 기본값: 2시간

### 3. 자동 업데이트 로직

1. 오늘 날짜(KST 기준)의 미정/휴방/게릴라 상태 스케줄 조회
2. 해당 멤버들의 치지직 채널 ID 추출 (`url_chzzk` 필드 활용)
3. 라이브 상태 확인 → 라이브 중이면 "방송" 상태로 업데이트
4. 라이브 아닌 경우 VOD 확인 → 오늘 날짜의 VOD가 있으면 "방송" 상태로 업데이트
5. 제목과 시작 시간을 스케줄 테이블에 함께 업데이트

## 구현 상세

### DB 스키마

`settings` 테이블 추가:

| 필드       | 타입      | 설명          |
| ---------- | --------- | ------------- |
| key        | TEXT (PK) | 설정 키       |
| value      | TEXT      | 설정 값       |
| updated_at | NUMERIC   | 업데이트 시간 |

설정 키:

- `auto_update_enabled`: 활성화 여부 ("true" / "false")
- `auto_update_interval_hours`: 실행 주기 ("1" / "2" / "4")
- `auto_update_last_run`: 마지막 실행 시간 (타임스탬프)

### Cron Trigger

- wrangler.jsonc에 `triggers.crons: ["0 * * * *"]` 설정 (매시 정각 실행)
- 실제 업데이트 주기는 DB 설정값(`auto_update_interval_hours`)으로 제어
- 마지막 실행 시간과 비교하여 주기가 지났을 때만 실행

### API 엔드포인트

| 메서드 | 경로                    | 설명          |
| ------ | ----------------------- | ------------- |
| GET    | `/api/settings`         | 설정 조회     |
| PUT    | `/api/settings`         | 설정 업데이트 |
| POST   | `/api/settings/run-now` | 수동 실행     |

### 관리자 UI

경로: `/admin/settings`

기능:

- 자동 업데이트 활성화/비활성화 토글
- 업데이트 주기 선택 (1시간 / 2시간 / 4시간)
- 수동 실행 버튼 및 실행 결과 표시
- 마지막 실행 시간 표시

## 관련 파일

- `src/db/schema.ts` - settings 테이블 정의
- `drizzle/0010_add_settings.sql` - 마이그레이션
- `worker/index.ts` - scheduled 핸들러, autoUpdateSchedules 함수, 설정 API
- `src/lib/api/settings.ts` - 설정 API 클라이언트
- `src/features/admin/auto-update-settings.tsx` - 관리자 UI 컴포넌트
- `src/routes/admin/settings.tsx` - 설정 페이지 라우트
