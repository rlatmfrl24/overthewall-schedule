# 무료 운영 우선 백엔드 최적화

> 과거 구현·배포 기록: 2026-09-08. 아래 WebSub 해제·복구 운영 계약은 2026-09-09 종료됐다. 현행 운영에서는 [시간당 채널 조회](channel-upload-polling.md)를 사용하며 Hub 확인을 기다리거나 구독 기능을 재개하지 않는다. 수치와 배포 증거는 당시 기록으로 보존한다.

검증 기준: 2026-09-08, Git `f20a497ccab6da52932fd086448c09cf6aaa4dee`, 운영 Worker `f092d36d-c037-4d25-a49c-c21655aaa1b5`.

Cloudflare Worker·D1·Queue·Workflow·R2 구조와 물리 Queue 격리를 유지한다. 새 테이블·인덱스·유료 서비스 없이 반복 조회와 할 일 없는 예약 실행을 줄인다. X 미리보기의 하루 30센트 예산, 외부 API quota, D1 dispatch 예상 쓰기 40,000행 guard와 보존기간은 변경하지 않는다.

## 적용 계약

| 영역 | 변경 | 보존하는 계약 |
| --- | --- | --- |
| Outbox | 동치 상태 조건에 기존 상태·시간 인덱스 지정, 전달 유실 복구는 queued item부터 탐색 | lease, CAS, 중복 전달 방지, 정렬, 처리 상한 |
| 예약 실행 | Cron에서 읽기 전용 대상 확인 후 Workflow 생성, coordinator 재확인 | 수동 요청 감사 이력, 중단된 queued run 복구 |
| 유지보수 | 실제 대상이 있는 phase만 생성, retention은 삭제와 같은 조건의 존재 조회 | X·Naver·일반 YouTube 공용 outbox 복구와 API 보존기간 정리 |
| Play | `otw_play_automation_paused=true`일 때 자동 감시·대조·source health·재큐잉 중지 | 승인·곡·후보 검수, unsubscribe 처리 및 callback |
| 실패 상태 | WebSub `ok:false`, source health 실패·재시도·미완료를 실행 결과에 반영 | 해결된 성공과 진짜 partial 구분 |
| WebSub 복구 | 자동화 허용 시 `hub_timeout` 실패 구독의 시간당 최대 한 번 재가입 | 현재 generation, 승인, 활성 monitor, 요청 CAS |
| Shorts | 성공 checkpoint가 있는 정기 수집 이관, 공개 GET은 요청한 신규 채널만 준비 | 과거 페이지 요청, cursor, quota, lease |
| YouTube 저장 | 9개 영상씩 최대 99개 bind로 upsert; 50건은 6개 SQL | 모든 저장 성공 이후에만 source cursor 이동 |
| X 공개 피드 | 8개 계정의 소스·게시글을 총 2개 SQL로 조회 | 계정별 LIMIT, 숨김, 정렬·tie, source 최신성 |
| Operations | retention COUNT를 batch로 묶고 UTC 로그 시각을 인덱스 친화적으로 비교 | 실측 Cloudflare Metrics와 dispatch 추정 예산 구분 |
| 개발·배포 | Node 24 LTS, 호환 보안 패치, preflight의 중복 test 제거 | coverage 안에서 unit·Worker integration 모두 실행 |

## Play 중지·재개

관리자 → OTW Play → 채널 관리 → **Play 자동화 전체 일시 중지**를 사용한다. 활성 monitor를 기존 버전 검사 PATCH로 중지하고 구독 해제를 요청한 다음, monitor readback을 확인하고 설정을 저장·재조회한다. 중간 실패를 전체 성공으로 표시하지 않는다. 이미 중지된 monitor는 유지한다.

설정 누락은 `false`이며 기존 동작을 보존한다. 설정 API를 직접 사용하더라도 서버의 새 감시·구독·자동 전달 경로는 중지 상태를 확인한다. 구독 종료가 확인되지 않은 항목은 종료된 것으로 간주하지 않고 cleanup 또는 intent recovery가 이어서 처리한다.

재개는 전체 중지 해제 후 필요한 monitor를 명시적으로 다시 켠다. 기존 watermark 재설정 계약에 따라 중지 기간 전체를 자동 소급 수집하지 않는다. 후보의 수동 검수·Ready 저장·카탈로그 반영 경로는 전역 중지와 분리되어 있다.

## 측정과 완료 기준

운영 감사에서 9/4~9/7 UTC D1 읽기는 하루 1,276,810~2,019,366행, 쓰기는 15,424~16,706행이었다. 9/7의 outbox 관련 세 쿼리가 약 92%를 차지했다. Cloudflare adaptive 집계이므로 정확한 청구액으로 해석하지 않는다.

운영 DB의 동일 빈 결과 SELECT 비교에서 기존 claim 2,131행 → 인덱스 지정 6행, 전달 유실 탐색 3,914행 → queued 우선 탐색 1행을 확인했다. 모두 쓰기 0이었다. 회귀검사는 완료 이력 2,130개를 가진 실제 D1에서 각 빈 조회의 `rows_read <= 10`, `rows_written = 0`을 검증한다.

배포 후 같은 공개 URL·관리자 진입점에서 기능·상태를 확인한다. 요청 시간은 같은 지역·조건의 표본만 비교하며 소수 표본을 전체 사용자 p95로 표현하지 않는다. 다음 7일은 Cloudflare의 UTC 일별 D1 실측과 쿼리 집계를 읽고, 다음을 확인한다.

- Outbox 읽기 합계 80% 이상 감소. 트래픽 변화가 있으면 조회당 읽기와 실행 횟수도 함께 비교한다.
- 대상 없는 유지보수 item 생성 0. 실제 구독 종료·재시도·공용 복구가 있는 실행은 포함하지 않는다.
- X·Naver·일반 YouTube 수집의 최근 성공 시각, backlog, 오류가 기존 계약 범위에 있다.
- Play 중지 상태와 구독 종료 상태, 승인·후보 보존을 함께 확인한다.
- 관측을 위해 D1 usage ledger에 추가 쓰기를 하지 않는다.

실제 청구서·Clerk 비용·전 사용자 p95는 이번 코드 검증의 근거에 포함하지 않는다. 7일 관측이 끝나기 전 장기 절감 효과가 검증 완료되었다고 표시하지 않는다.

## 구현 검증 결과

- 전체 unit·Worker integration 259개 파일, 1,874개 테스트 통과. 마지막 구독 해제 UI 변경은 관련 10개 테스트와 타입·lint를 추가 확인했다.
- 전체 preflight는 구현 커밋 `2320f5d` 기준으로 통과했다. 후속 WebSub 해제 intent 수정 `b43e73b`는 D1 integration 14개와 service·HTTP·hub 30개 테스트, 타입·lint·배포 빌드로 추가 확인했다.
- 실제 화면 점검에서 발견한 관리자 직접 진입 수정 `8b2e300`은 자산 생성·Cloudflare assets HTTP 회귀 8개 테스트, 타입·lint·배포 빌드로 확인했다. 후속 소규모 수정마다 전체 coverage를 다시 실행하지는 않았다.
- Coverage: statements 81.89%, branches 68.89%, functions 85.53%, lines 83.45%. 기존 70/60/70/70 기준 유지.
- 운영 의존성 `pnpm audit --prod`: 알려진 취약점 0건.
- 배포 전 같은 지역에서 URL별 5회 요청의 중앙값: `/` 174ms, `/api/members` 309ms, `/api/member-posts` 1,706ms. 모두 HTTP 200. 전체 사용자 p95가 아니다.
- 운영 pause 조작 이후 monitor `paused`, version 106을 D1에서 확인했다. 당시 만료 lease를 보존한 구독 요청이 DB 제약에 막혀 있었으며, 만료 lease 처리와 해제 재시도 UI를 수정했다.
- 기존 X `binghayu`의 `budget_exceeded`는 배포 전부터 존재했다. 신규 장애나 이번 변경으로 해결한 항목으로 집계하지 않는다.

## 운영 반영 및 실제 흐름 검증

구현은 별도 worktree `C:\Develop\overthewall-schedule-cost-optimization`, 브랜치 `codex/backend-cost-optimization`에서 진행했다. 기존 `C:\Develop\overthewall-schedule`의 프런트엔드 작업은 수정하지 않았다.

첫 구현 `2320f5d`를 2026-09-08 00:19:32 UTC에 Worker `faaef8ad-641f-48e1-8b85-ed7e7dae7466`으로 배포했다. 실제 구독 해제에서 드러난 늦은 callback 처리 문제를 `b43e73b`로 수정하고 00:27:13 UTC에 `f038cac6-ed01-44e2-9a78-b39109a015b4`를 100% 배포한 것을 Cloudflare deployments에서 재조회했다. 기존 DB 스키마를 유지했다.

관리자 실제 링크 점검에서 `/admin/review`, `/admin/collection`, `/admin/content`, `/admin/resources`, `/admin/history`의 직접 요청이 모두 HTTP 404인 것을 확인했다. 기존 페이지 코드와 라우터 등록은 있었지만 정적 HTML 생성 목록에 누락된 상태였다. `8b2e300`은 이 5개 진입점을 생성 목록에 추가하며 인증·noindex·미등록 URL의 404 계약을 유지한다.

**최종 운영 코드: `8b2e300`, Worker `e67bcc69-5e83-4113-9558-9899c787efae`, 2026-09-08 00:39:10 UTC 100% 배포.** 새 5개 관리자 경로 모두 HTTP 200·noindex를 재조회했다.
대시보드의 실제 `자동 업데이트 상세 보기` 링크로 다시 진입해 일정 수집 설정과 Play 일시 중지 표시까지 확인했다.

| 실제 진입·관측 | 확인 결과 |
| --- | --- |
| 관리자 → Play → 채널 관리 → 전체 일시 중지 | 설정 `true`, monitor `paused` version 106을 DB에서 확인. 감시 재개·추가·대조·가져오기 비활성화 |
| 관리자 → Play → 자동 후보 → 검수·등록 | 기존 후보의 검수 dialog 열림. 저장하지 않고 닫았으며 승인 채널 12개와 자동 후보 2개 유지 |
| 관리자 → 대시보드 | Play 중지 안내와 관리 링크 표시. X·Naver·YouTube 상태 및 전송 대기 0 확인 |
| 관리자 → 자원·보존 | Cloudflare Metrics 실측 쓰기 1,270행과 dispatch 사용 예상 1,310행을 별도로 표시. 내부 한도 40,000과 보강 예산 $0.30 유지 |
| 공개 → 멤버 게시글 | X·Naver 게시글, 계정 필터, 저장된 미리보기 표시 |
| 공개 → VOD & 클립 → Shorts 더 보기 | 최초 20개에서 서로 다른 다음 20개를 추가해 40개 표시 |
| 정상 Cron → YouTube 수집 | 00:24 UTC run succeeded 1/1. 레거시 이관 성공 checkpoint `1788827043746` 저장 |
| 정상 Cron → X 수집 | 00:26 UTC run succeeded 2/2. 8개 소스 모두 최근 성공 시각 갱신, 소스 오류 0 |

9/8 배포 후 readback에서 Naver 8개·YouTube 14개 소스의 오류는 각각 0이었다. YouTube run 성공은 해당 실행의 완료를 뜻하며, 이번에 모든 채널의 새 영상을 가져왔다는 뜻은 아니다. 소스별 기존 `next_check_at`을 따르며 최신성은 7일 동안 계속 확인한다.

동일 기기·공개 URL별 순차 5회 측정 결과는 아래와 같다. 표본 요청에서 오류는 없었으며 전체 사용자 p95 또는 장기 오류율로 해석하지 않는다.

| 경로 | 배포 전 중앙값 | 배포 후 중앙값 |
| --- | ---: | ---: |
| `/` | 174ms | 170ms |
| `/api/members` | 309ms | 325ms |
| `/api/member-posts` | 1,706ms | 839ms |

### WebSub 종료 미확인

실제 관리자 구독 해제 요청 00:29:01 UTC는 약 20초 후 `hub_timeout`을 반환했다. DB에는 `unsubscribing`, `pending_mode=unsubscribe`, 만료 lease 제거 상태가 유지되는 것을 읽기 전용 조회로 확인했다. 늦은 확인 callback을 수용하며 타임아웃을 성공으로 표시하지 않는다. 00:29:37 UTC까지 tail에서 해당 POST 503은 확인했지만 허브 callback은 관측되지 않았다. **구독 종료 자체는 아직 미확인**이다.

15분 stale intent 조건을 충족하는 00:44:01 UTC 이후 기존 예약 유지보수의 재시도 대상이다. Play 중지 중에도 이 해제 복구와 callback은 유지한다. 허브 POST 타임아웃의 외부 원인은 아직 확정하지 않았다.

### 7일 관측

이 작업에 연결된 자동화 `백엔드 비용 최적화 7일 검증`(ID `7`)을 생성했다. 9/8부터 9/15까지 매일 한국시간 오전 10시에 읽기 전용 관측을 수행하며, 의미 있는 장애·비용 증가·작업 생성 이상과 마지막 결과를 알린다. 9/15 최종 비교 전까지 outbox 읽기 80% 감소와 불필요한 유지보수 생성 0의 장기 기준은 검증 대기다.

## 2026-09-09 Outbox UPDATE PK 보완

후속 관측에서 후보 SELECT는 상태 인덱스를 사용하지만 실제 claim UPDATE의 바깥 대상 선택에는 전체 스캔이 남아 있었다. 운영에는 보존 이력 2,000개 이상과 22행 시점의 오래된 통계가 함께 존재했다. 기존 로컬 검사는 실제 UPDATE도 실행했지만 이 통계 차이를 재현하지 못했다.

`claimPendingOutbox`와 같은 구조의 전달 유실 복구 UPDATE에 기존 `sqlite_autoindex_scheduled_outbox_1`을 명시했다. 내부 선택 조건·ORDER BY·LIMIT, 단일 UPDATE의 원자성, lease·CAS·RETURNING은 유지한다. 새 인덱스·스키마 변경·운영 통계 갱신은 포함하지 않는다. 이 인덱스는 필수 SQL 의존성이므로 향후 스키마 재구축 시 이름과 사용 가능 여부를 함께 확인해야 한다.

회귀검사는 로컬 D1에서 22개 outbox 행을 분석한 다음 통계를 갱신하지 않고 완료 이력 2,130개로 늘린다. 수정 전 실제 scoped claim UPDATE는 2,134행을 읽어 실패했고, 수정 후 scoped/global claim과 복구의 빈 결과 UPDATE는 각각 10행 이하·쓰기 0으로 통과했다. 실제 실행 대상 3개에 대해서도 LIMIT 2의 반환 정보와 다음 claim의 나머지 1개, 중복 없는 ID를 확인했다. 동시 scoped/global claim의 단일 획득도 검증했다.

검증 결과: 관련 D1 26개 및 전체 preflight 264개 파일·1,916개 테스트 통과. Coverage statements 81.99%, branches 69.33%, functions 85.61%, lines 83.53%. 마지막 테스트 보강 후 타입·대상 lint도 통과했다.

운영 코드 `51a1182`를 2026-09-08 22:03:10 UTC(9/9 07:03 KST)에 Worker `9ac3aaf1-2ffd-4643-983f-acb7e8f2dafa`로 100% 배포하고 Cloudflare deployments에서 재조회했다. 구현은 `codex/outbox-pk-claim`, `C:\Develop\overthewall-schedule-outbox-pk`에 있다.

22:04 UTC에 이틀 이상 지난 동일한 성공 완료 run을 대상으로 기존·수정 SQL의 실제 UPDATE 전체를 비교했다. 두 쿼리 모두 대상 없음·쓰기 0·`changed_db=false`였고 완료 run 상태도 유지됐다. 기존 바깥 UPDATE는 2,092행, 수정된 바깥 PK UPDATE는 **5행**을 읽었다. 임의 SELECT로 대신하지 않고 `claimPendingOutbox`가 만든 SQL과 실제 운영 D1의 실행 결과를 사용했다. 비교 쿼리에는 `outbox-pk-verification-*` 주석을 붙였으므로 정기 dispatcher의 자연 발생 사용량과 구분한다. 이 검증은 빈 결과의 비용 확인이며 활성 Queue 전달 자체의 성공 증거로 확장하지 않는다.

## Outbox 전체 조치 후속 검증 (2026-09-09 KST)

Operations의 전송 대기 COUNT와 가장 오래된 시각 MIN을 기존 상태·시간 인덱스를 사용하는 단일 집계로 통합했다. 미래 재시도도 대기열에 포함하고, 유효한 dispatch lease·종료된 run·실행 불가능한 item은 제외하는 기존 표시 계약을 유지한다. API·UI 응답, 사용량 원장, 40,000행 dispatch 추정 guard는 변경하지 않았다.

2026-09-08 22:19:20 UTC 운영 D1에서 동일 시각을 바인딩한 기존·신규 조회는 모두 `activeRunCount=0`, `staleLeaseCount=0`, `outboxBacklog=0`, `oldestOutboxAvailableAt=null`을 반환했다. 읽기는 **4,183→6행**, 쓰기는 모두 **0행**, SQL 시간은 0.7597→0.1882ms였다. 단회 SQL 측정이며 전체 API p95나 월 청구액 추정으로 확장하지 않는다. 실행 계획은 outbox 상태 인덱스와 item/run PK, 기존 상태·lease 인덱스 조회를 확인했다.

실제 예약 흐름도 확인했다. PK 수정 배포 이후 22:14 UTC의 Naver run `21c2d342-3b87-41a2-bb3a-18acfbe27d92`는 `source=scheduled`, item 시도 1회, outbox `dispatched`·전송 시도 1회, run/item `succeeded`였다. 내부 결과의 4개 소스는 모두 `ok`, 오류는 없었다. 강제 수집 없이 Cron→Workflow→Outbox→Queue→수집 결과 저장이 완료된 이력이다. 같은 시각 WebSub의 outbox도 전송됐지만 작업 자체는 `ok:false`로 실패했다. 이는 기존 hub 해제 실패이며 Outbox 전달 성공과 구분한다.

관리자 `/admin/operations`의 실제 인증된 진입점에서도 07:19 KST에 실행 중·전송 대기·만료 lease 각각 0, Naver 최근 점검 07:14, Play 자동화 일시 중지를 확인했다. 추가 D1 통합검사는 완료 이력 2,130개·오래된 통계에서 빈 집계를 10행 이하로 제한하며, 미래 재시도·lease 경계와 NULL·모든 terminal item의 reconcile·terminal run 제외를 검증한다.

7일 관측에서는 22:03 UTC 이전·이후의 UPDATE 쿼리를 구분하고, 기존 비싼 바깥 UPDATE가 다시 등장하는지 확인한다. Operations의 COUNT·MIN 조회 및 WebSub 수동 해제 지원은 이번 변경에 포함하지 않는다.

## 도구 버전과 잔여 항목

Node `24.20.0`, Vite `7.3.6`, Wrangler `4.129.1`, Cloudflare Vite plugin `1.54.5`, Vitest `4.1.11`, PostCSS `8.5.28`로 검증한다. Cloudflare 빌드 환경도 `.node-version` 또는 `NODE_VERSION=24.20.0`을 사용한다. Worker 자체는 workerd에서 실행된다. Wrangler의 package export 변경에 맞춰 DB 점검·초기화·seed CLI 경로도 수정했다.

Coverage는 동시 worker를 2개로 제한한다. 기존 UI 테스트의 5초 제한과 검증 내용은 유지하며 과도한 병렬 실행에 따른 timeout을 줄인다. 개발 서버는 `coverage/`와 `.tmp/`를 감시하지 않아 보고서 생성 때마다 반복 새로고침하지 않는다.

호환 범위 갱신 후 감사 결과에 남은 esbuild advisory는 drizzle-kit의 개발용 전이 의존성이다. 해당 개발 서버를 공개하는 작업은 이 프로젝트 운영 경로가 아니다. 이 항목을 없애기 위해 검증되지 않은 Drizzle major 또는 esbuild 강제 교체를 도입하지 않는다.

근거: [Cloudflare D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [Wrangler 지원 환경](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [Node 24.20.0 릴리스](https://github.com/nodejs/node/releases), [Drizzle 개발 의존성 이슈](https://github.com/drizzle-team/drizzle-orm/issues/4861).
