# 스케줄 자동 업데이트

## 개요

오버더월 스케줄은 사용자들이 직접 업데이트하는 방식으로 운영된다. 하지만 매주 초기에는 멤버들의 스케줄 공지 및 업데이트가 늦어지는 문제가 있어, 치지직 라이브/VOD 상태를 기반으로 스케줄을 자동 수집하고, 관리자 승인 후 반영하는 기능을 구현했다.

## 기능 요구사항

### 1. 자동 수집 대상

- 미정, 휴방, 게릴라 상태의 스케줄
- 스케줄이 없는 날짜의 새 방송

### 2. 자동 수집 주기

- 관리자 UI에서 설정 가능 (1시간 / 2시간 / 4시간)
- 기본값: 2시간

### 3. 자동 수집 및 승인 프로세스

```
Cron 트리거 → VOD 수집 → 대기 스케줄 저장 → 관리자 검토 → 승인/거부
```

1. 설정된 날짜 범위(기본 3일) 내의 모든 활성 멤버 조회
2. 해당 멤버들의 치지직 채널 ID 추출 (`url_chzzk` 필드 활용)
3. 각 멤버의 치지직 VOD 목록 조회 (최대 15개)
4. 각 VOD의 실제 스트리밍 시작 시간을 계산하여 날짜 범위 내의 것만 처리
5. VOD 처리 로직 (승인 대기 상태로 저장):
   - 해당 날짜에 시작 시간이 비슷한(±30분) 스케줄이 없으면 → `action_type: "create"`
   - 시작 시간이 비슷한 스케줄이 있고, 상태가 "방송"이 아니거나 제목이 없으면 → `action_type: "update"`
   - 이미 "방송" 상태이며 제목이 있으면 → 수집하지 않음
6. 관리자가 대기 스케줄을 승인하면 실제 스케줄표에 반영
7. **중요**: 한 날짜에 여러 개의 다시보기가 있으면 모두 별도의 대기 스케줄로 생성됨

### 4. 안전장치

- **중복 방지**: `vod_id`로 동일 VOD 중복 수집 방지, `member_uid + date + start_time`으로 중복 체크
- **충돌 감지**: 승인 시 기존 스케줄과 시간 충돌 검사 (±30분)
- **정합성 검사**: 업데이트 승인 시 대상 스케줄이 아직 존재하는지 확인

## 구현 상세

### DB 스키마

`settings` 테이블:

| 필드       | 타입      | 설명          |
| ---------- | --------- | ------------- |
| key        | TEXT (PK) | 설정 키       |
| value      | TEXT      | 설정 값       |
| updated_at | NUMERIC   | 업데이트 시간 |

`pending_schedules` 테이블 (승인 대기):

| 필드                 | 타입    | 설명                   |
| -------------------- | ------- | ---------------------- |
| id                   | INTEGER | PK                     |
| member_uid           | INTEGER | 멤버 UID               |
| member_name          | TEXT    | 멤버 이름              |
| date                 | TEXT    | 스케줄 날짜            |
| start_time           | TEXT    | 시작 시간              |
| title                | TEXT    | 제목                   |
| status               | TEXT    | 상태 (기본: "방송")    |
| action_type          | TEXT    | "create" 또는 "update" |
| existing_schedule_id | INTEGER | 수정 대상 스케줄 ID    |
| previous_status      | TEXT    | 수정 전 상태           |
| previous_title       | TEXT    | 수정 전 제목           |
| vod_id               | TEXT    | 중복 방지용 VOD 식별자 |
| created_at           | NUMERIC | 생성 시간              |

`auto_update_logs` 테이블 (로그):

| 필드            | 타입    | 설명                        |
| --------------- | ------- | --------------------------- |
| id              | INTEGER | PK                          |
| schedule_id     | INTEGER | 연결된 스케줄 ID            |
| member_uid      | INTEGER | 멤버 UID                    |
| member_name     | TEXT    | 멤버 이름                   |
| schedule_date   | TEXT    | 스케줄 날짜                 |
| action          | TEXT    | collected/approved/rejected |
| title           | TEXT    | 제목                        |
| previous_status | TEXT    | 이전 상태                   |
| created_at      | NUMERIC | 생성 시간                   |

### Cron Trigger

- wrangler.jsonc에 `triggers.crons: ["0 * * * *"]` 설정 (매시 정각 실행)
- 실제 업데이트 주기는 DB 설정값(`auto_update_interval_hours`)으로 제어
- 마지막 실행 시간과 비교하여 주기가 지났을 때만 실행

### API 엔드포인트

| 메서드 | 경로                                | 설명             |
| ------ | ----------------------------------- | ---------------- |
| GET    | `/api/settings`                     | 설정 조회        |
| PUT    | `/api/settings`                     | 설정 업데이트    |
| POST   | `/api/settings/run-now`             | 수동 실행        |
| GET    | `/api/settings/logs`                | 로그 조회        |
| DELETE | `/api/settings/logs/:id`            | 로그 삭제        |
| GET    | `/api/settings/pending`             | 대기 스케줄 목록 |
| POST   | `/api/settings/pending/:id/approve` | 개별 승인        |
| POST   | `/api/settings/pending/:id/reject`  | 개별 거부        |
| POST   | `/api/settings/pending/approve-all` | 전체 승인        |
| POST   | `/api/settings/pending/reject-all`  | 전체 거부        |

### 관리자 UI

경로: `/admin/settings`

기능:

- 자동 수집 활성화/비활성화 토글
- 수집 주기 선택 (1시간 / 2시간 / 4시간)
- 검색 범위 선택 (1일 / 2일 / 3일 / 5일 / 7일)
- 수동 실행 버튼 및 실행 결과 표시
- 마지막 실행 시간 표시
- **승인 대기 스케줄 목록**: 개별/일괄 승인 및 거부
- **수집/승인 기록**: 로그 표시 및 삭제

## 관련 파일

- `src/db/schema.ts` - settings, pendingSchedules, autoUpdateLogs 테이블 정의
- `drizzle/0011_cold_maximus.sql` - settings 테이블 마이그레이션
- `drizzle/0012_flimsy_millenium_guard.sql` - autoUpdateLogs 테이블 마이그레이션
- `drizzle/0013_add_pending_schedules.sql` - pendingSchedules 테이블 마이그레이션
- `worker/index.ts` - scheduled 핸들러, autoUpdateSchedules 함수, 설정/승인 API
- `src/lib/api/settings.ts` - 설정/대기 스케줄 API 클라이언트
- `src/features/admin/auto-update-settings.tsx` - 관리자 UI 컴포넌트
- `src/routes/admin/settings.tsx` - 설정 페이지 라우트
