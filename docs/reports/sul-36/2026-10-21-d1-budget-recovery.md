# D1 예산 조회 오류 복구 — 2026-10-21

## 문제와 원인

양 사이트 자연 Cron에서 `d1.read_budget_unavailable / upstream_error`가 발생해
예산이 남아 있어도 새 배경 작업의 승인이 중단됐다. UTC10/20의 낮은 사용량은
정상 수집의 효율 개선만으로 해석할 수 없다.

기준 소스는 `f9281dce5f45547130ec971a816ea33d864e958d`다.
공통 `CloudflareD1ReadBudget`가 저장한 native `fetch`를 `this.fetcher(...)`로
호출하면서 클래스 인스턴스를 receiver로 전달했다. Cloudflare Worker는 이 호출을
`TypeError: Illegal invocation: function called with incorrect this reference`로
거부한다. GraphQL 요청이 전송되기 전 예외를 `upstream_error`로 변환한 것이 실제 원인이다.
기존 정상 D1 계측 리더와 동일하게 `this.fetcher.call(globalThis, ...)`로 수정한다.

저장된 두 Cloudflare 토큰은 2026-10-21T11:01:59Z에 동일한 계정 예산 GraphQL에
HTTP200·오류 없음·계정119,287행으로 응답했다. 이는 로컬 저장 토큰의 증거이며,
읽을 수 없는 운영 secret 값을 확인했다는 뜻은 아니다. 토큰 교체는 하지 않는다.

## 수정 범위와 보존 계약

- 공통 리더 한 곳을 수정한다. Cron admission과 Play 예산 alias에 함께 적용된다.
- 계정 전체·UTC 날짜, 배경 상한4,000,000행 및 더 엄격한 설정,
  60초 캐시·시간초과·실패 시 새 작업 유예와 기존 작업 복구를 유지한다.
- 운영 목표는 계정 합산 하루5,000,000행이다. 임시 유료 플랜으로 높이지 않는다.
- 수집·조회 주기, Play·AI 자동화 중지, LuvDia AI=false, 공개·권한·보관·공유
  소유자·빙하유 일정 정책과 schema를 변경하지 않는다. 강제 수집하지 않는다.

## 로컬 근거

Node24.20.0·pnpm11.7.0을 사용하고 잠금 파일을 변경하지 않았다.

1. 회귀 테스트를 먼저 추가했다. 수정 전10개 중 새 receiver 검사1개가 실패했고
   예산을 `unavailable / rowsRead:null`로 반환했다. 수정 후 관련20개 테스트가 통과했다.
2. 설치된 Miniflare/workerd에서 실제 native `fetch`로 같은 소스를 실행했다.
   수정 전 `Illegal invocation`·outbound 요청0회, 수정 후 정상 예산234,908행·
   GraphQL 요청1회였다. 실제 외부 호출은 로컬 outbound service로 차단했다.
   이 값은 fixture이며 운영 사용량이 아니다. 운영 D1 SQL·쓰기는 각각0회다.
3. 일반 Node 및 함수 stub은 native receiver 제약을 검사하지 않아 기존 테스트가
   장애를 놓쳤다. 새 테스트는 receiver를 검사해 같은 회귀를 차단한다.
4. 독립 리뷰에서 actionable finding은 없었고 예산·Cron·coordinator 테스트38개와
   `git diff --check`가 통과했다. 격리 작업 트리에 migration148개를 실제 적용해
   로컬 D1을 초기화했다. 기존 작업 공간의 DB는 수정하지 않았다.

로컬 원본 증거는 기존 visualization 프로젝트의 `d1-budget-recovery-20261021/`에
보존했다: `saved-token-probe.json`, `workerd-before.json`, `workerd-after.json`.
이 문서 작성 시 최종 preflight·병합·운영 반영은 아직 완료되지 않았다.
최종 판정과 운영 version·실제 자연 Cron 결과는 이 변경 PR의 검증 ledger가 소유한다.

## 한계와 운영 확인

복구 후 정상 배경 작업이 다시 승인되면 오류로 억제되던 날보다 사용량이 늘 수 있다.
5M행 하루 준수는 배포만으로 보장할 수 없고, 4M행 배경 상한도 집계 지연과 공개
트래픽 때문에 절대 한도를 보장하지 않는다. 이번 작업은 주기 최적화나 자동화 재개가 아니다.
새 운영 토큰·설정·진단 endpoint를 추가하지 않으며 기존 자연 Cron과 읽기 전용
계측으로 반영을 확인한다. 원격 migration은 필요하지 않다.
