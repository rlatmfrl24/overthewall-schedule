# D1 최적화 최종 검토·수정 — 2026-10-20

What this change does: `codex/d1-efficiency`의 전체 변경을 다시 검토하고 확인한 결함 4건을 로컬에서 수정했다. 독립 재검토의 잔여 Standards·Spec 지적은 각각 0건이다. 계정 합산 **UTC 하루 5,000,000행 읽기** 기준과 자동 배경 작업의 4,000,000행 중단선은 유지한다.

- 전체 검토 기준: `71913fe9c710d268664706bcb7ee03e09cad3150` → `f9161e39e5f113bba5f314b8acf191ccddd1ead6`, 11개 커밋.
- 재검토 명령: `git diff 71913fe9c710d268664706bcb7ee03e09cad3150...f9161e39e5f113bba5f314b8acf191ccddd1ead6`.
- 수정 커밋: `c58d1f36949db155f97d681a90dafb36f6bb151e`.
- 격리 작업 트리: `C:/Users/rlatm/.codex/worktrees/d1-efficiency/overthewall-schedule`. 다른 작업 트리와 기존 미커밋을 수정하지 않았다.
- 명세: [승인된 실행 계획](../../superpowers/plans/2026-10-19-d1-efficiency.md). 기존 33개 검토 항목의 처리·계측은 [10/19 구현 보고서](2026-10-19-d1-efficiency.md)에 남아 있다.
- `ponytail-review`, Matt Pocock의 두 축 독립 리뷰, OTW 코드 리뷰·API 변경 지침을 적용했다. issue tracker 설정 파일은 없고 커밋에 이슈 참조도 없어, 이미 승인한 로컬 명세를 사용했다. 리뷰를 위해 별도 추적 시스템을 추가하지 않았다.

## Standards

**1. [P2 · 수정 완료] 검색 결과가 최신 서버 상태를 덮음**

- 역할: 곡·참여자 선택기가 페이지 밖 대상을 검색한다.
- 문제: `remoteSongs`, `remoteEntities`, `resolvedSongs`가 독립 React 상태로 남고 카탈로그 무효화에 참여하지 않았다. 검색 후 같은 ID의 이름·보관 상태가 변경되면 오래된 행이 최신 행을 덮을 수 있었다. `.agent/rules/architecture.md`의 “Use TanStack Query as the single source of truth for server state”와 충돌했다.
- 수정: [공통 조회 hook](../../../src/features/otw-play/queries/use-admin-catalog.ts)에서 기존 카탈로그 키 아래 TanStack Query로 관리한다. 동일 ID는 높은 version을 사용하고, 같은 version이면 현재 카탈로그를 우선한다. 선택된 곡의 추가 메타데이터도 ID 조회로 관리한다. 중복 debounce/fetch 구현을 함께 제거했다.
- 미수정 영향: 보관된 대상을 계속 제안하거나 이전 이름·버전으로 편집할 수 있었다. 서버의 최종 권한·동시성 검증은 수정 전에도 유지됐지만 사용자 흐름은 잘못됐다.

독립 Standards 리뷰는 최초 명시 위반 1건과 같은 원인의 `Duplicated Code` 판단을 묶었다. 수정 후 명시 위반 0건·독립 조치가 필요한 smell 0건이다.

## Spec

**2. [P1 · 수정 완료] HTML 조립 중 보관 전환을 놓치는 프로필 캐시**

- 역할: [SEO 조립](../../../worker/app/site-seo.ts)이 한 요청 안에서 프로필 Promise를 공유한다.
- 문제: SEO가 프로필을 읽고 `ASSETS.fetch`를 기다리는 동안 보관 전환이 완료되면 본문 서비스는 변경 이후 revision을 첫 기준으로 읽었다. 그 뒤 변경 이전 프로필을 재사용해 소개·링크·JSON-LD를 공개할 수 있었다. 계획의 “Cached public content must never survive an unrepresented access/member/link/default-setting change”에 위배됐다.
- 수정: 첫 프로필 조회 전에 접근 revision을 확보한다. 본문 시작·최종 접근 검사에서 같은 기준과 비교한다. 실제 Worker 조립과 로컬 D1을 사용하는 `ASSETS.fetch` hook에 보관·receipt 변경을 넣어 검증했다. 수정 전 `200`으로 재현됐고, 수정 후 양 사이트 GET·HEAD 모두 `503/no-store`로 차단됐다.
- 미수정 영향: 보관 직전 요청이 보관된 내용을 공개할 수 있었다. 조회와 보관 전환이 겹칠 때만 발생하는 경합이며 영향은 공개 정책 위반이다.

**3. [P2 · 수정 완료] 첫 검색 페이지가 전체 선택·기존 곡 존재 판정을 제한함**

- 역할: 관리자 곡·참여자·채널 편집에서 전체 대상에 검색으로 접근한다.
- 문제: 조회는 25개인데 선택기가 `nextCursor`를 사용하지 않았다. 또한 `A Star 01` 같은 앞선 후보가 30개 있으면 기존 `Star`가 첫 페이지에서 빠지고, 새 곡을 만들 수 있다고 잘못 판단했다. 검색 응답을 기다리기 전에도 새 곡 선택이 노출됐다. 계획의 전체 대상 접근·기존 identity 유지 조건을 충족하지 못했다.
- 수정: 세 선택기 모두 사용자 요청으로 다음 25개를 읽는 더 보기를 제공한다. 곡/주체의 기존 12개/6개 화면 제한은 페이지 조회 모드에서 해제한다. 곡 조회 DTO에 선택적인 `exactSongExists`를 추가해 이미 읽은 후보에서 LIMIT 전에 제목·별칭의 정확 일치를 확인한다. 페이지들을 합칠 때 이 값도 유지한다. 검색 완료·성공 전에는 신규 선택을 허용하지 않는다. 공개 API·정렬·커서는 변경하지 않았다.
- 미수정 영향: 페이지 밖 대상을 선택하지 못하거나 기존 곡을 새 곡으로 오인할 수 있었다. 동일 fixture에서 실제 D1 결과가 정확 일치를 누락함을 재현한 뒤 수정했다.

**4. [P2 · 수정 완료] 전체 게시 준비 실패가 처리되지 않음**

- 역할: 전체 게시 버튼은 현재 페이지와 무관한 전체 대상을 조회한 뒤 확인을 받는다.
- 문제: 준비 조회가 실패하면 처리되지 않은 Promise 거부가 발생하고 오류·재시도 안내가 없었다. 준비 중 반복 클릭도 같은 전체 조회를 반복했다. 계획의 전체 게시 대상 유지·오류 처리 조건과 기존 정상 흐름을 함께 확인했다.
- 수정: 기존 카탈로그 Query의 명시적 refetch로 준비한다. 조회 중 버튼을 잠그고 실패를 표시한다. 실패 때 게시·확인창을 열지 않으며 재시도로 확인 단계에 다시 진입한다. 실제 게시 대상은 전체 조회에서 얻은 목록이며, 확인 전 쓰기는 없다.
- 미수정 영향: 운영자가 동작 결과를 알 수 없고 비싼 전체 조회를 반복할 수 있었다.

독립 Spec 리뷰는 최초 2번을 확인했고, 주 검토자가 3·4번을 추가 재현했다. 수정 후 독립 재검토의 추가 확정 지적은 0건이다. Standards와 Spec의 우선순위를 서로 합치거나 재정렬하지 않았다.

## 로컬 검증

Node **24.20.0**, pnpm **11.7.0**을 사용했다. 최종 수정 소스에 유효한 관련 검증은 **12개 파일·220개 사례의 조합 PASS**다. 단일 전체 테스트 명령이 통과했다고 해석하지 않는다.

| 범위 | 결과 | 실제 검증 |
| --- | --- | --- |
| Cron·계정 예산·Operations·작업 조정 | 4파일·46 PASS | 집계 실패·상한·UTC·기존 작업 상태 |
| 관리자 화면·선택기 | 2파일·82 PASS, 조합 | 전체 관리자 파일 75개와 선택기 최종 7개. 마지막 테스트 보완 후 관련 9개 재실행 PASS |
| 관리자 HTTP·API client·본문 서비스 | 3파일·38 PASS | 인증 뒤 DTO 전달·기존 API 계약·최종 정책 검사 |
| 실제 Worker/D1 관리자·SEO | 3파일·54 PASS, 조합 | 53개 통과 뒤 양 사이트 경합과 계측으로 바뀐 본문 파일 7개 재실행 PASS |
| 타입 | PASS | `pnpm.cmd typecheck:test` |
| 린트 | PASS | 변경 코드 12개 파일 ESLint, 마지막 테스트 보완 파일 재검사 |
| 구조 | PASS | `pnpm.cmd architecture:check` |
| OTW·LuvDia 빌드 | 각각 PASS | `pnpm.cmd build`, `pnpm.cmd build:luvdia`, 각 산출물 manifest 검증 포함 |
| diff | PASS | `git diff --check` |

주요 실행 명령은 다음과 같다. 테스트 파일 경로는 저장소 기준이다.

```powershell
pnpm.cmd exec vitest run worker/app/scheduled-workflow-cron.test.ts worker/features/otw-play/infrastructure/cloudflare-ingestion-read-budget.test.ts worker/features/operations/infrastructure/cloudflare-d1-observability-reader.test.ts worker/features/scheduled-operations/infrastructure/scheduled-job-coordinator.test.ts
pnpm.cmd exec vitest run src/features/otw-play/ui/admin/catalog-pickers.test.tsx src/features/otw-play/ui/admin/catalog-manager.test.ts --testTimeout 15000
pnpm.cmd exec vitest run worker/features/otw-play/http/admin-catalog-handler.test.ts src/features/otw-play/api/admin.test.ts worker/features/seo/application/site-content-service.test.ts
pnpm.cmd exec vitest run --config vitest.all.config.ts --project worker-integration worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts worker/features/seo/infrastructure/site-content-storage.integration.test.ts worker/features/seo/http/handler.integration.test.ts
```

회귀 테스트는 먼저 실패를 관측한 뒤 통과시켰다. UI 테스트는 실제 QueryClient와 선택·편집 제어를 사용하지만 서버 응답은 모의한다. Worker/D1 경합은 실제 로컬 DB와 Worker 진입점으로 검증한다. 어느 쪽도 실제 인증 관리자 화면의 저장을 증명한다고 해석하지 않는다. 초기 테스트 작성의 React import·필수 SQL fixture 누락은 바로잡고 실제 결함으로 실패하는 것을 다시 확인했다. assertion이나 보호 조건을 낮추지 않았다.

## 비용과 캐시

- 5,000곡 관리자 fixture의 전체 조회 **12 SQL·15,013행** 대비 페이지 조회 **13 SQL·659행**, 쓰기 **0행**을 새로 재확인했다. 이번 수정으로 이 값은 증가하지 않았다.
- `exactSongExists`는 기존 조회 결과를 검사하므로 SQL이나 D1 읽기·쓰기를 추가하지 않는다. 더 보기는 사용자 동작마다 다음 페이지를 조회하며 자동 전수 로딩은 없다.
- 프로필 HTML GET+HEAD fixture 합계는 **14 SQL·20행 읽기·쓰기 0행**이다. 프로필 projection은 요청별 한 번씩, 총 2회 읽었다. 안전한 접근 snapshot을 위해 요청당 revision SELECT 1회를 추가했다. 이 HTML fixture는 기존 보고서의 배경 inventory 9 SQL·24행 fixture와 다른 시나리오이므로 두 수치를 전후 비교하지 않는다.
- 페이지 밖 선택 곡의 확인 화면 메타데이터는 선택 ID로 조회한다. 전체 카탈로그로 확장하지 않는다.
- 요청 간 공개 데이터 캐시는 계속 우회한다. 관리자 검색은 기존 TanStack Query 무효화에 참여하는 브라우저 서버 상태다. 공개·관리자 권한 및 최종 쓰기 guard를 생략하지 않는다.
- 기존에 기록한 한계는 남는다. Unicode 의미를 보존하는 넓은 관리자 검색은 SQL 후보 전체를 확인할 수 있고, 전체 게시·내보내기는 의도한 전체 대상을 읽는다. 이번에는 검색 색인·스키마를 추가 확장하지 않았다.

## 실제 화면과 제한

수정 소스의 localhost:5187 Vite/Worker와 전용 `.wrangler/state/d1-efficiency-flow`에서 기존 설치 Playwright로 확인했다. `remoteBindings:false`이며 원격 `/api/` 요청을 차단했다. API mock은 사용하지 않았다. 공개 상태나 로컬 release flag는 변경하지 않았다.

- `/profile/local_sora`: 200, 실제 프로필 이름·자기소개·링크 표시 확인 및 화면 검수.
- `/rights`: 200, 권리 안내 표시.
- `/play`: 200, 공개 준비 화면 유지, 비공개 fixture 곡 미노출.
- `/admin/otw-play`: 실제 로그인 필요 화면 유지.
- 페이지 오류 0건·차단된 원격 업무 API 호출 0건. 브라우저와 개발 서버는 종료했다.

로컬 화면 증거는 무시된 `.tmp/d1-efficiency-browser/review-20261020/flow.json`과 스크린샷에 있다. 실제 인증 관리자 목록→검색→편집→저장·재조회 및 LuvDia 브라우저는 확인하지 못했다. 해당 경로의 컴포넌트·D1 테스트 통과와 구분한다.

스키마·마이그레이션·의존성 변경은 이번 수정에 없다. 기존 0142–0147의 15개 인덱스와 격리 로컬 147개 체인 검증은 이전 기록을 재사용했으며 이번에 다시 적용하지 않았다. 향후 운영 적용 시 인덱스를 사용하는 Worker보다 마이그레이션을 먼저 적용해야 한다.

Play 자동화 중지·LuvDia AI=false·공개/보관/공유 소유자·빙하유 일정 정책은 유지한다. 관측용 D1 쓰기를 추가하지 않았다. 운영 D1 SQL·업무 API·원격 마이그레이션·수집·push·병합·배포를 수행하지 않았다. 전체 suite·preflight는 재실행하지 않았으며 향후 PR 병합 준비가 별도 소유한다.

Verdict: 로컬 최종 검토와 확인된 수정 완료. Standards 1건(P2)·Spec 3건(최대 P1)을 해결했고 각 축 잔여 지적은 0건이다. 운영의 UTC 하루 계정 합산 500만 행 준수는 아직 검증하지 않았다. 집계 지연·수락한 작업·공개 트래픽 때문에 배경 작업 중단선만으로 절대 한도를 보장하지 않는다.
