# OTW Schedule 문서

현재 계약·작업 상태·과거 증거를 구분한다. 새 작업은 현행 문서에서 시작하고,
완료된 계획이나 과거 운영 snapshot을 현재 지침으로 사용하지 않는다.

## 프로젝트 기준

| 문서 | 책임 |
| --- | --- |
| [개요](../README.md) · [제품 결정](../PRODUCT.md) | 제공 범위·로컬 개발·승인된 방향 |
| [개발·운영 상태](development-status.md) | 구현·종료·미완료·미승인 작업의 단일 상태표 |
| [남은 작업 중요도 보고서](archive/remaining-work-priority-report-2026-09-17.md) | 9/17 기준 쉬운 설명·중요도·완료 조건·권장 순서 |
| [Design](../Design.md) · [폰트 정책](font-consistency-review.md) | 현재 디자인·접근성·타이포그래피 |
| [아키텍처](architecture.md) | capability·의존성·실제 연결 경로 |
| [공개 페이지 AEO](aeo.md) | 서버 HTML 요약·공개 정책·Play 공개 대응·검증 |
| [테스트](testing.md) · [D1 workflow](drizzle-workflow.md) | 검사·격리·migration |
| [Agent 설정](../AGENTS.md) | `.agent` 권위와 생성 mirror |

## Play

| 문서 | 책임 |
| --- | --- |
| [제품 요구사항](otw-play-product-requirements.md) | 역할·공개 범위·멤버 탐색·무결성·이전 ID 대체 관계 |
| [시스템 설계](otw-play-system-design.md) | 인증→service→D1, 저장·재생·자동화 |
| [UI/UX](otw-play-ui-ux-design.md) | 사용자·회원·관리자 동선과 상태 |
| [유지보수 가이드](otw-play-implementation-guide.md) | 변경·검증·release·closeout |
| [관리자 흐름](otw-play-admin-workflow-integration.md) | 통합 console·등록·가져오기·검수 |
| [노래 클립 계약](otw-play-singing-clips-requirements-and-plan.md) | 수록·공개·구간 정책과 검증 기록 |
| [AI 검수](otw-play-ai-review.md) | Gemini 보조 입력·수동 적용·예산·검증 한계 |

## 운영

| 문서 | 책임 |
| --- | --- |
| [예약 작업](operations/scheduled-jobs-v2.md) | Cron → Workflow → Outbox → Queue, 상태·재시도 |
| [채널 polling](operations/channel-upload-polling.md) | 승인 채널·pause·watermark·gap·backfill |
| [비용 운영](operations/backend-cost-optimization.md) | 읽기 전용 관측·현재 비용 경계 |
| [7일 최종 보고](operations/backend-cost-observation-final-2026-09-16.md) | 종료된 9/9~9/15 관측 증거 |
| [종료 구현 유지](operations/retired-implementation-cleanup.md) | WebSub/warmup 재도입 방지·유지 제약 |
| [X 비용](operations/x-api-cost-minimization-design.md) | 신규행 수집·cache·비용 추적 종료 기록 |
| [X 이력·보관](operations/x-member-history-and-archive-design.md) · [게시물 저장](operations/member-post-storage-policy.md) | 보관·redaction·공개 읽기 |
| [계정 이전](cloudflare-production-account-migration.md) | runtime 통합·남은 provisioning/cutover |
| [편성 자동갱신](auto-update.md) · [YouTube](youtube-optimization.md) · [Cache](cache-policy.md) | 기능별 운영·캐시 |

## 증거와 유지보수

[아카이브](archive/README.md)는 과거 계획·조사·검증과 정리 전 원문을 제공한다.
[이번 closeout](archive/documentation-closeout-2026-09-17.md)은 수정·검사·인계를 기록한다.
[포스터 디자인 QA](archive/snapshot-poster-design-qa-2026-09.md)는 날짜가 있는 UI 증거이며 현행 계약은 `Design.md`다.

- 계약은 소유 문서, 진행 상태는 개발 상태표, 당시 증거는 날짜가 있는 기록에 둔다.
- 미구현 요구사항을 아카이브 이동만으로 삭제·완료 처리하지 않는다.
- 문서 이동 시 inbound/outbound 링크를 갱신한다.
- `.agent` 변경 뒤 `pnpm sync:agent-cursor`와 `pnpm sync:agent-cursor:check`를 실행한다.
- 보고의 시각·배포 identity·readback 범위를 유지한다. 테스트나 graphify 연결은 운영 확인을 대신하지 않는다.
