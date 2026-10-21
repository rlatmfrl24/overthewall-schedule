# 아카이브 안내

최신 작업·중단 조건은 [현재 작업](../current-work.md)이 소유한다. [2026-10-16 문서 정리](2026-10-16/README.md)는 종료된 계획·조사/QA와 과거 상태표를 보존하며, [전체 문서 점검](documentation-audit-2026-10-16.md)은 각 문서의 보존·이동 판단을 기록한다. 이 색인의 과거 체크박스를 현재 실행 지시로 사용하지 않는다.

현재 계약은 [문서 인덱스](../README.md), 완료/미완료와 중단 조건은 [현재 작업](../current-work.md)을 따른다.
이동은 요구사항 삭제, 제안의 구현 승인 또는 운영 검증 완료를 뜻하지 않는다.

## 2026-10-21 문서·아카이브 재대조

[미커밋 문서 77개 점검 기록](documentation-reconciliation-2026-10-21.md)은 master `aa58ddb8`과 대조한
보관 위치·기록 적용 범위·관측일을 설명한다. 기존 10/16 아카이브와 활성 계약·원본 자산을 유지하며,
10/20 보존 작업 트리의 중복 보관 배치를 다시 복사하거나 삭제하지 않았다.

## 2026-10-20 구조 후보01~03 완료

[PR #176 검토·구현·운영 검증 자료](2026-10-20-candidates-1-3/README.md)를 보관했다. 현재 판정은 [최신 구조 검토](../architecture-review.md)가 소유한다. 원문의 로컬 전용·미배포 표기는 당시 상태다.

## 2026-10-17~19 완료 관측

아래는 완료된 관측의 원문이며 본문의 당시 ‘다음 관측’을 다시 예약하지 않는다. 최신 완료 여부와 남은 한계는 현재 작업 문서가 소유한다.

- [양 사이트 자연 X·자동 일정 시각 확인](../reports/sul-36/2026-10-17-1925-natural-observation.md)
- [LuvDia 자연 자동 일정](../reports/sul-36/2026-10-17-2310-luvdia-natural-schedule.md)
- [OTW 자연 자동 일정·관측 예약 종료](../reports/sul-36/2026-10-18-1210-otw-natural-schedule.md)
- [LuvDia 공개·OTW 멤버/D-day 숨김·원본 보존](../reports/sul-36/2026-10-19-publication-observation.md)

## 2026-09-22 정리 기록

- [브랜치 통합·검증·운영 스키마 확인](branch-consolidation-2026-09-22.md)
- [AI 요청 분석·모델 비교](ai-review-optimization-2026-09-22.md)
- [포스터 디자인 QA](snapshot-poster-design-qa-2026-09.md)
- [SUL-27 검증 자료 정리](sul-27-validation-closeout.md)
- [9/17 Graphify 분석 기록](graphify-2026-09-17/README.md)
- [선택된 Play 로고 시안](otw-play-logo-2026-09-09/README.md)
- [8/31 YouTube 운영 조정·분석 자료](youtube-cadence-adjustment-2026-08-31.md)

생성 그래프·캐시와 미채택 로고 시안은 Git `cec6d273`에서 복원할 수 있다.
운영 계약·DB migration·이미지 원본은 이번 정리 대상이 아니다.

## 2026-09-17 통합 전 원문

- [Play 요구사항과 ID](otw-play-product-requirements-before-2026-09-17.md)
- [시스템 ADR·schema](otw-play-system-design-before-2026-09-17.md)
- [UI/UX](otw-play-ui-ux-design-before-2026-09-17.md)
- [단계별 구현·검증](otw-play-implementation-guide-before-2026-09-17.md)
- [비용 최적화 과정](backend-cost-optimization-before-2026-09-17.md)
- [종료 구현 제거 과정](retired-implementation-cleanup-before-2026-09-17.md)

## 조사·설계와 완료 기록

| 영역 | 기록 |
| --- | --- |
| 구조 | [실행 계획](architecture-refactoring-plan.md), [완료 검증](architecture-refactoring-verification.md) |
| 편성표 | [auto-update 조사](auto-update-heuristic-v2-review.md), [스냅샷 QA](sul-10-snapshot-design-qa.md) |
| Play | [MVP 조사](music-player-member-mvp-review.md), [벌크 수집·제안](otw-play-catalog-bulk-ingestion-and-proposal-lifecycle-research.md), [구독 자동화](otw-play-channel-subscription-automation-research.md), [credit·노래책](otw-play-detailed-credits-and-member-songbook-research.md) |
| Play 검토 | [폐기된 3개 화면](otw-play-three-screen-design.md), [release 검토](otw-play-release-review.md), [9/14 통합 검토](session-consolidation-review-2026-09-14.md) |
| UI·검사 | [UI inventory](ui-component-inventory.md), [UI audit](ui-system-audit.md), [test audit](testing-audit.md) |
| 운영 | [미사용 구현](unused-implementation-audit-2026-09-09.md), [관측 변경](observation-validity-2026-09-09.md), [종료 Hub 진단](websub-hub-diagnosis-2026-09-09.md), [X provider 사고](x-provider-upload-404-incident-closeout.md) |
| 범위에서 제외된 조사 | [공유 배너: 요구사항 삭제](external-share-banner-review.md), [VOD AI: 별도 프로젝트 분리](vod-ai-summary-highlight-technical-review.md) |
| 이번 정리 | [문서 closeout](documentation-closeout-2026-09-17.md) |
| 후속 작업 판단 | [남은 작업 설명·중요도 보고서](remaining-work-priority-report-2026-09-17.md) |

원문의 날짜·수치·실패·미완료는 당시 상태다. 링크는 이동 경로로 정리했고 과거 임시 경로의
파일이 지금도 존재한다고 보장하지 않는다.
