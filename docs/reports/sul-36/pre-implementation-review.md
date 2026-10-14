# SUL-36 구현 실행 전 결정·고려사항 점검

- 점검일: 2026-10-14, Asia/Seoul
- 코드 기준: `bf0c8159412d283996e04c6d6147de52dbd10ba5`
- 대상: [확정 정책·설계](../../superpowers/specs/2026-10-13-luvdia-independent-deployments-design.md), [구현 계획](../../superpowers/plans/2026-10-13-luvdia-independent-deployments.md), 현재 source/config/schema와 공식 플랫폼 문서.
- 범위: 읽기 전용 코드 조사와 문서 보완. 운영 DB의 실제 자료·설정·진행 작업, 계정 사용량, Cloudflare/Clerk dashboard 상태는 조회하지 않았다.
- 기록 시점: 구현 착수 전 점검이다. 이후 2026-10-14 지시에 따라 코드·로컬 검증을 진행하며 현재 실행 범위와 완료 증거는 위 구현 계획에서 갱신한다. 도메인·운영 이관·배포는 남겨둔다.

## 판정

**점검 당시 운영 방향은 확정됐지만 실행 준비는 미충족이었다.** 기존 outbox는 데이터 복제 로그가 아니며, 수집 소유권 인계·보관 자료의 후속 삭제 방지·검증 환경·schema와 자동 배포 순서를 구체화해야 했다. 이것은 당시 OTW의 장애 판정이 아니라, 새로 요구한 사이트 분리의 실행 준비 판정이다. 이후 구현과 현재 증거는 [로컬 검증 기록](local-implementation-verification.md)에서 갱신한다.

목표는 `2026-10-18 11:00 Asia/Seoul`이다. 전체 기능·이관·권한·무중단 검증이 끝나지 않으면 공개를 연기하고 기존 OTW 수집·갱신을 유지한다. **점검 당시**에는 도메인 미정·구현 미착수·무중단 절차 미검증으로 일정 위험이 높았으며 작업 일수나 달성 가능성을 수치로 추정할 근거가 없었다. 이후 코드·로컬 검증의 진행 상태는 위 구현 계획을 따른다.

## 1. 결정 범위 전수 대조

| 영역 | 확인한 정책 | 실행 전 남은 사항 |
| --- | --- | --- |
| 코드·서비스 수명 | 공통 코드, 두 사이트 지속 운영, 별도 배포/DB | 두 config·산출물·로컬 상태의 일관된 대상 선택 |
| 대상·기능 | 빙하유·유리리·양메이만, 기존 전체 기능 | 관리 roster와 공동 자료의 역사적 참여자 구분 |
| 브랜드 | LuvDia Schedule / LuvDia Play, 기존 로고·메일, 비공식 고지 | 모든 화면·오류 문구·SEO·이미지 내보내기 반영. 소속 표기는 개인 방송인, 화면 검토 후 조정 가능 |
| 도메인·커뮤니티 | 도메인 미정, 커뮤니티 URL 확정 전 링크 비표시 | 실제 주소·DNS·TLS·canonical·Clerk origin. 도메인은 production 준비 필수 입력 |
| 인증·관리자 | 별도 Clerk 앱·회원, 기존 운영자 개별 권한 | 새 development/production 앱 identity·admin IDs·authorized origins, OTW token 거부 |
| 과거 자료 | 멤버 콘텐츠·검수 자료 이관, OTW 원본 관리자 보관 | 실제 보유 범위, 관계 없는 전역 자료의 분류, 작성자 출처와 계정 소유권 분리 |
| 개인 데이터 | 개인 playlist·계정 연결은 OTW 유지 | 보관 항목의 unavailable 처리, 본인 제안·썸네일 경유 노출 차단 |
| 수집 | 기존 소스·주기 승계, 새 자료 LuvDia 전용 | source별 소유권·checkpoint·혼합 작업·공동 채널, collector 외 source-health 경로 |
| 무중단 | 세 사람도 수집·갱신 일시 정지 없음 | 원본과 원자적으로 기록되는 변경분, 삭제·순서·재시도·파일 일관성, 관리자 전환 동선 |
| 자원·외부 API | 같은 Cloudflare/API 계정, 물리 자원·가능한 키 분리 | 실제 자원 ID·token 권한·검증 자원. 공유 한도는 독립되지 않음 |
| 비용 | 기존 계약·합산 한도 우선, 비용 증가 별도 결정 | 현행 사용량·다른 소비자·이관/검증/Clerk 비용과 사이트별 배분 |
| 배포 | 검증된 master 병합 후 사이트별 자동 배포 | migration 선후 관계·동시 배포 직렬화·오래된 build 차단·한쪽 실패 재개 |
| 공개·복구 | 목표 시각, 미완료 시 연기 | 실제 도메인 검증, 소유권 인계 readback, 호환 버전 복구와 저널/파일 보호 기간 |
| 승인 범위 | 점검 당시 구현 보류 | 이후 별도 지시로 코드·로컬 검증을 진행한다. 운영 자원 생성·이관·배포는 별도 실행 범위다 |

## 2. 코드에서 확인한 실행 설계의 빈틈

### A01. 변경분 포착은 추가 설계가 필수

`scheduled_outbox`는 run/item 전달 기록이며 변경된 행·삭제 내용을 저장하지 않는다. schedules/notices/ddays에는 공통 `updated_at`도 없고 hard delete가 존재한다. Play 감사 기록은 실패해도 업무 저장이 성공할 수 있다. 따라서 기존 로그나 시간 조건만으로 모든 변경을 복제한다는 전제는 성립하지 않는다. [outbox](../../../db/schema/index.ts#L3563), [일정 스키마](../../../db/schema/index.ts#L287), [일정 삭제](../../../worker/features/schedules/infrastructure/d1-schedule-write-repository.ts#L255), [공지 삭제](../../../worker/features/notices/infrastructure/d1-notice-gateway.ts#L183), [감사 실패 처리](../../../worker/features/otw-play/application/admin-catalog-service.ts#L68)

- **발생 조건·영향:** 초기 복사 중 수정/삭제가 있으면 누락 또는 오래된 상태 복원이 가능하다. 실제 갱신이 계속되는 조건에서 위험이 높다.
- **필요 설계:** 원본 저장과 같은 트랜잭션에 순서·키·이전/이후 대상 관계·삭제를 기록하는 최소 저널, 초기 복사 기준점, 적용 cursor, 재개·중복 제거, 대상 범위 진입/이탈 규칙. 저널은 원본 복제의 정합성용이며 관측용 불필요한 쓰기를 추가하는 것과 다르다.
- **닫는 증거:** 모든 대상 mutation 목록과 실제 D1에서 복사 중 수정/삭제·순서 역전·중복·중단 후 재개를 재현한 최종 상태 비교. D1 `batch()`의 원자성은 한 DB 안에서 적용되므로 두 DB와 R2를 하나의 트랜잭션처럼 취급하지 않는다. [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

### A02. 수집 소유권은 planner와 최종 쓰기 모두에서 적용

X/CHZZK는 여러 대상을 continuation에 저장하고 executor가 나중에 그대로 실행한다. 현재 lease는 작업 완료 상태를 보호하지만 콘텐츠 쓰기 권한을 사이트별로 검사하지 않는다. roster나 새 Cron 설정만 바꿔도 과거 Queue 메시지는 남는다. [planner](../../../worker/features/scheduled-operations/infrastructure/scheduled-job-planner.ts#L137), [executor](../../../worker/features/scheduled-operations/infrastructure/scheduled-job-executor.ts#L308), [Queue 실행 순서](../../../worker/app/scheduled-queue.ts#L131)

- **발생 조건·영향:** 인계 시 미완료/지연 작업이 있으면 OTW 재갱신·중복 반영 위험이 높다. 혼합 작업을 통째로 버리면 다른 OTW 멤버도 누락된다.
- **필요 설계:** source별 단일 쓰기 주체, 소유권 세대와 실제 쓰기의 조건 검사, 혼합 작업 분리, 접수된 요청의 완료/인계, 마지막 변경 번호와 늦은 delivery 처리. 외부 API 재조회 중복과 저장 효과 중복을 구분한다.
- **checkpoint:** 현재 모니터 생성·paused 재개는 최신 영상으로 watermark를 설정하므로 이관 도구로 사용할 수 없다. 확정 watermark·pagination·next due·기존 candidate 식별자는 검증해 승계하고 lease/dispatch 권한은 새로 발급한다. [모니터 생성·재개](../../../worker/features/otw-play/application/channel-monitor-service.ts#L129)
- **공동 source:** 채널·Cafe 게시판·X 참조 등 양 사이트가 필요한 source는 콘텐츠 범위별 소유권/필터와 quota 중복을 목록으로 결정한다. 세 사람을 대상 목록에서 빼는 것만으로 충분하지 않다.

Queues는 중복 전달이 가능하고 Cron 변경은 전파에 최대 15분이 걸릴 수 있다. 공개 시각에 Cron을 바꾸는 작업을 원자적 인계로 사용하지 않는다. trigger/domain 준비와 쓰기 소유권 인계를 분리한다. [Queues 전달 보장](https://developers.cloudflare.com/queues/reference/delivery-guarantees/), [Cron 전파](https://developers.cloudflare.com/workers/configuration/cron-triggers/#2-update-configuration)

### A03. 전체 이관의 기준은 보유 자료 조사로 닫아야 함

CHZZK VOD/클립은 만료되는 API cache이고, YouTube feed는 30일 보관, 일부 수집 후보 metadata도 만료 후 제거된다. 현존 자료 수를 조회하지 않았으므로 모든 과거 자료가 남아 있다는 주장이나 누락 규모 추정은 할 수 없다. [CHZZK cache](../../../db/schema/index.ts#L686), [feed retention](../../../worker/features/operations/infrastructure/data-retention.ts#L112), [후보 정리](../../../worker/features/otw-play/infrastructure/d1-ingestion-repository.ts#L1364)

- **manifest 필수 분류:** 현존 영구 자료 / 현재 cache에만 있는 자료 / 이미 제거·만료된 것으로 확인된 자료 / 외부에서만 조회 가능한 자료 / 삭제·redaction tombstone / 범위 분류가 필요한 자료.
- **보유 기준점:** 실행 시 승인 inventory의 기준 시각·원본 변경 번호를 고정한다. 그 기준점 전에 대상 행/파일의 TTL·registry·미참조 정리에 대한 보호를 활성화하고 확인한다. 기준점 이후 정상 수정·수집은 계속 반영한다. 단순 운영상 만료와 의도적인 원문 삭제/redaction을 구분하여 후자는 기존 제거 의미를 유지한다. 이 구분 없이 모든 DELETE를 복제하지 않는다.
- **관계 폐쇄:** 일정·공지·D-day·프로필·X/Cafe/YouTube·곡/가창/source·검수/제안·파일과 관계를 데이터군별로 적고 각 행에 이관/보관/재생성/제외 이유를 둔다. 건수뿐 아니라 ID 대응·게시/접근 상태·파일 hash를 비교한다.
- **운영자 분류:** D-day에는 멤버 FK가 없고 공지의 관련 멤버 목록은 비어 있을 수 있다. 이 행들을 이름 검색만으로 자동 확정하지 않는다. 후보 manifest를 만들고 해당 행만 운영자가 분류한다. [D-day](../../../db/schema/index.ts#L352), [공지](../../../db/schema/index.ts#L317)
- **기존 삭제 정책:** 제거된 원문·숨김/tombstone을 복구하지 않는다. 현재 X/Cafe의 원문 삭제·소급 수집 금지 계약과 파일 대신 외부 URL을 저장하는 범위도 유지한다. 이미 없는 과거 자료의 복구는 확정 Q01에 따라 후속 결정이다. [게시물 보관 정책](../../operations/member-post-storage-policy.md)

### A04. 공동 콘텐츠와 회원 제안은 그대로 복사할 수 없음

공동 performance의 다른 참여자는 `music_entities.member_uid`로 실제 members를 참조할 수 있다. 공지 수정도 관련 멤버 전원이 유효한지 검사한다. 모든 FK를 복제하면 LuvDia 관리 대상이 세 명을 넘어가고, 단순 삭제하면 크레딧·수정 흐름이 깨진다. [entity FK](../../../db/schema/index.ts#L1386), [참여자](../../../db/schema/index.ts#L2003), [공지 관계 검증](../../../worker/features/notices/infrastructure/d1-notice-gateway.ts#L291)

**정책을 보존하는 설계 기준:** 관리 roster는 세 명만 유지한다. 다른 참여자의 역사적 크레딧은 외부 참여자 등 기존 모델을 우선 사용해 보존한다. 세 사람이 참여한 하나의 공동 항목은 OTW에서 관리자 보관하되, 같은 곡/source에 연결된 다른 멤버의 독립된 가창까지 함께 숨기지 않는다. 공지의 역사적 참여자 표시와 현재 편집 가능한 관리 멤버 관계를 분리한다. 실제 공동 자료 목록을 검토할 때 이 규칙으로 분류가 불가능한 사례만 운영자에게 제시한다.

회원 제안에는 NOT NULL 작성자 ID와 검수자/상태 제약이 있고, OTW 본인 목록·상세·수정 경로가 있다. 검수 자료 이관을 이유로 원 계정 ID/email·권한을 LuvDia 사용자에게 연결하거나 새 관리자 이름으로 역사를 덮어쓰면 안 된다. [제안 작성자](../../../db/schema/index.ts#L2161), [검수 상태 제약](../../../db/schema/index.ts#L2265), [본인 조회·수정](../../../worker/features/otw-play/infrastructure/d1-member-submission-repository.ts#L681)

**필요 설계:** 이관 검수 자료의 출처와 인증상 소유권을 구분하는 schema/DTO, 이관 후 담당 관리자의 새 작업 이력, OTW 내 제안의 내용 노출·수정 차단. 원 개인정보·원본 이력은 OTW에 보존하고 LuvDia에 일반 회원 개인정보를 복제하지 않는다. 과거 승인·거절 결과를 새 실행으로 재생하지 않는다.

### A05. 관리자 보관은 수집 종료·TTL·파일 정리와 함께 보호

YouTube registry는 대상에서 빠진 source를 DELETE하고 영상은 FK cascade로 삭제된다. 반대로 `enabled=0`만 넣으면 다음 sync가 다시 활성화한다. 따라서 자료 보관과 수집 대상에서의 제외는 별도 상태여야 한다. [registry 삭제/재활성화](../../../worker/features/youtube/infrastructure/youtube-feed.ts#L152), [영상 cascade](../../../db/schema/index.ts#L864)

- **발생 조건·영향:** 기존 registry/retention을 그대로 실행하면 보관 약속과 달리 자료가 삭제될 수 있어 위험이 높다. `is_deprecated`만 사용하지 않는 기존 결정은 유지한다.
- **필요 변경:** source ownership·archive 상태를 registry/collector/public reader/retention 모두에 반영. 업무 콘텐츠 보존과 임시 실행/usage 로그 정리를 구분한다. 전환 저널과 파일은 검증·복구에 필요한 기간 전에 제거하지 않는다.
- **R2:** 업로드·DB 참조·미참조 파일 정리가 별개다. manifest의 object key/version/hash를 보호하고 목적지 파일 검증 후 참조를 반영한다. 교체/삭제 race와 부분 복사 재개를 확인하며 전체 수집을 멈추는 대신 이관 대상 파일의 파괴적 cleanup만 좁게 보호한다. [업로드](../../../worker/features/notices/infrastructure/d1-notice-gateway.ts#L218), [정리](../../../worker/features/notices/infrastructure/d1-notice-gateway.ts#L256)
- **실제 인수:** 인계 후 정상 registry sync·retention·source-health가 한 번 이상 실행된 뒤에도 보관 자료와 파일이 유지되는지 확인한다.

### A06. 숨김은 모든 읽기 경로와 자산에 적용

일반/회원 API·상세·검색·집계·추천·SEO·snapshot·cache뿐 아니라 내 제안·playlist 대표 이미지·기본 playlist에서도 보관 자료가 나오지 않아야 한다. 개인 playlist는 기존 unavailable slot을 재사용하고 저장 행을 지우지 않는다. [기존 unavailable 의미](../../../db/schema/index.ts#L186), [playlist 해석](../../../worker/features/otw-play/application/playlist-service.ts#L49)

R2는 현재 1년 immutable 공개 캐시이며 프로필 정적 이미지는 Worker를 우회한다. 서버/CDN의 새 요청과 새 화면 응답을 차단하고 관리자 이미지는 정상 인증 경로로 렌더링해야 한다. 이미 다운로드된 파일·브라우저 저장본·상류 외부 사이트까지 회수할 수 있다고 약속하지 않는다. [R2 응답](../../../worker/features/assets/http/handler.ts#L9), [정적 자산 routing](../../../wrangler.jsonc#L32)

관리자 보관을 알지 못하는 이전 Worker로 rollback하는 것은 금지한다. 코드 버전만 되돌린다고 이전 공개 cache·검색 read model이 안전해지는 것도 아니다. 검색엔진 기존 색인의 제거는 갱신 지연이 있으므로 즉시 회수를 인수 기준으로 삼지 않는다.

### A07. 검증 환경·실행 순서·로컬 격리를 구체화

기존 계획은 Task 1/3에서 실제 새 Clerk 로그인을 검증하고 Task 5에서 production build를 요구하면서 그 값은 Task 6에서 처음 만들도록 되어 있었다. Task 6의 인계가 새 환경 배포·실제 흐름 검증보다 앞에 있기도 했다. 이 순환 의존과 순서를 이번 문서 수정으로 바로잡는다.

**권고 환경:** 로컬은 두 사이트별 D1/R2·env·port·Clerk development를 사용한다. 실제 Cron/Queue 장애 검증은 운영과 격리된 일회성 검증 자원에서 수행한다. LuvDia production의 최종 smoke는 실제 도메인에서 외부 접근을 통제한 상태로 수행한다. 추가 검증 자원도 비용 정책을 따르며 자원 identity 목록과 접근자·비활성화/정리 조건을 먼저 기록한다. 도메인·workers.dev·preview alias·직접 asset 경로를 함께 막으며 `noindex`를 접근 통제로 쓰지 않는다.

현재 `R2 remote:true`는 로컬에서도 실제 bucket에 쓰고 삭제할 수 있다. D1만 격리해서는 부족하다. 두 사이트가 같은 port를 사용하며 dev restart가 같은 repo의 Vite 모두를 종료하는 경로도 있다. 사이트별 local origin/port·env 선택 우선순위·restart 대상을 설계에 추가한다. [R2 binding](../../../wrangler.jsonc#L68), [restart](../../../scripts/dev-restart.mjs#L73), [local config](../../../scripts/local-dev-config.mjs#L33), [remote binding 설명](https://developers.cloudflare.com/workers/local-development/#remote-bindings)

Workers Preview는 실제 Queue consumer나 정기 Cron 실행을 대신하지 못한다. HTTP preview·하위 handler 호출만으로 인수 완료 처리하지 않는다. [Preview 자원/trigger 경계](https://developers.cloudflare.com/workers/previews/resources/#queue-consumers)

현재 shell의 Node는 `v25.2.1`, pnpm은 `11.7.0`으로 확인했다. 저장소는 Node `>=24.20.0 <25`를 요구하므로 구현의 app/build 검증 전에 지원 runtime을 선택해야 한다. 문서 검사는 현재 Node로 가능하지만 그 통과를 지원 환경의 app 검증으로 취급하지 않는다. [runtime pin](../../../package.json#L6)

### A08. 자동 배포와 schema·복구는 사이트별로 직렬화

현재 배포 도구는 미적용 migration이 있으면 멈추며 migration을 적용하지 않는다. 따라서 master 병합 자동 배포와 별도로 누가 언제 schema를 적용하는지 필요하다. [배포 guard](../../../scripts/deploy-workers.mjs#L34)

- **권고 순서:** 이전 Worker와 호환되는 expand migration → 해당 DB readback → 검증된 새 Worker 자동 배포 → 실제 흐름 확인. 제거/축소 migration은 기존 버전 의존이 사라진 뒤 별도 수행한다.
- **실행 주체:** 운영자가 승인된 release 절차로 DB별 migration을 적용하고 readback한다. Workers Builds는 사이트별 build/deploy를 담당하며 migration이 없거나 준비되지 않으면 차단한다. 같은 사이트의 migration/deploy는 직렬화하고 오래된 commit의 역순 배포를 막는다.
- **부분 실패:** 한쪽 성공을 다른 쪽의 완료로 처리하지 않는다. 공통 schema는 하나의 체인을 유지하되 DB별 적용 버전·Worker 호환표·재개 지점을 기록한다.
- **복구:** 인계 전에는 OTW가 계속 처리한다. 인계 후에는 먼저 LuvDia의 마지막 정상 호환 버전으로 복구한다. OTW로 처리 주체를 되돌리는 것은 인계 후 LuvDia의 새 변경을 역이관하는 별도 검증 절차가 있을 때만 가능하다. 이전 OTW DB를 복원해 새 데이터를 버리는 방식은 금지한다.
- **추가 영향 파일:** `cf-typegen`/`worker-configuration.d.ts`, Node/pnpm pin, site별 env 입력, Workers Builds branch/명령/watch paths/token 권한까지 포함한다. 실제 dashboard 구성은 아직 확인하지 않았다.

### A09. 예산은 세 종류를 구분

| 구분 | 현재 근거 | 적용 |
| --- | --- | --- |
| 계정 전체 측정 | [Cloudflare ingestion read guard](../../../worker/features/otw-play/infrastructure/cloudflare-ingestion-read-budget.ts#L4)는 database filter 없이 계정 전체를 읽음 | 이 threshold를 사이트별 예산이라고 단순히 절반으로 나누지 않음 |
| 사이트 DB별 예약/사용 ledger | [YouTube quota](../../../worker/features/youtube/infrastructure/youtube-quota.ts#L63), [scheduled guard](../../../worker/app/scheduled-workflow-cron.ts#L49) | 두 사이트 cap과 다른 소비자·여유분을 공용 실제 한도에 맞춰 배분 |
| 공급자 계약·실제 청구 | Cloudflare/API 프로젝트 공유, 별도 Clerk | 실제 계약·리셋 시각·관측 지연·실패 동작·임시 이관/검증 사용량을 조사. 비용 증가 시 별도 결정 |

계정 관측 guard는 실시간 원자적 합산 예약이 아니다. 기존 per-site ledger가 다른 DB의 예약을 자동 알지 못한다는 점도 유지한다. 무중단 이관 저널의 추가 쓰기·반복 조회가 현재 수집 주기를 깨뜨리거나 기존 계약을 넘는지 평가해야 한다. 현재 요금제·사용량을 확인하지 않아 충분한 여유가 있다고 판단하지 않았다.

### A10. 인증·브랜드는 실제 사용자 흐름에서 확인

현재 auth는 authorized parties를 생략할 수 있고 issuer/JWKS를 각각 받는다. 새 배포 guard는 production issuer·JWKS·publishable key의 앱 identity와 허용 origin 일치를 검사해야 한다. 사용자 ID 문자열만으로 상대 앱 사용자를 허용하지 않는다. [auth config](../../../worker/platform/auth.ts#L148)

새 도메인의 로그인/로그아웃·관리자·회원 playlist/제안·권리 문의·외부 링크·멀티뷰·snapshot 저장을 실제로 확인한다. 사이트 이름은 header/footer뿐 아니라 Play 본문·오류/대기 문구·aria·admin·SEO·공유 이미지에 퍼져 있다. 경로·내부 enum을 일괄 개명하지 않고 표시문구와 실행 대상을 분리하는 기존 설계는 유지한다.

## 3. 추가 선택과 실제 입력

### 점검 중 추가 확정한 범위

| ID | 확인 내용 | 확정 정책 | 상태 |
| --- | --- | --- | --- |
| Q01 | 이미 DB/R2에 없는 과거 자료도 최초 공개 전 복구해야 하는가 | 현존 자료 전체 이관·누락 사유 기록, 없는 과거 자료 복구는 후속 결정 | 2026-10-14 사용자 확정 |
| Q02 | 별도 로그인과 관리자 갱신 무중단의 접점 | 접수된 변경은 끝까지 보존하고 수집을 계속하며, 전환 이후 새 편집은 LuvDia에 별도 로그인해 수행 | 2026-10-14 사용자 확정. OTW 로그인/편집 세션 자동 승계는 요구하지 않음 |

공동 항목의 관리자 보관과 개인 자료의 비이관은 이미 확정된 정책이다. A04/A06의 구현 해석을 기록하고 실제 예외 자료만 확인한다. 같은 결정을 반복 질문하거나 임의로 이관 범위를 줄이지 않는다.

### 실제 값·자료 입력 목록

| 입력 | 확보할 시점 | 소유자/확인 방식 |
| --- | --- | --- |
| LuvDia domain·보유 상태·DNS/TLS | production Clerk·빌드·외부 접근 검증 전 | 사용자 주소 선택, 이후 운영 설정 readback |
| 개발/검증/운영 자원과 Clerk identity·admin IDs | 각 환경을 사용하는 검증 전 | 운영자 설정, 도구 readback. 비밀값은 문서/로그에 기록하지 않음 |
| source별 대상·주기·watermark·활성/보류·공동 source | 이관 상세안·rehearsal 전 | 실제 설정 읽기. 신규 확대는 하지 않음 |
| 콘텐츠/관계/파일의 실제 건수·크기·만료/삭제·애매한 글로벌 자료 | 전체 이관 완료 기준을 정하기 전 | 읽기 기반 manifest, 애매한 행만 운영자 분류 |
| 계정·provider 계약/현재 사용량/다른 소비자·Clerk 비용 | 자동 실행·이관 부하 검증 전 | 대시보드·기존 ledger 읽기, 비용 증가 필요 시 사용자 결정 |
| Workers Builds branch·명령·watch paths·env·token 범위 | 자동 배포 연결 전 | 실제 dashboard readback |
| 인계 중 요청/작업 처리 규칙·복구 가능 버전·저널/파일 보호 종료 조건 | rehearsal 및 production 인계 전 | 개발자가 기술 상세안 작성, 실제 연속 갱신 실험 증거로 판단 |

## 4. 수정한 실행 순서와 인수 기준

1. 확정 Q01/Q02를 적용하고 도메인 입력과 실제 자료·쓰기·source 목록을 확보한다. 변경 포착·소유권·역사적 관계·보관 schema를 먼저 설계한다.
2. 구현 지시 이후 개발/검증 환경과 Clerk development를 필요한 검증 전에 준비한다. 로컬 D1/R2·env·port를 격리한 뒤 공통 코드·사이트 경계·보관·이관 도구를 구현한다.
3. 격리된 실제 Worker/D1/R2/Queue/Workflow에서 초기 복사·동시 갱신·삭제·지연/중복 delivery·실패/재개·파일 교체·권한/보관을 rehearsal한다. 앱의 정상 진입·저장/readback과 정상 Cron/Queue 흐름을 사용한다.
4. 최종 코드/local schema의 preflight·독립 검토 후, 운영 실행 지시 범위에서 OTW 호환 expand migration과 새 LuvDia bootstrap을 적용한다. 각 schema readback 이후 production doctor/pending 검사를 수행하고 master 병합의 사이트별 자동 배포로 원본 변경 포착/소유권 경계와 비공개 LuvDia를 배포한다. 실제 포착 및 대상 TTL/파일 보호를 확인한 뒤 inventory 기준점을 정한다. OTW 수집·공개는 유지한다.
5. 비공개 LuvDia에 초기 자료·변경분·파일을 이관하고 실제 domain·Clerk·전체 읽기·접근 권한·복구 호환성을 확인한다. 인계 전 목적지의 이관 대상에 새 업무 쓰기를 허용하지 않는다. 정상 저장 흐름은 격리 rehearsal에서 검증하고 production 대상 저장은 인계 후 확인한다. 시험용 소유권 우회 경로를 추가하지 않는다.
6. 필수 검증이 완료된 경우에만 목표 시각에 검증된 규칙으로 처리 소유권과 OTW 관리자 보관을 적용하고 LuvDia를 공개한다. 도메인/trigger 신규 설정 전파를 이 순간 처음 시작하지 않는다. 미완료면 공개 연기·OTW 운영 유지다.
7. 실제 수집 주기·지연 작업·retention 실행 이후 양측 readback, 비용·권한·파일 보존을 확인한다. 보호 저널/파일은 정해진 복구 조건 충족 후에만 정리한다.

공개 전 완료할 증거와 인계 후 확인할 production 저장·다음 수집 주기 증거는 구분한다. 후자의 미실행을 선행 검증의 성공으로 채우지 않으며, 인계 후 실패에는 사전 검증된 호환 복구 절차를 적용한다.

**완료 증거:** manifest의 모든 대상/관계/파일 처리와 제외 이유, accepted mutation 누락 0·중복 효과 0, 확정 checkpoint 연속성, 세 사람 외 OTW 데이터/수집 유지, 보관 자료의 일반/회원 접근 차단·관리자 정상 접근, 실제 production artifact/schema/auth identity와 정상 사용자 흐름. fixtures나 문서 검사로 대체하지 않는다.

## 5. 이번 점검의 한계

정책·계약·schema·collector/Queue·retention·파일·auth·build/deploy·로컬 도구를 대조했고 플랫폼 제약은 공식 문서로 재확인했다. 확인한 누락은 설계/계획에 반영했지만 실행 상세안·실제 데이터·자원 설정·연속 이관 성능은 아직 검증되지 않았다. 기존 통과 문서 검사는 링크·문서 구조의 증거이며 실행 준비의 증거가 아니다.

이번 최종 문서 검사는 5개 문서의 로컬 링크 97개·고정 코드 출처 21개·참조 사용 54개·형식·정책 반영·문서만 변경된 범위를 확인해 통과했다. 계획의 7개 Task와 55개 미실행 단계는 모두 미완료 상태다. `git diff --check`와 agent sync 검사는 exit 0이고, sync 대상 27개 파일은 변경 없이 유효하다. 지원 Node 범위 경고는 A07의 구현 검증 선행 조건으로 남긴다.

코드·설정·테스트를 변경하거나 자원을 생성하지 않았고 앱 테스트·빌드·DB/R2 이관·commit/push·배포를 실행하지 않았다.
