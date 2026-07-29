# 스케줄 자동 업데이트

## 개요

오버더월 스케줄은 사용자들이 직접 업데이트하는 방식으로 운영된다. 자동
업데이트 V2는 치지직 VOD를 새 일정을 무조건 만드는 근거로 사용하지 않고,
기존 스케줄 누적 내역의 빈 시간·빈 제목을 채우는 보조 자료로 사용한다.

## 기능 요구사항

### 1. 자동 수집 대상

- `방송`, `미정`, `게릴라` 일정 중 시작 시각이나 제목이 비어 있는 일정
- 기존 일정과 연결되지 않는 독립 방송 세션
- `휴방` 일정이 있는 날짜는 자동 후보를 만들지 않는다.

### 2. 자동 수집 주기

- 관리자 UI에서 설정 가능 (1시간 / 6시간 / 12시간 / 24시간)
- 기본값: 6시간

### 3. 자동 수집 및 승인 프로세스

```
Cron → VOD 관측 upsert → 방송 세션 병합 → 일정 일대일 매칭
     → 억제/기존 일정/보완 후보 분류 → 관리자 승인 또는 거부
```

1. 설정된 날짜 범위(기본 3일) 내의 모든 활성 멤버 조회
2. 해당 멤버들의 치지직 채널 ID 추출 (`url_chzzk` 필드 활용)
3. 각 멤버의 치지직 VOD 목록 조회(페이지당 5개, 최대 3페이지)
4. `vod_id`별 시작·종료 시각, 제목, 길이, 썸네일과 최초·최종 관측 시각을
   `schedule_broadcast_observations`에 멱등 upsert
5. 같은 멤버의 다음 VOD가 이전 종료 후 60분 이내 시작하면 자정 경계와
   무관하게 하나의 방송 세션으로 병합
6. 방송 세션과 같은 멤버·방송일의 일정을 일대일로 매칭
   - 예정 시각과 세션 시작이 60분 이내면 가장 가까운 일정을 우선
   - 시간 매칭이 없으면 정규화 제목의 완전 일치, 포함 관계, bigram Dice
     유사도 0.6 이상인 유일한 일정과 연결
   - 시간·제목이 모두 없는 일정과 남은 세션이 각각 하나일 때만 단일 결손
     fallback 적용
   - 복수 제목 후보 또는 동일한 최상위 시간 점수는 `ambiguous`
7. 분류 결과
   - 완성된 기존 일정과 매칭: pending을 만들지 않음
   - 빈 필드가 있는 일정과 매칭: `fill_missing_fields`
   - 매칭되지 않은 독립 세션: `missing_schedule`
   - 불확실한 매칭: `ambiguous`
   - 휴방일: `holiday_suppressed`
   - 10분 미만이며 같은 날 완성 일정이 존재: `short_suppressed`
8. 관리자가 승인하면 승인 시점에도 비어 있는 필드만 채우며 기존 값과
   상태를 덮어쓰지 않음. 새 일정 생성에만 `status="방송"` 사용
9. 관리자가 거부하면 세션 대표 `vod_id`별 제외 기록을 저장하고, 명시적으로
   재검토를 허용하기 전까지 제목·시간 변경과 무관하게 다시 수집하지 않음
10. 과거 로그는 분석과 회귀 테스트에만 사용하며 후보 소급 생성이나 추정
    백필을 수행하지 않음

### 4. 안전장치

- **재개 병합**: 중단·재개 VOD를 60분 세션 경계로 합쳐 동일 방송의 후보
  중복을 방지
- **중복 방지**: 세션 대표 `vod_id`와 `member_uid + date + start_time`으로
  pending 중복 확인
- **영구 제외**: 후보 삽입 SQL이 `schedule_candidate_rejections`를 직접
  확인하므로 거부와 수집이 동시에 실행돼도 동일 VOD가 재생성되지 않음
- **원자적 거부**: 제외 스냅샷 저장, `update_logs` 감사 기록, pending 삭제를
  하나의 D1 batch로 실행
- **빈 필드 전용 승인**: SQL의 조건부 할당으로 승인과 운영자 입력이
  겹쳐도 이미 입력된 필드와 상태를 보존
- **stale 정리**: 승인 전에 대상이 완성되었거나 대응 일정이 생기면
  `candidate_obsolete` 감사 로그와 함께 pending 정리
- **원자적 후보 생성**: pending 삽입과 자동 수집 감사 로그를 D1 batch로
  실행해 감사 로그 실패 시 함께 rollback

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
| previous_start_time  | TEXT    | 수정 전 시작 시각      |
| previous_title       | TEXT    | 수정 전 제목           |
| candidate_kind       | TEXT    | 신규/빈 필드/불확실    |
| match_reason         | TEXT    | 시간/제목/fallback     |
| match_confidence     | TEXT    | high/medium/low        |
| ranked_schedule_ids  | TEXT    | 순위화 대상 ID JSON    |
| source_vod_ids       | TEXT    | 원본 VOD ID JSON       |
| session_started_at   | TEXT    | 세션 시작 시각         |
| session_ended_at     | TEXT    | 세션 종료 시각         |
| vod_segment_count    | INTEGER | 병합한 VOD 조각 수     |
| vod_id               | TEXT    | 중복 방지용 VOD 식별자 |
| created_at           | NUMERIC | 생성 시간              |

`schedule_broadcast_observations` 테이블 (영구 VOD 관측):

| 필드 | 설명 |
| ---- | ---- |
| vod_id | 고유 VOD 식별자(PK) |
| member_uid / channel_id | 멤버와 치지직 채널 |
| started_at / ended_at | 계산된 방송 시작·종료 epoch ms |
| duration_seconds | 방송 길이 |
| title / thumbnail_url | 후보 스냅샷 |
| first_seen_at / last_seen_at | 최초·최종 관측 epoch ms |

`schedule_candidate_rejections` 테이블 (활성 거부 제외):

| 필드          | 타입    | 설명                                      |
| ------------- | ------- | ----------------------------------------- |
| id            | INTEGER | PK                                        |
| vod_id        | TEXT    | 고유 VOD 식별자                           |
| 후보 스냅샷   | -       | 멤버, 일정, 제목, VOD 메타데이터          |
| reason_code   | TEXT    | 표준 거부 사유                            |
| reason_note   | TEXT    | 선택 메모(최대 500자)                     |
| actor_*       | TEXT    | 처리자 식별 정보                          |
| rejected_at   | NUMERIC | 거부 시각                                 |

재검토 허용은 이 테이블의 행을 제거하고 감사 로그를 남긴다. 즉시 pending을
생성하지 않으며 다음 자동·수동 수집에서 현재 일정 상태를 다시 평가한다.

`update_logs` 테이블 (로그):

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
| vod_id          | TEXT    | 처리한 VOD 식별자           |
| reason_code     | TEXT    | 거부 사유 코드              |
| reason_note     | TEXT    | 거부 사유 메모              |
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
| GET    | `/api/settings/logs`                | 로그 조회 (페이지네이션: `page`, `pageSize`, `sort`, `total`) |
| DELETE | `/api/settings/logs/:id`            | 로그 삭제        |
| GET    | `/api/settings/pending`             | 대기 스케줄 목록 |
| POST   | `/api/settings/pending/:id/approve` | 개별 승인        |
| POST   | `/api/settings/pending/:id/reject`  | 개별 거부        |
| GET    | `/api/settings/pending/rejections` | 거부 제외 목록(검색·사유·날짜·페이지네이션) |
| POST   | `/api/settings/pending/rejections/:id/reopen` | 재검토 허용 |
| POST   | `/api/settings/pending/approve-selected` | 선택 승인(배치 결과 상세 반환) |
| POST   | `/api/settings/pending/reject-selected`  | 선택 거부(배치 결과 상세 반환) |
| POST   | `/api/settings/pending/approve-all` | 전체 승인        |
| POST   | `/api/settings/pending/reject-all`  | 전체 거부        |

### 관리자 UI

경로: `/admin/settings`

기능:

- `검토 대기`, `거부 제외`, `실행 기록`, `설정` 탭
- 처리 전 후보, 활성 제외, 최근 거부 억제, 마지막·다음 실행 요약
- 자동 수집 활성화/비활성화 토글
- 수집 주기 선택 (1시간 / 6시간 / 12시간 / 24시간)
- 검색 범위 선택 (1일 / 2일 / 3일 / 5일 / 7일)
- 수동 실행 버튼 및 실행 결과 표시
- 마지막 실행 시간 표시
- **승인 대기 스케줄 목록**: 개별/일괄 승인 및 사유가 필수인 거부
- **거부 제외 목록**: 검색·필터·후보 스냅샷·재검토 허용
- **실행 기록**: VOD 조각, 방송 세션, 재개 병합, 후보 생성, 영구·단기·휴방
  억제, 불확실 매칭, stale 후보 정리 지표
- **수집/승인 기록**: 로그 표시 및 삭제

## 관련 파일

- `db/schema/index.ts` - settings, pendingSchedules, updateLogs 테이블 정의
- `drizzle/0011_cold_maximus.sql` - settings 테이블 마이그레이션
- `drizzle/0012_flimsy_millenium_guard.sql` - auto_update_logs(legacy) 테이블 마이그레이션
- `drizzle/0013_add_pending_schedules.sql` - pendingSchedules 테이블 마이그레이션
- `drizzle/0014_heavy_slapstick.sql` - update_logs/pending_schedules 반영
- `drizzle/0043_curly_clea.sql` - 영구 거부 제외와 실행 지표 추가
- `drizzle/0044_careful_guardsmen.sql` - VOD 관측, 방송 세션 후보 메타데이터,
  V2 실행 지표 추가
- `worker/app/scheduled.ts` - scheduled 작업 조합
- `worker/features/schedules` - 자동 수집, pending 승인, 일정 쓰기
- `worker/features/configuration` - 설정 조회와 저장
- `src/features/configuration/api/settings.ts` - 설정 API 클라이언트
- `src/features/schedules/api/pending-schedules.ts` - 대기 스케줄 API 클라이언트
- `src/features/configuration/ui/admin/auto-update-settings.tsx` - 관리자 UI 컴포넌트
- `src/routes/admin/settings.tsx` - 설정 페이지 라우트
