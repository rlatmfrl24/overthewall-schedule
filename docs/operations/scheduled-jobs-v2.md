# Scheduled jobs v2 운영 전환

정기 작업 v2는 D1 run/item/outbox를 권위 상태로 사용하고, 하나의 범용 Workflow는 전달받은 job type의 조정만 수행하며 Queue item 하나가 실제 Worker invocation 하나를 소유한다. Workers Free에서는 scheduled Workflow가 지원되지 않으므로 분 목록을 가진 Cron Trigger 하나가 범용 Workflow instance를 시작한다.

## 배포 전 확인

1. `pnpm d1:reset:local -- --validate-only`
2. `pnpm drizzle:migrate:local`과 `PRAGMA foreign_key_check`
3. 운영 D1에 generated migration을 적용하고 `scheduled_job_runs`, `scheduled_job_items`, `scheduled_outbox`, `scheduled_usage_daily`를 readback한다.
4. `pnpm queues:provision`으로 Queue가 존재하는지 확인한다. 이 명령은 Cloudflare 리소스를 생성하므로 운영자가 명시적으로 실행한다.
5. 통합 `overthewall-schedule` Worker에 `X_BEARER_TOKEN`, `YOUTUBE_API_KEY`, Clerk, Analytics read token, WebSub secret을 설정한다.
6. `pnpm deploy:dry-run`으로 단일 config의 fetch, scheduled, queue, Workflow binding을 함께 검증한다.

## lane 전환

Cron bridge는 아래 D1 flag를 먼저 읽고 정확히 `true`인 lane만 Workflow를 시작한다.
coordinator도 같은 flag를 다시 검사한다. 수동 실행은 같은 v2 pipeline을 사용하며
rollout flag와 무관하게 접수된다.

- `scheduled_v2_naver_cafe_collection_enabled`
- `scheduled_v2_x_collection_enabled`
- `scheduled_v2_youtube_feed_collection_enabled`
- `scheduled_v2_websub_maintenance_enabled`
- `scheduled_v2_ingestion_recovery_enabled`
- `scheduled_v2_source_health_enabled`
- `scheduled_v2_channel_reconcile_enabled`
- `scheduled_v2_recent_reconcile_enabled`
- `scheduled_v2_schedule_auto_update_enabled`
- `scheduled_v2_retention_prune_enabled`

Naver → X → 일반 YouTube feed → WebSub/ingestion → health/reconcile → auto-update →
retention 순서로 활성화한다. 동일 job의 legacy 실행은 해당 flag 활성화 전에
중단해야 한다. 일반 YouTube 신규 업로드 feed는 이 플랫폼이 관리하고, 그 밖의
YouTube API 응답 캐시는 HTTP Worker의 수요 기반 SWR을 유지한다.

## 보수적 실행 경계

- coordinator의 한 번 fan-out은 8개 item으로 제한한다. 남은 outbox는 다음 시간별 recovery가 이어서 전송한다.
- X는 4 handle, Naver Cafe는 4 source 단위이며 post/source-check를 bulk SQL로 기록한다.
- source health는 공개 catalog revision CAS 비용을 포함해 2 source/item으로 시작한다. 설계 상한 5보다 보수적인 값이며 due source 수만큼 item을 만들어 처리량은 유지한다.
- 업로드 감시는 WebSub 즉시 알림을 1차 경로로 사용하고 channel reconcile은 누락 복구용이다. scheduler는 매시 23분에 due 여부만 확인하며, 채널별 실제 reconcile 간격은 6시간이다.
- Free 계정의 Cron Trigger 한 개(`3,13,23,33 * * * *`)가 시각별 job type을 하나의 `ScheduledOperationsWorkflow`에 전달한다. ingestion recovery와 auto-update는 3분, WebSub maintenance와 Naver Cafe는 13분, channel reconcile·일반 YouTube feed와 짝수 UTC 시각의 X는 23분, source health는 33분에 분산한다. 일일 recent reconcile과 retention은 18:03 UTC 실행에 합류한다.
- 논리 lane은 D1 관측·admission·lease 기준으로 유지하되 물리 Queue는 control, critical, background로 통합한다. critical은 recovery·WebSub maintenance·YouTube source correctness를, background는 X·Naver·auto-update·retention을 concurrency 1로 직렬화한다. 실시간 ingestion과 WebSub delivery Queue는 기존 concurrency 1/2를 유지한다.
- X Workflow는 2시간, auto-update Workflow는 1시간마다 eligibility를 점검한다. 실제 실행 여부는 각각 `x_collection_interval_hours`와 `auto_update_interval_hours` 및 마지막 실행 시각으로 판정하므로 더 긴 관리 설정을 덮어쓰지 않는다.
- auto-update는 2 channel scan → member/date match → finalizer 순으로 실행한다. 시간별 idempotency bucket을 사용해 1시간 설정도 누락하지 않는다.
- X API 비용과 모든 YouTube quota는 외부 호출 전에 `scheduled_usage_daily`에서 원자 예약한다. YouTube 일일 quota day는 공급자 기준인 `America/Los_Angeles` 자정에 전환하고 상태 화면도 같은 원장을 읽는다. 각 item dispatch도 Queue operations·예상 D1 rows read·rows written을 한 문장에서 함께 예약해 하나라도 일일 목표를 넘으면 전체 예약을 거부한다. Queue retry도 추가 operations 예산을 예약하지 못하면 재시도하지 않고 throttled로 종료한다.
- item 실행 결과를 terminal 상태로 저장한 뒤 다음 단계 생성이나 outbox 전송이 실패하면 같은 메시지의 재전달에서 후속 조정만 다시 수행한다. retry 예산까지 소진되면 run을 실패로 표시하고, 운영자 retry가 `reconcile` outbox로 외부 작업 재실행 없이 후속 조정만 복구한다. lease token CAS를 잃은 worker는 완료·재시도 상태를 덮어쓰지 않는다.
- Free Queue의 24시간 보존기간을 넘긴 `queued + dispatched` item은 1시간의 전파 여유를 더한 25시간 후 pending outbox로 되돌린다. 오래된 queued item의 execute outbox 행이 누락된 경우에도 같은 recovery가 재생성하며, item lease CAS가 중복 메시지의 외부 작업 재실행을 차단한다.

## 저빈도 YouTube 운영 조정

2026-08-31 운영 공개 API에서 공식 8개·키리누키 6개 채널의 최근 업로드 373건을 확인했다. 가장 바쁜 채널은 주 9.11건, 중앙 업로드 간격 19.49시간, 4시간 내 최대 3건이었다. WebSub가 신규 업로드 알림을 우선 처리하므로 채널별 reconcile 6시간을 유지하고, 빈 due/recovery 확인만 시간당 1회로 줄인다. 재현 가능한 계산과 한계는 `youtube-upload-cadence-analysis.ipynb`에 기록한다.

- 전체 Workflow 예약 시작: 하루 398회 → 158회(약 60% 감소)
- ingestion/WebSub 고정 recovery item: 하루 672개 → 168개(75% 감소)
- 고정 recovery item의 D1 write 예약 추정: 하루 38,400 rows → 9,600 rows(75% 감소)

위 수치는 실제 due 채널·source와 X/Naver/auto-update 실행량을 제외한 예약 시작 및 고정 recovery item 기준이다.

## 2026-09-01 정규 수집 안정화 Closeout

### 기준선

- 구현 PR: [#96](https://github.com/rlatmfrl24/overthewall-schedule/pull/96)
  merge `66a62ec91d61226717b6d979f6b6c784b9a370d9`,
  [#97](https://github.com/rlatmfrl24/overthewall-schedule/pull/97)
  merge `c6531599f02ff35b34d51ca38a4f39e5d5a28796`
- X 장기 기록 구현: `e652d21d84fd8078bd816053ee3f84178823cc3c`
- 로컬 migration 체인 보강: `aad06c8`
- production Worker version:
  `07c1de88-f6ba-4bf5-86b5-eebd69857dd4`
- production D1 readback: `2026-09-01T11:40:17Z`
- D1 size: 15,458,304 bytes(약 15.46MB)
- open PR: 0

수치는 위 시점의 운영 snapshot이며 이후 정상 수집으로 변할 수 있다. 다음 표는
구현 완료와 향후 설계를 섞지 않는다.

| 영역                   | 판정             | production 근거                                                                                                                                    | 남은 확인·후속                                                                                                                 |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 공용 scheduler·rollout | 완료             | 정규 수집·OTW Play lane이 v2 scheduler에서 실행됨                                                                                                  | 제거된 job type은 read model과 수동 실행 계약에서 허용하지 않음                                                                |
| X 신규 피드            | 부분 완료        | 8개 source·160개 post, watermark 8/8, continuation 0, scheduled run 성공 6·skip 9                                                                  | 기존 source의 `last_attempt_at`·`last_success_at` 8/8 NULL. 실제 source refresh 뒤 row-level readback 필요                     |
| X 공개 read            | 완료             | 공개 member-post GET 전후 `x_api_usage_events` 1,604건·max ID 7,161·추정비용 합계 14,140,000 micros로 동일                                         | 공개 archive는 추가하지 않음                                                                                                   |
| X 장기 저장·redaction  | 완료             | X post 일반 TTL 제외, tombstone·관리자 redaction·재수집 복구 방지 구현                                                                             | 기존 160건·8 handle·숨김 0건 유지                                                                                              |
| X 참여 지표 재조회     | 완료             | PR #103 runtime 제거 뒤 Worker `0948db90-1d51-48ae-84a6-f43822047819` 배포, migration `0077` 적용. 전용 table·setting·run·usage event 0건             | 신규 수집 응답의 수집 시점 지표만 유지                                                                                         |
| 네이버                 | 완료             | 8개 active source 모두 초기화·watermark, continuation 0, post 360건, scheduled run 성공 14·skip 13                                                 | 내부 Endpoint 변경 감시와 관리자 킬스위치 유지                                                                                 |
| 일반 YouTube           | 부분 완료        | 14개 source(공식 8·키리누키 6) 모두 초기화·watermark, continuation 0, 영상 119건(공식 20·키리누키 99), run 성공 4                                  | `partial` 1건은 total/completed 1/1·failed 0·`last_error=NULL`이므로 결과 정규화 readback gap으로 추적                         |
| OTW Play WebSub        | 완료             | monitor 1·active 1, subscription active 1, `verified_at=2026-09-01T05:14:09Z`, lease `2026-09-06T05:14:09Z`, 오류 없음                             | pause·승인 철회 시 unsubscribe 계약 유지                                                                                       |
| OTW Play 후보 흐름     | 부분 완료        | WebSub delivery 1건이 `2026-08-26T07:08:58Z`에 `completed`, `singing_clip` 후보 2건이 `needs_input`                                                | 관리자 검수→비공개 draft 변환 production canary 미완료                                                                         |
| OTW Play 공개          | 완료된 의도 상태 | catalog revision 177, `public_read_enabled=0`, `navigation_visible=0`                                                                              | 이 Closeout에서 공개 flag를 변경하지 않음                                                                                      |
| 운영 로그·D1           | 완료             | retention run 성공 3, post는 TTL 제외하고 상세 운영 로그를 우선 정리하는 정책 반영                                                                 | D1 60/75/85% 경고와 로그 증가율 지속 관찰                                                                                      |

### scheduled run snapshot

| Job                       | 결과                     |
| ------------------------- | ------------------------ |
| `channel_reconcile`       | succeeded 4, skipped 23  |
| `ingestion_recovery`      | succeeded 28             |
| `naver_cafe_collection`   | succeeded 14, skipped 13 |
| `recent_reconcile`        | skipped 1                |
| `retention_prune`         | succeeded 3              |
| `schedule_auto_update`    | succeeded 2, skipped 25  |
| `source_health`           | succeeded 5, skipped 23  |
| `websub_maintenance`      | succeeded 6, skipped 21  |
| `x_collection`            | succeeded 6, skipped 9   |
| `youtube_feed_collection` | succeeded 4, partial 1   |

X 장기 기록과 관리자 history는 유지한다. 공급자 upload HTTP 404로 정상 실행이
불가능했던 삭제 동기화 batch는 2026-09-02에 런타임·scheduler·설정·D1 계약에서
제거했다. 33분 cron은 이제 `source_health`만 실행한다. 자세한 실패 증거는
`docs/archive/x-provider-upload-404-incident-closeout.md`의 역사 기록으로 분리했다.

### 2026-09-02 X 참여 지표 비용 절감 결정

- `x_metrics_refresh` job type과 정규·수동 실행 경로를 제거한다.
- 24시간 post lookup, metric snapshot, 일별 engagement 집계와 관리자 summary API를
  제거한다.
- 신규 수집 응답에 이미 포함된 수집 시점 `public_metrics`는 피드 표시 호환성을
  위해 유지하며 추가 X 호출을 만들지 않는다.
- `x_post_metric_snapshots`, `x_member_daily_metrics`, facts의 metric scheduling
  column, 관련 setting·실행 이력·usage event는 contract migration에서 제거한다.
- 게시물 원문·facts·수집 cursor와 관리자 history API는 유지한다.

### 2026-09-02 X 참여 지표 제거 Closeout

- runtime PR: [#103](https://github.com/rlatmfrl24/overthewall-schedule/pull/103),
  merge `c0fbedb4883e8103a0791245c107f9def702ac83`
- schema PR: [#104](https://github.com/rlatmfrl24/overthewall-schedule/pull/104),
  migration `0077_ambiguous_post.sql`
- production Worker: `0948db90-1d51-48ae-84a6-f43822047819`
- production D1 적용·readback: `2026-09-02T02:58:29Z`
- 삭제: snapshot 227, 일별 집계 48, run 15, item 9, outbox 9, usage event 3,
  metric setting 2
- 보존: `x_post_facts` 127, `x_posts` 198
- 검증: 전용 table·index·setting·run·usage event 0, pending migration 0,
  `PRAGMA foreign_key_check` 0

D1 크기는 16,265,216 bytes에서 16,216,064 bytes로 감소했다. 공개 피드 DTO와
수집 시점 `public_metrics`는 유지되지만 이후 metric 재조회 경로는 존재하지 않는다.

## 배포 순서

`pnpm deploy`는 운영 D1에 미적용 migration이 있으면 중단하고 통합 Worker 한 개를 배포한다. Queue 생성, secret 쓰기, migration 적용, rollout flag 변경, 기존 Worker/Queue 삭제는 자동으로 수행하지 않는다. 최초 통합 전환은 `cloudflare-production-account-migration.md`의 drain·consumer handoff gate를 따라야 한다. Wrangler config에는 Workflow의 `schedules`를 두지 않는다. 해당 속성은 Workers Paid 전용이며 Free 운영 환경은 Cron bridge를 권위 진입점으로 사용한다.

## 관찰 기준

- 시간 단위 작업: 3회 연속 정상
- 채널별 6시간 reconcile: 3회 연속 정상
- 일일 작업: 2회 연속 정상
- 7일 동안 Queue 5,000 operations/일, Workflow 1,500 steps/일, background D1 200만 reads·4만 writes/일 이내
- `exceededCpu`, subrequest-limit 오류 0
- outbox backlog와 stale lease는 Operations 대시보드에서 0으로 복귀

완료된 outbox는 7일, item은 30일, run summary는 90일 보존한다. X API 사용 이벤트·X 수집 실행·네이버 소스 검사는 30일 뒤 삭제하고, `scheduled_usage_daily`와 `naver_cafe_usage_daily` 일별 집계는 장기 보존한다. X·네이버 게시물은 일반 TTL prune 대상이 아니며 식별자·출처·최초 확인·숨김 상태를 영구 보존한다. 공지 만료는 조회 시점 visibility 규칙이며 별도 cleanup job을 만들지 않는다.
