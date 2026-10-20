> **완료된 로컬 구현·검증 원문:** 본문의 미배포·미커밋 표기는 당시 상태다. 후보01~03은 PR #176에서 병합·양 사이트 반영을 완료했다. [최신 검토 결과](../../../architecture-review.md)와 [최종 운영 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/176#issuecomment-6291519609)를 먼저 읽는다.

# Play 카탈로그 저장 재시도 검토 지적 수정

기준: `b2be7c7e1f976a8702eb9fa386186ada0f28ed82`에서 분기한 `codex/play-catalog-retry`의 로컬 미커밋 변경. 구조 검토의 **후보 01 후속 점검**에서 확인한 저장 재시도, 실제 충돌 복구, 미사용 보조 함수만 수정했다. 다른 구조 후보를 구현하거나 운영에 반영한 기록이 아니다.

## 재현과 수정

- 기존 Worker의 실제 fetch 진입점에서 서명 JWT 인증→관리자 권한→카탈로그 서비스→D1을 통과시켰다. 같은 키·입력으로 저장 후 재전송하면 기존에는 `201→409`, 동시 요청은 `201/409`였다. HTTP가 검증한 키를 실제 서비스 factory가 버리는 것이 원인이었다.
- `music_admin_command_results`에 사이트·인증된 관리자·요청 키, 메서드·경로·쿼리 순서·입력의 SHA-256, 성공 상태와 저장 당시 결과를 보관한다. 현재 인증을 먼저 확인하고 완료 결과를 반환한다. 같은 키의 다른 의도는 `PLAY_ADMIN_IDEMPOTENCY_CONFLICT` 409다. JSON 객체 필드 순서 변경은 동일 입력으로 취급하고 배열·중복 쿼리 매개변수 순서는 보존한다.
- 업무 쓰기·카탈로그 revision·이벤트·완료 결과를 같은 D1 batch에 넣었다. 완료 결과의 unique 충돌이나 저장 실패는 해당 batch 전체를 롤백한다. 경쟁 요청은 이미 완료된 결과를 다시 읽는다. 별도 잠금·실행 큐·복구 작업은 추가하지 않았다.
- 기존 scoped catalog SQL과 DTO 변환을 공유해 관련 행의 저장 당시 snapshot만 기록한다. 이후 수정·삭제가 있어도 첫 응답을 복원한다. entity/song/channel/performance CRUD, 게시·철회, 통합 등록과 제안 승인·거절을 포함한다.
- 이미 승인된 제안을 재확인하는 기존 성공 분기는 별도로 결과만 보관한다. 독립 리뷰에서 새 코드의 `503` 회귀를 발견했고 실제 HTTP 실패를 먼저 재현한 뒤 수정했다. 업무 데이터·revision·이벤트는 다시 쓰지 않는다.
- 등록 화면에서 진짜 `PLAY_ADMIN_STALE_WRITE`를 받으면 입력을 유지하고 저장을 막는다. `영상 다시 확인`으로 기존 catalog refresh·preflight를 실행하고 새 revision으로 검토·저장한다. 일반 실패는 동일 입력의 요청 키를 유지한다.
- 전체 활성 소스·테스트·스크립트·계약·설정의 호출자를 확인한 뒤 `prepareCandidateConversion`, `createConvertedCatalogEntry`, `parseVideoCatalogMutation`, `videoCatalogReads`, `parseVideoReadCommand`, `videoCatalogReferences`와 미사용 parser 보조 코드를 삭제했다. 살아 있는 candidate parser·검증·D1 저장 소유권은 유지했다. 의존성 추가는 없다.

## 검증 범위와 결과

Node `24.20.0`, pnpm `11.7.0`을 사용했다. 실패를 숨기기 위한 제외·시간 제한 확대·정책 완화는 하지 않았다.

| 경로/검사 | 결과 |
| --- | --- |
| 실제 Worker fetch + JWT 검증 + 전체 migration D1 | 6개 통합 사례 PASS. 응답 유실·동시 재시도·키 범위·401/403·다른 의도 409·원자 롤백·CRUD·삭제 후 재전송·게시/철회·승인/거절/승인 재확인 포함 |
| 완료 요청 재전송 계측 | 실제 D1 wrapper에서 추가 `rowsWritten=0`, JWKS/YouTube 추가 외부 호출 0 확인 |
| 기존 D1 catalog 소유 모듈 | 27개 integration 사례 PASS. 조회 범위·게시 정책·참조 보호·원자 저장 유지 |
| UI·API·HTTP handler·서비스 | 117개 사례의 합성 검증 PASS: 최초 112개 통과 + 시간 초과 UI 5개만 다른 작업 종료 후 단독 재실행해 전부 통과(2.24~3.20초). 단일 전체 명령의 일괄 통과로 표기하지 않음 |
| 타입 | `pnpm typecheck:test`의 test/worker/node 세 구성 PASS |
| 린트 | 변경 코드 검사에서 catch 변수 재할당 1건 수정 후 해당 파일·새 통합 테스트 재검사 PASS. 나머지 변경 코드 지적 0건 |
| 구조·공백 | `pnpm architecture:check`, `git diff --check` PASS |
| 양 사이트 빌드 | OTW·LuvDia 정식 `build-site.mjs` 및 artifact manifest PASS. 원래 checkout의 공개 Clerk 배포 identity만 프로세스 환경으로 선택해 사용. 비밀키 복사·배포 없음 |
| 전체 migration 검증·doctor | 148개 migration 실제 적용·순서 일치·bootstrap 정리·FK 검증 PASS. `--validate-only`로 기존 로컬 D1 보존. 별도 신규 `.tmp/catalog-retry-d1-doctor-20261020`에도 전체 체인 적용 후 `d1:doctor --schema-only` PASS: pending 0, 신규 완료 기록 테이블의 모든 필수 열 확인. 최초 0123 단계의 Wrangler `bad port` 실패 후 같은 명령 재시도로 통과 |
| 독립 코드 리뷰 | 승인 재확인 회귀 수정 후 잔여 actionable finding 0건. 정적 판정이며 실행 검증을 대체하지 않음 |

실행 명령은 다음과 같다. 모든 Vitest 실행은 Node 24.20.0으로 수행했다.

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.all.config.ts --project=worker-schema worker/app/admin-catalog-replay.integration.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.all.config.ts --project=worker-integration worker/features/otw-play/infrastructure/d1-admin-catalog-repository.integration.test.ts
node node_modules/vitest/vitest.mjs run worker/features/otw-play/http/admin-catalog-handler.test.ts worker/features/otw-play/application/admin-catalog-service.test.ts src/features/otw-play/ui/admin/catalog-manager.test.ts src/features/otw-play/api/admin.test.ts --maxWorkers=1
pnpm d1:reset:local -- --validate-only
pnpm d1:reset:local -- --persist-to=.tmp/catalog-retry-d1-doctor-20261020
pnpm d1:doctor -- --persist-to=.tmp/catalog-retry-d1-doctor-20261020 --schema-only
```

UI 재검증은 위 4파일 실행의 JSON 결과에서 실패한 5개 이름만 `--testNamePattern`으로 선택하고 동일 `--maxWorkers=1`·기본 5초 제한을 사용했다. `.tmp/catalog-retry-unit-final.json`과 `.tmp/catalog-retry-ui-recheck.json`을 파일·사례 이름으로 합쳐 117개 전부의 통과를 확인했다. HTTP/D1 결과를 포함한 고유 사례는 **150개**다. 중간 혼합 project 실행의 테스트 수 0은 통과로 계산하지 않았다.

통합 테스트는 업무 저장을 mock하지 않는다. 외부 Clerk JWKS와 YouTube 응답만 고정했으며 실제 외부 계정·YouTube 가용성이나 운영 인증 화면을 검증한 것은 아니다. 모든 fixture 요청은 허용한 두 외부 경로 외에는 실패하도록 제한했고 AI는 false다. HTTP 통합은 Worker의 실제 `Request/Response` 진입점을 호출하며 별도 네트워크 서버에 배포하지 않았다.

## 적용과 남은 한계

- Drizzle로 생성한 `0148_soft_power_pack.sql`은 새 테이블 하나를 추가한다. SQL·`0148_snapshot.json`·journal·schema를 함께 다뤄야 한다. 기존 테이블·데이터·migration 이력 삭제는 없다.
- **운영 반영 전 양 사이트 D1에 0148을 먼저 적용해야 한다.** 새 Worker만 먼저 배포하면 키가 있는 관리자 쓰기가 완료 기록 테이블을 찾지 못한다. PR·병합·원격 migration·배포는 이번에 실행하지 않았다.
- 정상 쓰기는 완료 기록과 PK 인덱스의 저장 비용이 추가된다. 완료 재시도는 PK 조회만 수행하며 업무 재저장·외부 호출이 없다. 미래 DTO/receipt 형식 변경 시 기존 완료 기록의 해석도 함께 보존해야 한다.
- 운영 관리자 브라우저에서 새 코드를 실행하거나 실제 운영 응답 유실을 발생시키지 않았다. 운영 D1 요청/쓰기·중지된 Play 자동화·LuvDia AI=false·유료 AI 상태 변경이 없다.
- 기존 로컬 DB와 원래 checkout의 대량 미커밋을 보존했다. 검증 DB·빌드·로그는 task-owned ignored 경로에만 둔다. `.agents/skills` 5개와 `src/routeTree.gen.ts`의 기존 줄바꿈 차이는 이번 의미 변경에서 제외했다.
- 전체 preflight·전체 테스트는 실행하지 않았다. 이번은 로컬 수정 범위 검사이며 PR 병합 준비 단계가 아니다.
