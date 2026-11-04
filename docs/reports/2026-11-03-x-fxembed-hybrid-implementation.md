# FxEmbed 혼합 수집 구현·검증 — 2026-11-03

FxEmbed 기본 수집, 독립된 공식 X 보강, 계정별 장애 전환, 웹훅 Disabled 보존을 구현했다. **양 사이트의 로컬 관리자 정상 경로에서 실제 Fx 응답으로 새 게시물 232건을 저장하고 공개 카드를 확인했다.** 운영 배포·원격 migration·운영 구독 중단은 수행하지 않았다. 실제 공식 보강 주기와 비용 절감액은 운영 전환 후 확인할 항목이며, 전체 운영 완료로 보고하지 않는다.

- 계획: [승인된 구현 계획](../superpowers/plans/2026-11-03-x-fxembed-hybrid.md)
- 설계 근거: [혼합 구성 검토](../research/2026-11-03-x-fxembed-hybrid-review.md), [기존 실제 조회 결과](2026-11-03-x-alternative-live-test.md)
- 작업 공간: `C:/Users/rlatm/.codex/worktrees/x-fxembed-hybrid/overthewall-schedule`
- 브랜치: `codex/x-fxembed-hybrid`; 기준 `fbdf9a03`; 주요 구현·수정 `a3bacb81`, `deac138e`, `79d9791c`, `ae86e3c`, `d1db17b2`, 계약 테스트 `0a6d65c1`, 최종 주기 readback `909be4da`.
- 환경: Node 24.20.0, pnpm 11.7.0. 의존성·lockfile 추가 변경 없음.

## 구현된 동작

Fx는 30분마다 확인하고 공식 API는 별도 커서로 24시간 정기 대조한다. 계정별 공급자 실패 2회에 공식 2시간 fallback을 켜며, Fx 조회·저장 성공 2회에 해제한다. 미완료 공식 페이지를 먼저 재개하고 공통 UTC 하루 $1 목표·사이트 한도·backoff·D1/Queue 보호를 그대로 통과한다.

저장은 공식 → 웹훅 → Fx 필드 우선순위를 적용한다. 불완전한 응답이 기존 본문·첨부·관계를 지우지 않는다. 같은 Fx 내용이나 지표만 바뀐 응답은 게시물·facts·references를 다시 쓰지 않는다. 숨김·redaction·공개 제한을 우선하며, revision과 기존 JSON을 비교해 동시 갱신을 방어한다. 보조 참조 기록까지 완료한 뒤 content hash를 확정하므로 실패한 페이지의 재시도가 누락된 보조 기록을 복구한다.

Fx는 고정 호스트와 설명적인 앱 User-Agent를 사용하고 X 인증을 전달하지 않는다. handle·신뢰 계정 ID를 대조하고 다른 작성자 문맥·리포스트·중복을 걸러낸다. 매번 head를 확인한 뒤 기존 cursor를 이어 읽으며 계정당 최대 4페이지다. 비정렬 응답의 오래된 ID만으로 종료하지 않는다. 활성화 이전 글의 일반 백필을 추가하지 않았다.

관리자는 `GET/PATCH /api/x/collection`과 기존 수동 실행 경로에서 제어한다. 기본 설정은 `x_api`이므로 배포·migration만으로 전환되지 않는다. 전환은 예산 초기화 → Disabled 저장 → 소유 원격 구독 중단·부재 확인 → Fx 기본 설정 저장 순서다. 실패를 성공으로 표시하지 않는다. 혼합 모드의 웹훅 start/resume은 409이며, 공식 기본 모드로 복귀해도 Disabled를 유지한다. CRC·인증·설정·이력·명시적 재활성화 기능은 남는다.

## 실제 로컬 경로와 authoritative readback

실제 브라우저의 정상 관리자 로그인과 제어 화면을 사용했다. 직접 endpoint 호출로 인증·관리자 동작·작업 orchestration을 대체하지 않았다.

`관리자 → PATCH 기본 수집원 → Disabled/예산 확인 → 기본 수집원으로 실행 → native Workflow → Queue → Fx 실제 HTTP 응답 → 공통 병합 저장 → 공개 /feed`

2026-11-03 15:40 KST의 로컬 D1·공개 API readback:

| 항목 | OTW | LuvDia |
|---|---:|---:|
| 허용 계정 | 5 | 3 |
| 실제 새 Fx 저장 | 80 | 152 |
| 보존한 기존 게시물 | 258/258 | 258/258 |
| 기존 공식 진행 상태 | 변경 없음 | 변경 없음 |
| 실제 조회·저장 정상 계정 | 4 | 3 |
| 공급자 오류 | `otw_ate` HTTP 404 | 없음 |
| 미완료 cursor | 5 | 3 |
| 실행 최종 상태 | partial | partial |
| 공개 API 상태·중복 없는 ID | 200 · 60/60 | 200 · 40/40 |
| 기본 수집원·웹훅 | Fx · Disabled | Fx · Disabled |

- OTW run: `1f922885-9af1-45ba-9488-0df4cb25189e`; LuvDia run: `a8b795b4-7d5b-4afa-9768-c2c89ca0b3e9`.
- 실제 카드: OTW `2117272243277549973`, LuvDia `2117266214708007061`. 본문·답글 링크·첨부·인용 표시를 실제 공개 화면에서 확인했다.
- 공식 상태 비교 대상은 `last_seen_post_id`, `last_success_at`, `collection_started_at`, 공식 pagination/base/newest 필드 전체다. 기존 값과 동일했다.
- 공통 원장: 2026-11-03 UTC, 한도 1,000,000µ, 사용 0, 예약 0. 양 사이트 당일 X 유료 조회 이벤트 0. 이는 로컬 원장 증거이며 실제 청구 감소액의 증거는 아니다.
- 양 사이트 central control은 `enabled=0`, `pause_reason=hybrid`, `last_error=NULL`; 로컬 소유 활성 구독 0이다. 복원본에는 기존 원격 소유 구독이 없었으므로, **운영의 기존 유료 구독을 실제 중단했다는 증거로 사용하지 않는다.**
- partial은 4페이지 한도 뒤 남은 탐색을 보존한 결과다. `last_success_at`과 전체 탐색 완료 시각을 구분했고, 진행 중인 cursor를 완료로 정규화하지 않았다.
- `otw_ate`는 수정 전 UA 401과 이어진 공급자 404로 연속 실패 2·fallback 1이 기록됐다. 다른 계정은 실패 0·fallback 0이다. 이 로컬 상태로 공식 유료 fallback을 강제 실행하지 않았다.

### 검증 환경 준비와 테스트 영향

원본 저장소의 DB를 수정하지 않고 SQLite backup으로 격리된 기존 이력을 복원한 뒤 0161까지 증분 migration했다. 실제 신규 글은 모두 위 수집 경로가 저장했다. 게시물·계정 ID·공식/Fx cursor·성공 시각을 SQL로 주입하지 않았다.

초기 LuvDia 로컬 DB의 `local_sora/local_mina/local_noa`는 개발 fixture였다. 이를 실제 멤버로 오인한 복원 준비는 ID 검사에서 **변경 전에 실패**했다. 이후 실제 공개 `/api/members`의 `bing_hayu`, `yang_mei`, `u_lili`와 역사 데이터의 code·X URL 일치를 검증했다. 멤버 API에 쓰기 기능이 없어, 로컬 환경 준비에서 다른 사이트의 멤버 5명만 deprecated로 표시해 실제 LuvDia 허용 목록을 복원했다. 이 설정 복원은 실제 수집·인증·제어 경로의 성공 증거를 대신하지 않는다. 이전 로컬 DB와 원본 DB는 보존했다.

공식 API의 Fx 미발견 글 독립 발견·중복 방지, 계정별 2실패/2성공 전환, 경합·저장 실패·UTC 이월·권한·타사이트 경계·원격 중단 실패·재활성화는 실제 D1 및 native Workflow/Queue 통합 테스트로 확인했다. 이 테스트의 외부 공식 응답은 fixture다. 알려진 ID lookup을 공식 타임라인 복구 증거로 대신하지 않았으며, 실제 유료 타임라인 대조는 추가로 강제하지 않았다.

## 발견한 실패와 수정

1. 실제 Worker Fx 요청은 처음 모두 401이었다. 공개 API가 빈 User-Agent를 거절한다는 응답을 확인했다. Node는 기본 UA를 넣어 사전 조회에서 숨겨졌던 차이였다. 설명적인 `OTWSchedule/1.0 (+https://otw-schedule.info)` 헤더를 추가하고 경계 테스트 RED→GREEN 후 같은 관리자 경로에서 실제 저장·카드를 다시 확인했다.
2. 공식 응답이 비면 기존 Fx 카드 ID가 공식 완료 커서로 승격될 수 있었다. 공식 진행 상태와 이번 공식 응답만 커서 근거로 사용하도록 수정했다. legacy 응답 cache도 커서 근거에서 제외했다.
3. 같은 regular shard의 A 완료·B 실패가 A의 정기 완료까지 막았다. 계정별 실제 완료와 해당 계정의 보강 오류로 판단해 다음 자격에서 완료 A를 재구매하지 않도록 수정했다. B의 backoff는 그대로 보존한다.
4. 참조 기록 실패 뒤 동일 본문 재시도가 보조 쓰기를 생략할 수 있었다. sourced NULL content hash를 미완료 표식으로 사용하고 최종 기록 이후 확정한다. 정상 replay의 쓰기 0은 유지한다.
5. 불완전한 타임라인 응답에서 기존 글의 회복된 인용 preview가 저장되지 않았다. 공식 보강이 같은 알려진 관계의 빈 preview만 채우도록 하고 다른 필드의 권한은 승격하지 않았다.
6. 혼합 모드에서도 일부 기존 운영 readback이 저장된 2시간 설정을 표시했다. 원래 설정은 보존하면서 공식 상태는 24시간, 일반 혼합 작업의 기대 주기는 Fx 30분으로 해석하도록 연결했다.

독립 최종 리뷰는 `gpt-6-astra`의 새 문맥에서 `fbdf9a03..ae86e3c5`를 읽기 전용으로 검토했다. Important 2·추가 부모 재현 문제를 하나의 수정 작업에서 RED→GREEN으로 보완했다. 재리뷰를 반복하지 않았다. 미룬 minor 지적은 없다.

## 검증 기록

- 출처 저장 관련 96건, Fx 관련 25건, 예약·native 관련 143건을 각 작업에서 실행했다.
- 관리자·Disabled·저장·native 경로 12파일 165건 PASS.
- 최종 커서·완료·preview·기존 X 회귀 4파일 89건 PASS.
- 관리자 부모 흐름·독립 route 정책 2파일 30건 PASS. 일반 실행의 Fx provider 선택과 pending의 공식 실행을 구분한다.
- 전체 첫 완주: 407파일, 3,450 PASS / 4 FAIL. 새 route 두 개와 변경된 UI/호출 계약의 기존 테스트를 보완했다. 실패 결과를 통과로 숨기지 않았다.
- 전체 재실행: 407파일, 3,454 PASS / 1 FAIL. 실패는 마지막에 추가한 기존 2시간 readback 회귀다. 보완 후 운영 HTTP·RPC·Disabled·native Workflow·수집 UI의 **6파일 96건 PASS**를 다시 확인했다. 추가 운영 상태 테스트 1건도 포함한다. 이는 저장소 규칙에 따른 **합성 검증**이며, 최종 tree에서 `pnpm test` 전체 명령을 다시 통과했다고 표현하지 않는다. 미해결 테스트 실패는 없다.
- 최종 Node 24 `pnpm typecheck:test`, `pnpm architecture:check`, 변경 코드 lint PASS.
- 최종 주기 readback 변경 이후 양 사이트 build·manifest를 다시 생성해 PASS를 확인했다. 기존 bundle 크기 경고와 테스트의 RPC stub dispose 경고는 남으며, 새로운 실행 실패는 아니다.
- build manifest의 기록 commit은 `0a6d65c1`이다. 당시 포함한 미커밋 수정이 `909be4da`에 커밋됐으며, 두 사이트의 `sourceTreeHash`와 전체 artifact hash를 최종 코드에서 재계산해 모두 동일함을 확인했다. commit 표기 차이를 숨기지 않으며 운영 릴리스에서는 배포할 artifact의 식별을 다시 확인한다.
- 새 DB 전체 migration은 native 테스트에서 0161까지 적용했다. 별도 shell의 전체 체인 0159 검증과 실제 과거 DB→0161 증분 적용·양 사이트 D1 doctor PASS. SQL·snapshot·journal을 함께 관리한다.
- `pnpm preflight`는 실행하지 않았다. 저장소 규칙에 따라 최종 PR 병합 준비 또는 승인된 릴리스에서 수행한다.

## 판단 기록과 비용

| 판단 | 이유와 잘못됐을 때의 비용 |
|---|---|
| 승인 계획을 동등한 계약·상대 경로로 저장 | 원래 사용자 요구가 최상위다. 요약으로 빠진 계약이 있으면 원래 요구를 따른다. |
| 기존 의존성 junction·로컬 Node24 사용 | 의존성 변경 없이 재현한다. 로컬 Vite만 실제 의존성 경로 읽기를 허용했다. 환경 차이는 production build·native 테스트로 구분한다. |
| CAS에 기존 JSON도 비교 | revision을 올리지 않는 기존 preview writer와 경합해 공식 문맥이 유실되는 것을 막는다. |
| Fx identity/cadence와 공식 regular 완료를 추가 컬럼으로 분리 | 계정 오인·중복 유료 정기 수집·24시간 기준점 이동을 막는다. 새 공식 ID·cursor를 Fx가 쓰지 않는다. |
| 같은 관계의 기존 preview 보존, 빈 preview만 공식 경로로 복구 | 독립 nested 출처 모델을 추가하지 않는다. 기존 preview가 공식 보강까지 오래 남을 수 있다. |
| Worker redirect는 manual로 받고 3xx 거절 | Workers의 실제 지원 범위에 맞추면서 고정 호스트 경계를 지킨다. |
| provider 없는 작업은 공식, legacy 예산 재개는 기존 의미 유지 | 이전 작업을 strict pending 토큰 계약으로 재해석하지 않는다. 기존 재시도를 잃을 비용이 있다. |
| 타사이트가 쓰는 공유 구독 보존 | Disabled 사이트를 위해 다른 사이트 수집을 끊지 않는다. 원격 앱 전체의 구독·과금과 사이트별 활성 수를 구분해야 한다. |
| 기존 원장이 사라지면 실패로 차단 | 예산 0으로 재생성해 이미 지출한 비용을 잊지 않는다. 복구 전 공식 조회가 멈출 수 있다. |
| 보조 쓰기 완료 hash를 마지막에 확정 | 페이지 성공 전에 참조까지 durable하게 한다. 변경된 글당 완료 metadata 쓰기가 추가되며 D1 보호를 우회하지 않는다. |
| 새 게시물 보관 기간을 발명하지 않음 | 기존 정책은 x_posts의 나이별 삭제를 하지 않는다. cache·usage 이력 보관과 삭제/redaction 경계는 유지한다. |
| LuvDia 실제 허용 목록과 역사 데이터로 로컬 환경 복원 | fixture·새 백필로 성공을 만들지 않는다. 잘못된 목록은 다른 멤버 노출을 만들므로 실제 code·URL 일치를 먼저 검사했다. |
| 짧은 수명 글 완전 추적·handle 변경 이관은 확장하지 않음 | 폴링 사이 누락·rename 계정의 지연은 가능하다. 명시적 계정 설정과 공식 정상 주기 확인이 필요하다. |

## 운영 전환 전 남은 사항

1. 최종 PR 검토·병합 준비에서 preflight를 실행하고 양 사이트 Worker의 승인된 릴리스를 진행한다. 두 Worker가 새 제어/RPC 계약을 제공하는 artifact인지 확인한다.
2. OTW → LuvDia 순서로 **운영 관리자**에서 전환한다. 실제 소유 유료 원격 구독의 부재와 Disabled를 확인한 뒤 다음 사이트로 진행한다. migration이나 배포만으로 전환하지 않는다.
3. 정상 공식 주기에서 Fx 미발견 글의 독립 복구와 정상 Fx 주기·계정별 fallback/복귀를 운영 원장과 공개 피드로 확인한다. 추가 강제 유료 실험·자동 예산 증액을 하지 않는다.
4. 사용 원장과 실제 청구를 나눠 비용을 비교한다. 아직 고정 절감률이나 실제 절감액을 주장하지 않는다.
5. 문제가 생기면 기본 수집원을 `x_api`로 되돌린다. 웹훅은 Disabled로 두며 데이터·공식 cursor·장부를 되돌리지 않는다. 재활성화는 별도 수동 확인 절차를 따른다.

Fx 공급자 장애·404·예산 소진·짧게 게시됐다 삭제된 글 때문에 지연 또는 누락이 남을 수 있다. 이번 실제 404는 발생이 확인된 제한이며, 미완료 상태·공식 fallback이 이를 표시한다. 운영 구독 중단 실패는 실제 과금이 계속될 수 있으므로 오류를 지운 성공 표시 대신 원격 부재 readback을 완료해야 한다.
