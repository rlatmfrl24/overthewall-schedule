# 필요할 때 읽는 참조 문서

작업 순서와 중단 조건은 [현재 작업](current-work.md)이 소유한다. 아래는 해당 기능을 실제로 변경할 때만 읽는 계약·가이드이며 별도 작업 목록이 아니다. 과거 계획을 함께 전부 로드하지 않는다.

| 변경 범위 | 소유 문서 |
| --- | --- |
| 제품 범위·화면 | [PRODUCT](../PRODUCT.md), [Design](../Design.md) |
| 구조·경계 | [아키텍처](architecture.md), [Agent 규칙](../AGENTS.md) |
| 공개 전환·보관 | [현행 사이트 공개 정책](operations/site-publication.md), [멤버 게시물 보존](operations/member-post-storage-policy.md), [X 이력](operations/x-member-history-and-archive-design.md) |
| 일정 수집 | [자동 갱신](auto-update.md), [예약 작업](operations/scheduled-jobs-v2.md) |
| 비용·자원 | [비용 운영](operations/backend-cost-optimization.md), [캐시](cache-policy.md), [YouTube](youtube-optimization.md) |
| 채널 자동 수집 | [Polling](operations/channel-upload-polling.md), [종료 구현 경계](operations/retired-implementation-cleanup.md), [저장 피드 정책](operations/youtube-feed-retirement.md) |
| Play 제품·저장 | [요구사항](otw-play-product-requirements.md), [시스템 설계](otw-play-system-design.md), [UI/UX](otw-play-ui-ux-design.md) |
| Play 관리자 | [검수·등록 흐름](otw-play-admin-workflow-integration.md), [가져오기](otw-play-import-review-redesign.md), [플레이리스트 작업 큐](otw-play-playlist-work-queue.md) |
| 노래 클립·AI | [클립 계약](otw-play-singing-clips-requirements-and-plan.md), [AI 검수](otw-play-ai-review.md) |
| 검사·릴리스 | [테스트](testing.md), [Play 유지보수](otw-play-implementation-guide.md), [D1 규칙](drizzle-workflow.md) — 중단 중 실행 금지 |
| 검색·서버 HTML | [AEO](aeo.md) |

후순위 요구만 검토할 때: [계정 이전](cloudflare-production-account-migration.md), [AI 초안 미실행 계획](superpowers/plans/2026-10-14-otw-play-metadata-first-ai-draft.md). 읽기나 문서 존재가 실행 승인은 아니다.

## 날짜가 있는 증거

현재 D1 수정과 Play 점검 결과는 [10/19 점검 기록](reports/sul-36/2026-10-19-d1-playback-closeout.md)을 따른다. 완료된 [공개 전환 관측](reports/sul-36/2026-10-19-publication-observation.md)과 [10/16 이관 정리 기록](reports/sul-36/2026-10-16-content-transition-retirement.md)은 해당 시점의 검증·배포 근거다. [D1 사고 복구 기록](reports/sul-36/2026-10-16-otw-d1-incident.md)과 [R2 사고 기록](reports/sul-36/operational-upload-incident.md)은 원본 보존·복구 근거이며 재실행 지시가 아니다.

종료된 관측·기술 검토·기존 배포/구현 계획·구버전 상태표는 [아카이브 색인](archive/README.md)에서만 찾는다. 기존 미커밋 보고서와 실행 기록을 위한 일부 이전 경로는 짧은 이동 안내로 남겼다. 정책·스키마 이력·라이선스·현재 기능의 계약을 불필요한 문서로 삭제하지 않았다.
