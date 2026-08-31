# Scheduled jobs v2 운영 전환

정기 작업 v2는 D1 run/item/outbox를 권위 상태로 사용하고, Workflow는 조정만 하며 Queue item 하나가 실제 Worker invocation 하나를 소유한다. Workers Free에서는 scheduled Workflow가 지원되지 않으므로 분 목록을 가진 Cron Trigger 하나가 해당 Workflow를 시작한다.

## 배포 전 확인

1. `pnpm d1:reset:local -- --validate-only`
2. `pnpm drizzle:migrate:local`과 `PRAGMA foreign_key_check`
3. 운영 D1에 generated migration을 적용하고 `scheduled_job_runs`, `scheduled_job_items`, `scheduled_outbox`, `scheduled_usage_daily`를 readback한다.
4. `pnpm queues:provision`으로 Queue가 존재하는지 확인한다. 이 명령은 Cloudflare 리소스를 생성하므로 운영자가 명시적으로 실행한다.
5. Worker별 secret을 설정한다. `otw-ops-collectors`에는 `X_BEARER_TOKEN`, `otw-ops-media`에는 `YOUTUBE_API_KEY`와 WebSub secret, `otw-ops-auto-update`에는 필요한 CHZZK 관련 secret을 각각 설정한다.
6. `pnpm deploy:dry-run`으로 여섯 config를 모두 검증한다.

## lane 전환

Cron bridge는 배포 직후에도 Workflow를 시작하지만 아래 D1 flag가 정확히 `true`인 lane만 item을 생성한다. 수동 실행은 같은 v2 pipeline을 사용하며 rollout flag와 무관하게 접수된다.

- `scheduled_v2_naver_cafe_collection_enabled`
- `scheduled_v2_x_collection_enabled`
- `scheduled_v2_websub_maintenance_enabled`
- `scheduled_v2_ingestion_recovery_enabled`
- `scheduled_v2_source_health_enabled`
- `scheduled_v2_channel_reconcile_enabled`
- `scheduled_v2_recent_reconcile_enabled`
- `scheduled_v2_schedule_auto_update_enabled`
- `scheduled_v2_retention_prune_enabled`

Naver → X → WebSub/ingestion → health/reconcile → auto-update → retention 순서로 활성화한다. 동일 job의 legacy 실행은 해당 flag 활성화 전에 중단해야 한다. 공개 YouTube 캐시는 이 플랫폼에 등록하지 않고 HTTP Worker의 수요 기반 SWR만 사용한다.

## 보수적 실행 경계

- coordinator의 한 번 fan-out은 8개 item으로 제한한다. 남은 outbox는 다음 시간별 recovery가 이어서 전송한다.
- X는 4 handle, Naver Cafe는 4 source 단위이며 post/source-check를 bulk SQL로 기록한다.
- source health는 공개 catalog revision CAS 비용을 포함해 2 source/item으로 시작한다. 설계 상한 5보다 보수적인 값이며 due source 수만큼 item을 만들어 처리량은 유지한다.
- 업로드 감시는 WebSub 즉시 알림을 1차 경로로 사용하고 channel reconcile은 누락 복구용이다. scheduler는 매시 23분에 due 여부만 확인하며, 채널별 실제 reconcile 간격은 6시간이다.
- Free 계정의 Cron Trigger 한 개(`3,13,23,33 * * * *`)가 시각별 Workflow를 시작한다. ingestion recovery와 auto-update는 3분, WebSub maintenance와 Naver Cafe는 13분, channel reconcile과 짝수 UTC 시각의 X는 23분, source health는 33분에 분산한다. 일일 recent reconcile과 retention은 18:03 UTC 실행에 합류한다.
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

## 배포 순서

`pnpm deploy`는 운영 D1에 미적용 migration이 있으면 중단하고, collectors → media → auto-update → maintenance → scheduler → web 순서로 배포한다. Queue 생성, secret 쓰기, migration 적용, rollout flag 변경은 자동으로 수행하지 않는다. 스케줄러 config에는 Workflow의 `schedules`를 두지 않는다. 해당 속성은 Workers Paid 전용이며 Free 운영 환경은 Cron bridge를 권위 진입점으로 사용한다.

## 관찰 기준

- 시간 단위 작업: 3회 연속 정상
- 채널별 6시간 reconcile: 3회 연속 정상
- 일일 작업: 2회 연속 정상
- 7일 동안 Queue 5,000 operations/일, Workflow 1,500 steps/일, background D1 200만 reads·4만 writes/일 이내
- `exceededCpu`, subrequest-limit 오류 0
- outbox backlog와 stale lease는 Operations 대시보드에서 0으로 복귀

완료된 outbox는 7일, item은 30일, run summary는 180일 보존한다. 공지 만료는 조회 시점 visibility 규칙이며 별도 cleanup job을 만들지 않는다.
