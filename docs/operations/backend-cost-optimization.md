# 무료 운영 우선 백엔드 최적화

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
- Coverage: statements 81.89%, branches 68.89%, functions 85.53%, lines 83.45%. 기존 70/60/70/70 기준 유지.
- 운영 의존성 `pnpm audit --prod`: 알려진 취약점 0건.
- 배포 전 같은 지역에서 URL별 5회 요청의 중앙값: `/` 174ms, `/api/members` 309ms, `/api/member-posts` 1,706ms. 모두 HTTP 200. 전체 사용자 p95가 아니다.
- 운영 pause 조작 이후 monitor `paused`, version 106을 D1에서 확인했다. 당시 만료 lease를 보존한 구독 요청이 DB 제약에 막혀 있었으며, 만료 lease 처리와 해제 재시도 UI를 수정했다.
- 기존 X `binghayu`의 `budget_exceeded`는 배포 전부터 존재했다. 신규 장애나 이번 변경으로 해결한 항목으로 집계하지 않는다.

## 도구 버전과 잔여 항목

Node `24.20.0`, Vite `7.3.6`, Wrangler `4.129.1`, Cloudflare Vite plugin `1.54.5`, Vitest `4.1.11`, PostCSS `8.5.28`로 검증한다. Cloudflare 빌드 환경도 `.node-version` 또는 `NODE_VERSION=24.20.0`을 사용한다. Worker 자체는 workerd에서 실행된다. Wrangler의 package export 변경에 맞춰 DB 점검·초기화·seed CLI 경로도 수정했다.

Coverage는 동시 worker를 2개로 제한한다. 기존 UI 테스트의 5초 제한과 검증 내용은 유지하며 과도한 병렬 실행에 따른 timeout을 줄인다. 개발 서버는 `coverage/`와 `.tmp/`를 감시하지 않아 보고서 생성 때마다 반복 새로고침하지 않는다.

호환 범위 갱신 후 감사 결과에 남은 esbuild advisory는 drizzle-kit의 개발용 전이 의존성이다. 해당 개발 서버를 공개하는 작업은 이 프로젝트 운영 경로가 아니다. 이 항목을 없애기 위해 검증되지 않은 Drizzle major 또는 esbuild 강제 교체를 도입하지 않는다.

근거: [Cloudflare D1 요금](https://developers.cloudflare.com/d1/platform/pricing/), [Wrangler 지원 환경](https://developers.cloudflare.com/workers/wrangler/install-and-update/), [Node 24.20.0 릴리스](https://github.com/nodejs/node/releases), [Drizzle 개발 의존성 이슈](https://github.com/drizzle-team/drizzle-orm/issues/4861).
