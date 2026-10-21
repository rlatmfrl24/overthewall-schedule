# Task 4.3 implementation report (resumable)

Status: Task4.3 코드/승인된 로컬 검증 완료, controller review 대기. BASE e8ef5aaa585cb8b255aa6244edbb3b703e303176. 최종 commit은 이 보고서의 closeout에 기록한다. Whole Task4는 미완료이며, 실제 production build와 운영 사고 영향 확인은 아래 한계대로 남는다. 아래 날짜별 IN PROGRESS 절은 당시 상태를 보존한 이력이며 이 최종 상태를 대체하지 않는다.

## 최종 결과 — 2026-10-14 21:22 KST

정상 OTW 관리자 공지 업로드→Bearer Blob 표시→공지 저장→저장된 이미지 열기→D1 참조/파생 index/ACK와 실제 로컬 R2 본문 readback을 최종111/112 적용 후 확인했다. immutable put/retry/참조 CAS/cleanup claim, 보존/expiry/redaction, source absolute→target relative projection, 최종 availability port가 실제 로컬 D1/R2 및 별도 ASSETS runtime에서 동작한다. 테스트가 요구 의미를 좁히는 대체 entry는 추가하지 않았다. Controller가 승인한 별도 static 및 committed-R2 receipt, origin mapping, 파생 참조 index, legacy 마지막 해제 clock은 모두 최종 authority 경로에 연결했다. Task4.4 전체 writer/ingress와4.5 inventory/copy orchestration은 완료하지 않았다.

**운영 사고는 미해결이다.** 18:55 KST 구 CLI의 top-level import가 금지된 remote R2 put을 실행했다. 로그상6 complete/7번째 Creating, 총76중69 never-started이며 session99620 Ctrl-C exit1 후 일치하는 실행 자식은 없었다. Root가 사용자에게 별도 승인받은 정확히7 GET에서 현재 모든 객체200/총14,215,562bytes/입력과 같은 SHA·size를 확인했다. 마지막 객체 Last-Modified18:55:28은 중단 기록18:55:26 이후이다. R2 upload-version은 GET에서 제공되지 않았고 ETag를 version으로 간주하지 않았다. 사고 전 bytes/version, 실제 CDN cache와 사용자 영향은 UNKNOWN이다. public,max-age=31536000,immutable metadata도 put에 포함됐으므로 무해했다고 주장하지 않는다. Agent는 containment 뒤 원격 IO를 실행하지 않았다. Root의 허가된7 reads와 구별하며 로컬 PASS로 사고를 상쇄하지 않는다. 상세는 `task-4-3-incident.md`, root-owned `docs/reports/sul-36/operational-upload-incident.md`, `.tmp/sul36-incident-readback-20261014`에 남아 있다.

**실제 build 미완료:** `pnpm build` exit1 (`.tmp/sul36-4-3-build-final.log`). 기존 production publishable key와 CLERK_ISSUER의 identity 불일치가 `assertClerkDeploymentConfig`에서 거부했다. tsc/Vite/SEO/artifact 생성 단계는 시작하지 않았다. Private input/guard를 바꾸거나 가짜 key로 우회하지 않았다. 실제 LuvDia Clerk app/domain/login, production D1 ID/R2 binding/deployment artifact, public bucket/custom-domain 차단 및 기존 edge cache, 합산 보관량/Worker·D1·R2 quota/cost는 운영 활성화 전 pending gate이다. 별도 app/Worker/test/node 타입 검사는 통과했다.

### Boundary / owning caller coverage

| 경계와 실제 caller | 최종 의미와 확인 |
| --- | --- |
| `operations/infrastructure/data-retention.ts` | `contentRowHeldSql`을 count/prune/status/hasMore에 동일 적용.30일 feed·expired X cache·update logs의 held 자료 보존. `DELETE RETURNING` 실제 삭제 행 수 사용; trigger 쓰기를 삭제 수로 오인하지 않음. |
| `youtube/infrastructure/youtube-feed.ts` | 실제 registry DELETE, upsert 재활성화, source read, due/metadata/backfill selectors에 hold/moved 조건. held missing source 보존, unrelated expiry와 shared 정상 source positive. |
| `otw-play/infrastructure/d1-ingestion-repository.ts` | 후보/작업 archive expiry의 조회와 최종 UPDATE에 같은 hold. source-health caller audit에서 expiry/DELETE가 없음을 확인해 불필요 selector guard 제거; 공유 music metadata와 source에 남은 실행행을 membership만으로 일괄 중지하지 않음. source-health 기존7건 PASS. |
| `x-posts` HTTP→app composition→`D1RedactionWriter` | owning pure `parseXRedaction`, 실제 reference로 transition 선택, fixed admission/commit/capture/outcome 소비. intentional redaction은 작동하며 expiry와 구별. `final_owner_required` 유지. |
| `notices` HTTP→`D1NoticeGateway.uploadThumbnail`→`D1R2FileStore.put` | multipart operationId, 검증된 content type/bytes, immutable version과 실제 member/site/resource/generation/expected previous reference를 최종 D1 CAS까지 연결. 정상 UI 최종 확인 완료. |
| `D1NoticeGateway.deleteThumbnail/cleanupThumbnails` | 기존 notices/thumbnails cleanup 자격만 유지. current/previous/pending/unknown/unACK/history/active-transition hold 보존. durable claim 뒤 동일 object/version 새 참조 차단; 다른 새 version 정상 허용. unknown delete는 actual absence readback으로만 reconcile. |
| `D1R2FileStore` + `D1TransitionFileWriter` | `begin→verifyPut→commitReference→acknowledge`; 일반 파일은 실제 durable state, active 파일은 기존 `admit/recordFileIntent/recordFileObservation/commit` 소비. 가짜 actor/transition/admission 없음. FileIntent.status는 immutable admission fact. D1/R2 distributed atomicity를 주장하지 않음. |
| `asset_file_reference_paths` / `asset_file_retention_releases` | index는 rebuild-only 검색 보조이며 rawURL/table/row/field/origin 보존. 같은 business trigger body에서 index projection 후 fixed capture. current raw exact-match/normalizer/manifest 조건으로 stale/missing/forged index 거부. legacy clock은 source-only durable authority; 실제 마지막 hold/reference 해제만 단조 기록. target은 자체 clock을 재구축. |
| `D1FileAvailability` / `CommittedFileAvailability.assertAvailable` | captured reference, exact transition/generation/manifest revision/digest/fence, 선택 site/resource와 실제 bytes/hash/size 확인. static ASSETS artifact와 R2 upload-version 구별. baseline committed R2는 별도 receipt, active R2는 고정 FileObservation. source/target upload-version이 같아야 한다고 요구하지 않음. |
| `ProjectionContext.files: FileReferenceProjection` | content-transition 내부 runtime-only `projectReference(raw:string):string` port. infrastructure가 승인 plan에 bound된 기존 assets classifier를 공급. domain에 assets import/type 없음, validator 복제/이동 없음. source projector와 target decoder 모두 필요 port 없으면 거부, target wire에 미투영 absolute URL도 거부. callback은 wire/manifest에 직렬화하지 않음. |
| `TransitionPlan.fileOrigins` / exact parent CAS revision | explicit site-origin, 승인 R2 bucket origin, 명시 external-only를 구별. 임의 host 제거 금지. source absolute→target relative, sealed source raw/hash 유지. 새 unknown origin은 source 정상 저장을 막지 않지만 inventory/export/fence를 거부. 승인 mapping 추가만 fence 전 가능. |
| `worker/app/fetch.ts`→assets policy→R2/ASSETS | GET/HEAD/conditional 모두 policy/auth 먼저. archive-only anonymous401/member403, admin private,no-store; 합법적 normal 공유 참조는 public. ETag에 site/access revision. raw image credentials 없음. |
| 두 canonical Wrangler router | `/profile/*`, `/*%*`로 encoded prefix/slash/manifest alias가 실제 Worker ingress에 도달. `/profile/__artifact.json`과 encoded alias404. 관련 없는 정상 public static body200 유지. 추가 Worker 호출 비용은 운영 gate. |
| `apiFetchBlob`→`useAuthenticatedImage(s)`→공지·프로필 UI | 기존 Bearer/error pipeline, AbortController 및 objectURL revoke. draft/saved notice, admin profile portrait/signature/background consumers 연결. hook을 shared/hooks로 분리해 react-refresh 경계 보존. |
| profile upload wrapper→runner→`buildAssetFileStore` | direct-entry guards 양쪽, explicit site/config/bucket/scope/persist/opID 검사 후 dynamic runtime/spawn. local remoteBindings:false/envFiles:[], 동일 version/receipt 프로토콜. 실제 양쪽 local CLI/retry/readhash PASS. remote/confirm-target/account 경로는 실행하지 않음. |
| resource metadata / schema registry | SITE_D1_DATABASE_NAME·SITE_ASSET_BUCKET_NAME을 canonical D1/R2 declaration/common validator/local config/Env/typegen/fixtures/receipt constructor와 일치. 이름 검증은 production binding 관측 proof가 아님.104–112 schema/registry/capture/projection/activation 소비자 연결. |

### 최종 실제 UI / 저장 결과

- Vite normal `run-site dev` entry session91626, http://localhost:5173, task-owned `.tmp/sul36-task42-ui-otw`; 최신 확인 PID31120/parent50900. 기존 서버9229 충돌2회는 실패 로그에 보존했고 당시 실제 해당 작업 parent40672/child11044만 commandline/creation identity 확인 후 종료했다. unrelated process/source/legacy/private inputs를 건드리지 않았다.
- 기존 genuine Chrome profile/cookies로 새 task tab2007444989: `/admin/content?tab=notices`→새 공지→실제 `public/profile/bing_hayu.webp` 선택→업로드→draft Blob480×479→공지 등록→공지 이미지 보기→saved Blob480×479. title `Task4.3 최종111112 관리자 이미지 검증`, notice id4. 모의 로그인/토큰 사용 없음. 앞선109 상태 notice3 증거는 보존하며 최종 UI 검증을 대신하지 않는다.
- operationId `4e0c046b-7ad4-4907-ba85-47c2647f2e55`; logical `notices/thumbnails/4e0c046b-7ad4-4907-ba85-47c2647f2e55.webp`; version `_versions/otw/4e0c046b-7ad4-4907-ba85-47c2647f2e55.webp`; R2 upload-version `d478f22b4e876d6c03415380eccd13ef`;31446bytes; SHA256 `3632eaf65e4cf69538e614d2939a4b4724c610af3544e33471ec0be49d4ad10d`.
- D1 reference_committed_at1791979628764, ACK1791979628824. rawURL/index의 image_urls.0와 thumbnail_url 두 참조가 같은 version을 가리킨다. `.tmp/sul36-4-3-ui-final-readback.json`, `ui-final-r2.log`, 실제 다운로드 `ui-final-body.webp`의 SHA·size가 입력/D1과 일치. R2 get은 명시 `--local --config wrangler.jsonc --persist-to .tmp/sul36-task42-ui-otw`였다.

### 최종 검사, 원래 실패, 수정된 fixture

모든 Node/pnpm 명령은 Node24.20.0을 PATH 첫 항목으로 사용했다. 아래는 **composed verification**이며 common full suite/preflight PASS를 주장하지 않는다. 로그 prefix는 `.tmp/sul36-4-3-`이다. W=`pnpm exec vitest run --config vitest.worker.config.ts`, U=`pnpm exec vitest run`.

| 실제 명령 / 로그 suffix | 결과와 적용 범위 |
| --- | --- |
| W `worker/features/assets/infrastructure/file-recovery.integration.test.ts`; recovery-final3.log | exit0,15PASS. actual immutable same-key/unknown put/crash states/reference/ACK, cleanup race/unknown delete, index forgery/missing/raw/keymove/foreign, legacy15min/late history hold. ordinary1000 unrelated refs read260→264, write1→1,14→19ms. 이전 recovery-final2 exit1(13PASS/1FAIL)은1264reads로 선형 비용 드러냄; row_id pushdown 수정 후 해소. |
| 같은 파일 `-t` member alias + ordinary active profile; member-alias-red.log / member-alias-green.log | 실제 uppercase MEMBERS가 memberUid null로 허용되던 RED exit1; canonical namespace/owning member code fix 후 exit0,2PASS. |
| W 최종 CT/retention/availability3파일; transition-retention-final.log | exit1,54PASS/1FAIL. 실패는 기존 race fixture가 옛 `SET phase='source_fenced'`만 interleave하여 실제 race가 실행되지 않은 것. 새 `SET phase=iif` matcher로 fence-race-final.log exit0,2PASS. 단일55건 재실행 PASS로 표기하지 않음. |
| W `worker/features/content-transition/infrastructure/d1-transition.integration.test.ts -t 'approved absolute asset origin\|baseline\|replay'`; projection-port-d1.log | 최종 port 수정 후 exit0,5PASS/44skip. source absolute→target relative, unknown origin source 계속, exact CAS revision/conflict/fence, grouped60delta,63row baseline resume/replay. |
| U `worker/features/content-transition/domain/projected-content.test.ts -t 'owning file projection port'`; projection-port-red.log | exit1,실제 missing port가 raw source URL을 identity fallback으로 반환함. |
| U `worker/features/content-transition/domain/projected-content.test.ts src/shared/ui/authenticated-image.test.tsx`; projection-port-green.log | exit0,11PASS. source/decoder required-port와 target unprojected URL 거부, hook lifecycle. |
| W `worker/features/assets/infrastructure/file-availability.integration.test.ts`; availability-port-final.log | 최종 port 수정 후 exit0,1PASS. 이 shared-runtime fixture는 validator/D1/R2 보조 증거이다. 독립 ASSETS 긍정은 아래 별도3runtime 증거만 사용한다. |
| W file-recovery + archive-access selected migration/auth; migration-auth-final.log | exit0,2PASS. populated pre111 sentinel raw/index bootstrap 보존, forged index 포함 failed D1batch에서 business/index/release rollback; actual app anonymous/member/admin fixture auth. |
| U 관련10파일; units-final.log | exit0,84PASS(resource/local config/architecture/registry/file reference/assets+notice handler/retention/Blob client/hook). U CLI/source-health; consumers-final.log exit0,16PASS. absent d1-ingestion-repository.test.ts selector는 실행 증거로 세지 않음. 실제 ingestion expiry는 retention integration5PASS에 포함. |
| U `scripts/wrangler-seo-config.test.ts`; routing-final.log | exit0,2PASS. 양쪽 실제 canonical router의7encoded aliases와 manifest Worker 진입, unrelated public body200. auth는 별도 app test/UI 증거. |
| `pnpm architecture:check`; architecture-final3.log | exit0. 직전 architecture-final2 exit1은 CT domain→assets import 위반. approved narrow internal port로 수정; checker 예외 확대 없음. |
| `node node_modules/eslint/bin/eslint.js <owned TS/MJS file list>`; lint-final3.log | exit0. lint-final은 pnpm PowerShell argument flattening으로 exit2, lint-final2는 react-refresh hook/component exports2errors exit1. hook shared/hooks 분리 후 최종 통과. |
| `pnpm typecheck:test`; typecheck-final2.log; `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`; app-types-final2.log | 모두 exit0. Worker/test/node/app 전부 최종 port/hook 코드 기준. |
| `node --test scripts/sync-agent-to-cursor.test.mjs`; sync-tests-final.log; `pnpm sync:agent-cursor:check`; sync-check-final.log | exit0,5PASS; exit0,27managed/reference-valid. canonical architecture 수정 후 정상 sync로 mirror 생성. |
| `pnpm drizzle:generate`; schema-no-diff.log | exit0,No schema changes, nothing to migrate. |
| `node scripts/d1-reset-local.mjs --site=otw --persist-to=.tmp/sul36-task43-validation-otw --validate-only`; chain-otw3.log; LuvDia 동일 selected 경로; chain-luvdia2.log | 양쪽 전체112 chain exit0. 앞선 parallel bootstrap fetch fail 및 OTW bad-port0039는 chain-otw/luvdia/otw2 실패 로그 그대로 보존. 지원 validate-only temp DB만 검증했고 기존 DB reset 없음. |
| `node scripts/d1-migrate-local.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw`; ui-migrate112.log; LuvDia `--persist-to=.tmp/sul36-cli-fixture-luvdia`; luvdia-migrate112.log | 각각110–112 증분 apply exit0. apply 전후 members/notices/schedules/ddays/asset_file_references/asset_file_versions6table normalized results 동일. 이제111/112는 실제 적용됐으므로 수정 금지. |
| `node scripts/d1-doctor.mjs --site=<site> --persist-to=<위 site fixture> --skip-api --skip-remote`; doctor-otw.log / doctor-luvdia.log | 모두 exit0,blocking failure 없음. |
| selected-local `wrangler types --config=.wrangler/local/otw/wrangler.json --strict-vars=false`; LuvDia `wrangler types .tmp/sul36-4-3-luvdia-worker.d.ts --config .wrangler/local/luvdia/wrangler.json --strict-vars=false` | 실제 generator exit0. common writeLocalSiteConfig/loadSiteEnvironment 사용; private input 수정/가짜 secret/수동 declaration 없음. OTW 결과의 기존 generator trailing whitespace만 자동 정규화하여 의미 변경 없이 diff check 통과. |
| `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.worker.json .tmp/sul36-capture-parity-final.ts`; capture-parity-final.log | exit0,현재 source generator와 applied112 byte-equivalent,237statements,max94,554bytes.100KBguard 유지. |
| `pnpm build`; build-final.log | exit1,기존 production Clerk identity 입력 guard에서 종료. 실제 build 미완료, 우회하지 않음. |

앞선 실제 RED/중간 fixture 오류의 원문은 아래 시간순 절과 로그에 보존한다. SQL100KB/SQLITE_TOOBIG/depth100 실패, CASE migration splitter incomplete-input, freeze depth100은 PASS가 아니다. 최종 shallow row-scoped MATERIALIZED 경계와 동등 permit join, 같은 CAS UPDATE의 identity/manifest를 별도 SET expression으로 분리해 해결했다. NOT NULL 실패는 전체 UPDATE rollback을 보장하며 final owner/generation/fence 조건을 약화하지 않았다. 관측용 추가 write는 넣지 않았다. Active value-only mutation의 small/1000unrelated 비용은88read/17write,15statements 동일하다.

독립 ASSETS의 원래 shared-Miniflare 긍정 주장은 철회했다(동일 runtime의 assets:storage 공유). prefix Fetcher는 보조 validator 증거일 뿐이다. `.tmp/sul36-independent-static.ts`를 `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.worker.json`로 실행한 independent-static2.log exit0은 **각각 한 ASSETS directory를 가진 별도 getPlatformProxy runtime3개**에서 원래 /profile·signature 경로6개를 실제 읽고 manifest별 body SHA/size 검증, 다른41byte body 거부, pre-transition R2→captured baseline→target own object-version/body/install을 확인했다. 첫 independent-static.log의 Request realm 오류는 실제 실패이며 stringGET adapter 수정 후 통과했다. `.tmp/sul36-4-3-independent-static-proof.json`은 실제 receipt를 보존한다. production artifact/deployment identity는 검증하지 않았다.

실제 지원 CLI는 import-safe/invalid-target 주입식 안전 검증 후 parent 승인 아래 tiny source-dir2files, site별 isolated persist, 명시 --local/stable operation-id로 실행했다. cli-{otw,luvdia}-{actual2,retry}.log exit0,각2versions ACK와 actual R2 body/hash/own upload-version/retry readback 동일. 첫 seed의 잘못된 ON CONFLICT(code), 첫 proxy persist v3 누락을 숨기지 않고 수정했다. 사고를 유발한 cli-red.log는 정상 TDD RED로 세지 않는다.

### 보존 / self-review / 남은 경계

- Self-review에서 실제 누락된 raw URL normalization, absolute origin authority, DELETE/fence SQLite depth, index1000row 비용, legacy 마지막 release, member namespace alias, domain import 경계를 찾아 각각 실제 RED/실패와 소유 경로 수정으로 닫았다. 테스트-only bypass, generic callback registry, 임시 ownership/provenance adapter, static ETag→R2version 변환 없음.
- Schema104–112/일치 snapshot·journal을 함께 보존한다. 기존0000–0103/applied history 및 source/legacy를 수정하지 않았다. 실제111/112 적용 이후 generated SQL은 재작성하지 않았다. populated rollback/index bootstrap/replay/normal UI를 확인했다.
- `.tmp/sul36-4-3-legacy-preservation.json` 네 파일 모두 baseline SHA/size unchanged: main16019456/b26320f8…e281, metadata4096/4c34b48e…b9d, shm32768/ef7eb207…18d5, wal12392/cabcfbef…e3f. 실제 전체 hash는 파일에 기록. 원본 private configuration과 unrelated 작업은 보존했다.
- direct public R2/custom-domain/old edge cache, production resource IDs/bindings, actualLuvDia login, 총 보관 비용/사용량/encoded routing Worker비용은 미검증 운영 gate. 이미 내려받은 bytes를 회수한다고 주장하지 않는다. unresolved pending/unknown/unACK hold는 timeout으로 해제하지 않는다.
- Controller/root docs 및 unrelated AI docs는 staging 제외. 새 dependency/remote repair/account provisioning/deployment/dry-run/push/PR/Linear/subagent/reviewer 실행 없음. Agent remote put 사고는 위에 별도로 공개했으며 그 이전/이후 범위를 구분한다.4.4/4.5를 시작하지 않았다.

## 이전 checkpoint 기록 (당시 상태, 최종 판정 아님)

## Accepted scope and concrete controller decisions

Read task-4-3-brief, global constraints, accepted architecture 1–3/4–5/4.3, final4.1 plus fix1/fix2, appended4.2/fix1 review, primary file runtime notes and canonical worker-api/db-migration rules. Exact current interfaces own the work. Parent owns docs/reports/sul-36 and other SUL docs; unrelated initial docs/otw-play-ai-review.md and docs/superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md are preserved.

Current closed command codecs only accept schedules.save, otw-play.song.update, source.checkpoint_due. recordFileIntent requires an accepted operation; ordinary uploads have no transition. Controller explicitly authorized narrow owning notice/profile file codecs and minimum ordinary durable intent/version/reference state, with no fake transition/actor, second handoff engine, or authority bypass. File intent status remains its immutable admission fact; progress comes from append-only observation/outcome/ACK. Existing file transfer excludes only outcome/sourceFence when comparing identity, so changing admitted status would break final4.1.

Controller also confirmed recovery grace: pending/unknown/unacknowledged and active-transition holds never expire from time alone; current/previous/archive/history/recovery references continue protection. Only proven unreferenced/unheld cleanup-eligible files use existing15min notice grace measured from latest of uploaded/ACK/final release. No new legacy/profile automatic cleanup authority. Unresolved hold volume/cost remains an operational activation gate. Owning redaction codec/final commit connection is in4.3 because actual RED proves armed triggers correctly reject unadmitted direct redaction; full writer transport stays4.4.

## Current implementation / remaining work

- Added source membership/archive hold SQL via content-transition public entry and connected retention's one eligibility/count/prune/readback predicate for held feed, X cache, update logs. Bounded prune returns actual deleted rows (D1 meta.changes includes capture trigger writes); hasMore verifies remaining eligible rows.
- YouTube registry DELETE excludes held source rows and prevents moved-source re-enable in upserts/reader. Actual local registry pass preserves held missing source and unrelated expiry removes correctly. Remaining complete selector/moved/update/source-handler/ingestion/source-health coverage still needs finishing.
- Assets policy reads member/profile-image/notice references before R2 or bound ASSETS. Archive-only GET/HEAD/conditional request denies anonymous/member with no metadata; admin uses private,no-store. A normal unrelated reference preserves shared public bytes. Public responses no-store and R2 ETag includes selected site and current source access revision. Static profile/signature matching runs before SEO; Wrangler exclusions removed in both configs. Further alternate-path/build and direct R2 gate review remains.
- Shared apiFetchBlob consumes the actual shared bearer/error pipeline; new protected-image hook owns Blob object URLs/abort/revoke. Notice editor and manager image view use it; admin profile portraits/signatures/backgrounds use it. UI lifecycle/browser verification and types are pending.
- Durable ordinary versions/intents/schema/migration, immutable R2 adapter, transition file availability, profile CLI protocol and actual crash recovery remain to implement. No new file writer has been added yet.

## Actual commands and evidence so far

Every command prepends `.tmp/node-runtime/node-v24.20.0-win-x64` to PATH. Logs include observed EXIT_STATUS; no common suite/preflight. `pnpm.cmd exec vitest run --config vitest.worker.config.ts` is the Worker command prefix, `pnpm.cmd exec vitest run` the unit prefix.

| Scope / retained log | Actual result |
| --- | --- |
| Worker `worker/features/content-transition/infrastructure/retention.integration.test.ts`; `.tmp/sul36-4-3-retention-red.log` | exit1;3fixture failures: unrelated official source had member_uid NULL, violating existing owner CHECK. Corrected to real unrelated member90; constraint preserved. |
| Same; `retention-red2.log` | exit1;3actual RED: status counted held feed2 instead of1; registry DELETE final_owner_required; intentional redaction final_owner_required. |
| Same `-t 'same hold\|actual registry'`; `retention-green.log` | exit1;registry passed; counted3D1 changes instead of1actual removed row because capture trigger writes count in metadata. |
| Same; `retention-green2.log` | exit0;2PASS/1redaction skipped after actual-row count fix. Redaction remains pending, never claimed green. |
| Worker `worker/app/archive-access.integration.test.ts -t 'archive-only asset'`; `assets-red.log` | exit1;actual R2 archive-only anonymous GET returned200 instead of401. |
| Same; `assets-green.log` | exit1;test worker startup fetch failed/bad port, no tests. No behavior verdict. |
| Same; `assets-green2.log` | exit0;1PASS/20skipped. Real local R2+canonical D1; fixture RSA/JWKS actors only. One image.text warning from test bytes decoder to correct. |
| Unit `src/shared/api/client.test.ts -t 'protected image'`; `blob-red.log` | exit1;fixture used window in Node; corrected with existing vi.stubGlobal pattern. |
| Same; `blob-red2.log` | exit1;apiFetchBlob missing, intended RED. |
| Unit `src/shared/api/client.test.ts`; `blob-green.log` | exit0;20PASS. Binary bytes0,128,255,1 preserved under required bearer. Supporting client unit proof, not genuine admin login. |

## Preservation / limits

No destructive filesystem action, existing source/legacy reset/migration, provider fetch, remote/account/provisioning, deployment/dry-run, push/PR/Linear, dependency or subagent action. All test D1/R2 storage is owned isolated Worker test storage. Four original legacy hashes still require final comparison against legacy-local-d1-baseline.json. No memory-derived project fact is relied upon (registry search found no task-specific hit).

Resume by finishing authenticated-image lifecycle/consumer checks, remaining retention coverage/redaction, then minimal schema/version protocol and real D1/R2 crash proof. Actual OTW browser Vite97897/task42 fixture remains available; actual LuvDia app/domain/login is deferred. Parent reviews only after DONE; do not start4.4.

## Resume update 2026-10-14 18:30 KST (still IN PROGRESS)
- Ordinary immutable store actual D1/R2 tests: .tmp/sul36-4-3-file-green.log exit0 3PASS. Active profile composition + fixed admission/observation/reference capture/outcome: file-transition.log exit0 4PASS. Status remains immutable `intent` while file/operation outcomes commit.
- Pure command entry architecture RED: first invocation mistakenly named absent vitest.node.config.ts (startup exit1; architecture-red.log). Correct vitest default invocation architecture-red2.log: 5 actual failures/2PASS/10skip. Narrow allowlist + own-domain-only entry rule: architecture-green.log exit0 7PASS/10skip. Canonical architecture rule changed; normal sync/check still pending.
- Owning X id validator moved into pure domain; normal app composes D1RedactionWriter with fixed repository. Real held cache redaction application/audit passes (retention-redaction.log exit0 3PASS). Existing direct primitive RED retained above; no final_owner bypass.
- Ingestion archive hold RED first fixture failed identity CHECK (ingestion-red.log); corrected 11-character YouTube IDs exposed actual cleared count8 vs1 (ingestion-red2.log). Added same hold predicates to candidate/job due reads and updates; intermediate output4 vs1 (ingestion-green.log), corrected trigger-inclusive D1 metadata to UPDATE RETURNING actual rows. ingestion-green2.log exit0 4PASS (prune/registry/redaction/ingestion).
- Added normal Drizzle104 file references/versions, custom105 capture extension, generated106 cleanup claim and custom107 final reference guards. Existing103 unchanged. Pending final populated preservation/rollback/no-diff/parity tests.
- Cleanup actual real R2 test wraps only delete result delivery: durable claim rejects racing old-object notice reference, new immutable version+notice reference succeeds, actual R2 delete occurs then simulated lost result, readback sees absent old/present new, same claim retry marks deletion observed. cleanup.log exit0 6PASS including pending/unknown/unacknowledged/grace protection. Parent explicitly approved minimum cleanup claim after concrete TOCTOU evidence; claim blocks specific object, not independent new versions.
- New explicit SITE_D1_DATABASE_NAME/SITE_ASSET_BUCKET_NAME in both configs, common parseSiteStorageResources plus binding-declaration validator/local private-input conflict checks. Parent approved metadata only; deployed physical IDs/bindings remain operational proof. Worker env/site fixtures updated; selected-local generated type path still pending.
- Notice normal upload now carries stable per-File operationId through multipart into immutable store; app constructs store with selected D1/R2 names; logical asset reader maps current version; member backgrounds list managed references plus legacy keys. Cleanup caller integration and UI fields recently edited, tests pending.
- Worker types first failed erasableSyntaxOnly parameter properties; converted new constructors to explicit fields. Second found SITE_ID accidentally inserted into R2Object test fixture; moved to Env. Latest full scoped type pass still pending.
- CUA inventory shows genuine Chrome profile but OTW tabs closed. Parent verified old Vite97897 no longer exists and localhost5173 has no listener. Authorized restart with original task42 fixture and same Chrome cookies; apply only new migrations, no reset/private-input edit. No browser mutation has occurred yet.
- Remaining: exact member UID final file concurrency facts; transferred file recovery/availability port actual bytes proof; notice cleanup/UI tests; profile CLI selected target+same real protocol; static alternate paths; remaining source cleanup selectors; real admin Blob/image browser flow; migration/typegen/scoped checks/sync/hash preservation/selfreview/explicit commits.

## 2026-10-14 18:58 KST — incident and new evidence (IN PROGRESS)

A material unauthorized remote R2 upload occurred through an unsafe test import of the old top-level CLI. See task-4-3-incident.md and .tmp/sul36-4-3-incident-objects.json. Six remote Upload complete logs, one attempted/unknown,69 never-started paths. Ctrl-C session99620 exit1; two local CIM checks found0 matching child processes. Operational impact/old byte equality/version effects remain UNKNOWN. No further remote readback or repair. CLI/Wrangler execution checks paused by controller until injected import/invalid-target safety is proven. The old import now has a direct-entry guard, not yet verified. This supersedes the earlier blanket no-remote-IO preservation statement; earlier completed local evidence remains local but cannot offset the incident.

Other actual progress before incident:
- file-owner.log exit0 6PASS after final actual member UID/code and cleanup generation changes.
- New final CommittedFileAvailability port, D1FileAvailability adapter with separate static artifact/body receipts and committed-baseline R2 receipts. TransitionPlan optional reviewed assetBuckets binds source/target declarations; active FileIntent/FileObservation unchanged. Actual separate source and target ASSETS Worker bindings read full profile/signature manifest+body; R2 source-target versions differ and actual byte SHA/size matches.
- file-availability.integration.test.ts first execution exit0 1PASS in availability-red.log (filename misleading; it is GREEN, never an intended RED result). Pre-transition ordinary profile upload→captured baseline→target install, missing source static proof, missing target object, cross-resource/static stale generation and R2 wrong version/bucket/hash, stale fence negative checks. More regression and self-review still pending.
- Generated108 owner identity corrected before real local apply to generation DEFAULT1; generated109 file_availability_evidence (static and committed R2 kinds); all104–109 applied incrementally to existing task42 UI fixture through node scripts/d1-migrate-local.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw, exit0. No existing database reset. Existing103 unchanged.105 capture adds static logical paths and structural code/image references; max SQL92382bytes.
- Vite restart twice failed EADDRINUSE9229. Read-only CIM found actual existing16:00 task server parent40672 run-site dev/child11044 Vite localhost5173. Verified exact repo commands and creation identity, stopped only these two, normal supported run-site entry restart succeeded, exec session91626, http://localhost:5173, same task42 persistence. Original private inputs unchanged.
- Genuine Chrome session preserved. New tab2007444506 /admin/content→공지→새 공지→actual public/profile/bing_hayu.webp selected→upload→draft Blob image render480×479→공지 등록→공지 이미지 보기→stored Blob image480×479. Screenshot in CUA output, actual UI title Task4.3 정상 관리자 이미지 업로드 검증. No fake login/token; LuvDia remains deferred.
- Normal upload operation3fee7d0d-191b-48e5-a597-eeb98f40dbe5; actual noticeid3, logicalnotices/thumbnails/<op>.webp, immutable_versions/otw/<op>.webp,31446bytes. D1 readback reference/hash/size, R2 uploadversion1eca53c9f93d39cc3699d7eaa6d14a81, reference_committed_at1791971471107,ACK1791971471135. wrangler local object get exit0; downloadedbody SHA2563632eaf65e4cf69538e614d2939a4b4724c610af3544e33471ec0be49d4ad10d equals actual original. ui-readback.json and ui-r2-readback.log preserve evidence. These local Wrangler commands preceded incident.
- worker-types3.log exit2 only incomplete R2 wrapper type cast in a test; changed to explicit unknown cast, not rerun yet.
Remaining: safely redesign CLI/import/invalid-target checks, authorized local CLI proof only after safety boundary; full owning caller retention/cleanup/access coverage; active transferred recovery and extra availability negatives; types/scoped existing fixtures/tests/migrations/no-diff/parity/sync/legacyhashes/selfreview/commits. WholeTask4.3 and wholeTask4 remain incomplete. No further task or review started.

## 2026-10-14 19:55 KST checkpoint — URL identity and final checks still IN PROGRESS

- Safety remediation actual injected tests: cli-safe-green3.log 10PASS (9 CLI safety +1 image lifecycle); final-unit-fixes.log 18PASS (9 CLI safety moved to worker/app/profile-background-upload.test.ts for correct Worker type environment +9 retention). CLI wrapper and runner have direct-entry guards, explicit site/config/bucket/scope/persistence/opID validation before spawn/runtime, local remoteBindings:false and envFiles:[], no remote execution. Original import incident test is not valid RED evidence.
- Actual supported local CLI tiny fixture completed both sites,2 immutable versions/ACK each, retry identical D1/R2 readback including upload versions. See cli-{otw,luvdia}-{actual2,retry}.log and before/after-retry JSON. Initial ON CONFLICT(code) seed fixture invalid; corrected ordinary INSERT SELECT NOT EXISTS. Initial getPlatformProxy persist path omitted v3 and read wrong empty DB; corrected installed Wrangler contract. Existing UI/source/legacy were never reset.
- Earlier shared-Miniflare independent static binding positive is WITHDRAWN: assets:storage is global inside one runtime. Prefix wrappers now give supporting validator proof only (static-negative-local-assets.log1PASS). independent-static2.log is actual separate3getPlatformProxy runtimes, eachoneASSETSdirectory, canonical /profile and signature paths, no prefix wrapper;6source static receipts, target same bytes, actual changed41byte thirdbinding rejected, realbaselineR2 ownversionsdifferent/readhash/installreadback PASS. independent-static.log first failed Request realm mismatch; product Fetcher calls now stringGET. Evidence independent-static-proof.json. No production deployment ID/binding proof.
- Retention final5PASS, file-final7file-recoveryPASS but availability test fixture failed, corrected static-negative-local-assets1PASS; owning-units-final31PASS. retention-consumers52PASS plus2 source-health fake-fixture errors from an unnecessary guard; removed that unrelated source-health change after audit (no expiry/delete; shared metadata remains nonexclusive). Parent approved retaining source-only normal jobs and deferring full ingress4.4.
- App/test types3 exit0, node-types2 exit0. Worker types5 failed .mjs declarations after safely isolating Worker CLI test from DOM types; own.d.mts added; worker-types6 exit0. Selected-local OTW cf-typegen ran via .wrangler/local/otw/wrangler.json; never manual-generated declarations/private input edits. Canonical architecture sync1mirrorupdated; architecture-final exit0, sync-tests5PASS exit0, sync-check exit0.
- Self-review found existing notice validator preserves query/hash/encoded/raw HTTP URLs while exact SQL retention/capture/claim guards did not. encoded-red.log2FAIL: encoded reference release incorrectly true; encoded static404 !=401 (auth flow failure, no byte leak demonstrated there). Initial inline decoder exceeded100KB guard; combined and split read-only views hit actual D1 depth100; compact inline98000+SQL hit SQLITE_TOOBIG duringmigration. Logs encoded-sql-size2/3/4 and encoded-green{,2,3,4}; none is PASS. New0111draft was generated normally and only exercised in disposable Vitest DBs; noexistingpersistentDB/userdata saw111. Parent explicitly authorized regenerating this unshared draft, never applied0103–0110.
- Parent approved minimum rebuild-only asset_file_reference_paths derived index after D1limits: preserve rawURL/table/row/field/origin, refresh same mutation transaction and same trigger body beforefixed capture, no trigger ordering assumption, no snapshot rebuildeachwrite, canonicalregistry rebuild/notexport. Final consumers validate currentraw/normalization/mapping; stale/missing/forged index failclosed. Implementation pending at thischeckpoint.
- Parent approved narrow TransitionPlan.fileOrigins for explicit site-origin/R2bucket origin/external-only classification. No guessed LuvDia domain or host stripping. Missing mapping blocks inventory/progression/fence while normal source writes/admissions continue. Approved sourceabsolute becomes targetrelative; sealedsourceimages/hash stayraw. Same exact parentCAS append-only revision may add mappings beforefence, never reinterpretexisting map/resource/UID or stagedbaseline. Owning parser RED origin-red.log missingmodule; origin-green.log2PASS; integration/projection/SQL/appendCAS stillpending.
- Actual both canonical assets routers: encoded-routing-red.log2FAIL at /%70rofile/bing_hayu.webp, noWorker marker. Installedrouter matches encoded URL.pathname literally. Added /*%* tobothcanonicalrun_worker_first. encoded-routing-green.log2PASS (7aliases/site inclencodedmanifest) proves routingonly; stubWorker marker is supportingboundaryproof, actualauthintegration stillblockedbydraft111. Need final actualmanifest404 +publicpositive and appauth proof. Worker invocation cost remains operationalquota gate.

Incident update provenance: root, with explicit user permission, performed exactly7remoteGET reads after containment. All200,14,215,562bytes total, eachcurrentSHA/size matches incidentinput; Last-ModifiedKST18:55:13/15/19/21/22/25/28. SeventhwhichwasCreating-only atstop hasLM18:55:28 (afterstoprecord26). GET doesnotreturnR2upload-version; ETag isnotversion. Priorbytes/version/CDNcache/userimpactremainUNKNOWN. Root evidence .tmp/sul36-incident-readback-20261014 and root-owned docs/reports/sul-36/operational-upload-incident.md are excludedfromagentstaging. Thisagent performed no remoteIO aftercontainment; rootauthorized7reads aredistinct. LocalPASSdoesnotcloseincident.

## 2026-10-14 20:54 KST checkpoint — final reference index/grace implementation
- 0111/0112 unshared drafts regenerated through real Drizzle into .tmp/sul36-final-url-draft then copied with matching journal/snapshots. 0111 now creates rebuild-only raw URL index and source-local legacy retention release clock. 0112 refreshes derived index in the same business capture trigger body before fixed capture, adds exact-current-input guards and history release/acquire clocks. No persistent/UI DB has received111/112 yet; old0103–0110 unchanged.
- Actual parser/SQL parity: path-policy.log1PASS; URL delimiters/auth url-auth-green.log2PASS. Earlier migration failures remain failures: CASE splitter incomplete-input, >100KB/SQLITE_TOOBIG, depth100 DELETE/fence. Current max generated SQL94,554bytes. Final owner required remained enabled: flattened equivalent permit join fixed DELETE; exact-row AS MATERIALIZED file edge and one-boolean manifest CTEs prevent recursive planner expansion. Final freeze applies identity and manifest predicates in separate SET expressions within the same CAS UPDATE; NOT NULL constraints abort whole update on failure. No extra state/observability writes or weaker owner/fence condition.
- origin-final.log exit0 1PASS after original fence depth100 and a corrected case-sensitive error-message test expectation (fence-new9.log). Actual source approved absolute reference→target relative DB/index, sealed source raw image unchanged, new unknown origin source commit continues but export/fence reject, append-only exact parent CAS origin revision (duplicate/mapping conflict), target accepts revision, renewed readiness/fence/replay external-only, after-fence mutation reject.
- grace-fence-new.log exit0 1PASS (legacy test only; mistyped origin test selector skipped origin). Actual old legacy without release proof held, first release establishes15min, duplicate does not reset, current ref reacquire/final DELETE monotone release,14min protected/16min actualR2delete. recovery-final2.log13PASS1FAIL exposed1000unrelated write read-cost growth1264 vs260; row_id pushdown in exact raw view lookup fixed index-cost-final.log1PASS260→264reads/1write both.
- late-hold-red.log exit1 actual RED: adding later historical reference left durable held0. Added scoped history mutation acquire/release in actual transaction, same-value historical update no extra writes. recovery-final3.log exit0 15PASS: all ordinary/active immutable/recovery/hash/claim-race/unknown-delete/index/raw/missing/forgery/foreign-origin scope/legacygrace/latehistory cases; ordinary1000reference cost260→264reads,1write each. Explicit external origin exemption now requires same selected owning row, never borrows another row's manifest.
- routing-final.log exit0 2PASS both canonical router configs: encoded protected aliases and encoded private artifact reach Worker; unchanged unrelated public image actual bytes still static200. This router harness is boundary evidence, actual app auth and genuine UI are distinct. worker-types-final.log exit0. Remaining final transition/retention suites, populated migration/rollback/no-diff, selectedLuvDia typegen, UIincremental111/112 and genuine normal flow, remaining types/lint/sync/selfreview/commit.
- Incident remains distinct unresolved operational impact. Root authorized7GET current-state equality is recorded above; no agent remoteIO after containment. No source/legacy/private reset; final4legacyhash comparison pending.


## Closeout / commit / exact owned files

Code commit: `a36099c77aeb3662d333dfe1d637de231bb8fd6e` (112 owned files, schema/SQL/snapshots/journal together). No root/unrelated docs staged. New snapshot/capture artifacts account for most of the 131,779 inserted lines. Old103 journal entries match BASE exactly;9 entries appended,112 total; all old tracked migrations unchanged (`history-preservation-final.log`, exit0).

Final staged `git diff --cached --check` exit2 is retained: applied `drizzle/0112_asset_file_url_capture.sql` lines513 and542 each contain four spaces only. Controller independently confirmed both. Existing applied SQL and generator byte parity remain unchanged; no cosmetic rewrite/new migration. This is a known formatting concern, not a pristine all-checks claim. The preceding tracked-only diff check exit0 did not include then-untracked migrations and must not substitute for this final result. Production build exit1 and operational incident remain separate limits above.

Exact final focused selectors: `W worker/features/assets/infrastructure/file-recovery.integration.test.ts -t "namespace alias|selected profile replacement"` (2PASS exit0); `W worker/features/assets/infrastructure/file-recovery.integration.test.ts worker/app/archive-access.integration.test.ts -t "preserves populated|archive-only asset"` (2PASS exit0); `W worker/features/content-transition/infrastructure/d1-transition.integration.test.ts -t "rejects stale (ack|freeze) after a classification"` (2PASS exit0). `W` is the pinned-Node Worker command prefix stated above.

Owned paths in code commit:

- `.agent/rules/architecture.md`
- `.cursor/rules/architecture.mdc`
- `contracts/content-transition.ts`
- `contracts/notices.ts`
- `contracts/site-definition.ts`
- `db/schema/index.ts`
- `drizzle/0104_asset_file_recovery.sql`
- `drizzle/0105_asset_file_capture.sql`
- `drizzle/0106_asset_file_cleanup.sql`
- `drizzle/0107_asset_file_reference_guards.sql`
- `drizzle/0108_asset_file_owner_identity.sql`
- `drizzle/0109_file_availability_evidence.sql`
- `drizzle/0110_asset_file_cafe_capture.sql`
- `drizzle/0111_asset_file_url_identity.sql`
- `drizzle/0112_asset_file_url_capture.sql`
- `drizzle/meta/_journal.json`
- `drizzle/meta/0104_snapshot.json`
- `drizzle/meta/0105_snapshot.json`
- `drizzle/meta/0106_snapshot.json`
- `drizzle/meta/0107_snapshot.json`
- `drizzle/meta/0108_snapshot.json`
- `drizzle/meta/0109_snapshot.json`
- `drizzle/meta/0110_snapshot.json`
- `drizzle/meta/0111_snapshot.json`
- `drizzle/meta/0112_snapshot.json`
- `scripts/architecture-check.mjs`
- `scripts/architecture-check.test.ts`
- `scripts/build-site.mjs`
- `scripts/local-site-config.mjs`
- `scripts/profile-background-upload-runner.ts`
- `scripts/site-resources.mjs`
- `scripts/static-asset-manifest.d.mts`
- `scripts/static-asset-manifest.mjs`
- `scripts/upload-profile-backgrounds-to-r2.d.mts`
- `scripts/upload-profile-backgrounds-to-r2.mjs`
- `scripts/wrangler-seo-config.test.ts`
- `src/features/members/ui/member-profile-page.tsx`
- `src/features/notices/api/notices.ts`
- `src/features/notices/ui/admin/notice-form-dialog.tsx`
- `src/features/notices/ui/admin/notice-manager.tsx`
- `src/shared/api/client.test.ts`
- `src/shared/api/client.ts`
- `src/shared/hooks/use-authenticated-image.ts`
- `src/shared/ui/authenticated-image.test.tsx`
- `src/shared/ui/authenticated-image.tsx`
- `vitest.worker.config.ts`
- `worker-configuration.d.ts`
- `worker/app/archive-access.integration.test.ts`
- `worker/app/assets.ts`
- `worker/app/fetch.ts`
- `worker/app/profile-background-upload.test.ts`
- `worker/app/routes.ts`
- `worker/app/x-posts.ts`
- `worker/features/assets/application/ports/asset-reader.ts`
- `worker/features/assets/commands.ts`
- `worker/features/assets/domain/asset-key-policy.ts`
- `worker/features/assets/domain/file-command.ts`
- `worker/features/assets/domain/file-reference.test.ts`
- `worker/features/assets/domain/file-reference.ts`
- `worker/features/assets/http/handler.test.ts`
- `worker/features/assets/http/handler.ts`
- `worker/features/assets/index.ts`
- `worker/features/assets/infrastructure/d1-asset-access-reader.ts`
- `worker/features/assets/infrastructure/d1-file-availability.ts`
- `worker/features/assets/infrastructure/d1-r2-file-store.ts`
- `worker/features/assets/infrastructure/d1-transition-file-writer.ts`
- `worker/features/assets/infrastructure/file-availability.integration.test.ts`
- `worker/features/assets/infrastructure/file-recovery.integration.test.ts`
- `worker/features/assets/infrastructure/file-retention.ts`
- `worker/features/assets/infrastructure/r2-asset-reader.ts`
- `worker/features/content-transition/application/ports/file-availability.ts`
- `worker/features/content-transition/domain/disposition-registry.ts`
- `worker/features/content-transition/domain/projected-content.test.ts`
- `worker/features/content-transition/domain/projected-content.ts`
- `worker/features/content-transition/index.ts`
- `worker/features/content-transition/infrastructure/capture-graph.ts`
- `worker/features/content-transition/infrastructure/capture-statements.ts`
- `worker/features/content-transition/infrastructure/command-codecs.ts`
- `worker/features/content-transition/infrastructure/content-retention.ts`
- `worker/features/content-transition/infrastructure/d1-baseline-store.ts`
- `worker/features/content-transition/infrastructure/d1-projection-context.ts`
- `worker/features/content-transition/infrastructure/d1-transition-repository.ts`
- `worker/features/content-transition/infrastructure/d1-transition.integration.test.ts`
- `worker/features/content-transition/infrastructure/file-reference-index.ts`
- `worker/features/content-transition/infrastructure/file-reference-integrity.ts`
- `worker/features/content-transition/infrastructure/file-reference-projection.ts`
- `worker/features/content-transition/infrastructure/file-retention.ts`
- `worker/features/content-transition/infrastructure/manifest-statements.ts`
- `worker/features/content-transition/infrastructure/retention.integration.test.ts`
- `worker/features/members/infrastructure/d1-member-reader.ts`
- `worker/features/notices/application/ports/notice-gateway.ts`
- `worker/features/notices/http/handler.test.ts`
- `worker/features/notices/http/handler.ts`
- `worker/features/notices/infrastructure/d1-notice-gateway.ts`
- `worker/features/operations/infrastructure/data-retention.test.ts`
- `worker/features/operations/infrastructure/data-retention.ts`
- `worker/features/otw-play/commands.ts`
- `worker/features/otw-play/infrastructure/d1-ingestion-repository.ts`
- `worker/features/schedules/commands.ts`
- `worker/features/x-posts/commands.ts`
- `worker/features/x-posts/domain/post-identity.ts`
- `worker/features/x-posts/http/x-posts.ts`
- `worker/features/x-posts/index.ts`
- `worker/features/x-posts/infrastructure/d1-redaction-writer.ts`
- `worker/features/x-posts/infrastructure/x-api.ts`
- `worker/features/x-posts/infrastructure/x-posts-adapters.ts`
- `worker/features/youtube/infrastructure/youtube-feed.ts`
- `worker/platform/types.ts`
- `worker/platform/url-path-sql.ts`
- `worker/test-support/site-env.ts`
- `wrangler.jsonc`
- `wrangler.luvdia.jsonc`

Owned evidence files in the subsequent documentation commit are this report and `task-4-3-incident.md` only. Root docs/reports/sul-36, root SUL plan/spec, unrelated AI docs, all .tmp/.wrangler/private inputs remain excluded. Handoff: controller review may begin; do not activate or start Task4.4 from this report.

## Fix round 1/5 — 2026-10-14

FIX_BASE `9d990e419bfaf54e0626b2e62c9e20bbf575840e`. 코드 commit `55a5e3fa13a3e0653367661891447d823bbdb9b4` (`fix: seal legacy file inventory and resolve protected absolute images`), 소유 코드/테스트/schema/migration 37개 파일 및 `9bd630cf4346f1d11275d8d5b168028c0e86cbb7` (`fix: copy sealed file inventory before source fence`), 초기 전달 포트·테스트 5개 파일 보완(두 commit의 코드 파일 합집합 38개). I1–I4를 실제 owning 경계에서 수정했다. 아래 증거는 로컬 구현 완료와 재리뷰 인계이며 전체 Task4, 운영 이관, 운영 사고 종결을 의미하지 않는다. Controller ruling49–51 및 후속 same-batch guard/original seal/old-page resume/pre-fence copy 결정을 적용했다. Helper/reviewer/subagent, 의존성 설치, remote IO, push/PR/Linear, 4.4 작업은 하지 않았다.

### I1: 기존 unmanaged R2와 명시적인 baseline 보호·inventory

신설 0113은 `content_transition_file_inventories`와 `content_transition_file_inventory_rows` 두 control table만 추가한다. Canonical registry는 두 표의 모든 열/JSON/FK를 `source_only`로 분류한다. Business content 복사나 가짜 upload/admission/actor가 아니다. 0114는 기존 owning URL index/retention/capture generator와 최소 inventory immutability trigger를 설치하고 파생 URL index만 재구축한다. Source raw, 기존 managed version/reference, FileIntent/FileObservation의 의미는 유지한다.

4.5가 소비할 최종 공개 경로는 다음과 같다.

1. 기존 `D1TransitionRepository.prepare(plan)` 후 **명시적으로** `armFileInventory(transitionId, inventoryId)`를 호출한다. prepare/import 자체는 arm하지 않는다. Prepared source의 정확한 site/D1 resource/bucket, 세 code–UID, plan/revision, owning 현재 raw reference와 managed reference의 version/hash/size를 같은 D1 batch에서 고정한다. 이미 진행 중이거나 충돌하는 해당 legacy object cleanup claim은 arm 전체를 rollback한다. 다른 안전한 immutable version 및 무관한 일반 작업은 계속된다.
2. App의 기존 `buildFileAvailability(env)`가 반환하는 `D1FileAvailability.observeArmedInventory(id, inventoryId)`는 승인된 raw 참조 및 정확히 세 `members/<code>/backgrounds/` prefix를 실제 R2에서 pagination한다. Managed reference가 없는 논리 key를 실제 `get`하여 body SHA-256/size/own upload-version을 기록한다. 목록을 다시 읽어 key/version 변동을 거부하고 현재 D1 raw/ref/member와 원래 arm을 재검증한다. ETag나 listing metadata는 body proof가 아니다. 같은 observation retry는 기존 immutable fact와 같아야 한다.
3. 기존 `protect(id, {receiptId, protocol, manifestDigest, inventoryId})`는 assetBuckets가 있는 실제 파일 전환에서 observed inventory를 필수로 요구한다. 같은 **D1 transaction** 안에서 current raw/ref/member, exact plan/revision, 전체 세 prefix coverage, 필요한 object rows/count, cleanup claim을 재검증한 뒤 baseline commit과 inventory `sealed`/`source_boundary`를 함께 확정한다. Stale inventory는 baseline marker를 만들지 못한다. R2 read와 D1 seal이 분산 원자적이라는 주장은 하지 않는다. 정상 owning writer는 immutable version에 쓰고 cleanup은 durable arm/claim을 소비하며, 원래 논리 key를 임의로 덮어쓰는 외부 작업은 이 계약의 정상 writer가 아니다.
4. 기존 `describeBaseline`/`exportBaselinePage`의 `BaselineHeader.fileInventory`는 source의 실제 sealed header만 포함한다. Header에는 inventory id, 원래 plan/revision, baseline boundary, coverage, row count/digest가 있다. Target `beginBaseline`은 baseline 저장과 **같은 batch**에서 기존 0113의 `receiving` header를 최초 고정한다. 현재 또는 승인된 append-only revision 계보, member/resource, exact header를 확인한다. 새 schema 0115는 필요하지 않았다. 이미 적용된 0113/0114를 수정하지 않았다.
5. 초기 복사는 `exportBaselineInventoryPage({plan, manifestRevision}, offset)` / `receiveBaselineInventoryPage(context, page)` / `verifyBaselineInventory(context)`를 사용한다. 실제 source fence가 없는 copy/replay 단계에서 원래 source seal과 target에 이미 저장된 baseline/header 및 승인 lineage에 묶는다. Source는 원래 object version/body/hash를 다시 읽고, target은 새 header를 만들어 수용하지 않고 **저장된 원래 baseline seal**과 비교한다. 15행의 고정 bounded page, predecessor/total digest, object identity/version/hash/size를 검증한다. Missing/changed seal, 다른 inventory, stale revision/resource, coverage 누락을 거부한다. Current target listing으로 원래 목록을 재구성하지 않는다. 기존 `exportInventoryPage` / `receiveInventoryPage`와 final availability는 `FileAvailabilityContext {plan, manifestRevision, fence}`의 exact persisted fence를 계속 요구한다. 초기 readback은 final receipt나 installation을 생성하지 않는다.
6. 정상 재시작은 첫 page부터 다시 보내도 된다. 이미 전진한 page는 저장된 전체 prefix의 hash와 해당 page의 모든 row/kind/identity/value를 읽어 검증한다. 정확한 old page retry는 **D1 mutation/batch 0**, R2 side effect 0이며 cursor/count/digest를 되돌리지 않는다. Partial/conflicting/future page는 거부한다. Final availability는 저장된 전체 row count/digest를 다시 확인한다.
7. 기존 `installCommittedState`→`CommittedFileAvailability.assertAvailable`는 모든 원래 legacy object의 **target 실제 body**를 읽고 source seal의 hash/size와 비교한다. `LegacyR2Observation`은 `kind:legacy_r2`, inventory/site/resource/generation/manifest/fence 및 target 자신의 actual upload-version을 기록한다. Source와 target upload-version은 서로 같을 필요가 없다. 기존 managed immutable R2 proof 및 static ASSETS artifact proof와 구별한다. Intent/admission을 꾸며내지 않는다. 실제 기존 `R2AssetReader` fallback과 `D1MemberReader.findProfileByCode`의 background listing에서도 복사된 논리 key가 정상 반환된다.

보호는 durable arm부터 시작한다. Pending/unknown/unacknowledged와 오래된 미완료 arm을 시간으로 해제하지 않는다. 실패한 stale arm도 보관 사실로 남는다. 기존 15분 cleanup 자격·참조/역사/ACK/last-release 정책을 넓히지 않는다. 미완료 hold의 보관량·비용 확인 및 운영자 orchestration은 운영 활성화 전 gate다. Initial inventory 관찰은 arm/observe, 초기 복사는 baseline inventory 포트, 최종 fence-bound evidence는 기존 final 포트로 구분한다. 실제 운영 arm/inventory/copy는 실행하지 않았다.

Actual regression은 `store.put()`을 먼저 부르지 않은 unmanaged notice와 implicit background를 사용했다. Notice는 16개의 추가 실제 reference를 넣어 15행을 넘는 inventory 전송/재시작도 검증했다. Source logical bytes→arm/observe→protect/seal→baseline→target 누락 거부→잘못된 bytes 거부→실제 copy/readback→installation 성공을 수행했다. 원래 source 객체를 같은 bytes로 새 version에 덮어쓴 test-only 변경도 export에서 거부했다. Claim 충돌의 arm rollback, protect 직전 current reference 경쟁의 전체 rollback, 일반 upload 계속, 24시간 후에도 legacy cleanup 보호, 새 arm 재시도, old arm 보존을 확인했다.

### I2: 원문 절대 URL과 정상 관리자 Blob 경로

공유 계약 `GET /api/assets/protected-reference?url=<raw>` / `ProtectedAssetReferenceResponse {path:string|null}`를 추가했다. Exact route는 admin/no-store이고 owning handler의 verified-admin 판정 **이후**에 resolver와 D1 metadata에 접근한다. 401/403/400과 `private, no-store`를 유지한다. 외부 fetch/redirect는 없다.

App composition은 검증된 선택 site의 canonical/configured origin과 실제 row에 묶인 approved origin/resource를 `D1ProtectedAssetReferenceResolver`에 공급한다. Host나 client origin은 tenant authority가 아니다. 원래 business raw와 exact derived index의 일치 및 owning selected row를 확인한다. Cross-site/resource, forged/nonowning row, unclassified origin은 external fallback으로 숨기지 않는다. 승인된 external-only 판정만 `path:null`이다. LuvDia domain/alias는 추측하지 않았다.

기존 notice manager/form, `AuthenticatedImage`, member profile에서 공통 `useAuthenticatedImages`를 계속 소비한다. Hook은 자체 API resolver와 검증된 같은-site 상대 Blob path에만 Bearer를 보내고 redirects를 거부한다. Relative authority trick 및 공백을 포함한 canonical raw URL도 처리한다. Raw DTO/source/sealed URL은 바꾸지 않는다. 실제 external 판정은 원래 img URL을 유지한다. Blob abort/revoke 동작도 유지한다. Owning classifier는 backslash로 authority를 바꾸는 상대 URL을 추가로 거부한다.

Genuine UI 증거: 기존 task UI fixture `.tmp/sul36-task42-ui-otw`에 0113/0114만 incremental apply 했다. 기존 Vite session `91626`, PID `31120`→parent `50900` run-site dev, localhost:5173 및 같은 Chrome profile의 실제 관리자 session을 확인했다. 오래된 탭은 없어 새 task tab `2007445036`에서 `/admin`→콘텐츠→공지로 진입했다. 로그인/token을 만들거나 추출하지 않았다.

로컬 fixture setup `.tmp/sul36-fix1-ui-fixture.mjs`는 explicit OTW config/persist, `remoteBindings:false`, `envFiles:[]`로 기존 테스트 upload의 실제 bytes를 새 독립 logical key에 넣고 archived 공지 id5를 준비했다. 이는 기존 stored absolute URL 상황을 만드는 **setup**이며 정상 UI create/upload 증거라고 주장하지 않는다. 원래 notice4/upload와 source/legacy/private inputs는 유지했다.

- Raw URL: `https://otw-schedule.info/r2-assets/notices/thumbnails/task43-fix1-archive-absolute.webp`.
- 정상 `공지 이미지 보기` 클릭 후 `blob:http://localhost:5173/1c13061b-7026-41b3-a781-fab0380c72b2`, `complete:true`, 실제 `480×479` decode 및 전체 화면 screenshot 관찰.
- D1 id5 `content_access=admin_archive`, `image_urls`와 index `raw_url`의 절대 원문 보존, origin `https://otw-schedule.info`, path `/r2-assets/notices/thumbnails/task43-fix1-archive-absolute.webp`.
- 실제 로컬 R2: **31,446 bytes**, SHA-256 `3632eaf65e4cf69538e614d2939a4b4724c610af3544e33471ec0be49d4ad10d`, upload-version `40d86c4a175f7a62ee301e7d8d39b0c4`.
- 같은 로컬 asset의 비인증 직접 GET: **401**, `Cache-Control: private, no-store`, body `Login required`.
- 증거: `.tmp/sul36-4-3-fix1-ui-readback.json`, `...ui-browser-observation.json`, `...ui-fixture.log`, `...ui-public-denial.log`. Screenshot은 CUA 관찰에 출력되었으며 파일로 export했다고 주장하지 않는다.

Controlled route integration의 actual D1/R2/admin/member/JWKS fixture 및 unit external zero-Bearer는 보조 증거다. Genuine UI 증거와 구분한다. 외부 provider에 실제 요청하지 않았고 actual LuvDia login도 하지 않았다. 종전 정상 upload→Blob→save 증거는 원래 보고대로 유지되며 이번 UI 증거는 **stored own absolute archived image open/read**를 검증한다.

### I3/I4: sealed history 최종 fence와 SQL/parser 일치

`sealedFileReferencesResolvedSql`은 현재 행과 별도로 sealed journal의 required baseline/replay before/after 이미지에서 notice JSON image URLs, thumbnail, member profile image, Naver thumbnail을 읽는다. Approved member/classification scope 및 exclusions를 유지한다. 현재 notice를 고치거나 삭제해도 과거 미분류 URL은 지워지지 않는다.

처음에는 이 predicate를 큰 기존 CAS UPDATE에 결합했으나 실제 D1이 `SQLITE_NOMEM`을 냈다. 같은 predicate의 독립 SELECT(7,116 bytes)는 valid=1이었다. Controller 승인대로 **같은 `db.batch`**의 read-only guard SELECT 뒤 기존 exact CAS UPDATE로 분리했다. Missing/NULL/invalid는 coalesce→의도적 JSON 오류로 batch를 abort한다. Guard는 exact transition/site/resource/generation/protocol/revision/digest를 검사하고 기존 UPDATE의 readiness/phase/fence/checkpoint/manifest CAS와 최종 rowcount/readback은 유지한다. 별도 pre-read 이후 mutation으로 transaction을 끊거나 관측용 쓰기/새 permission을 만들지 않았다. 내부 SQL 오류는 기존 manifest/conflict 진단으로 변환한다.

Actual D1: 미분류 URL의 정상 저장→정상 수정 또는 삭제→fence 거부→승인된 append-only origin 추가→**같은 baseline/header와 원래 sealed journal** export/replay 성공. Source raw/history readback 동일, target 실제 최종행 일치. Fence batch 직전 competing normal commit이 잘못된 URL을 저장하고 삭제하는 late-history race도 guard가 발견한다. Fence/frozen control은 rollback하고 이미 완료된 정상 competing outcomes는 보존하며 이후 일반 source write도 계속된다. 기존 stale-readiness/checkpoint/revision/fence 경쟁 회귀도 통과했다. Inventory 원래 seal은 이후 append-only revision을 수용해도 바뀌지 않고 target의 같은 seal로 receipt를 받는다.

SQL `urlPathSql`은 빈 segment와 trailing slash를 보존하고 dot segment/1회 decode/query·fragment 제거를 owning parser와 맞춘다. `/profile//bing_hayu.webp`, `/profile/bing_hayu.webp/`, `/r2-assets/notices//thumbnails/a.webp`는 actual final fence에서 거부된다. Valid encoded/dot/query URL은 actual D1 index와 owning parser가 같은 path를 낸다. Allowlist/auth를 넓혀 SQL을 통과시키지 않았다. 적용된 0000–0112는 불변이며 새 0114의 rebuild/capture/retention/final consumers가 같은 helper를 사용한다.

### 실행 증거 — 실제 RED, 원래 오류, GREEN

아래 모든 Node/pnpm 실행은 먼저 `$env:PATH="$PWD/.tmp/node-runtime/node-v24.20.0-win-x64;$env:PATH"`를 설정했다. 편의상 `CT=worker/features/content-transition/infrastructure/d1-transition.integration.test.ts`, `AV=worker/features/assets/infrastructure/file-availability.integration.test.ts`, `FR=worker/features/assets/infrastructure/file-recovery.integration.test.ts`, `AA=worker/app/archive-access.integration.test.ts`로 표기한다. 표의 해당 이름은 실제 명령에서 전체 path로 전달했다. 로그는 `.tmp/sul36-4-3-fix1-<이름>.log`다. 서로 다른 회차를 하나의 전체 suite PASS로 합산하지 않는다.

| 실제 명령/경계 | 결과·exit | 로그 |
| --- | --- | --- |
| `pnpm exec vitest run --config vitest.worker.config.ts CT FR -t 'fix1 rejects unresolved sealed\|fix1 rejects noncanonical slash\|SQL URL identity'` | 의도된 RED **6 FAIL/65 skip**, exit1: history2, slash3, SQL parity1 | `history-path-red` |
| `pnpm exec vitest run src/shared/ui/authenticated-image.test.tsx -t 'stored own absolute'` | 의도된 RED **1 FAIL/1 skip**, exit1: raw absolute src가 그대로 노출 | `absolute-blob-red` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV -t 'real unmanaged'` 초기 회차 | alias `t.id`, 뒤의 두 NOMEM 실패는 setup/SQL 구현 오류이며 I1 intended RED가 아님 | `unmanaged-red`, `unmanaged-red-corrected`, `unmanaged-red-corrected2`, `sealed-diagnostic` |
| 같은 unmanaged 회귀, SQL guard 분리 후 | 의도된 RED **2 FAIL/1 skip**, exit1: notice `Missing committed captured file reference`, implicit background target 미존재인데 installation 성공 | `unmanaged-red-corrected3` |
| 새 inventory 첫 실행 | depth100 arm guard 실패; MATERIALIZED row guard로 수정. 다음 회차 실제 성공의 void 반환을 `toBeDefined`로 검사한 fixture 오류를 `toBeUndefined`+installation readback으로 수정 | `unmanaged-green-attempt1`, `unmanaged-green-attempt2`, 각 exit1 |
| boundary scoped run(AV/CT/FR의 해당 fix1/SQL case) | **8 PASS/66 skip**, exit0 | `boundaries-attempt1` |
| `pnpm exec vitest run --config vitest.worker.config.ts AA -t 'absolute'`의 resolver case | actual D1/R2 **1 PASS/21 skip**, exit0 | `resolver-d1` |
| inventory/history/fence 첫 조합 | **4 FAIL/18 PASS/36 skip**, exit1. release boolean 의미 오해, old fixture bucket 두 건, `.run`→`.batch` 변경 후 race matcher 미주입을 수정 | `inventory-history` |
| 수정한 같은 조합 | **23 PASS/36 skip**, exit0 | `inventory-history2` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV FR CT AA` | **96 PASS/2 FAIL**, exit1. 두 실패는 guard의 malformedJSON을 기존 manifest/conflict 진단으로 반환하지 않은 문제; owning catch 수정 | `d1-final` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV CT worker/features/content-transition/infrastructure/file-inventory-schema.integration.test.ts` | **60 PASS**, exit0. CT 전체, inventory, populated apply/rollback | `d1-final2` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV CT -t 'fix1'` | 최종 baseline seal/plan/revision/append-lineage 및 history guard **21 PASS/38 skip**, exit0 | `seal-final` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV -t 'real unmanaged'` | 추가 실제 기존 reader/listing **2 PASS/2 skip**, exit0 | `legacy-readers` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV -t 'real unmanaged notice'` | 15행 초과의 old page 재전송 intended RED **1 FAIL/3 skip**, exit1: `Inventory page predecessor mismatch` | `inventory-resume-red` |
| `pnpm exec vitest run --config vitest.worker.config.ts AV` | old-page zero-write, missing/conflicting/future/partial, 정상 readback 포함 최종 **4 PASS**, exit0 | `inventory-resume-green` |
| `pnpm exec vitest run --config vitest.worker.config.ts worker/features/content-transition/infrastructure/retention.integration.test.ts` | **5 PASS**, exit0 | `retention` |
| `pnpm exec vitest run src/shared/ui/authenticated-image.test.tsx worker/features/assets/domain/file-reference.test.ts worker/app/routes.test.ts worker/features/content-transition/domain/disposition-registry.test.ts` | **23 PASS**, exit0. 이전 route fixture의 새 endpoint 누락/기존 stale immutable-cache 기대 실패는 `unit-final`(exit1,1FAIL28PASS)에 보존 | `unit-final2` |
| `pnpm exec vitest run worker/features/assets/domain/file-reference.test.ts worker/features/content-transition/infrastructure/file-inventory-statements.test.ts` | **3 PASS**, exit0; 0114 generator byte parity/100KB guard | `parity` |
| `pnpm exec vitest run src/shared/ui/authenticated-image.test.tsx` | trimmed raw/own absolute/external zeroBearer/authority trick/Blob cleanup **3 PASS**, exit0 | `blob-final` |

일부 Worker 회차에 pool worker 종료 timeout warning과 binary fixture의 `.text()` warning이 출력됐다. 위 실제 exit/test verdict를 그대로 기록하며 warning을 runtime/운영 성공 증거로 해석하지 않는다. 마지막 inventory 회차는 4 PASS/exit0이며 R2 body는 arrayBuffer SHA readback으로 확인했다. 초기 TS1294(parameter property)와 존재하지 않는 cleanup method fixture 오류는 `types-attempt1/2` exit1에 보존했고 수정했다. 초기 lint의 test `do…while(true)` 한 건도 `lint` exit1에 남기고 정상 `for` 루프로 수정했다.

### Migration·정적 검사·보존·비용

- `pnpm drizzle:generate` → 0113, `pnpm drizzle:generate:custom --name asset_file_inventory_guards` → 0114, 각각 exit0(`generate`, `generate-custom`). Canonical generator로 0114를 작성했다. 이후 적용본 수정 없음.
- `node scripts/d1-reset-local.mjs --site=otw --persist-to=.tmp/sul36-task43-fix1-chain-otw --validate-only` 및 `--site=luvdia --persist-to=.tmp/sul36-task43-fix1-chain-luvdia --validate-only`: 각각 실제 임시 D1 전체 **114 migrations**, exit0(`chain-otw`, `chain-luvdia`). Existing source/legacy reset 없음.
- `node scripts/d1-migrate-local.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw`: 기존 UI fixture에 pending **0113/0114만** apply, exit0(`ui-migrate`). Selected local `otw_db`/config/persist 로그 보존. Populated ordinary notice 원문 보존, 고의 실패시 whole migration batch rollback, 재적용 후 raw 보존/index parser 갱신/FK check는 actual D1 `file-inventory-schema.integration`에서 PASS.
- `node scripts/d1-doctor.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw --skip-api --skip-remote`: exit0(`ui-doctor`), blocking failure 없음.
- 최종 `pnpm drizzle:generate`: `No schema changes, nothing to migrate`, exit0(`nodiff`). `_journal`/113·114 snapshots 포함. 0000–0112 SQL/snapshot의 normalized Git blob **223/223 동일**: `.tmp/sul36-4-3-fix1-migration-preservation.json`.
- 0114 owning generator parity **241 statements**, 최대 **94,554 bytes**, 100KB 이하. 적용 SQL을 cosmetic 편집하지 않았다.
- `pnpm architecture:check`: exit0(`architecture-final`). `pnpm typecheck:test`: exit0(`types-closeout`); 마지막 Worker seal/resume 변경 후 `pnpm exec tsc -p tsconfig.worker.json --noEmit`도 각각 exit0(`seal-types`, `resume-types`). Changed `.ts/.tsx`만 `pnpm exec eslint <명시 소유 목록>` exit0(`lint-final`); 이후 변경 파일 targeted lint도 exit0(`seal-lint`, `resume-lint`). Canonical rule/sync 입력은 이번 fix에서 바꾸지 않았으므로 이전 sync PASS를 반복하지 않았다. Common suite/preflight, unchanged blocked production build도 반복하지 않았다.
- 기존 4 legacy files SHA/size **모두 동일**: `.tmp/sul36-4-3-fix1-legacy-final.json`. Main 16,019,456 bytes `b26320f8…e281`, metadata 4,096 bytes `4c34b48e…b9d`, shm 32,768 bytes `ef7eb207…18d5`, wal 12,392 bytes `cabcfbef…e3f`. 이것은 원격 R2 무변경 증거가 아니다.
- Actual protect fixture: **18 statements, 4,264 rows read, 72 rows written**. Earlier 4,263 결과와 구분한다. 정상 capture의 small/1,000 unrelated 비교는 둘 다 **88 reads/17 writes**. File-index ordinary query는 **256→260 reads/1 write**. Selected 1,000-row baseline 및 큰 fanout의 기존 영향 검사도 로그에 그대로 있다. 전체 snapshot 재구축·관측 heartbeat write를 ordinary writer에 추가하지 않았다. Production inventory 크기·총 hold 보관량·Worker/R2/D1 quota와 비용 판정은 운영 gate로 남는다.

### Self-review, concerns, handoff

Self-review에서 current-row/history 불일치, arm/claim 경쟁, original baseline seal을 target header가 대체할 가능성, append-lineage, 오래된 page retry, 실제 implicit background reader, admin-before-metadata, arbitrary-origin Bearer 차단, SQL/parser strictness, source-only registry/capture exclusion, old migration/legacy 보존을 직접 추적했다. 같은 D1 transaction 및 authoritative R2 body/readback으로 경계를 확인했다. Fixture를 통과시키려고 정상 writer를 중지하거나 source raw/authority를 바꾸지 않았다.

`git diff --cached --check`의 최종 실제 결과는 **exit2**다. 새 적용 `0114_asset_file_inventory_guards.sql:523,553` 두 줄(각 네 공백)이 기존 generator에서 재현됐다. 최초 check의 source `.ts` EOF blank는 제거했지만 적용 SQL byte parity는 유지했다. Controller가 보존을 지시한 기존 `0112:513,542` M1도 그대로 남는다. **Pristine diff-check PASS라고 보고하지 않는다.** 두 migration의 cosmetic 재작성/추가 cosmetic migration은 하지 않았다. 실행/데이터 의미 위험은 낮으며 fix 재리뷰와 전체 리뷰에 전달한다.

Production build는 종전 Clerk key/issuer identity 불일치로 artifact 생성 전 exit1인 상태이며 이번에 입력을 바꾸거나 우회하지 않았다. Actual LuvDia login/domain, production resource/binding/deployment identity, provider/account/quota/CDN/direct bucket closure, 전체 writer/ingress(4.4)와 operator orchestration(4.5)은 검증·구현 완료로 주장하지 않는다.

운영 upload 사고는 별도 미해결이다. 이번 writer fix round의 후속 remote IO는 0이다. Root가 별도 사용자 허가로 수행한 7 GET은 현재 200/총14,215,562 bytes/사고 input hash-size 일치이며 마지막 저장 시각은 중단 기록 뒤였다. 이는 사고 전 bytes/version, 실제 upload-version(GET에 없음), CDN/사용자 영향을 증명하지 않는다. 새 local PASS·import guard로 사고를 상쇄하거나 종결하지 않는다. Root의 incident/ruling/ledger 문서는 이 commit에 포함하지 않았다.

첫 코드 commit의 exact owned list는 `.tmp/sul36-4-3-fix1-owned-code.txt`와 `git show --name-only 55a5e3f`다. `contracts` 3, `db/schema/index.ts`, 새 SQL 2/snapshot 2/journal, hook/Blob test, app routes/composition/auth integration, assets owning resolver/inventory/availability/handler/tests, transition baseline/repository/index/registry/retention/history/generator/tests, URL SQL helper를 포함한다. 후속 `9bd630c`는 assets의 availability/inventory/integration test 및 content-transition의 file-availability port/index 5개만 포함한다. Root SUL 문서/ledger와 unrelated AI 문서, private inputs, `.tmp`/`.wrangler`는 staging에서 제외했다. 이 보고서만 별도 evidence commit으로 추가한다.

### 최종 포트 보완: source fence 이전의 실제 복사

Controller의 마지막 caller audit에서 `55a5e3f`의 inventory export/receive가 final `fence_json`을 필수로 요구해 최초 파일 복사를 source fence 이후에만 허용한다는 공백을 확인했다. 그 commit만으로 I1의 전체 최종 포트가 완성됐다는 초안 판단을 정정한다. 초기 복사에 미래/가짜 fence를 넣거나 고정 4.1의 prepared target 권한을 넓히지 않았다. 새 wire/schema/permission/owner/actor도 추가하지 않았다.

최종 `BaselineFileInventoryContext {plan, manifestRevision}`는 content-transition 내부 port 타입이며 기존 `FileAvailabilityContext`는 여기에 실제 `SourceFence`를 필수로 추가한다. App의 기존 `buildFileAvailability`가 반환하는 동일 owning adapter에 위 세 초기 메서드를 공개했다. 초기 entry는 현재 D1의 exact local site/resource/plan/revision, source protected/copying/replaying/target_ingress_ready 또는 target target_ingress_ready, **fence_json IS NULL**을 확인한다. Inventory engine은 source의 original sealed baseline commit 또는 target의 실제 저장된 baseline boundary/header 및 승인 lineage를 검증한다. 수신 시 현재 plan/revision/resource/fence와 page predecessor는 row insert/progress update와 **같은 D1 batch**에서 검사한다. JSON guard 오류는 `Inventory page context/predecessor conflict`로 전달되고 batch 전체가 rollback한다. Old exact page retry는 기존 read-only 검증을 유지한다.

실제 순서는 다음과 같다.

1. Source prepare→explicit arm→실제 unmanaged notice+implicit background body/hash/upload-version 관찰→protect와 원래 baseline/seal을 같은 transaction에서 확정→beginCopy.
2. Target `openIngress`로 durable receiving만 준비한다. 이는 target 최종 business 실행이나 source fence 허가가 아니다. Source는 ACK/fence 전까지 final writer다.
3. Source 원래 baseline header와 early inventory page를 export한다. Target `beginBaseline`으로 원래 header를 고정한 뒤 page를 수신하고, page의 실제 source R2 body를 target local bucket에 복사한다. Target own body/hash/size를 early verifier로 읽는다. 누락·wrong bytes는 거부한다. 초기 검증은 **final evidence 0건**, installation 없음이다.
4. Inactive baseline을 기존 stage/materialize/finalize 포트로 설치하고 source beginReplay 후 실제 `schedules.save` codec admission→readExecutableCommand→같은 source final-owner commit을 수행한다. 이를 기존 exportProjectedCommits→installProjectedCommit으로 replay하며 target UID 11과 원래 title을 읽는다. 이 시점 양쪽 `fence_json`은 NULL이다.
5. 최신 승인 revision의 compatible/미만료 target readiness를 기존 openIngress renewal로 얻고 source acknowledgeIngress→freeze→target installFence를 수행한다. 그 뒤 exact fence의 source static body proof와 target final legacy/managed/static verifier를 소비하는 installCommittedState가 성공한다. 새 early port는 fence 후 거부된다. 기존 최종 tail/checkpoint/frozen TRANSFER/activation 의미를 바꾸지 않았다.

실제 경쟁은 target page batch 직전에 정상 `acceptManifestRevision`을 실행했다. 이전 context의 read 검증 뒤라도 row insert/cursor 진행이 전부 rollback했고 `staged_rows=0`, inventory row count=0을 읽었다. 새 approved origin revision context에서 같은 원래 header/page를 재전송하자 통과했으며 source describeBaseline 및 원래 inventory header는 변하지 않았다. Missing target baseline, forged inventory id, stale revision, 다른 bucket도 거부했다. Source/target upload-version은 별개이고 기존 body hash/size 계약은 같다. D1/R2 분산 원자성이나 현재 target listing이 원본 승인이라는 주장은 하지 않는다.

검사 환경은 동일한 pinned Node24.20.0 + 실제 local D1/R2 Worker runtime이다. 다음 로그는 `.tmp/sul36-4-3-fix1-<suffix>.log`이며 원래 오류를 보존했다.

| 명령/회차 | 실제 결과 | suffix |
| --- | --- | --- |
| `pnpm exec vitest run --config vitest.worker.config.ts worker/features/assets/infrastructure/file-availability.integration.test.ts -t "before source fence"` | **RED**, exit1,1FAIL4skip: `exportBaselineInventoryPage is not a function`; 실제 missing port | `early-red` |
| 같은 focused 명령, 첫 구현 | exit1,1FAIL4skip: fixture 직접 notice UPDATE가 `content_transition_final_owner_required`에 거부됨. Guard는 그대로 두고 실제 schedules.save admission/command/final commit으로 수정 | `early-green-attempt1` |
| 위 파일 전체 | exit1,**4PASS1FAIL**: early flow는 PASS, 다음 기존 test에 새 schedule이 남아 baseline version conflict. Task-owned test DB의 beforeEach cleanup에 schedules를 추가 | `early-green` |
| 위 파일 전체, fixture 교정 | exit0,**5PASS** | `early-final` |
| 위 파일 전체, same-batch approved revision 경쟁/원래 seal resume 추가 후 | exit0,**5PASS**, 최종 코드. Protect cost 18 statements/4,264 reads/72 writes는 동일 | `early-race-final` |
| `pnpm typecheck:test` | exit0 | `early-types` |
| `pnpm exec tsc -p tsconfig.worker.json --noEmit` (마지막 race test/catch 변경 후) | exit0 | `early-race-types` |
| 명시된 5개 변경 코드 `pnpm exec eslint ...`; 마지막 변경 inventory/test 두 파일만 재검사 | 각각 exit0 | `early-lint`, `early-race-lint` |
| `pnpm architecture:check` | exit0 | `early-architecture` |

후속 5파일의 staged diff check는 exit0이며 이전 0112/0114 적용 SQL의 전체 범위 diff-check exit2를 해소했다는 뜻은 아니다. 이 보완은 schema/migration/config/UI를 바꾸지 않았으므로 이미 끝난 양쪽 chain/no-diff/실제 absolute-image UI와 독립 검사를 반복하지 않았다. 실제 production build, LuvDia auth, 운영 사고의 현재/과거 확인 한계는 위에 적은 그대로다. 코드 self-review는 초기/최종 포트 분리, 실제 source live writer, target 수신 준비와 final ownership 구분, same-batch revision 경쟁, original seal/old-page idempotency, final fence 불변을 확인했다.

**DONE: Task4.3 fix round1 구현·로컬 증거 인계. Controller 재리뷰 대기; Task4 전체 미완료, 4.4 시작 금지.**

## Task4.3 fix round2/5 — I4, N1, N3 (2026-10-14 23:39–2026-10-15 KST)

FIX_BASE는 `f37b966bb921a0122d2c1f71f79e8970189c80f2`다. 전체 fix1 review와 fix2 brief, ruling53 및 controller의 trusted notice/draft 문맥 승인을 읽고 I4/N1/N3만 수정했다. I1–I3의 original seal/early inventory copy/final fence, source final writer 및 같은-batch sealed history guard는 유지했다. Canonical db-migration/worker-api-change와 자체 code-review 절차를 사용했다. Sole writer이며 helper agent/reviewer, remote IO, Task4.4 작업은 없었다. 아래 local 결과는 운영 사고, production build, 실제 LuvDia 인증의 미확인 상태를 해소하지 않는다.

### 최종 owning 경계와 호출자

**I4:** `worker/platform/url-path-sql.ts`에서 raw relative authority를 dot 정규화 전에 거부한다. 자체 검토로 TAB/LF/CR 및 encoded slash/backslash와 encoded dot/slash 조합도 같은 결함임을 확인했다. 최종 SQL은 URL의 raw separator/control 처리와 첫 dot 처리 → 한 번의 percent decode → decoded authority 거부 → 두 번째 path 처리 순서다. `/\\foreign.example/../../profile/bing_hayu.webp`를 포함한 여섯 거부 사례와 `/%5cforeign.example/../../profile/bing_hayu.webp`처럼 첫 URL 단계에서 dot가 먼저 소거되어 실제 owning parser가 허용하는 사례를 구분한다. 정상 control 제거와 기존 duplicate/trailing slash, query/fragment, encoded delimiter의 parser/SQL 결과를 비교했다. Owning TypeScript classifier를 완화하지 않았다.

공유 helper의 실제 소비자는 `file-reference-index`의 current index/projection, `file-reference-integrity`의 exact raw 검증, `fileReferencesResolvedSql`, `sealedFileReferencesResolvedSql`, retention/access/inventory/capture generator다. 새 `0115_asset_file_path_authority.sql`을 정상 custom migration으로 생성하고 UI fixture에 적용한 뒤 추가 반례가 확인되어, 그 적용본은 그대로 두고 `0116_asset_file_url_parse_order.sql`을 정상 생성했다. 새 migration은 기존 view/trigger를 owning generator로 교체하고 **derived index만** 재구축한다. Business raw, source sealed image/hash, 승인 plan/actor/fence/권한은 바꾸지 않는다. Final generator는 241 create statements, 최대 94,554 bytes로 100KB guard 안이다. 실제 current/history 각각 여섯 케이스에서 freeze가 거부되고 control row 전체와 원래 journal rows가 그대로이며, 이후 기존 `schedules.save` admission → readExecutableCommand → final-owner source commit은 성공한다. 테스트의 notice mutation은 기존 fixed-port capture fixture이며 전체 notice writer/ingress 4.4 완료 주장이 아니다.

**N1:** shared `ProtectedAssetReferenceContext`는 `{kind:'notice', id:number}` 또는 `{kind:'notice-draft', id?:number, relatedMemberUids:number[]}`다. 기존 `GET /api/assets/protected-reference?url=...`에 선택 JSON `context` query를 추가했다. Handler는 verified admin을 먼저 확인하고 각 입력을 4,096자 이내로 제한하며 positive safe-integer/중복 없는 UID/정확한 key 형태를 파싱한다. `normal`, `access` 같은 caller bool은 받지 않는다. 모든 응답은 private/no-store이고 invalid/unresolved는 400이다.

`D1ProtectedAssetReferenceResolver.resolve(raw, context?)`는 실제 notice 존재와 open의 raw 관계, draft existing row의 normal/editable 상태, 기존 owning `D1NoticeGateway.areRelatedMembersValid`를 통한 actual UID 유효성을 검증한다. Gateway의 기존 validator를 공개하고 app composition이 좁은 `NoticeImageMemberValidator` port로 공급한다. Assets domain에 다른 capability validator를 복제/이동하거나 새 authority를 만들지 않았다. Strict 범위는 실제 archive/selected/membership/moved 및 해당 raw의 current/sealed/baseline/inventory/history 사실에서 도출한다. 세 UID 자체만으로 전환 없는 일반 공지를 제한하지 않는다. Raw URL 조회는 business raw view를 사용하며 derived index만을 권한으로 삼지 않는다. 실제 index 삭제 시도는 기존 guard가 거부하므로 테스트도 그 거부를 확인한다. ID 생략, UID 축소, unrelated row 대입으로 실제 보호 raw를 external로 바꿀 수 없다. Serialized `image_urls`는 `json_each(json_extract(...))`로 풀어 현재 행에서 사라진 역사 이미지도 확인한다.

검증된 일반 row/draft이며 보호 사실/관련 전환이 없는 외부 HTTP(S)는 `path:null`로 원래 img 의미를 유지한다. 일반 external의 대문자 scheme/host 및 default port 표기는 owning notice 입력에서 유효하므로 그 normal 판정 전에 transition의 canonical-prefix 제약을 적용하지 않는다. Own configured origin 및 protected transition reference에는 기존 canonical/origin/resource 제약을 유지한다. Profile의 context 없는 strict 경로도 유지한다. Resolver는 외부 fetch/redirect를 하지 않는다. Raw DTO/source/seal은 변경하지 않는다.

`useAuthenticatedImages`/`useAuthenticatedImage`와 `AuthenticatedImage`에 선택 context를 전달한다. Notice form은 현재 draft id/선택 UID, notice manager의 `공지 이미지 보기`는 실제 row id를 넘긴다. Context가 바뀌면 같은 URL이라도 기존 resolution을 즉시 숨기고 abort/revoke 후 재검증한다. Bearer는 same-site resolver 및 검증된 relative Blob path에만 보내며 resolver 오류를 external로 바꾸는 fallback은 없다. 모든 공유 소비자를 확인했다: member profile/signature/background는 context 없이 기존 strict 경로, public `protectedImage=false`는 기존 동작이다.

**N3:** 새 own-absolute route 회귀의 image/webp body를 `.text()` 대신 `arrayBuffer()`/`Uint8Array` expected-byte 비교로 검증한다. 다른 기존 text/fixture warning과 과거 실패 기록을 pristine으로 바꾸지 않았다.

### 실제 RED/GREEN 및 검사 이력

모든 실행은 repo cwd에서 `$env:PATH="$PWD/.tmp/node-runtime/node-v24.20.0-win-x64;$env:PATH"`를 먼저 설정했다. 아래 로그 prefix는 `.tmp/sul36-4-3-fix2-`, 시간은 KST다. `CT=worker/features/content-transition/infrastructure/d1-transition.integration.test.ts`, `FR=worker/features/assets/infrastructure/file-recovery.integration.test.ts`, `AV=worker/features/assets/infrastructure/file-availability.integration.test.ts`, `SC=worker/features/content-transition/infrastructure/file-inventory-schema.integration.test.ts`, `RT=worker/features/content-transition/infrastructure/retention.integration.test.ts`, `AA=worker/app/archive-access.integration.test.ts`다. 경로 약자는 표의 명령에서 해당 전체 경로로 확장한 실제 호출이다.

| 시각/명령 | 결과와 원래 오류 | 로그 suffix |
| --- | --- | --- |
| 10/14 23:39 `pnpm exec vitest run --config vitest.worker.config.ts CT FR -t "fix2 rejects an authority\|SQL URL identity"` | exit1, 3 FAIL/71 skip. Parity는 intended RED(allow=1 대 reject=0); D1 두 개는 잘못 가정한 `frozen_operations` column 때문에 fixture 실패 | `authority-red.log` |
| 23:39 같은 CT만 `-t "fix2 rejects an authority"` | 실제 control row `SELECT *`로 fixture 교정 후 exit1, **2 intended FAIL/55 skip**, current/history 모두 freeze가 성공해 버림 | `authority-red-corrected.log` |
| 23:43 최초 CT+FR focused 명령 | 0115 후 exit0, **3 PASS/71 skip** | `authority-green.log` |
| 23:46/23:47 `pnpm exec vitest run --config vitest.worker.config.ts AA -t "fix2 preserves normal"` | 첫 exit1은 400 text를 JSON으로 읽은 assertion 실패; status로 교정한 두 번째는 **400 대 200 intended RED**, 1 FAIL/22 skip | `notice-red.log`, `notice-red-status.log` |
| 23:49 AA `-t "fix2 preserves normal\|fix1 resolves archived"` | 첫 owning-context 구현 exit0, **2 PASS/21 skip** | `notice-green-attempt1.log` |
| 23:54–23:56 unit consumer 명령(아래) | 처음 8 FAIL/14 PASS: stale `fetchActiveMembers` mock 6개, raw img 기대값 2개. Admin member mock/Blob fixture로 고친 뒤 2 FAIL/20 PASS 두 회차(첫 mock Response 재사용을 교정했으나 required test auth도 누락). 실제 test token/새 Response를 공급한 최종 **22 PASS**, exit0. 제품 auth를 우회하지 않음 | `consumers.log`, `consumers-corrected.log`, `consumers-final.log`, `consumers-auth-corrected.log` |
| 10/15 00:00 `pnpm exec vitest run --config vitest.worker.config.ts CT SC FR AV AA` | exit1, **102 PASS/2 fixture FAIL**. Current derived index 직접 삭제는 `asset_file_index_current_reference`; 추가 migration test가 같은 DB의 bootstrap UID를 중복 삽입. Guard를 그대로 assertion하고 같은 test에서 0114→새 migration 경계를 순차 검증하도록 교정 | `d1-final.log` |
| 00:03/00:04 pinned Node `--no-warnings --input-type=module`, actual helper/parser transpile + `node:sqlite :memory:` 비교 | 첫 supporting 진단은 반복 `?` bind 누락으로 모두 `/`를 반환하여 무효. `WITH input AS (SELECT ? raw)`로 교정한 결과 TAB/LF/CR 3개 및 encoded authority 2개 모두 parser reject/SQL allow=1. 운영/D1 전체 proof로 쓰지 않음 | `authority-diagnostic.log`, `authority-diagnostic-corrected.log` |
| 00:05 `pnpm exec vitest run --config vitest.worker.config.ts FR -t "SQL URL identity"` | actual D1 **intended RED**, exit1, 1 FAIL/16 skip; TAB authority allow=1 | `authority-extended-red.log` |
| 00:06 같은 명령, 0116 | exit0, **1 PASS/16 skip**, 확장 배열의 allow/reject 및 허용 경로 exact equality | `authority-extended-green.log` |
| 00:07–00:08 `pnpm exec vitest run --config vitest.worker.config.ts CT SC FR AV RT AA` | exit0, **6 files/118 PASS**. I4 current/history 12 cases, ordinary/active capture, cleanup race/unknown recovery, original seal/early copy/final availability, retention 및 populated rollback 포함. Worker-pool termination timeout warnings 3건은 남음; assertion FAIL 없음 | `d1-final116.log` |
| 00:09 unit consumer 명령 | exit0, **4 files/22 PASS**, final 0116 generator parity 포함 | `consumers116.log` |
| 00:14 AA `-t "fix2 preserves normal"` | 일반 `HTTPS://ORDINARY-MEDIA.EXAMPLE:443/image.webp`의 **400 대 200 intended RED**, exit1, 1 FAIL/22 skip | `normal-spelling-red.log` |
| 00:15 AA `-t "fix2 preserves normal\|fix1 resolves archived"` | normal owning context 뒤 protected canonical gate 순서로 수정; exit0, **2 PASS/21 skip** | `normal-spelling-green.log` |
| 00:17 같은 AA normal focused | actual historical record의 JSON-string `image_urls`가 **200 대 400 intended RED**, exit1, 1 FAIL/22 skip | `historical-json-red.log` |
| 00:18 AA 두 resolver tests | actual JSON value를 먼저 꺼내 array 순회하도록 교정; exit0, **2 PASS/21 skip**. 최종 resolver 코드 증거 | `historical-json-green.log` |

Unit consumer 실제 명령은 `pnpm exec vitest run src/features/notices/ui/admin/notice-form-dialog.test.ts src/features/notices/ui/admin/notice-manager.test.ts src/shared/ui/authenticated-image.test.tsx worker/features/content-transition/infrastructure/file-inventory-statements.test.ts`다. New draft preview와 실제 notice id open, context 변경 후 old-src 숨김/거부 시 fallback 없음, foreign Bearer 없음, 기존 Blob revoke 및 generator parity를 확인한다. API regression은 normal/no-transition/UID1-no-transition/unrelated-row positive와 missing id, raw mismatch, archived draft, invalid/deprecated/duplicate UID, forged normal bool, protected raw의 id 생략·UID 축소·unrelated-id 대입, selected unresolved/cross-site, historical raw를 거부한다. Actual route/D1/R2이지만 route auth는 로컬 signed test JWT fixture이고 아래 genuine browser auth와 구분한다.

마지막 수정은 resolver의 normal 판정 순서와 JSON 읽기 및 해당 route assertion만 바꿨으므로 이미 통과한 나머지 116 code/migration covering tests를 반복하지 않았다. 118 PASS와 그 뒤 최종 resolver의 2 PASS를 합산한 새 unique test 수로 과장하지 않는다.

### 실제 OTW 관리자 흐름과 authoritative readback

기존 task Vite session `91626`을 재사용했다. 최신 CIM에서 Node24.20.0 `run-site.mjs dev --site=otw` parent PID50900→Vite PID31120, parent PowerShell47468과 `.tmp/sul36-task42-ui-otw` 설정을 확인했다. 기존 Chrome tab은 없어 같은 Chrome profile의 새 tab `2007445279`, `http://localhost:5173/admin/content?tab=notices`로 들어갔으며 **기존 genuine Clerk 관리자 세션이 유지**됐다. Token/cookie를 읽거나 새 login/auth bypass를 만들지 않았다.

통제된 이미지 서버는 `.tmp/sul36-fix2-external-image-server.mjs`, session68014/PID52460, `http://127.0.0.1:5189/notice.webp`다. 127.0.0.1에만 bind하고 기존 task 이미지 파일 31,446 bytes를 반환하며 Authorization의 존재 여부만 기록한다. 외부 provider를 호출하지 않는다. 이 서버 준비 및 기존 archived id5 fixture는 setup이다. **새 notice id6 생성과 URL 입력/preview/save는 전부 정상 UI action**이다.

- 10/14 23:55 지원 entry `node scripts/d1-migrate-local.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw`로 0115만 485 commands/exit0 증분 적용했다(`ui-migrate.log`). 23:57 `새 공지`→내용/URL→`추가`→preview complete=true, 480×479→`공지 등록`→목록 열기 성공. Source raw URL은 `http://127.0.0.1:5189/notice.webp`다.
- 10/15 00:10 같은 지원 entry로 0116만 485 commands/exit0 적용했다(`ui-migrate116.log`). Reload→id6 수정 dialog의 동일 외부 preview→일반 멤버 UID9102 선택→`수정 저장`을 수행했다. 첫 PUT은 `SQLITE_BUSY_SNAPSHOT`으로 실패하고 UI가 입력을 유지했다. 같은 정상 저장 버튼 재시도는 00:12:16 성공했다. 직전 같은 task DB의 migration/doctor 실행과 겹친 local lock이며 정확한 lock 원인은 별도로 격리하지 않았다. 구현 변경/DB 강제 reset/guard 우회는 없었다. 원래 실패는 `ui116-first-save-error.log`, Vite session91626 output에 남겼다.
- 최종 00:16 관찰에서 id6 external img와 기존 id5 own-absolute archive img가 모두 complete=true, 480×479였다. id5는 `blob:http://localhost:5173/aed89eac-7055-4096-8a1b-e84f2196a95e`, 원래 absolute raw는 D1에 그대로다. `ui116-browser.json`, `ui116.jpg` 및 이전 `ui.jpg`에 보존했다.
- `node .tmp/sul36-fix2-ui116-readback.mjs`는 기존 selected config validator + `getPlatformProxy({configPath:'wrangler.jsonc',envFiles:[],remoteBindings:false,persist:{path:.../v3}})`의 로컬 D1/R2만 읽었다. `ui116-readback.json/log`: migration0116, id6 normal/[9102]/raw URL 및 image_urls.0·thumbnail_url 두 index 행, id5 admin_archive/raw/index 보존, **content_transitions count=0**. 따라서 정상 외부 preview/open/save를 위해 전환을 만들지 않았다.
- 기존 id5 R2 key `notices/thumbnails/task43-fix1-archive-absolute.webp`: 31,446 bytes, SHA-256 `3632eaf65e4cf69538e614d2939a4b4724c610af3544e33471ec0be49d4ad10d`, actual local upload-version `40d86c4a175f7a62ee301e7d8d39b0c4`로 fix1 값과 같다. Controlled external server도 같은 body/hash를 제공했으며 최종 readback 당시 기록된 10개 GET 모두 `authorizationPresent:false`. UI URL 및 local body proof이며 production bucket/version/CDN proof가 아니다.

[최종 일반 외부 이미지와 보관 Blob 표시 — 로컬 보관 안내](../../../docs/archive/documentation-reconciliation-2026-10-21.md#로컬-스크린샷-2개)

### Migration, 보존, 최종 영향 검사

| 명령 | 실제 결과 / 로그 suffix |
| --- | --- |
| `pnpm drizzle:generate:custom --name asset_file_path_authority`; `node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.worker.json .tmp/sul36-fix2-authority-capture.ts` | 각 exit0, 정상 0115 SQL/snapshot/journal 생성. `generate.log`, `generate-sql.log` |
| `pnpm drizzle:generate:custom --name asset_file_url_parse_order`; 같은 tsx entry `.tmp/sul36-fix2-url-capture.ts` | 각 exit0, 정상 0116 생성. 0115 적용 bytes 유지. `generate116.log`, `generate116-sql.log` |
| `node scripts/d1-reset-local.mjs --site=<otw\|luvdia> --persist-to=.tmp/sul36-task43-fix2-chain-<site> --validate-only` | 양쪽 exit0, 당시 115 migrations 실제 적용/검증, 기존 DB 교체 없음. `chain-otw.log`, `chain-luvdia.log` |
| 같은 명령, `--persist-to=.tmp/sul36-task43-fix2-chain116-<site>` | 양쪽 exit0, **최종116 migrations** 실제 적용/FK/빈 bootstrap 정리 검증, 기존 DB 교체 없음. `chain116-otw.log`, `chain116-luvdia.log` |
| `pnpm drizzle:generate` | exit0, **No schema changes**. `no-diff.log` |
| `node scripts/d1-doctor.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw --skip-api --skip-remote` | exit0, blocking failure 없음. `ui-doctor116.log` |
| `pnpm typecheck:test` | 첫 test의 Testing Library `exact` 옵션 TS2769/exit2 (`types.log`), 옵션 제거 후 exit0 (`types-final.log`), 0116 후 exit0 (`types116.log`), 마지막 normal URL 순서 수정 후 exit0 (`types-final-spelling.log`). 마지막 history 수정은 SQL literal/assertion만 변경 |
| `pnpm architecture:check` | exit0 (`architecture.log`), 신규 port/app composition 경계 허용, checker/rule 예외 추가 없음 |
| changed TS/TSX 파일의 `pnpm exec eslint $owned` | 첫 Windows wrapper가 전체 array를 한 pattern으로 합쳐 exit2; 검사 수행 아님 (`lint.log`). `node node_modules/eslint/bin/eslint.js @taskOwned`로 같은 명시 파일을 검사하여 exit0 (`lint-corrected.log`). 마지막 resolver/AA 두 파일 각각 재검사 exit0 (`lint-final-spelling.log`, `lint-final-history.log`) |

Validate-only의 selected persist 절대 경로가 repo `.tmp/` 안임을 확인했다. Script가 생성한 `%TEMP%/otw-d1-reset-*`의 자체 temp state만 정리하며 기존 task UI/source/legacy DB를 reset/move하지 않는다. Populated regression은 0112→0113/114와 별도 populated0114→0115/116 경계를 한 test에서 실제 D1로 적용했다. 끝의 의도적 invalid SELECT가 whole migration batch를 rollback하여 old raw/index를 보존했고, 성공 apply 후 raw 전체 row가 같고 authority index만 `/`로 거부 표현이 되며 FK 위반은 0이었다.

`preservation.json`/`preservation-corrected.log`는 FIX_BASE의 기존 drizzle SQL/snapshot **227개가 Git canonical bytes 기준 동일**함과 legacy4 실제 size/SHA 동일을 기록한다. 첫 readback helper의 `git show` 기본 1MiB buffer가 0112에서 ENOBUFS/exit1이었고 16MiB read-only buffer로 교정 후 exit0였다(`preservation.log` 원래 오류 유지). 기존0000–0114 SQL/snapshot을 수정하지 않았다. Journal만115/116 append다. Legacy hashes는 위 fix1의 네 값 그대로다. Private config/env/source data에 쓰지 않았다.

Final116 actual file-index ordinary write cost는 unrelated0/1000에서 reads **296/300**, writes **1/1**이었다. 0115 회차의256/260에서 고정40 reads가 증가했다. 같은 active value edit는 15 statements/88 reads/17 writes로 unchanged이며, 실제 SQL compile/normal DELETE/active capture/cleanup 및 fence cases가 통과했다. 보관량/Worker 호출/D1 quota·운영 비용 gate는 미해결 운영 준비 항목이다. 관측용 추가 DB write나 site/key 전체 pause를 넣지 않았다.

### Self-review와 남은 한계

현재 소스에서 accepted authority → same-site admin route → trusted row/draft → final classifier/Blob 또는 normal external → 실제 UI/readback을 다시 추적했다. I4는 current와 sealed history의 공통 정규화, canonical generated SQL, exact raw/index, freeze rollback 및 source 정상 작업을 함께 확인했다. N1은 실제 UID validator를 재사용했고 id/raw mismatch, draft ownership 변경, archived/history raw, caller bool, cross-site resource, foreign Bearer 경계를 확인했다. Self-review 중 발견한 normal URL spelling과 serialized historical JSON 결함은 위 실제 RED/GREEN으로 수정했다. 증거에 맞춰 fixture를 교정했으며 fixture를 새 권한으로 삼지 않았다.

이번 fix2의 소유 코드 27개를 명시적으로 staging한 뒤 `git diff --cached --check`는 exit0(`staged-check.log`)지만 **전체 Task4.3 pristine 의미가 아니다**. 기존 적용0112:513/542(M1), 0114:523/553(N2)의 네 공백 줄은 그대로 남고 이전 전체 범위 exit2도 유지된다. 새115/116 generator 출력의 trailing whitespace만 생성 시 제거하여 기존 적용본을 고치지 않았다. Pool teardown timeout 경고, local busy snapshot 첫 UI 실패, 중간 setup/type/lint/readback helper 오류는 위에 따로 보존했다.

Production build는 기존 Clerk public key/issuer identity 불일치로 artifact 생성 전 실패한 상태 그대로이며 다시 실행하거나 private 입력을 수정하지 않았다. 실제 LuvDia app/domain/login, production identity/body/binding/cache/account/quotas, 운영 이관·activation은 미실행이다. FullTask4 및4.4/4.5는 미완료다.

운영 upload 사고는 별도 미해결이다. 이 writer의 fix2 remote IO는0이며 root의 이전 승인7 GET 외 새 권한은 사용하지 않았다. 그 GET은 현재 input hash/size 일치와 마지막 저장 시각만 확인했고 사고 전 bytes/version, GET에 없는 upload-version, 실제 CDN/사용자 영향은 unknown이다. Local PASS로 사고를 종결하지 않는다. Root SUL/incident/ledger 및 unrelated AI docs는 staging에서 제외한다.

### 최종 자체 검토 보완 — decode 오류 소거 (10/15 00:26 이후)

종료 전 두 반례 `/%GG%2f..%2fprofile/bing_hayu.webp`, `/%ff%2f..%2fprofile/bing_hayu.webp`를 발견했다. Owning `decodeURIComponent`는 `URI malformed`로 거부하지만 0116 SQL은 잘못된 escape/UTF-8 상태를 잃고 뒤의 dot 처리에서 `/profile/bing_hayu.webp`로 만들었다. Memory SQLite 비교는 supporting(`final-decode-diagnostic.log`)이며, 실제 D1 parity에서 00:27:19 **1 FAIL/16 skip/exit1**, allow1 대 reject0의 intended RED를 따로 확보했다(`final-decode-red.log`). Controller는 같은 I4 current/history 권한 일관성 범위임을 확인했다.

최종 helper는 decode CTE에 UTF-8 상태를 유지한다. 작은 상수 CTE의 16개 byte-range 전이로 정상 ASCII/2·3·4-byte sequence, E0/ED/F0/F4의 범위 제약을 구분하고 malformed escape, overlong/surrogate/out-of-range/incomplete sequence는 최종 path 단계에 도달하지 못한다. 새 business table/manifest/authority는 없다. 첫 URL parse에서 이미 제거된 malformed segment와 정상 UTF-8가 두 번째 dot 처리에서 제거되는 경우는 owning parser처럼 허용한다. 원래 raw, 승인 plan/receipt, source 작업 권한은 유지한다.

단일 raw 및 decoded scalar를 담는 `p`/`e` CTE에만 `AS MATERIALIZED`를 사용한다. 이 두 경계는 UPDATE의 old/new trigger 확장 때 같은 작은 식이 반복 inline되는 것을 막는다. 전체 business snapshot을 materialize하거나 관측 write를 추가하지 않는다. 적용된0115/0116은 그대로 두고 정상 `pnpm drizzle:generate:custom --name asset_file_decode_validity` 및 `.tmp/sul36-fix2-decode-capture.ts` owning generator로 **0117**을 생성했다. UI/selected-chain에 적용되기 전 unshared0117 초안만 수정했다.

원래 실패도 보존한다. 첫 CASE 버전은 `,CASE` 앞 whitespace가 없어 Wrangler splitter가 CASE 시작을 인식하지 못하고 END만 세어 **562 queries**로 잘랐다. `decode-green.log`와 `decode-green-corrected.log` 각각 두 suite 실패/88 skip/exit1, `d1-final117.log`는 6 files 실패/1 test FAIL/121 skip/exit1이다. 후자는 앞 focused 결과를 확인하기 전에 시작한 불필요한 회차였으며 제품 PASS가 아니다. 실제 분할된 전체 SQL은 `.tmp/sul36-fix2-split117.json`에 보존했다. 공백 수정 뒤 정상 분할은484 SQL statements(지원 apply는 migration bookkeeping 포함485)였다.

그 다음 큰 CASE와 작은 lookup 각각은 SQL/parity/current test는 통과했으나 corrected-history의 정상 notice UPDATE가 `SQLITE_NOMEM`으로 실패했다. 두 회차 각각 **9 PASS/8 FAIL/71 skip/exit1**, `decode-green-final.log`(00:32:32), `decode-lookup.log`(00:34:27)이다. 실패한 lookup 전체 SQL은 동일 generator 출력에서 위 두 materialization keyword만 되돌려 `.tmp/sul36-4-3-fix2-0117-lookup-nomem.sql`로 재구성해 남겼다. 이를 원래 실행 파일의 독립 byte snapshot이라고 주장하지 않는다. 최종 두 scalar 경계 후 실제 owning source UPDATE와 fence 경로가 함께 통과했다.

| 실제 명령/회차 | 최종 결과 / prefix `.tmp/sul36-4-3-fix2-` 로그 |
| --- | --- |
| `pnpm exec vitest run --config vitest.worker.config.ts FR CT -t "SQL URL identity\|fix2 rejects an authority"` | 00:35:18 **17 PASS/71 skip/exit0**, `decode-materialized.log`. Current/history 각8입력의 원래 journal/control rollback 및 다음 정상 source commit 포함. Supporting parity만으로 대체하지 않음 |
| `pnpm exec vitest run --config vitest.worker.config.ts CT SC FR AV RT AA` | 00:36:31 **6 files/122 PASS/exit0**,131.10s, `d1-final117-corrected.log`. 새로운 populated0116→117 실패 batch rollback/성공 raw 보존, ordinary UPDATE/DELETE/cleanup, baseline/early copy/final proof 포함. Pool teardown timeout 경고3개 유지 |
| `pnpm exec vitest run worker/features/content-transition/infrastructure/file-inventory-statements.test.ts` | 최종 lookup/materialization generator parity **1 PASS/exit0**, `parity117-final.log`;241 create statements, max94,554bytes |
| `pnpm typecheck:test` | exit0, `types117.log`. 이후 변경은 같은 typed SQL string 안의 lookup/materialization이며 포트/type 변동 없음 |
| `node node_modules/eslint/bin/eslint.js worker/platform/url-path-sql.ts FR CT SC worker/features/content-transition/infrastructure/file-inventory-statements.test.ts` | 최종 5파일 exit0, `lint117-final.log` |
| `pnpm drizzle:generate` | 새117 후 No schema changes/exit0, `no-diff117.log` |

위 표의 FR/CT/SC/AV/RT/AA는 앞 절의 동일 전체 경로다. Supporting parity 배열은 valid UTF-8 각 boundary와 malformed/overlong/surrogate/out-of-range/incomplete, 첫 parse에서 제거되는 malformed segment, 기존 encoded authority/control/path cases를 포함한다. 최종 ordinary index 비용은 unrelated0/1000에서 **304/308 reads,1/1 writes**(116보다 고정8reads 추가), active value edit는 여전히15 statements/88reads/17writes, protect18 statements/4,264reads/72writes다. 운영 비용 gate는 유지한다. UI/타입/API 등 변경 없는 broad 영역은 다시 반복하지 않았다.

지원 CLI는 actual Worker tests와 별도로 검증했다. `node scripts/d1-reset-local.mjs --site=<otw|luvdia> --persist-to=.tmp/sul36-task43-fix2-chain117-<site> --validate-only`의 첫 OTW 시도는0062에서, 두 번째는0005에서 Wrangler `bad port`/exit1로 중단됐다(`chain117-otw.log`, `chain117-retry-otw.log`); LuvDia는 그 두 회차에서 시작하지 않았다. 원래 Wrangler 로그는 `wrangler-2026-10-14_15-36-47_308.log`, `wrangler-2026-10-14_15-38-13_626.log`다. Stack은 Wrangler migration handler `cli.js:225890:19`에서 errorNotes를 전달했고 실제 실패 URL/port는 로그에 없었다. 이를 새117 SQL 오류나 통과로 단정하지 않았다.

진행 중 Vitest가 종료된 뒤 같은 지원 entry의 마지막 순차 실행은 **OTW/LuvDia 각각117 migrations 실제 apply/검증, exit0**였다(`chain117-final-otw.log`, `chain117-final-luvdia.log`). 마지막 실행은 process-local `WRANGLER_SEND_METRICS=false`도 지정했다. 이 설정이 bad-port 원인을 고쳤다고 주장하지 않으며 정확한 초기 port 원인은 미격리다. 세 번째 실행 이후 추가 재시도나 기존 private/config/Vite 변경은 없었다. Validate-only 자체 temp DB만 사용하고 source/legacy/UI reset은 하지 않았다.

`node scripts/d1-migrate-local.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw`는 기존 UI fixture에117만 **485 commands/exit0**로 적용했다(`ui-migrate117.log`). 같은 genuine Chrome tab/profile에서 reload→id6 정상 수정→external preview complete480×479→`수정 저장`을 수행했고 00:43:55에 성공했다. 이번117 저장은 첫 시도에 성공했다. 목록에서 id6 external과 id5 archive Blob을 함께 열어 둘 다 complete480×479를 확인했다. 최초 automation의 `getByLabel`은 summary의 실제 label 속성이 없어 no-match였고 DOM을 읽어 실제 visible summary text로 클릭했다. 제품/인증 실패나 fallback은 없었다.

`node .tmp/sul36-fix2-ui117-readback.mjs`는 위와 같은 validated selected-local/remoteBindings:false D1/R2 읽기만 수행했다(exit0). `ui117-readback.json/log`에서 migration117, id6 normal/[9102]/raw/index, id5 archive/raw/index, transition0과 원래 R2 bytes31,446/SHA`3632eaf6…ad10d`/version`40d86c4a175f7a62ee301e7d8d39b0c4`를 재확인했다. Controlled external 요청은 최종19건 모두 Authorization 없음. 실제 browser 관찰은 `ui117-browser.json`/`ui117.jpg`이며 SVG icon처럼 이미지 body가 없는 role=img 항목은 성공 이미지 수에 포함하지 않았다. Fixture용 Vite91626과 localhost5189 image server68014/PID52460은 reviewer가 같은 정상 흐름을 열 수 있도록 유지했다. 다른 process/private 입력은 건드리지 않았다.

[0117 이후 정상 저장과 두 이미지 표시 — 로컬 보관 안내](../../../docs/archive/documentation-reconciliation-2026-10-21.md#로컬-스크린샷-2개)

보존 재확인 첫 helper는 이전 proof의 **raw SHA**에 LF-normalized bytes를 잘못 비교하여178개 false-negative/exit1이었다(`preservation-final117.log`). 파일을 바꾸지 않고 raw-to-raw 비교로 교정한 `preservation-final117-corrected.json/log`는 **227개 기존 SQL/snapshot 실제 bytes 동일, legacy4 실제 size/SHA 동일, exit0**다. 이전 FIX_BASE canonical equality 증거와 함께 유지한다. 0115/0116의 마지막 쓰기 시각은 각각10/14 23:42:00,10/15 00:06:29 KST 그대로이며 이후 재작성하지 않았다. Final117의 own generated SQL/snapshot/journal만 추가됐다.

최종 코드 commit은 **`0d527b338905c18232328048cb35bcc5a108845c`**다. `.tmp/sul36-4-3-fix2-owned-code.txt`의27개 파일을 명시 staging하고 실제 staged 목록과 exact 비교했다. Shared contract1, 새SQL3/snapshot3/journal1, notice form/manager 각코드·test, hook/sharedimage·test, app composition/route regression, assets port/context parser/handler/resolver/recovery test, transition current-history/populated/generator tests, existing notice UID validator, shared SQL helper만 포함한다. Root SUL/incident/ledger/plan/spec 및 unrelated AI docs, private/.tmp/.wrangler는 포함하지 않았다. Staged diff-check는 exit0이고 이전 적용0112/0114 whitespace concern은 여전히 별개다.

최종117 UI fixture의 `node scripts/d1-doctor.mjs --site=otw --persist-to=.tmp/sul36-task42-ui-otw --skip-api --skip-remote`는 **exit1**, 아래 정정 기록의 다섯 schema-query 실행 실패다(`ui-doctor117.log`). 마지막 tail만 보고 쓴 `320d107`의 exit0 표기는 잘못이므로 철회한다. 최종 자체 검토는 새 decode 전이/단일 scalar 경계, raw·current/history·final fence 일관성, trusted notice/draft와 기존 strict profile 소비자, Bearer 목적지, UI save/readback, migration bytes 및 explicit staging을 확인했다. 이 보고서만 별도 evidence commit으로 인계한다. 추가 remote 운영 IO·Task4.4·새 reviewer는 실행하지 않았다. 기존 운영 사고/production build/실제 LuvDia 인증 미확인과 applied whitespace, 초기 bad-port 원인 미격리는 위 기록대로 남는다.

**DONE_WITH_CONCERNS: Task4.3 fix round2 구현 및 실제 로컬 증거 인계. Controller 재리뷰 대기이며 전체 Task4는 미완료다.**

### doctor117 종료코드 정정 (10/15 00:47 이후)

`ui-doctor117.log`의 마지막 `[ok]` 항목만 보고 exit0로 문서화한 것이 잘못이었다. 실제 process 반환은 **exit1**이며 `music_channels`, `music_channel_entities`, `music_public_performance_sort_keys`, `music_performance_sources`, `music_search_grams` 다섯 `PRAGMA table_info` child 실행이 실패했다. Migration pending0 및 다른 항목 PASS와 별개이며 전체 doctor PASS를 철회한다. 코드27파일 commit의 실행 의미나 양쪽 validate-only117/122tests/실제UI readback PASS를 이 잘못된 표기로 증명하지 않는다.

원래 해당 다섯 Wrangler 로그를 `.tmp/sul36-4-3-fix2-doctor-original/`에 복사 보존했다. 파일 suffix는 `15-45-23_983`, `25_175`, `32_633`, `33_793`, `41_332`이고 모두 `wrangler-2026-10-14_*.log`다. 각 로그는 selected `wrangler.jsonc`, local `otw_db`, `.tmp/sul36-task42-ui-otw/v3/d1` 실행까지 도달했으나 오류 stack/URL/port나 query 결과가 남지 않았다. 따라서 최초 runtime 실패 원인을 bad-port, schema mismatch 또는 stdout JSON parser 결함으로 확정하지 않는다. Doctor의 `run`은 child의 실패 code/stdout/stderr를 받지만 `summarizeCommandFailure`가 합친 output의 첫 nonempty 줄만 반환하므로 Wrangler banner가 표시되었다. 정상 반환 후 JSON을 파싱하는 분기 실패와는 다르다.

전체 doctor를 반복하지 않고 다음 동일 selected-local metadata 명령만 실행했다: `node node_modules/wrangler/bin/wrangler.js d1 execute otw_db --local --persist-to=.tmp/sul36-task42-ui-otw --command "PRAGMA table_info(music_channels); PRAGMA table_info(music_channel_entities); PRAGMA table_info(music_public_performance_sort_keys); PRAGMA table_info(music_performance_sources); PRAGMA table_info(music_search_grams);" --config wrangler.jsonc`. **exit0/5 commands 성공**(`doctor-five-query.log`). 결과의 실제 column names를 기존 `scripts/d1-doctor-core.mjs`의 `REQUIRED_D1_COLUMNS`와 비교해 다섯 모두 missing[]였다(`doctor-five-readback.json`). 이는 현재 schema 일치의 실제 읽기 증거이며 원래 전체 doctor 실행 성공을 대신하지 않는다.

이 readback 보조 parser의 첫 실행은 Windows CRLF인데 `[\n`만 찾은 문자열 처리로 JSON EOF/exit1이었다(`doctor-five-readback.log`); 저장된 동일 출력의 CRLF를 정규화한 뒤 exit0(`doctor-five-readback-corrected.log`)이다. D1/제품 parser를 바꾸거나 재실행 결과를 조작하지 않았다. 원래117 doctor 실패와 그 원인의 미격리를 최종 concern으로 유지한다.

Controller는 schema 차이0 및 해당5-query exit0과 원래 전체 doctor exit1을 구분해 **DONE_WITH_CONCERNS**로 인계하도록 결정했다. 이번 fix와 무관한 기존 doctor diagnostics의 exit/signal/stderr 전달 개선은 추가하지 않았다. Root가 ledger/Task5 selected-tooling에 연결하며 **최종 doctor gate는 Task5에서 열린 상태**다. 두 supported117 chain, 실제 UI,122PASS를 doctor PASS로 바꾸지 않고, 진단 보완만으로 child 실패가 해결됐다고 주장하지 않는다. 추가 전체 검사는 실행하지 않았다.
