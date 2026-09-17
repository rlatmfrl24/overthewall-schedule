# OTW Play 유지보수·검증 가이드

기준: 2026-09-17. 최초 PR-1~9 단계 계획은 [구현 이력](archive/otw-play-implementation-guide-before-2026-09-17.md)으로 이동했다.
이미 존재하는 catalog·검수·플레이리스트·polling을 다시 만드는 착수 계획으로 사용하지 않는다.
현재 계약은 [제품 요구사항](otw-play-product-requirements.md), 구조는
[시스템 설계](otw-play-system-design.md), 우선순위와 남은 gate는 [개발 상태](development-status.md)를 따른다.

## 변경의 기본 순서

1. 현재 사용자 요구·승인된 계약을 확인하고 관련 DEC/FR/ADM/NFR와 영향받는 소비자를 식별한다.
2. 기존 진입점과 실제 데이터 흐름을 확인한다. 공개 flag·권한·기능의 구현 유무를 이름으로 추정하지 않는다.
3. 최소 완결 범위로 DTO, application, D1/외부 adapter, HTTP와 UI를 함께 변경한다.
4. 관련 회귀 검사와 실제 사용 흐름을 검증하고 저장/게시가 있으면 권위 재조회를 남긴다.
5. 문서의 계약·상태·근거를 동시에 갱신한다. 과거 날짜의 배포/관측 결과를 오늘의 검증으로 바꾸지 않는다.

## 주요 작업 경계

| 변경 | 반드시 보존할 경계 |
| --- | --- |
| catalog query/SEO | 회원 인증, 관리자 preview, 공식/clip 격리, strict cursor, no-store, 멤버 검색 noindex |
| 등록·검수·게시 | 명시적 분류·승인 채널·immutable dedupe·CAS·idempotency·D1 batch·event/revision |
| Ready/가져오기 | 다음 행에서 새 catalog identity 재사용; metadata 갱신과 실제 review 충돌 구분 |
| 회원 제안 | 본인 소유·pending_review·입력 보존·서버 status 권위·내부 note 비노출 |
| player/queue | 단일 visible iframe, segment, pause/이탈, 중복 없는 queue, 복원 재검증 |
| 개인 playlist | 전체 가창·명시적 추가/저장·계정 소유·version 충돌·서버 재조회 |
| polling | pause·generation·lease·watermark·gap·예산·250개 continuation·수동 1~20 backfill |
| AI 검수 | 실제 모델 결과·예산·수동 적용·수동값 보호·자동 게시 금지 |

## 검증 명령

Node 버전과 pnpm은 [루트 개발 안내](../README.md)를 따른다.
변경 중에는 관련 테스트를 사용하고 최종 gate는 `pnpm preflight`다.

```bash
pnpm test:unit path/to/changed.test.ts
pnpm test:worker-integration
pnpm preflight
```

preflight는 architecture → test typecheck → lint → unit/Worker 통합 테스트 한 번 → build
→ local D1 doctor → agent mirror check를 실행한다. coverage 계측·비율 gate는 포함하지 않는다.
`pnpm test:coverage`는 선택 진단이다. 정확한 runner는 [scripts/preflight.mjs](../scripts/preflight.mjs),
격리와 타깃 실행은 [testing.md](testing.md)를 따른다.

schema 변경은 생성된 additive migration으로 검증하며 기존 migration을 재작성하지 않는다.
로컬 bootstrap은 [D1 workflow](drizzle-workflow.md)를 따르고 운영 변경은 별도 release 범위다.
`.agent`를 수정하면 `pnpm sync:agent-cursor`, `pnpm sync:agent-cursor:check`를 실행한다.
agent infrastructure 변경에는 `node --test scripts/sync-agent-to-cursor.test.mjs`도 수행한다.

## 실제 흐름과 운영 gate

테스트는 실제 사용자·운영자 흐름을 지원하며 대체하지 않는다.
등록은 영상 확인 → 곡/채널/가창자 → 검수 → 저장 → 권위 재조회,
게시는 명시적 게시 → 해당 역할의 catalog 조회 → 실제 iframe 재생까지 확인한다.
개인 목록은 본인 저장·재방문 복원과 타인 변경 차단을 확인한다.
polling canary는 실제 승인 채널 신규 업로드 → 예약 전달 → candidate → 검수/draft readback으로 확인한다.
자동화 pause 중에는 이를 완료로 표시하지 않는다.

운영 접근 flag는 일반 회원 활성화와 navigation을 의미한다. 과거 익명 SEO 공개 순서를
그대로 재실행하지 않는다. 코드 병합·배포와 flag 변경·collection 재개는 별도 상태로 기록한다.
검증을 위해 동의 없이 운영 수집·게시·pause 해제·migration을 강제하지 않는다.
rollback은 필요한 flag/worker/data 영향을 분리하며 D1 이력·회원 저장 목록을 임의 삭제하지 않는다.

## 인계와 closeout

변경 범위, commit/artifact, 사용한 진입점, 권위 재조회, 수행한 검사와 남은 제한을 기록한다.
구현 완료·운영 검증 완료·조사 문서 종료를 서로 다른 상태로 남긴다.
승인되지 않은 proposal은 archive에 보존하되 완료 기능으로 집계하지 않는다.
닫힌 항목의 날짜·근거는 보존하고 미완료 작업은 [단일 상태표](development-status.md)로 인계한다.
