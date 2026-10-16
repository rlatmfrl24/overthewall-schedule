# OTW D1 read-limit incident and scheduled recovery

## Current outcome

**서비스 복구는 2026-10-16 09:01:09 KST에 완료했고, 10:13 KST에 X 반복 스캔 최적화만 격리 배포했다.** 복구 당시 원본 Worker `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022`의 실제 `/api/members`는 HTTP 200/8명, 메인 문서는 HTTP 200이었으며 브라우저에서 정상 일정과 멤버 8명의 카드를 확인했다. OTW Queue 6개와 원래 Cron을 복원하고 consumer·retry·retention 설정을 보존했다. 이후 배포한 현재 Worker는 `3a95078a-1ef5-4c44-91d0-9ece742620b2`이며, 같은 공개 API·화면과 설정 보존을 재확인했다. LuvDia 설정과 원본 작업 트리의 기존 미커밋 작업은 유지했다. 복구 근거는 `.tmp/otw-d1-incident-20261016/restored.json`, `restored-root.html`이며 최적화 검증·배포 근거는 아래에 별도로 기록한다.

At 08:03 KST on 2026-10-16, the OTW Cron trigger was temporarily removed and message delivery was paused on all six OTW queues. The maintenance page was active during this pause. Messages were not purged, consumer/retry/retention settings were preserved, and no application deployment or migration was performed for recovery. Existing uncommitted work remains intact.

At 08:07 KST, authoritative Cloudflare readback confirmed no OTW Cron schedules, six paused OTW queues, and zero running, queued, waiting, or paused OTW Workflow instances. LuvDia queue configurations were unchanged.

Recovery was scheduled for **2026-10-16 09:00 Asia/Seoul / 2026-10-16T00:00:00Z** and completed at 09:01 KST after verifying the actual production Worker flow. 기존 heartbeat `otw-9-d1`를 10:55 KST 결과 확인으로 갱신한 뒤, 해당 시각 새 버전의 정규 X 수집 성공을 확인하고 **PAUSED로 중지했다**. 별도 복구 예약은 중복 생성하지 않았다.

## Confirmed cause

The deployed OTW Worker version `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022` logged the following D1 failure for `GET /api/members` at `2026-10-15T22:56:23.618Z` and for its Cron at `2026-10-15T23:03:34.308Z`:

> Your account has exceeded D1's free tier daily row read limit.

The API log includes the nested D1 cause behind the failed `members` query. This confirms a **read-limit failure**, rather than inferring it from HTTP 500 alone.

Cloudflare GraphQL daily analytics for the UTC day 2026-10-15 returned this snapshot:

| Database | Rows read | Share of reads | Rows written |
| --- | ---: | ---: | ---: |
| `otw-db` | 1,144,045 | 22.52% | 17,219 |
| `luvdia-db` | 3,935,839 | 77.48% | 44,899 |
| Account total | **5,079,884** | 100% | **62,118** |

The free daily read allowance is 5,000,000 rows and the write allowance is 100,000 rows, shared across the account rather than isolated per database. The read snapshot is 101.60% of the allowance; writes are 62.12%. Free daily limits reset at 00:00 UTC, which is 09:00 KST. See [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [free-tier enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

The databases being separate does not isolate their account-level quota. Database metadata showed only about 39 MB of combined storage, so the observed failure is not a storage-capacity failure.

### Main consumption sources

- LuvDia: the largest hourly read bucket was 2,556,519 rows during 17:00–18:00 KST on October 15. Query Insights shows migration/transition schema operations and the recursive music-search consistency validator among the highest-read queries. The consistency validator alone reports 707,855 rows read across five executions. The evidence points to migration/validation activity dominating LuvDia's daily consumption, rather than ordinary background collection alone.
- OTW: Query Insights ranks the missing-X-facts scan first (717,336 rows read, 126 executions, zero rows returned), followed by quote-reference hydration selection (247,899, 111 executions, zero returned) and missing-reference backfill selection (211,237, 43 executions, zero returned). The local source maps these to `x-history.ts`, `x-collection.ts`, and reference hydration. Empty work selection still scans rows. These are optimization targets after service recovery.
- Query Insights and daily analytics use distinct aggregation datasets. Do not add the query-level values to daily totals or assume the two datasets reconcile exactly. These figures identify expensive patterns; the daily account snapshot and deployed error establish the quota incident.

No expensive validator, migration, collector, or table scan was executed for this investigation. Analytics and historical Worker logs were queried instead. Two tiny REST probes (`SELECT 1 AS available` and `SELECT name FROM sqlite_schema LIMIT 1`) returned successfully with 0 and 1 rows read and no writes **despite the production Worker quota error**. Therefore these probes do not prove quota recovery and must not be used as the release gate.

## Saved state and targets

Cloudflare account: `46e1801b290196fbec7cfae87710ffcf`.

Original Worker and Custom Domain: `overthewall-schedule`, `otw-schedule.info`. Original version remained `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022` at 100%.

The original Cron expression is `3,13,23,33,53 * * * *`. The Cron API path is `/accounts/46e1801b290196fbec7cfae87710ffcf/workers/scripts/overthewall-schedule/schedules`. Pausing used PUT with `[]`; restoring uses PUT with `[{"cron":"3,13,23,33,53 * * * *"}]`.

| Queue | ID | Previous delivery_paused | Temporary value |
| --- | --- | --- | --- |
| `otw-dead-letter` | `b9910be2527a4c3d96baf8d6cccc3692` | false | true |
| `otw-ops-background` | `f6062aacfcc44de685fe3337a3cc2dcf` | false | true |
| `otw-ops-control` | `a29c745f395642eaa5541ac2a391e40e` | false | true |
| `otw-ops-critical` | `d77ea4329ed84aa887671a4b38d50bce` | false | true |
| `otw-play-ai-review` | `570014eb1baa41d7a4967396144c3519` | false | true |
| `otw-play-ingestion` | `5c8540f4c2ca4633b4cdb3599ae70960` | false | true |

Queue changes use PATCH `/accounts/{account}/queues/{id}` with `{"settings":{"delivery_paused":true}}` or the saved previous value. Do not use PUT, remove consumers, change retries, or purge messages. Existing message retention is 86,400 seconds; pausing does not extend message expiry.

Maintenance Route: Zone `829450bafe9bc14f8acd9dd24705e8be`, Route ID `5147fcaab23246cc9fcfed8003546f78`, pattern `otw-schedule.info/*`, script `otw-schedule-maintenance`. The original Custom Domain is still connected to the original Worker. No DNS change is needed.

Machine-readable evidence is kept locally under `.tmp/otw-d1-incident-20261016/`: `before-schedules.json`, `before-queues.json`, `paused.json`, `verified-paused.json`, `analytics-daily.json`, `hourly.json`, `otwTop.json`, `luvdiaTop.json`, and sanitized `otw-errors.json`. Maintenance deployment evidence is under `.tmp/otw-maintenance-20261016/`. Credentials are not stored in these reports; read the existing `.env.local` without printing it. The available Node 24 runtime is `.tmp/publication-cutover-20261015/runtime/node.exe`.

## Recovery at 09:00 KST

1. Do not resume before `2026-10-16T00:00:00Z`. Read the snapshots and current Cloudflare state. Confirm the six OTW queues are paused and the Cron list is empty. Stop and investigate any unrelated configuration drift instead of overwriting it. Preserve LuvDia settings and the original Worker/Custom Domain. Check the exact route identity below; do not remove an unrelated route.
2. Keep Cron and queues paused while testing service recovery. GET `/zones/829450bafe9bc14f8acd9dd24705e8be/workers/routes/5147fcaab23246cc9fcfed8003546f78`. If its pattern and script match the saved maintenance overlay, DELETE **only that route**. If the route is already absent, inspect the route list and actual public behavior before assuming it was intentionally restored.
3. Immediately GET the real production `https://otw-schedule.info/api/members` and `https://otw-schedule.info/`. Require HTTP 200, the expected members JSON, and a normal OTW document. Inspect actual browser rendering. A successful `SELECT 1`, catalog read, static page, or cached shell alone is insufficient.
4. If the actual Worker flow fails, POST the same maintenance pattern/script to `/zones/829450bafe9bc14f8acd9dd24705e8be/workers/routes`. Record its new route ID here, retain paused Cron/queues, and update the heartbeat for a recheck in five minutes. Do not leave visitors on the broken origin or report successful recovery.
5. Once the original public flow is healthy, restore only the six queue `delivery_paused` values to the saved false values, preserving all other settings. Restore the saved Cron expression. Do not manually trigger collectors or replay/purge queued work. Queues drain through the existing consumers; Cron resumes its normal schedule.
6. Re-read Cron, all six queues, the route list, original deployment identity, and public API. Confirm LuvDia settings remain unchanged. Record the actual outcome and browser evidence here. No application source deployment is part of recovery. Continue directly with the user-authorized X scan optimization below; stop/delete heartbeat `otw-9-d1` only after recovery and that follow-up are handled.

## Accepted post-recovery priority

The user subsequently instructed that, once normal service is verified after 09:00 KST, **OTW repeated X scans are the first implementation task**. LuvDia migration, recursive consistency validation, bulk scans, and historical backfills remain deferred; a fresh daily quota does not authorize restarting them. The existing `otw-9-d1` heartbeat was updated in place to perform this follow-up in the same session, without creating a duplicate recovery schedule.

Pre-recovery preparation used local source inspection only; no production D1 queries or mutations were performed for this follow-up. The source inspection confirmed:

- `runXCollectionForHandles` in `worker/features/x-posts/infrastructure/x-collection.ts` calls both historical backfill selectors before acquiring source leases. Those selectors inspect global stored history, including when this invocation ultimately claims no handles.
- `backfillXPostFactsFromStoredPosts` in `x-history.ts` selects missing facts using an anti-join across stored posts. Returning zero rows does not establish cheap execution.
- `backfillXPostReferencesFromStoredPosts` in the same module checks JSON quote/reply fields and missing relation rows over stored posts on each invocation.
- `hydrateXReferences` in `x-reference-hydration.ts` joins posts and references and evaluates JSON, hydration state, and retry times to find work. Its empty-work selection is also a measured high-read query.
- Existing local changes already touch `x-history.ts` and `x-collection.ts`. Preserve those changes; do not reset the files or deploy the mixed working tree.

Implementation should eliminate repeat reads of completed/unchanged history while retaining discovery of new or edited posts, reference retries, concurrency safety, and recovery after interrupted processing. Do not replace the requested optimization by disabling X functionality or only increasing its interval. Choose the smallest complete approach after tracing write/update paths; this preparation does not preselect a cursor or index design.

Use local SQLite/D1 regression coverage, including `x-collection.test.ts` and `x-reference-hydration.integration.test.ts`, to reproduce repeated empty work and prove reduced reads or improved query plans. Cover new/updated posts, retry due times, and interrupted/concurrent processing. Inspect query cost as well as returned row counts. Production confirmation should use existing Cloudflare analytics/logs and minimal samples, not full-table validation or remote backfills. Check actual deployed-source/schema compatibility before any separately validated, scoped optimization release. Record implementation, test evidence, delivery identity, measured improvement, and any concrete release limitation; do not claim recurrence prevention merely from implementing a query change.

## Pre-recovery verification scope and risk (historical)

Operational API mutations were followed by independent configuration GETs and assertions. They confirmed paused queue delivery, retained consumer settings and message-retention values, unchanged LuvDia queues, an empty OTW Cron list, no active OTW Workflow, unchanged original deployment, and a public maintenance HTTP 503 response. No app code changed for this follow-up, so the app build, full test suite, and D1 doctor/migrations were not run.

This mitigation does not optimize expensive queries or create separate tenant quotas. LuvDia background settings remain unchanged as requested scope was OTW. Resuming all previous work can consume the shared allowance again; defer bulk migration/validation and address repeated empty X scans after recovery. Cron changes may take time to propagate at the edge; pausing queue delivery also blocks downstream executions during that interval. The scheduled recovery still requires the local Codex app/computer to be available.

## 09시 복구 이후 X 스캔 최적화

### 구현과 비용 측정

완료된 X 이력 전체에서 누락 여부를 매번 찾던 조회를, 변경 시 트리거가 등록하는 `x_post_repair_work`와 `x_quote_body_work`의 인덱스 조회로 바꿨다. 원본 게시물의 수집·수정·숨김·삭제와 참조 삭제가 작업을 무효화하며, 세대 번호와 원본 값이 일치할 때만 완료 처리한다. 오류 항목은 순서를 뒤로 보내 새 작업을 막지 않는다. 동일 참조의 재시도·종료·lease 상태는 유지하고 대상 ID가 바뀐 경우에만 재설정한다. 출처 lease를 확보하지 못한 호출은 전역 복구 작업을 실행하지 않는다. 기능이나 수집 주기는 끄거나 늘리지 않았다.

참조 본문과 작성자 재시도는 각각 인덱스 범위로 선별한 뒤 기존 우선순위로 합친다. SQLite가 빈 작업에서도 원본 게시물부터 읽지 않도록 조인 순서를 고정했다. 삭제 응답은 트리거의 파생 쓰기 수를 포함하는 `meta.changes` 대신 `RETURNING id`의 실제 게시물 수로 계산한다.

실제 로컬 Cloudflare D1의 `meta.rows_read` 측정:

| 상황 | 기존 | 변경 후 |
| --- | ---: | ---: |
| 완료된 이력 512건, facts·reference·hydration의 빈 조회 합계 | 3,075 | **9** |
| 512건의 본문·작성자 재시도가 모두 미래 시각인 경우 | 전체 이력 조회 | **7** |
| 확보한 출처 handle이 없는 호출의 전역 복구 읽기 | 2,050 | **0** |

9행/3,075행은 약 99.7% 감소한 **로컬 측정**이며 운영 전체 일일 사용량의 감소율을 의미하지 않는다. 동시 수정, 오래된 오류 201건 뒤의 새 작업, 뒤늦게 들어온 작은 ID, 참조 대상 변경과 lease 초기화, 저장 직후 참조 삭제를 회귀 범위에 포함했다.

### 운영 기준과 격리 포장

원본 작업 트리는 `d27f26a4`이며 운영 기준보다 22개 커밋 앞서 있고 다수의 미커밋 변경을 포함한다. 이 트리 전체 배포와 0102~0136 이관 마이그레이션 적용은 하지 않는다.

원격 master `bf0c8159412d283996e04c6d6147de52dbd10ba5`의 격리 공간: `C:/Users/rlatm/.codex/worktrees/otw-x-scan-recovery/overthewall-schedule`.

Cloudflare content/v2 API의 운영 Worker 원본과 같은 기준 소스의 Vite 빌드를 비교했다. TypeScript printer로 주석·서식을 정규화한 **전체 Worker SHA256이 동일**하다: `356b04c1e5020b3aebc2b7954a1c3becfebe9eb460fe4213d5300f6afc41f9e7`. 운영 메인 문서가 참조하는 JS/CSS 파일명 7개도 기준 빌드와 일치했다. 근거: `.tmp/otw-x-scan-20261016/vite-baseline-comparison.json`. 운영 D1의 마지막 적용 항목은 최소 3행 조회로 0101까지 확인했다(읽기 3, 쓰기 0).

격리 공간은 임시 배포 포장으로 사용한다. 원본에서 Drizzle로 생성한 다음 두 SQL을 파일명과 바이트 그대로 사용하며 번호를 다시 생성하지 않는다. 향후 이관 0102~0136 적용 시 이미 적용된 0137/0138은 파일명 기준으로 건너뛴다. canonical schema/journal/snapshot은 원본 작업 트리에 유지한다. 운영 적용 후 이 SQL은 수정하지 않는다.

| 파일 | SHA256 |
| --- | --- |
| 0137_x-repair-pending.sql | 56193ba1a02d75209a64a5246e876a8acc560c0b165769f703839790583179ca |
| 0138_x-repair-invalidation.sql | cfb5b37062a102a39b21a90f2cf5c94781c974098883260e102f810dd11b24af |

0137은 새 작업 테이블 2개와 인덱스만 추가한다. 0138은 트리거와 미완료 항목만의 초기 큐를 만든다. 초기화에는 기존 X 이력과 참조의 **유한한 1회 읽기**가 필요하다. 완료된 모든 게시물을 다시 처리하는 백필은 등록하지 않는다. 0139는 향후 content-transition의 유지보수 잠금용이므로 해당 기반 테이블이 없는 현재 운영에는 적용하지 않는다. 기존 권한·테넌트·이관 fence는 완화하지 않았다.

### 검증 기록

- canonical 전체 139개 마이그레이션: 임시 D1 실제 적용, 적용 목록·bootstrap 정리·foreign key 검사 PASS. 기존 로컬 DB 유지.
- 실제 순서 `0000..0101 → 0137/0138 → 0102..0136/0139`: 별도 임시 D1 실제 적용 및 동일 검사 PASS.
- 격리 배포 기준 103개 SQL: 새 격리 공간 로컬 D1에 실제 적용 PASS.
- 기존 X 참조·수집·삭제 D1 통합 회귀: 39/39 PASS.
- 수집·삭제 및 이관 registry/maintenance SQL 단위 회귀: 11/11 PASS.
- 원본 관련 TypeScript·ESLint·architecture 검사 PASS.
- 추가한 실제 D1 비용·동시 실행·기존 데이터 업그레이드 회귀: 8/8 PASS. 완료 이력 9행, 미래 재시도 7행 재현.
- 독립 리뷰: 원본 변경과 격리 포장 모두 추가 P1/P2 결함 없음. SQL 해시 일치 및 `git diff --check` PASS.
- 격리 preflight의 architecture·test typecheck·전체 lint PASS. 전체 테스트 321파일/2,546건 중 319파일/2,536건 PASS이며, 기존 음악 UI 두 파일에서 시간 초과 9건과 버튼 조회 실패 1건이 발생했다. X·D1 통합 검사는 모두 PASS. 실패한 두 파일만 단독 재검사하며 결과를 구분해 기록한다. 최초 시도는 공유 node_modules의 pnpm 자동 재설치가 비대화형 보호로 거부되어 검사 시작 전에 종료됐다. 공유 의존성을 건드리지 않도록 자동 설치만 껐으며 검사 자체는 생략하지 않았다.
- 기존 음악 UI 단독 재검사: 기본 5초 제한에서는 11건 실패, 문제의 버튼 시나리오는 단독으로 PASS. 기존 UI 앱·테스트 코드는 수정하지 않고 `--maxWorkers=1 --testTimeout=15000`으로 두 파일을 재검사해 **86/86 PASS**. 위 전체 결과와 합쳐 **2,546개 테스트를 검증한 조합 검증**이며, 단일 preflight 명령의 전체 PASS로 보고하지 않는다.
- 격리 build·로컬 D1 doctor PASS. 새 작업 공간의 생성 안내 파일 5개는 공식 sync로 다시 생성한 뒤 mirror check PASS, sync 회귀 5/5 PASS. 해당 생성 파일과 routeTree는 Git 내용 차이가 없는 줄바꿈 차이이며 제품 코드에 포함되지 않는다. 최종 검증 근거는 `.tmp/otw-x-scan-20261016/release-verification.json`.
- 완료된 mirror check·sync 회귀 출력은 `release-mirror-verification.log`에 별도로 보존했다. `release-remaining-preflight.log`의 마지막 mirror FAIL은 그 이전 검사 결과다.

09:42경 기존 Cloudflare 일일 집계는 계정 합계 50,581행 읽기, 181행 쓰기였다. 집계에는 지연이 있을 수 있다. 운영 대량 검증·재귀 음악 검색 정합성 검사·수집 강제 실행·메시지 purge·LuvDia 설정 변경은 수행하지 않는다. 기존 배포 스크립트의 remote doctor는 재귀 음악 정합성 SQL을 실행하므로 이번에는 사용자의 대량 검사 보류 지시를 우선한다. 로컬 전체 doctor와 원격 적용 파일 목록·추가 테이블/트리거의 제한된 메타데이터 확인으로 필요한 배포 검증을 수행한다.

09:54 최소 운영 표본(읽기 13행, 쓰기 0)에서 정규 X 수집 run 2298이 `2026-10-16T00:53:45.114Z` 시작, 4개 handle/4개 API 호출 후 `success`임을 확인했다. 수집 활성화·0.5시간 주기·scheduled v2 설정은 기존 값 그대로다. 수집을 강제로 실행하지 않았다.

### 운영 반영 및 실제 확인

**10:13 KST에 X 최적화만 분리 배포했다.**

- Worker: `overthewall-schedule`, 버전 `3a95078a-1ef5-4c44-91d0-9ece742620b2`, 100%, tag `otw-x-scan-20261016`.
- 운영 Worker를 다시 내려받아 검증한 빌드 전체와 정규화 SHA256 일치를 확인했다: `7565e17a3f8e8b64531433ccb25d4b1b9c3d35a3445f04b76f7b117781db0c69`.
- D1 `otw-db`에 **0137·0138만 적용**했다. 0139 및 이관 0102~0136은 적용하지 않았다. 적용 목록과 새 테이블 컬럼의 메타데이터 재조회는 읽기 4행, 쓰기 0행이었다. 원격 전체 doctor·음악 정합성 검사·기존 게시물 강제 재처리는 실행하지 않았다.
- 이미 검증한 build와 client guard, 대상·파일 목록·queue 설정을 확인한 뒤 Wrangler로 업로드했다. `--keep-vars`를 사용했고 기존 secret과 동일한 환경 변수 6개를 유지했다. 기본 deploy wrapper의 원격 대량 검사는 사용자 지시에 따라 제외한 경로다.
- `https://otw-schedule.info/api/members` HTTP 200/8명, 메인 HTTP 200. 실제 브라우저 재로딩 후 로그인 상태와 멤버 8명의 정상 일정 카드를 확인했다. 배포 후 캡처 API는 반복적으로 시간 초과됐지만 실제 접근성 트리에서 이 화면을 확인했다. 복구 시점 PNG는 `.tmp/otw-d1-incident-20261016/recovered-production.png`.
- OTW Queue 6개의 delivery·consumer·retry·retention과 Cron `3,13,23,33,53 * * * *`를 재조회해 기존 값 보존을 확인했다. LuvDia Queue 설정도 이전 스냅샷과 같았다. 원본 작업 트리의 미커밋 앱 코드는 배포하지 않았다.
- 운영에서 새 selector 세 개를 **읽기 전용으로 한 번씩** 실행했다. facts 1행, references 1행, hydration 9행으로 합계 **11행 읽기·0행 쓰기**, 모두 반환 0건이었다. 로컬 비용 측정과 구분하며, 실제 이력 전체를 다시 검증하거나 수집을 호출하지 않았다.

근거: `.tmp/otw-x-scan-20261016/production-{migration.log,migration-readback.json,deploy.log,readback.json,read-cost.json}` 및 `release-source-manifest.json`. 적용한 SQL은 위 SHA256으로 고정하며 변경할 때는 새 마이그레이션을 만든다.

**정규 실행 확인 완료:** run 2298/2299는 배포 전 증거로만 보존한다. 새 버전의 10:53 정규 수집 run **2300/2301**은 아래 최종 readback으로 확인했다. 11행의 selector 확인은 별도 조회비용 근거다. LuvDia 이관·대량 검증은 계속 보류한다.

10:20 Cloudflare 관찰: 새 Worker 버전의 10:13 scheduled 이벤트 `ok`, background Queue 이벤트 2건 `ok`. 연결된 Workflow instance `477ef3fa-156c-48f4-a7ce-a08c6f59ca62`는 플랫폼 조회에서 `complete`였다. 로그의 단일 Workflow invocation `canceled`는 이 완료 상태와 구분하며 업무 실패로 판단하지 않는다. 근거: `new-worker-background-events.json`, `new-worker-workflow-instances.json`.

10:35 실행 조건 확인: 기존 `scheduled-workflow-cron.ts`는 X 수집을 매시 23·53분에만 계획한다. 마지막 성공 완료값 `x_collection_last_run=1792112044952`는 09:54:04.952 KST이므로, 10:23 예약 시각은 기존 0.5시간 간격에 못 미친다. 따라서 10:23의 건너뜀과 X 대상이 아닌 10:33에는 새 수집 기록이 없는 것이 기존 동작과 일치한다. 주기·설정은 변경하지 않고 10:53 정규 실행을 기다린다. 설정 최소 표본은 읽기 13행·쓰기 0행이며 `.tmp/otw-x-scan-20261016/post-deploy-x-settings.json`에 보존했다.

10:41 사용자가 계속 대기하는 대신 예약 후 결과를 확인하도록 지시했다. 기존 `otw-9-d1`의 이름을 `OTW X 최적화 정규 실행 확인`으로 갱신하고, 오늘 **10:55 KST**에 이 대화에서 후속 확인하도록 저장·재조회했다(`ACTIVE`). 후속 범위는 10:53 정규 수집의 최소 D1 표본, 새 배포 버전·Cron·Queue·공개 API 확인, 증거와 보고서 갱신, 성공 시 기존 heartbeat 중지다. 실패·지연 시 강제 수집 없이 원인을 진단하고 필요하면 같은 예약만 5분 뒤로 갱신한다. 기존 복구·배포·마이그레이션은 재실행하지 않으며 LuvDia 대량 작업 보류도 유지한다.

### 10:55 최종 확인과 예약 종료

`2026-10-16T01:55:37.212Z`에 실제 운영 상태를 재조회했다. 새 배포 버전 `3a95078a-1ef5-4c44-91d0-9ece742620b2`는 100%다. 정규 X run **2300**은 10:53:43.769–49.371 KST, **2301**은 10:53:54.249–59.775 KST에 실행됐고, 각각 4개 handle 확인/갱신·API 4회·`success`·error NULL이다. 강제 수집 없이 8개 handle 전체의 정규 실행 성공을 확인했다. 같은 새 버전의 scheduled `ok`와 Queue 2건 `ok`가 연결된다.

이 최소 run 조회는 읽기 **3행**, 쓰기 **0행**이었다. 메인과 `/api/members`는 HTTP 200/8명, Cron은 원래 식 그대로, OTW Queue 6개는 모두 `delivery_paused=false`다. LuvDia를 포함한 이전 12개 Queue의 settings/consumers도 원래 스냅샷과 동일했다. 근거는 `.tmp/otw-x-scan-20261016/production-final-readback.json`이다. 복구·구현·격리 배포·비용 및 정규 실행 확인을 마쳤으므로 기존 `otw-9-d1`를 **PAUSED**로 중지했다. 19일 공개 작업과 고비용 보류 작업은 별도 목록에서 계속 관리한다.
