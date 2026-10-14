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
