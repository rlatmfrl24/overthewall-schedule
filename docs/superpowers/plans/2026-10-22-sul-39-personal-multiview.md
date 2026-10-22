# SUL-39 Personal Multiview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OTW와 LuvDia 일반 회원이 치지직 채널을 사이트별로 최대 30개 저장하고 기존 멀티뷰에서 선택·시청할 수 있게 한다.

**Architecture:** 각 사이트의 기존 Clerk 인증과 분리 D1에 개인 북마크를 저장한다. `multiview` capability가 본인 목록·권한을 소유하고, `chzzk` capability의 공개 export를 composition root에서 주입해 외부 정보를 조회한다. 공개 멤버 조회와 반복 `c=` 선택·Mul.Live 이동은 유지한다.

**Tech Stack:** TypeScript, React 19, Clerk, TanStack Query, Cloudflare Workers/D1, Drizzle, Vitest. 새 의존성 없음.

**Spec:** [사이트별 개인 멀티뷰 설계](../specs/2026-10-22-sul-39-personal-multiview.md). 실행자는 두 문서를 함께 읽는다. **2026-10-22 사용자가 로컬 구현을 승인했다.** 기존 공개 채널 조회 재사용 판정과 실행 증거는 ledger/검증 보고서에 남긴다.

## Global Constraints

- Node `>=24.20.0 <25`, pnpm `11.7.0`. 새 의존성 없음.
- 사이트별 일반 회원 개인 저장 **30개**, 동시 선택 **8개**. 두 한도를 혼용하지 않는다.
- OTW `otw-db`, LuvDia `luvdia-db`, 사이트별 Clerk 설정을 유지한다. 사용자 입력으로 사이트/소유자를 선택하지 않는다.
- `/multiview` 공개 선택, 반복 `c=`, Mul.Live 새 탭·확장 프로그램 안내·내장 보기 비활성화를 유지한다.
- 개인 GET/쓰기 모두 로그인 필수, `Cache-Control: no-store`, `Vary: Authorization, Cookie`.
- 기존 공개/보관·일정·VOD/클립 허용 목록과 Play 자동화 중지·LuvDia AI=false를 유지한다.
- `.agent`의 capability 경계와 Drizzle 생성 절차를 따른다. HTTP에서 D1 adapter를 생성하지 않는다.
- 실제 사용자 흐름·서버 readback이 완료 판정이다. fixtures나 mock 통과로 대체하지 않는다.
- 현재 기준 `f6be40ba40a9a305224a40d209e2cebb2e940082`. 실행 시 최신 [현재 작업](../../current-work.md)과 diff를 재확인하며 다른 작업의 브랜치/변경을 보존한다.
- 계획 작성은 구현·commit/push·Linear/GitHub 게시·원격 SQL·migration·배포 승인이 아니다.

## Review Focus

1. 29개에서 동시 신규 추가, 가득 찬 목록에서 중복 재시도: 정확히 30개 이내이고 기존 저장은 성공 응답한다 — Task 1의 실제 D1 경합 테스트.
2. 동일/다른 Clerk 사용자와 양 사이트, 로그아웃 직전 늦은 응답: 다른 소유자의 목록·metadata가 노출되지 않는다 — Task 2의 인증/D1 테스트와 Task 3의 계정 전환 테스트.
3. 휴방·삭제 채널·9004·429·timeout·stale cache: 확인 불가와 offline을 구분하고 기존 북마크/정상 채널을 유지한다 — Task 2의 provider/HTTP 테스트와 Task 3의 부분 장애 테스트.
4. 직접 공유한 URL·뒤로 가기·선택 중 북마크 삭제·개인 목록 지연: 기존 선택과 Mul.Live URL이 바뀌지 않는다 — Task 3의 페이지 테스트와 Task 4의 브라우저 확인.
5. 임의 URL·미저장 ID 조회·비공개 멤버와 같은 외부 채널·캐시 hit: 임의 fetch/권한 우회/내부 보관 정보 연결이 없고 정상 공개 멤버 선택은 계속 된다 — Task 1/2 입력·인가 테스트와 Task 3의 병합 테스트.

---

## 파일과 소유권

아래는 승인된 로컬 구현 대상 경로다. migration 파일명은 Drizzle 실행 결과로 정하므로 번호를 예약하거나 SQL 파일을 손으로 만들지 않는다.

| 경로 | 책임 |
| --- | --- |
| Create `contracts/multiview.ts`, `contracts/multiview.test.ts` | 저장 30개 상수, DTO, 개인 입력 정규화, 오류 코드 |
| Modify `contracts/api-routes.ts` | `apiRoutes.multiview.channels`, `.channel(id)`, `.liveStatus` |
| Modify `db/schema/index.ts`; generated `drizzle/*.sql`, `drizzle/meta/*` | `multiviewChannels` 테이블·PK/제약·목록 인덱스 |
| Modify `scripts/d1-seed-guard.mjs`, `.test.ts` | 개인 저장만 있는 로컬 DB도 빈 DB로 오인하지 않게 보호 |
| Create `worker/features/multiview/application/ports/multiview-channels.ts` | 저장소·외부 reader port |
| Create `worker/features/multiview/application/multiview-service.ts`, `.test.ts` | 목록/추가/삭제/본인 상태 조회, typed error |
| Create `worker/features/multiview/infrastructure/d1-channel-repository.ts`, `.integration.test.ts` | 소유자 한정 SQL, 원자적 상한·중복 |
| Create `worker/features/multiview/http/channel-handler.ts`, `.test.ts`; `worker/features/multiview/index.ts` | 인증·body/path·rate limit·응답, 공개 export |
| Create `worker/features/chzzk/infrastructure/chzzk-multiview-reader.ts`, `.test.ts`; modify `worker/features/chzzk/index.ts` | 기존 공개 채널 metadata와 엄격한 개인 live 결과 adapter |
| Modify `worker/features/chzzk/infrastructure/chzzk-api.ts`, `.test.ts` | private caller의 optional signal, 512개 live 캐시 상한; 기존 callers 유지 |
| Create `worker/app/multiview.ts`, `worker/app/multiview.integration.test.ts`; modify `worker/app/routes.ts`, `.test.ts` | 구체 adapter 주입, 실제 registry 인증·캐시 계약과 사용자 격리 검증 |
| Modify `vitest.worker.config.ts` | 새 migration을 실제 D1 integration suite에 연결; 기존 migration 순서/격리는 유지 |
| Modify `worker/platform/types.ts`, generated `worker-configuration.d.ts`, 양쪽 `wrangler*.jsonc` | 전용 rate limiter binding 타입 |
| Modify `scripts/site-resources.test.ts`; existing `scripts/local-site-config.test.ts` | 사이트별 rate binding/로컬 전달 검증; 새 CHZZK secret 없음 |
| Create `src/features/multiview/api/personal-channels.ts`, `.test.ts` | 공유 apiFetch의 인증 필수 API client |
| Create `src/features/multiview/queries/use-personal-multiview.ts`, `.test.tsx` | 사이트·소유자별 query/mutation, 취소·무효화 |
| Create `src/features/multiview/ui/personal-channel-manager.tsx`, `.test.tsx` | 로그인 안내·추가 입력·저장 개수·추가 오류 |
| Modify `src/features/multiview/model/types.ts`, `queries/use-multiview-sources.ts`, `ui/multiview-page.tsx`, `ui/multiview-page.test.ts` | 기본/개인 소스 병합·개인 카드 metadata·삭제·부분 상태 오류 |
| Create `src/features/multiview/queries/use-multiview-sources.test.tsx` | 실제 query adapter와 소스 병합 검증 |
| Existing `src/routes/multiview.tsx`, `src/routes/-multiview.test.ts`, URL helper/test, session boundary/test | 동작 변경 없이 공개 진입·8개/공유 URL·계정 경계 회귀 확인 |
| Update this plan/spec/current-work; create `docs/reports/sul-39/implementation-verification.md` only during execution | 실제 실행 증거와 미검증 한계 |

`src/features/multiview/index.ts`는 현재 외부 export를 유지하며 새 내부 hook/UI를 불필요하게 공개하지 않는다. `members`, 전역 `settings`, Play 데이터·UI, 라우터 생성 파일은 변경 대상이 아니다. `scripts/local-site-config.mjs`는 이미 서버 전용 값을 전달하므로 재작성하지 않는다. D1 doctor의 열 목록도 schema에서 생성되므로 새 수동 목록을 만들지 않는다.

## Task 1: 개인 저장 계약과 원자적 D1 저장소

**Files:** 위 계약·schema/migration·seed guard·repository와 `vitest.worker.config.ts`.

**Interfaces:**

- `contracts/multiview.ts`: `MAX_SAVED_MULTIVIEW_CHANNELS = 30`, `parsePersonalMultiviewChannelInput(input: unknown): string | null`; spec의 `MultiviewChannelMetadata`, `SavedMultiviewChannel`, `MultiviewChannelListResponse = { items: SavedMultiviewChannel[]; limit: 30 }`, `MultiviewChannelAddResponse = { item: SavedMultiviewChannel }`, `MultiviewChannelDeleteResponse = { deleted: true }`, `MultiviewLiveStatusResponse = { items: MultiviewLiveStatusItemDto[]; updatedAt: string }`, `MultiviewErrorCode`(spec의 오류 코드 문자열 union)를 export한다. 개인 목록 port 파일은 DTO를 재정의하지 않고 이 계약을 사용한다.
- `MultiviewChannelRepository`: `list(owner: string): Promise<SavedMultiviewChannel[]>`, `find(owner: string, channelId: string): Promise<SavedMultiviewChannel | null>`, `addWithLimit(owner: string, metadata: MultiviewChannelMetadata): Promise<SavedMultiviewChannel | null>`, `remove(owner: string, channelId: string): Promise<void>`.
- `addWithLimit`은 신규 저장/기존 중복 모두 행을 반환하고 실제 신규 한도 초과만 null이다. `D1MultiviewChannelRepository(db: D1Database)`가 구현한다.

- [x] **Step 1: 계약·실제 D1 회귀 테스트를 먼저 작성한다.** `contracts/multiview.test.ts`는 대문자 ID 정규화와 세 HTTPS URL 형태, 기본 포트 443/query/fragment 허용, 2,048자 초과·http·userinfo·다른 host·비기본 포트 8443·추가 path 거부를 assert한다. repository integration test는 생성 migration을 두 격리 D1 binding(`otw_db`, 기존 테스트용 `transition_target_db`)에 실제 적용한다. 핵심 assertions:

```ts
expect(await otw.list("bob")).toEqual([]); // alice의 저장이 있어도 비공개
expect(await luvdia.list("alice")).toEqual([]); // OTW 저장을 복사하지 않음
expect((await Promise.all([otw.addWithLimit("alice", channelA), otw.addWithLimit("alice", channelB)])).filter(Boolean)).toHaveLength(1); // 먼저 29개 저장
expect(await otw.list("alice")).toHaveLength(30);
expect(await otw.addWithLimit("alice", existingChannel)).toEqual(existingRow); // full에서도 중복 성공
expect(await otw.list("alice")).toHaveLength(30);
```

같은 채널 동시 추가 1행, 다른 소유자 삭제 무효, 재생성한 repository의 같은 readback, 동률 정렬, 잘못된 raw ID/빈 소유자 DB 거부를 추가한다. seed guard test는 `multiview_channels`가 보호 COUNT에 포함됨을 assert한다.

- [x] **Step 2: RED를 확인한다.** `pnpm exec vitest run contracts/multiview.test.ts scripts/d1-seed-guard.test.ts`와 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/multiview/infrastructure/d1-channel-repository.integration.test.ts`. 새 symbol/table 부재로 실패하는지 확인하며 기존 환경 실패와 구분한다.
- [x] **Step 3: 계약·schema와 `addWithLimit`을 구현한다.** schema에 spec의 열·복합 PK/인덱스·소문자 hex/비어 있지 않은 값 제약을 추가하고 `pnpm drizzle:generate --name=multiview_channels`로 생성한다. 위 port와 repository를 구현한다. INSERT는 소유자별 COUNT <30 조건을 포함한 단일 statement와 `ON CONFLICT(owner_user_id, channel_id) DO NOTHING RETURNING ...`을 사용한다. 반환이 없으면 같은 소유자/채널을 재조회해 중복을 반환하고 없을 때만 null로 판정한다. 선행 read와 INSERT 사이의 경합을 이 statement가 막아야 한다. read에 write/갱신을 넣지 않는다.
- [x] **Step 4: GREEN과 migration 보존을 확인한다.** Step 2 두 명령을 통과시키고 `node scripts/d1-reset-local.mjs --site=otw --validate-only`, `node scripts/d1-reset-local.mjs --site=luvdia --validate-only`, `pnpm typecheck:test`를 실행한다. 두 체인이 실제 임시 D1에서 통과하고 기존 로컬 DB를 바꾸지 않아야 한다. SQL에 새 테이블/인덱스/제약 외 파괴적 변경이 없는지 검토한다. migration 번호·파일명을 이 문서에 실제 결과로 기록한다.
- [x] **Step 5: 이 작업만 커밋한다.** 위 계약·schema·생성 SQL/meta·repository/ports·integration 설정·seed guard의 정확한 파일만 `git add`하고 `feat: persist site-owned personal multiview channels`로 커밋한다. 이 단계는 향후 구현 실행에 포함되며 지금 커밋하지 않는다.

## Task 2: 기존 채널 조회와 인증된 개인 API

**Files:** Worker multiview service/HTTP/index, CHZZK adapter/cache, app composition/registry, 서버 타입·양 사이트 설정과 그 테스트.

**Interfaces:**

- Consumes Task 1의 repository·DTO/parser.
- `MultiviewChannelReader` port: `resolveChannel(channelId: string): Promise<MultiviewChannelMetadata | null>`, `readLiveStatuses(channelIds: readonly string[]): Promise<MultiviewLiveStatusItemDto[]>`.
- `ChzzkMultiviewReader()`를 CHZZK index에서 export한다. 다른 capability의 내부 port를 deep import하지 않고 위와 구조적으로 맞는 메서드를 제공한다.
- `createMultiviewService(repository: MultiviewChannelRepository, reader: MultiviewChannelReader)` → `list(owner): Promise<{items: SavedMultiviewChannel[]; limit: 30}>`, `add(owner, channelId): Promise<{item: SavedMultiviewChannel}>`, `remove(owner, channelId): Promise<{deleted: true}>`, `liveStatus(owner): Promise<{items: MultiviewLiveStatusItemDto[]; updatedAt: string}>`; 모든 owner/channelId 인자는 string.
- `MultiviewServiceError(status: number, code: MultiviewErrorCode)`; `MultiviewService = ReturnType<typeof createMultiviewService>`.
- `createMultiviewChannelHandler(resolve: (env: Env) => MultiviewService)`; `worker/app/multiview.ts`의 `createMultiviewServiceForEnv(env: Env): MultiviewService`가 자신의 DB·서버 설정을 주입한다.
- `apiRoutes.multiview.channels`=`/api/multiview/me/channels`, `.channel(id)`=`/api/multiview/me/channels/:channelId`, `.liveStatus`=`/api/multiview/me/live-status`. spec의 네 method/200/no-store 계약을 정확히 등록한다.

- [x] **Step 1: 실패할 service/provider/HTTP·registry 테스트를 작성한다.** service는 중복 사전 조회 시 metadata 호출 0회, 31번째 신규 409, provider의 명확한 없음만 404, 외부 오류 503/쓰기 0회, GET/DELETE의 provider 호출 0회를 assert한다. provider는 기존 `service/v1/channels/{id}`의 `content`에서 요청 ID가 일치하는 정보만 채택하고 무인증 직접 조회·5초 timeout·HTTPS image/null을 assert한다. HTTP는 무인증 401과 인증 설정 오류 503, 잘못된 body/query/path 400, 4,096 bytes 초과 413, rate 거절 429/바인딩 장애 503, 모든 응답 no-store/Vary, 잘못된 method 405를 확인한다.

`worker/app/multiview.integration.test.ts`는 실제 registry·서명된 로컬 테스트 JWT·실제 D1을 사용한다. transport만 fake 외부 응답으로 격리하고 auth를 mock하지 않는다. A 저장 후 B의 목록/상태에 A 채널이 없고 B DELETE 후 A 행이 남는지, 다른 issuer의 토큰이 거부되는지 확인한다. `?channelIds=...`·`ownerUserId`·`siteId` 입력은 400이다. live cache hit여도 본인 저장이 없는 요청은 해당 metadata를 반환하지 않아야 한다.

부분 상태는 `MultiviewLiveStatusItemDto`를 사용한다. 실제 polling 응답에서 이름/사진이 생략되므로 개인 상태 content는 핵심 상태 필드만 필수이며, 공개 DTO는 유지한다:

```ts
expect(result.items.find(x => x.channelId === failedId)?.content).toBeNull();
expect(result.items.find(x => x.channelId === healthyId)?.content?.status).toBe("OPEN");
expect(await repository.list("alice")).toHaveLength(2); // timeout/9004/429/stale 이후에도 보존
```

외부 삭제/휴방·불일치 ID·invalid content·stale cache·513번째 캐시 추가를 포함한다. 설정 테스트는 두 config의 `MULTIVIEW_RATE_LIMITER`가 서로 다른 namespace/6·60 설정이고 local config에도 전달되며 secret은 VITE/public vars에 없음을 assert한다.

- [x] **Step 2: RED를 확인한다.** `pnpm exec vitest run worker/features/multiview worker/features/chzzk/infrastructure/chzzk-multiview-reader.test.ts worker/app/routes.test.ts scripts/site-resources.test.ts scripts/local-site-config.test.ts`; `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/app/multiview.integration.test.ts`. 새 symbol/route가 없어 실패해야 한다.
- [x] **Step 3: provider·service·HTTP를 구현한다.** 기존 공개 채널 확인을 정상 추가 경로로 직접 사용한다. 새 Client 인증이나 9004 fallback 발생을 전제로 하지 않는다. 현재 공개 CHZZK allowlist를 수정하지 않는다. service는 사용자 저장 목록만 상태 reader에 전달한다. existing `fetchChzzkLiveStatusWithDebug(channelId, options)`에 `signal?: AbortSignal`을 optional로 추가해 개인 reader만 5초 signal을 전달하고 기존 호출자는 유지한다. live 메모리 캐시는 TTL 60초/최대 512개로 제한하며 초과 시 가장 먼저 저장한 key를 제거한다. private reader는 최대 동시 4개로 호출하고 오류/stale인 채널만 null 처리한다. endpoint 전체 결과나 사용자 목록을 shared cache에 넣지 않는다.

`worker/platform/types.ts`에 `MULTIVIEW_RATE_LIMITER?: RateLimit`만 추가한다. 양쪽 Wrangler에 별도 binding을 추가한다: OTW namespace `1003`, LuvDia `1004`, `simple.limit=6`, `period=60`; 이 번호는 검토 시 저장소 config에서 미사용이며 실제 계정 충돌 여부는 배포 준비에서 별도 확인한다. 인증 후 POST/상태 각각 `${site.id}:${user.id}:add|status` 키로 제한한다. 목록/삭제는 이 upstream용 limiter에 의존하지 않는다. 새 CHZZK secret/env example 변경은 필요하지 않다.

- [x] **Step 4: GREEN과 기존 경계를 확인한다.** Step 2를 통과시키고 기존 `worker/features/chzzk/http/live-status.test.ts`, `http/media.test.ts`, `infrastructure/chzzk-live-status.test.ts`, `infrastructure/chzzk-api.test.ts`를 함께 실행한다. `pnpm cf-typegen`, `pnpm architecture:check`, `pnpm typecheck:test`와 변경 코드 lint를 실행한다. 생성 타입 변경이 다른 사이트/기존 Env fixtures를 요구하면 해당 consumers만 갱신한다. 9004 fallback·공개 미승인 채널 거부는 계속 통과해야 한다.
- [x] **Step 5: 이 작업만 커밋한다.** 위 Worker·shared route·config/example·테스트·생성 타입의 정확한 경로만 stage하고 `feat: expose authenticated personal multiview APIs`로 커밋한다.

## Task 3: 개인 목록에서 실제 선택·시청하는 화면

**Files:** frontend API/hook/manager와 기존 multiview page/source/type 및 회귀 테스트.

**Interfaces:**

- Consumes Task 1/2 wire 계약. 기존 `apiFetch`를 `auth: "required"`, `cache: "no-store"`, `signal`로 사용한다.
- `fetchPersonalMultiviewChannels(signal?: AbortSignal)`, `addPersonalMultiviewChannel(input: string, signal?: AbortSignal)`, `deletePersonalMultiviewChannel(channelId: string, signal?: AbortSignal)`, `fetchPersonalMultiviewLiveStatus(signal?: AbortSignal)` → 각 endpoint의 DTO Promise.
- `usePersonalMultiview()` → `{ isLoaded, isSignedIn, channels: SavedMultiviewChannel[], statuses: MultiviewLiveStatusItemDto[], loading: boolean, statusLoading: boolean, listError: Error|null, statusError: Error|null, addError: Error|null, deleteError: Error|null, addPending: boolean, deletingIds: string[], add(input: string): Promise<void>, remove(channelId: string): Promise<void>, reload(): Promise<void> }`.
- `MultiviewSource`에 `saved?: SavedMultiviewChannel` 추가. `useMultiviewSources(members: Member[], personal?: { channels: SavedMultiviewChannel[]; statuses: MultiviewLiveStatusItemDto[]; loading: boolean; isError: boolean })`는 기존 반환 계약을 유지하면서 ID별로 병합한다. 추가 인자 없이 기존 caller도 계속 동작한다.
- `PersonalChannelManager({ personal }: { personal: ReturnType<typeof usePersonalMultiview> })`는 입력·로그인·count·추가 오류를 소유한다. 선택·삭제는 page의 카드에서 수행하며 같은 저장 데이터를 두 개의 독립 state로 복사하지 않는다.

- [x] **Step 1: API/hook/실제 페이지 회귀 테스트를 먼저 작성한다.** 인증 로딩 중·비회원 시 개인 fetch 0회, 성공 후 목록 GET readback으로 count가 바뀜, 31번째 오류의 정확한 문구, 중복 count 불변, 추가 503 시 입력/기존 목록 유지, 삭제 실패 시 행 유지와 이름 포함 오류를 assert한다. POST 200→GET 503이면 spec의 ‘저장됐지만 목록을 다시 불러오지 못했어요’ 문구와 재조회 제어가 나오고 ‘저장 0개’ 또는 ‘저장 실패’로 표시하지 않음을 확인한다. query key는 `['multiview-private', site.id, user.id, 'channels'|'live-status', ...]`다. unmount/logout/account switch 시 AbortSignal 취소, 이전 계정 key 제거, 늦은 mutation 응답이 새 계정 데이터에 쓰이지 않음을 테스트한다.

페이지 테스트는 실제 개인 API module/hook와 QueryClientProvider를 사용하고 fetch transport/Clerk 세션만 제어한다. 관리 UI를 추가한 뒤 저장 목록 재조회와 다음 선택까지 연결하며 새 UI 검증 전체를 hook mock으로 대체하지 않는다. 기존 공개 page mock 테스트는 회귀용으로 유지한다. 다음 assertions를 포함한다:

```ts
expect(new URLSearchParams(window.location.search).getAll("c")).toEqual(sharedIds); // 늦은 목록 load/북마크 삭제 뒤에도 동일
expect(screen.getAllByRole("button", { name: `${defaultName} 선택` })).toHaveLength(1); // 기본/개인 중복
expect(screen.getByRole("link", { name: /Mul.Live에서 보기/ }).getAttribute("href")).toBe(expectedEightChannelUrl);
expect(document.querySelector("iframe")).toBeNull();
```

외부 채널에는 가짜 UID·`/profile/<archivedCode>.webp`·비공개 멤버 내부 링크가 없음을 확인한다. 개인 상태만 실패하면 정상 기본 멤버 LIVE가 유지되고, 기본 상태만 실패하면 정상 개인 LIVE가 유지되어야 한다. 뒤로 가기, offline 전환, 선택한 북마크 삭제, 30개 저장/8개 선택의 독립 한도를 확인한다. 삭제 버튼을 선택 버튼 안에 중첩하지 않고 키보드로 각각 조작되는지 확인한다.

- [x] **Step 2: RED를 확인한다.** `pnpm exec vitest run src/features/multiview src/routes/-multiview.test.ts src/app/providers/session-query-boundary.test.tsx`. 새 개인 기능의 실패를 확인하고 기존 공개/URL 테스트를 요구사항에 맞춰 제거하지 않는다.
- [x] **Step 3: client·hook·화면을 구현한다.** 추가는 서버 성공 후 해당 소유자의 목록/상태 query를 무효화하고 GET 결과로 표시한다. mutation 실패와 저장 후 GET 실패를 구분해 spec의 안내를 표시하며 `currentContentQuery`가 실패한 데이터를 감추는 정책을 우회하지 않는다. 실제 목록을 읽지 못하면 count/입력 영역에 재조회 상태를 표시한다. 실패한 추가/삭제를 성공처럼 반영하지 않는다. 캡처한 site/owner의 query만 갱신하며 계정 전환 정리는 기존 SessionQueryBoundary와 함께 검증한다. 개인 상태는 90초/백그라운드 false, 목록은 기존 `CONTENT_READ_QUERY_OPTIONS`/`currentContentQuery` 정책을 따른다. 목록 load 완료 후에만 개인 상태 query를 켠다.

소스는 ID로 dedupe하고 기본 멤버 프로필을 우선한다. 개인 실패를 기존 `MemberPicker`의 전역 `isError`로 모든 카드에 전파하지 않도록 각 소스의 유효 `liveStatus`/isLive로 그룹을 계산한다. 공개/개인 실패 메시지는 유지하되 정상 쪽 상태를 보존한다. 개인 카드명은 유효 live 이름 → 저장 이름 → ID, 이미지는 HTTPS 저장 사진 → 기존 아이콘 순서다. 개인 저장 삭제는 sibling 버튼이며 현재 `ids`를 바꾸지 않는다. 목록·상태 실패 시 저장 성공을 취소하거나 URL을 재작성하지 않는다.

- [x] **Step 4: GREEN과 양 사이트 빌드를 확인한다.** Step 2, `pnpm architecture:check`, `pnpm typecheck:test`, 변경 코드 lint, `pnpm build`, `pnpm build:luvdia`를 실행한다. 기존 `/multiview` route는 auth-free, URL 선택 8개, 내장 보기 비활성화 테스트가 유지되어야 한다. 실제 LuvDia 화면은 Task 4에서 별도로 확인하며 OTW 고정 define의 unit test를 양 사이트 증거라고 표현하지 않는다.
- [x] **Step 5: 이 작업만 커밋한다.** frontend 대상과 관련 테스트의 정확한 경로만 stage하고 `feat: manage personal channels in multiview`로 커밋한다.

## Task 4: 양 사이트 실제 흐름 검증과 인계

대표 로컬 UI/readback과 검토는 수행했다. 별도 계정·기기·모바일·실제 방송 재생은 미검증으로 남긴다. 전체 수용 완료로 처리하지 않는다. 결과는 [검증 기록](../../reports/sul-39/implementation-verification.md)을 따른다.

**Files:** 실행 시 `docs/reports/sul-39/implementation-verification.md` 생성, 이 plan/spec와 current-work 상태 갱신. 새 테스트 앱·우회 route·임시 권한을 만들지 않는다.

**Interfaces:** Tasks 1~3의 정식 `/multiview`·Clerk 로그인·개인 API·각 사이트 로컬 D1.

- [x] **Step 1: 실패가 드러나는 수용 체크리스트를 보고서에 만든다.** 두 사이트별 익명 접근, 일반 회원 추가/저장 readback/재로그인, 다른 계정 격리, 선택 8개, 북마크 삭제/URL 보존, Mul.Live 새 탭을 각각 미검증 상태로 시작한다. test/mock 통과를 이 표의 PASS로 복사하지 않는다.
- [x] **Step 2: 실재 선행 조건을 준비한다.** 승인된 구현용 checkout을 사용하고 기존 ignored env/DB/서버를 보존한다. 사이트별 기존 개발 Clerk 계정을 정상 설정하고, 해당 사이트 local migration을 **증분 적용**한다. 기존 DB를 reset/seed하지 않는다. 두 dev 진입점은 `pnpm dev`와 `pnpm dev:luvdia`다. 키/계정 부재면 해당 실제 흐름을 미검증으로 남기고 독립적인 테스트·공개 흐름 검증은 계속한다.
- [ ] **Step 3: 각 사이트의 정상 UI 흐름을 실행한다.** 비회원 멤버 선택 → 해당 사이트 일반 회원 로그인 → 실재 외부 치지직 채널 URL 추가 → 실제 network 응답과 목록 GET에서 같은 ID 확인 → 새로고침/재로그인 복원 → 기본/개인 함께 최대 8개 선택 → 정확한 Mul.Live 새 탭 URL과 가능한 실제 재생 확인 → 저장 삭제/GET 부재 및 선택 유지 확인. 외부 시청에 필요한 최신 확장 프로그램은 사용자 브라우저의 기존 정상 환경에서 확인하며 이 작업이 확장을 설치하거나 내장 재생을 복구하지 않는다. 다른 기기/별도 로그인 세션에서도 같은 사이트 목록이 서버에서 복원되는지 확인한다. 모바일 너비·키보드 추가/삭제도 확인한다.
- [ ] **Step 4: 격리·한계와 검증 identity를 기록한다.** 계정 A/B와 OTW/LuvDia 각각의 자기 토큰으로 요청하고, 다른 issuer 토큰의 거부와 양쪽 DB 독립성을 확인한다. 운영 데이터 대량 생성 대신 30개 경합은 Task 1의 격리 실제 D1 테스트 증거를 사용한다. 공개/개인 부분 장애는 실제 네트워크 실패를 로컬 브라우저에서 유도해 관찰하고 운영 장애 주입은 하지 않는다. commit·사이트/config·실행 명령·실제 결과·미확인 기능을 구분한다. 외부 재생·추가/복원이 안 되면 전체 기능 완료로 판정하지 않는다.
- [x] **Step 5: 범위 검토와 다음 실행 경계를 기록한다.** 정상 기능·계약·권한·동시성 검증을 재검토하고 필요한 수정만 한다. Task 1~3의 통과 증거는 동일 입력일 때 재사용한다. `pnpm preflight`는 최종 PR 검토 수정이 끝난 **병합 준비** 또는 별도 요청한 릴리스에서 한 번 실행하며, 문서 작성/각 task마다 실행하지 않는다. 운영 반영은 별도 승인 후 양 사이트 로그인 설정·rate namespace·계정 합산 D1 예산 확인 → 동일 소스의 각 DB migration → 정상 배포 → 최소 표본 실제 UI/readback 순서다. 테이블을 DROP하는 롤백은 하지 않는다. GitHub 쓰기가 승인되고 열린 PR이 소유하면 PASS/FAIL을 그 PR ledger에 기록한다. 지금 외부 게시·원격 작업은 하지 않는다.
- [x] **Step 6: 실제 수행한 검증 문서만 커밋한다.** 한계가 있으면 그대로 남기고 `docs: record personal multiview verification`로 문서 경로만 stage/commit한다. 문서만으로 실제 기능 검증을 완료 처리하지 않는다.

## 계획 자체 점검 — 2026-10-22

확정 범위(일반 회원/치지직/양 사이트 분리), 30/8 한도 분리, 서버 소유자 검증, 원자적 경합, 실패 보존, 외부 설정, 정상 진입·서버 readback을 네 task에 배정했다. 공개 선택·URL·보관 정책을 우회하는 중간 구현 단계는 없다. Review Focus 5개는 각각 owning task의 테스트/실제 수용 절차에 연결했다. 함수명·DTO·경로·오류·site/owner key는 문서 간 일치하도록 대조했다.

사용자의 로컬 구현 승인에 따라 executing-plans로 구현했다. 실제 수행한 테스트·migration·빌드·UI 결과와 남은 검증 한계는 [구현 검증 기록](../../reports/sul-39/implementation-verification.md)에 구분한다. 운영 효과를 주장하지 않는다.
