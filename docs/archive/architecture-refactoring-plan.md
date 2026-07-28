# 클린 아키텍처 전면 리팩터링 실행 계획

## 문서 상태

- 상태: 구현 완료 후 archive
- 작성 기준일: 2026-07-28
- 구현 완료일: 2026-07-28
- 대상 저장소: OTW Schedule web app + Cloudflare Worker
- 구현 브랜치: `refactor/clean-architecture-migration`
- 현재 문서의 역할: 당시 구현 범위, 의존성 규칙, 호환성 정책, 검증
  게이트의 이력 보존

이 문서는 구현 당시의 목표와 순서를 설명한 계획 이력이다. 현재 구조의
단일 기준은 `docs/architecture.md`, 구현 결과와 최초 목적 부합성 근거는
`docs/architecture-refactoring-verification.md`를 따른다.

사용자의 최종 요청에 따라 구현 checkpoint commit은 만들지 않았다. 기존
사용자 변경을 포함한 working tree를 별도 브랜치에 그대로 보존하고, 코드
검토가 끝날 때까지 commit·merge·push를 수행하지 않는 방식으로 보호 전략을
조정했다.

## 1. 결론

현재 실행 계획은 최초 목적에 부합한다.

최초 목적은 기능별 코드 소유권을 명확히 하고, 프런트엔드와 Worker에
Clean Architecture 의존성 방향을 적용하며, Codex가 변경 범위와 검증 대상을
쉽게 찾을 수 있도록 만드는 것이다. 수정된 계획은 다음 수단으로 이를
직접 달성한다.

- 기술 계층 중심 폴더를 기능별 vertical slice로 해체한다.
- transport DTO, domain model, DB row, UI view model을 분리한다.
- Worker의 `http → application → domain`,
  `application → ports ← infrastructure` 의존성을 강제한다.
- 프런트 feature 외부 접근을 각 feature의 `index.ts`로 제한한다.
- route registry, architecture check, Worker 통합 테스트로 경계를 자동 검증한다.
- 별도 브랜치, 작업트리 변경 목록, 전체 검증 gate로 기존 개발 내역을
  보호한다.

다만 전면 일괄 전환은 회귀 범위가 크다. 따라서 “한 번에 최종 구조를
완성한다”는 범위는 유지하되, 구현과 검증을 단계별 validation checkpoint로
나누는 것을 필수 조건으로 둔다. 코드 검토 전에는 checkpoint commit을
만들지 않는다.

## 2. 감사 결과와 우선순위

2026-07-28 점검 기준으로 `pnpm lint`, `pnpm test`, `pnpm build`가 통과했고,
77개 테스트 파일의 388개 테스트가 성공했다. 생산 코드 정적 import
검사에서는 순환 의존성이 발견되지 않았다. 따라서 이번 작업은 고장 난
프로젝트를 재작성하는 작업이 아니라, 동작하는 시스템의 경계와 무결성을
강화하는 작업이다.

### 즉시 해결할 실제 결함

1. schedule 저장과 pending 승인·거부가 여러 D1 문장으로 나뉘어 중간 실패 시
   일부 데이터만 반영될 수 있다.
2. live, YouTube, X 등 외부 API proxy가 대상 개수와 allowlist를 일관되게
   제한하지 않아 실행 시간과 외부 API quota를 과도하게 소비할 수 있다.
3. prefix 기반 Worker dispatch가 오타 경로를 수락하고, 미등록 `/api/*`에
   `200`을 반환할 수 있다.
4. 프런트엔드가 Drizzle schema 타입을 직접 참조해 persistence 모델과
   runtime schema chunk가 client bundle로 유입된다.

### 구조적 문제

1. `src/features/admin`, `src/hooks`, `src/lib/api`에 여러 기능의 책임이
   기술 역할별로 흩어져 있다.
2. `worker/routes/settings.ts`, `worker/services/x.ts` 같은 대형 파일이 HTTP,
   use case, 외부 gateway, cache, persistence 책임을 함께 가진다.
3. Worker 테스트가 `src/lib/api`에 위치하고 Worker 코드가 coverage 대상에서
   제외된다.
4. GET endpoint가 settings 정규화 저장, notice 만료 반영, live schedule
   자동수정 같은 command를 수행한다.

실행 순서는 실제 데이터 결함과 trust boundary 문제를 먼저 해결하고,
그 위에서 전체 폴더와 소유권을 전환하는 것으로 고정한다.

## 3. 확정된 제품·운영 결정

- 전체 기능을 목표 구조로 전환하고 이전 내부 계층을 최종 상태에 남기지 않는다.
- 현재 익명 schedule 생성·수정·삭제 정책은 유지한다.
- 익명 쓰기는 `ScheduleWriteAuthorizationPolicy` port와
  `PublicScheduleWritePolicy` adapter로 명시해 우발적 허용과 구분한다.
- 기존 유효 API의 method, 성공 status, 성공 payload, cache header를 유지한다.
- 최근 사용한 `.wrangler/state` 로컬 D1 데이터는 보존한다.
- `/multiview`는 인증이나 extension 없이 동작하는 공개 Mul.Live iframe
  방식과 반복 `c=` URL 상태를 유지한다.
- DB 테이블 정의는 변경하지 않는다. schema 파일 이동만 수행하며 SQL
  migration은 생성하거나 적용하지 않는다.
- 원격 push, PR, merge, D1 remote migration, Worker 배포는 이 계획의 자동
  실행 범위가 아니다.

## 4. 브랜치와 기존 변경 보호

초기 계획은 기존 앱 변경과 실행 계획을 `develop`에 먼저 commit한 뒤 전용
브랜치를 만드는 방식이었다. 그러나 이후 사용자가 코드 검토를 위해
commit을 수행하지 말라고 명시했으므로, 실제 구현에서는 다음 보호 전략을
적용했다.

1. 당시 `develop`과 같은 기준 commit에서
   `refactor/clean-architecture-migration` 브랜치를 생성했다.
2. 기존 미커밋 변경을 숨기거나 재작성하지 않고 새 브랜치의 working tree에
   그대로 유지했다.
3. 기존 변경과 리팩터링 변경을 함께 `git status --short`,
   `git diff develop`, `git diff --cached develop`,
   `git ls-files --others --exclude-standard`로 검토할 수 있게 보존했다.
4. 구현 중 commit·merge·push를 수행하지 않았고, broad stage·reset·stash·
   clean도 사용하지 않았다.
5. 기존 앱 변경은 이동된 최종 소유 경로와 관련 테스트를 통해 보존 여부를
   확인했다.

계획 작성 전에 존재했던 보호 대상은 다음 8개 파일이었다.

- `Design.md`
- `src/components/app-navigation.ts`
- `src/components/app-navigation.test.ts`
- `src/components/app-shell.tsx`
- `src/features/multiview/multiview-page.tsx`
- `src/features/multiview/multiview-page.test.ts`
- `src/features/multiview/multiview-utils.ts`
- `src/features/multiview/multiview-utils.test.ts`

구현 브랜치:

```text
refactor/clean-architecture-migration
```

현재 `HEAD`와 `develop`은 동일 기준 commit을 가리키므로
`develop...HEAD` commit diff가 비어 있는 것이 정상이다. 보호 근거는 commit
차이가 아니라 위 working tree 목록, 이동 후 관련 테스트, 전체 gate 결과다.
최종 결과는 사용자 검토와 승인 전까지 commit하거나 `develop`에 merge하지
않는다.

금지 사항:

- `git reset --hard`
- 사용자 변경에 대한 `git checkout --`
- 기존 변경을 숨기기 위한 임시 stash
- 전체 ignored 파일을 대상으로 하는 광범위한 `git clean`
- 승인되지 않은 원격 push, PR 생성, merge 또는 deploy

## 5. 목표 구조와 의존성 규칙

```text
contracts/                    # Worker와 frontend가 공유하는 wire DTO
db/schema/                    # 기능별 Drizzle table 정의

src/
  app/                        # provider, layout, admin auth composition
  routes/                     # 얇은 TanStack Router adapter
  features/<capability>/
    model/
    use-cases/
    api/
    queries/
    ui/
    index.ts
  shared/
    api/
    query/
    ui/
    lib/

worker/
  index.ts                    # 얇은 Cloudflare runtime entry
  app/                        # route registry, cron, composition root
  platform/                   # auth, HTTP, D1, observability
  features/<capability>/
    domain/
    application/
    ports/
    infrastructure/
    http/
    index.ts
```

모든 feature에 빈 계층을 일률적으로 만들지는 않는다. 실제 책임이 있을 때만
하위 폴더를 만든다.

### 프런트엔드 의존성

```text
route/app
  → feature public index
    → ui/queries/use-cases
      → model

api
  → contracts + shared HTTP client
```

- feature 간 참조는 상대 feature의 `index.ts` 공개 표면만 사용한다.
- `model`은 React, TanStack Query, HTTP client, Drizzle에 의존하지 않는다.
- server state는 TanStack Query cache를 단일 기준으로 사용한다.
- form draft, dialog open state 같은 실제 UI state만 local state로 둔다.
- frontend는 `db`와 `worker`를 import하지 않는다.

### Worker 의존성

```text
http adapter
  → application use case
    → domain + ports
      ← infrastructure adapter

app composition root
  → concrete adapter wiring
```

- `domain`, `application`, `ports`, `contracts`에는 `Request`, `Response`,
  `Env`, D1, Drizzle 의존성을 허용하지 않는다.
- raw SQL과 외부 API client는 infrastructure에만 둔다.
- 인증, JSON parsing, route matching, observability는 `worker/platform`에서
  공통 제공한다.

이 규칙은 TypeScript AST 기반 `architecture:check`와 ESLint restricted
import 규칙으로 자동 검증한다.

## 6. 기능 소유권

| Capability | 소유 범위 |
| --- | --- |
| `members` | 멤버 조회, profile, profile background model |
| `schedules` | schedule 편집, conflict 규칙, automation, pending review |
| `schedule-board` | daily, weekly, snapshot, board read model |
| `ddays` | D-Day domain, public query, admin 관리 |
| `notices` | 공개 notice, banner, visibility, thumbnail, admin 관리 |
| `chzzk` | live status, VOD, clip, CHZZK cache |
| `youtube` | member videos, kirinuki, cache, warmup |
| `media-library` | CHZZK와 YouTube를 조합하는 프런트 read model |
| `x-posts` | X gateway, cache, collection, link preview |
| `naver-cafe` | source 설정, post 수집과 표현 |
| `member-posts` | X와 Naver Cafe를 조합하는 feed와 admin monitor |
| `multiview` | member source 선택, 반복 `c=` 상태, Mul.Live iframe |
| `configuration` | 공통 settings 저장과 정규화 |
| `audit` | actor 정보와 admin audit log |
| `operations` | health read model, retention, 운영 command 조합 |
| `assets` | R2 key 정책과 asset delivery |

`src/features/admin`은 최종적으로 제거한다. admin auth와 layout만
`src/app/admin`에 두고, 각 관리 화면은 해당 capability의 `ui/admin`이
소유한다.

## 7. API와 데이터 무결성

### Route 계약

- registry 교체 전에 현재 endpoint 전체를 machine-readable route manifest로
  고정한다. 각 항목은 method, exact path pattern, owner capability, auth,
  cache header, 성공 status를 가진다.
- frontend path builder와 Worker route manifest가 공유하는 path 상수는
  `contracts`에서 관리하고, auth와 cache 같은 Worker 전용 metadata는
  `worker/app`에서 관리한다.
- 기존 handler에 대한 characterization test로 manifest의 누락과 중복을
  확인한 뒤 새 registry가 같은 성공 계약을 제공하는지 비교한다.
- exact `{ method, path pattern }` registry를 사용한다.
- 미등록 API는 `404`를 반환한다.
- 등록된 path의 잘못된 method는 `405`와 `Allow`를 반환한다.
- malformed JSON과 invalid body는 `400`을 반환한다.
- ID는 양의 safe integer만 허용한다.
- 기존 pending endpoint 별칭은 같은 use case를 호출하는 HTTP 호환
  adapter로 유지한다.

### GET과 command 분리

- `GET /api/settings`는 정규화한 값을 반환만 하고 저장하지 않는다.
- notice 조회는 만료 여부를 query에서 계산하며 update하지 않는다.
- `GET /api/live-status`는 조회 전용으로 전환한다.
- 기존 live response의 `scheduleAutoFill`은 호환을 위해
  `{ updated: 0 }`으로 유지한다.
- 관리자 자동 반영은
  `POST /api/operations/live-schedule/auto-fill`로 이동한다.

### 외부 API 입력 정책

- CHZZK: 32자리 hex, 소문자 정규화, 중복 제거, 활성 멤버 allowlist,
  최대 20개
- YouTube: `^UC[A-Za-z0-9_-]{22}$`, 활성 멤버 allowlist, 최대 20개,
  `maxResults` 1–20
- X: `^[A-Za-z0-9_]{1,15}$`, 대소문자 비구분 중복 제거, 활성 멤버
  allowlist, 최대 20개, `maxResults` 5–20
- allowlist 조회 실패는 `503`, invalid 또는 미승인 target은 `400`

### Schedule과 pending 원자성

`ScheduleWriteRepository`가 `D1Database.batch()`로 conflict 처리, schedule
변경, update log, pending 삭제를 하나의 transaction에 넣는다. Cloudflare는
batch 중간 문장 실패 시 전체 sequence를 rollback한다고 명시한다.

- create ID는 재조회하지 않고 insert 결과의 `meta.last_row_id`를 사용한다.
- create log는 schedule insert 바로 다음 문장에 두고, 그 사이에 다른
  insert를 허용하지 않는다. 이 create log에만 `last_insert_rowid()`를
  사용한다.
- update, delete, reject log는 request나 pending row에서 이미 확인된
  schedule ID를 사용한다.
- pending bulk는 ID별 transaction으로 처리해 항목 단위 all-or-nothing과
  기존 partial-success 의미를 유지한다.
- 입력 순서대로 결과를 반환하고 동시성은 최대 4로 제한한다.
- HTTP handler 재귀 호출을 제거하고 모든 단건·선택·전체 동작이 같은
  application use case를 사용한다.

동일 pending의 동시 처리는 사전 SELECT 결과로 결정하지 않는다. batch의 첫
write를 pending 존재 여부와 conflict 조건을 포함한 conditional DML로 만든다.

- create: `INSERT ... SELECT FROM pending WHERE id = ? AND NOT EXISTS(conflict)`
- update/apply-empty: `UPDATE ... WHERE EXISTS(pending WHERE id = ?)`
- 후속 log와 pending delete: 직전 DML의 `changes() = 1`일 때만 수행
- 첫 DML의 `meta.changes = 1`인 요청만 성공으로 판정

pending row가 transaction의 claim/CAS 역할을 하며, 첫 번째 transaction이
pending을 삭제한 후 시작되는 요청은 0건 처리된다. 이 보장은 문서상의
가정만으로 완료 처리하지 않는다. isolated D1에서 동일 pending을 동시에
처리해 정확히 한 요청만 성공하는 통합 테스트를 필수 gate로 둔다. 이
테스트가 실패하면 checkpoint를 중단하고 `claimed_at` 또는 version column,
unique conflict key를 포함한 별도 schema migration 승인을 먼저 받는다.

참고:
[Cloudflare D1 `batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

## 8. 구현 순서와 checkpoint

전체 범위를 하나의 리팩터링 브랜치에서 완료하되 다음 validation
checkpoint별로 검증한다. 사용자 검토 전에는 commit하지 않는다.

### 1. Characterization, route manifest, architecture guard

- 현재 API, auth, cache, UI 동작의 characterization test를 추가한다.
- 모든 endpoint의 method/path/auth/cache/success status를 route manifest로
  고정하고 현재 handler와 대조한다.
- Worker 통합 테스트 환경과 test typecheck를 구성한다.
- architecture import/cycle 검사를 먼저 도입한다.
- `.agent/rules/architecture-migration.md`에 current path, target owner,
  migration 상태를 기록하고 `.cursor` mirror를 생성한다.

### 2. 고위험 reference slice와 공통 경계

- schedules/pending을 첫 vertical slice로 전환한다.
- conditional DML과 D1 batch로 원자성·동시 승인 결함을 먼저 해결한다.
- exact route registry, strict ID/JSON validator, 외부 API target
  limit/allowlist를 먼저 적용한다.
- GET에서 실행되는 domain command를 명시적 command use case로 분리한다.
- 이 checkpoint의 rollback, concurrency, auth, route characterization test를
  모두 통과시킨다.

### 3. Contracts, DB schema, platform 확장

- `contracts`를 feature별 wire DTO로 분리한다.
- `src/lib/types.ts`, `worker/types.ts`의 책임을 transport, domain, DB,
  view model로 이동한다.
- Drizzle table 정의를 `db/schema`로 이동하고 SQL 차이가 없음을 검증한다.
- frontend bundle에서 Drizzle runtime을 제거한다.
- shared HTTP/query adapter와 Worker platform을 만든다.

### 4. Leaf capability 이동

다음 순서로 API, query, UI, Worker adapter를 함께 이동한다.

```text
members
→ ddays / notices
→ chzzk / youtube
→ x-posts / naver-cafe
```

기능 하나를 이동할 때 기존 경로와 새 경로를 장기간 병존시키지 않는다.
관련 소비자와 테스트를 같은 checkpoint에서 전환한다.

### 5. Aggregate와 presentation 이동

```text
schedule-board
→ media-library / member-posts
→ multiview
→ operations / audit
```

- route를 얇게 만들고 admin UI를 소유 feature로 분산한다.
- profile, notice, daily schedule 대형 화면을 query/container/presentation으로
  분리한다.
- TanStack Query cache와 local state의 이중 저장 및 DOM event 동기화를
  제거한다.

### 6. Legacy 제거와 문서 정리

- 임시 re-export와 기존 수평 계층 잔여물을 제거한다.
- 도달하지 않는 X/Naver 전용 overview는 고유 동작 보존 여부를 확인한 뒤
  관련 전용 테스트와 함께 제거한다.
- 현재 실제 구조에 맞게 README와 운영 문서를 갱신한다.
- 각 checkpoint에서 이동이 완료된 경로는 즉시 `.agent` current-state
  규칙과 migration map에 반영하고 `.cursor`를 sync/check한다. 마지막에는
  migration map을 최종 architecture rule로 교체한다.

## 9. 테스트와 완료 게이트

### 필수 회귀 테스트

- 기존 388개 테스트가 보호하던 동작과 assertion을 이동 후에도 보존한다.
  dead module 제거와 중복 test 통합 때문에 최종 test 개수 자체는 완료 기준으로
  사용하지 않는다.
- exact route `404/405`, malformed JSON, strict ID/date/time
- anonymous/member/admin auth matrix와 의도적 anonymous schedule write
- schedule 저장 중간 실패 시 conflict 삭제와 log까지 전체 rollback
- create 반환 ID, schedule ID, audit log schedule ID 일치
- 동일 pending 동시 승인 시 정확히 1회 성공
- bulk 성공·충돌·실패 혼합 시 항목별 commit과 결과 순서
- CHZZK, YouTube, X target validation, allowlist, 최대 개수
- cache fresh/stale/forceRefresh와 외부 API 실패 fallback
- Worker와 frontend가 동일 contract fixture를 decode
- profile preload 실패, snapshot clipboard/download 실패, multiview 반복
  `c=` 상태
- admin mutation 후 DOM event 없이 Query cache 소비자가 갱신

Worker D1 통합 테스트는 `@cloudflare/vitest-pool-workers`와 isolated
Miniflare D1을 사용한다.

참고:
[Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)

### 최종 명령

```text
pnpm architecture:check
pnpm typecheck:test
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm sync:agent-cursor:check
```

coverage에는 frontend model/use-case/API와 Worker domain/application/
infrastructure production code를 포함한다. global 최소 threshold는 다음과
같이 고정한다.

- statements: 70%
- lines: 70%
- functions: 70%
- branches: 60%

schedule/pending command repository와 use case는 global 수치에 가려지지 않도록
모든 command branch에 unit 또는 isolated D1 integration test가 있어야 한다.

추가로 다음을 검사한다.

- client build에 `schema-*.js` 또는 Drizzle runtime이 없음
- production import cycle이 없음
- Worker production 코드가 coverage 대상에 포함됨
- `git diff develop`, `git diff --cached develop`,
  `git ls-files --others --exclude-standard`와 이동 후 app/multiview 테스트에서
  기존 변경이 보존됨
- schema 이동 전후 generated migration SQL 차이가 없음

## 10. 정리 범위

### 삭제

- `dist`, `coverage`
- `.wrangler/tmp`, `.wrangler/deploy`, dev restart log
- 빈 `.agents`, `.codex`, `.tanstack`
- editor JSON이 잘못 저장된 `.prettierignore`
- 전환 후 도달하지 않는 legacy adapter, type, hook, API module

### 보존

- `.wrangler/state`
- `.env.local`, `.vscode`, `node_modules`
- profile background 원본이 있는 `r2`
- `src/routeTree.gen.ts`, `worker-configuration.d.ts`
- Drizzle migration과 seed
- 사용자 수정과 source asset

`.tmp/`는 ignore에 추가한다. `package.json`과 `pnpm-workspace.yaml`의 동일
override는 workspace 한 곳만 source of truth로 남긴다.

## 11. 최초 목적 부합성 점검

| 최초 목적 | 계획의 대응 | 판정 |
| --- | --- | --- |
| 기능별 코드 분리 | capability별 frontend/Worker vertical slice와 public `index.ts` | 부합 |
| Clean Architecture | domain/application/ports/infrastructure 의존 방향과 composition root | 부합 |
| Codex 유지보수성 | 소유권 표, 얇은 route, architecture check, 기능별 colocated test | 부합 |
| API 계약 일관성 | 공유 contracts, exact route registry, strict boundary validation | 부합 |
| 데이터 안전성 | D1 atomic batch, 항목별 bulk transaction, 동시 처리 테스트 | 부합 |
| 기존 동작 보존 | 성공 계약과 public schedule 정책 유지, pending 호환 adapter | 부합 |
| 기존 개발 내역 보호 | 동일 `develop` 기준의 전용 branch, working tree 목록, 이동 후 테스트와 전체 gate, commit·merge·push 금지 | 부합(운영 방식 조정) |
| 불필요 파일 정리 | disposable artifact와 local working state의 명시적 구분 | 부합 |
| 문서와 agent 최신화 | 구현 완료 시 실제 구조 기준으로 canonical 문서와 mirror 갱신 | 부합 |

### 의도적 예외

- 익명 schedule 쓰기는 보안 기본값이 아니라 현재 제품 정책이다. 이번
  리팩터링에서는 변경하지 않고 policy adapter와 계약 테스트로 명시한다.
- pending legacy URL은 외부 호환성을 위해 남지만 application logic은
  중복하지 않는다.
- full migration은 작은 변경 원칙보다 범위가 크지만, 전용 브랜치와
  validation checkpoint gate로 위험을 통제한다.
- foreign key 추가와 legacy migration fallback 제거는 현재 원격 D1 상태와
  삭제 정책 확인이 필요한 별도 데이터 프로젝트로 제외한다.

## 12. 중단 조건

다음 중 하나가 발생하면 다음 validation checkpoint로 진행하지 않고 원인을
먼저 해결한다.

- 기존 성공 API payload를 소비자 수정 없이 깨뜨리는 변경
- route manifest와 실제 handler의 method/path/auth/cache 차이
- schema 이동 과정에서 실제 DDL 차이 생성
- D1 원자성 통합 테스트 실패
- 사용자 기존 app/multiview 변경 유실
- `architecture:check`, lint, test, build 중 하나의 실패
- local D1 state 또는 사용자 asset이 cleanup 대상에 포함됨
- 새 production dependency가 필요하지만 기존 도구로 대체 가능한지 검토되지 않음

## 13. 완료 정의

다음 조건이 모두 충족돼야 아키텍처 리팩터링이 완료된 것으로 본다.

1. 모든 기능이 소유 capability 아래에 있고 이전 수평 계층이 제거됐다.
2. contracts와 DB schema가 frontend domain/UI에서 분리됐다.
3. Worker use case가 D1, Drizzle, Request, Response를 직접 참조하지 않는다.
4. schedule과 pending command가 중간 실패 시 부분 반영되지 않는다.
5. 기존 성공 API와 제품 정책이 보존되고 의도적 오류 계약만 변경됐다.
6. architecture, typecheck, lint, test, coverage, build, mirror gate가 통과했다.
7. 임시 산출물은 제거됐고 local D1과 사용자 asset은 보존됐다.
8. 최종 구조 문서가 작성되고 이 계획 문서는 archive 대상으로 전환됐다.
9. `HEAD`와 `develop`의 동일 기준 commit, working tree 변경 목록, 기존 변경
   보존 여부가 검토됐으며 승인 전 commit·merge·push되지 않았다.
