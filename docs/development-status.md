# 개발·운영 상태와 인계

기준일: 2026-09-17. 소스 기준: `58cb3f7e26146614b0af06dc4cc61ab086a35702`.
분산된 계획의 **현재 상태와 남은 작업**을 통합한다. 계약은 [PRODUCT](../PRODUCT.md)와
[Play 요구사항](otw-play-product-requirements.md), 화면은 [Design](../Design.md), 구조는
[architecture](architecture.md)를 따른다. `구현 반영`은 현재 소스에 존재한다는 뜻이며
`운영 확인`은 해당 날짜의 실제 흐름·권위 readback이 필요하다. 이번 정리에서 운영을 재조회하지 않았다.

## 구현 반영 범위

| 영역 | 현재 범위 | 근거 / 한계 |
| --- | --- | --- |
| 편성표·이미지 출력 | 일간/주간 편성, live 연계, 스냅샷·포스터·기존 편성 출력 | PR #141/#142가 기준 HEAD에 포함. [디자인](../Design.md), [스냅샷 QA](archive/sul-10-snapshot-design-qa.md), [포스터 QA](../design-qa.md) |
| 사이트 콘텐츠 | 공지·이벤트, YouTube/CHZZK VOD·클립, X/Naver 피드, 프로필, Mul.Live multiview | [개요](../README.md), [구조](architecture.md). Chrome extension은 범위 아님 |
| Play 접근 | 회원 catalog/player/playlist, 관리자 preview·clip 탐색, 별도 회원 제안 | [Play shell](../src/features/otw-play/ui/public/play-shell.tsx), [HTTP](../worker/features/otw-play/http/public-catalog-handler.ts) |
| 멤버 탐색·SEO | 멤버 필터 검색, 구 멤버 URL redirect, Play 검색 noindex, 프로필 SEO 유지 | [제품 정책](../PRODUCT.md). 독립 노래책·곡 수 gate 대체 |
| Play 목록 | 전체 가창 기본 모음, 상세 보기·명시적 queue 추가, 개인 비공개 저장 | [PlaylistService](../worker/features/otw-play/application/playlist-service.ts), [UI 계약](otw-play-ui-ux-design.md) |
| 입력·검수 | 직접 등록·가져오기, Ready catalog materialization, 제안 수정·철회, clip 구간·게시 경계 | [관리자 흐름](otw-play-admin-workflow-integration.md), [클립 계약·증거](otw-play-singing-clips-requirements-and-plan.md) |
| Play AI | Gemini 보조·명시적 적용·예산·별도 Queue | [AI 검수](otw-play-ai-review.md). 실제 호출과 전체 품질 검증 구분 |
| 예약 운영 | Cron → Workflow → Outbox → Queue, read-only D1 guard, 실제 partial 보존 | [예약 작업](operations/scheduled-jobs-v2.md) |
| 승인 채널 수집 | 시간당 polling, pause·watermark·continuation·gap·backfill | [polling](operations/channel-upload-polling.md). 신규 업로드 canary는 잔여 항목 |

## 종료된 작업

| 작업 | 종료 근거와 경계 |
| --- | --- |
| 구조 리팩터링·UI/test 조사 | [아카이브](archive/README.md)에 당시 완료·조사 증거 보존. 현행 구조·명령으로 통합 |
| 폐기한 Play 3개 화면·WebSub 계획 | 현재 발견/검색/playlist와 polling으로 대체. 과거 이력·무결성 계약 보존 |
| WebSub 리소스 제거 | [9/16 최종 보고](operations/backend-cost-observation-final-2026-09-16.md)에서 Queue·secret·binding 부재 확인. 49시간 대기를 재등록하지 않음 |
| 백엔드 비용 7일 관측 | UTC 9/9~9/15, 168시간 관측 종료. claim 읽기 감소 목표 충족; 전체 청구액 인과 효과는 미증명 |
| 관측 예약 종료 | 같은 보고서에 예약 7 삭제·동일 작업 잔여 0건 기록. 이번에 재삭제하지 않음 |
| 문서 통합 | [이번 closeout](archive/documentation-closeout-2026-09-17.md). 기능·운영 전체 완료와 구분 |

## 남은 작업

나열 순서는 새 구현 승인이나 착수 순서를 뜻하지 않는다. 각 종료 조건을 충족한 항목만 닫는다.

| ID | 상태 / 다음 행동 | 종료 조건 |
| --- | --- | --- |
| OPS-PLAY-UPLOAD | global pause 중 신규 업로드 canary 미검증. 승인된 재개 후 실제 새 업로드 관측 | 예약 전달 → candidate → 관리자 검수/draft readback; 중지 기간 자동 소급 금지 |
| OPS-PLAY-RELEASE | 실제 재생·역할별 접근·source-health 전체 시나리오는 각 release에서 확인 | 대상 Worker/flags와 실제 흐름 증거. 과거 flags 1/1만으로 통과 아님 |
| OPS-X-30D | 2026-09-02~10-02 비용 관찰 중 | [X 비용 계약](operations/x-api-cost-minimization-design.md)의 원장·Developer Console 대조. 백엔드 7일 관측과 별개 |
| OPS-ACCOUNT | runtime 통합 검증됨, 전용 계정 provisioning/cutover 대기 | [계정 이전](cloudflare-production-account-migration.md)의 별도 승인·대상 리소스·데이터·실사용 readback |
| AI-QUALITY | 실제 모델 호출 이후 전체 품질·운영 효과는 별도 검증 | [AI 문서](otw-play-ai-review.md)의 원본 입력·출력·관리자 적용·실패/예산 확인 |
| LATER-CREDIT | FR-045·ADM-031 제작 참여/만든 곡 | 공식 근거·관리자 검증과 실제 표시 |
| LATER-PIN | FR-047·ADM-032 대표곡 pin | 최대 5곡·순서·fallback과 재조회 |
| LATER-CORRECTION | FR-048·ADM-037 참여 정보 정정 | 본인 제출·근거·승인 전 비반영·승인/거절 |
| BACKLOG-MERGE | ADM-009 가창 병합 | 실제 관리자 병합과 참조/중복/이력 무결성 |
| BACKLOG-PLAYER | FR-021 player 원곡 가수 표시 | 목록/상세와 별도로 재생 패널에서 표시 |
| NEXT-LIBRARY | 좋아요·최근 청취·멤버 라디오·공동/공개 공유 목록 | 소유·보관·동기화·공유 정책 확정 후 구현. 개인 비공개 playlist와 분리 |
| NEXT-BROADCAST | 방송별 setlist·원본 방송만으로 재생 | [클립 계약](otw-play-singing-clips-requirements-and-plan.md)과 구분해 범위 결정 |
| PROPOSALS | [공유 배너](archive/external-share-banner-review.md), [VOD AI](archive/vod-ai-summary-highlight-technical-review.md) 조사 보존 | 조사 종료는 구현 승인·개발 완료가 아님 |

과거 playlist canary·source-health 등의 증거는 이번 정리만으로 모두 완료 또는 미완료로
재판정하지 않았다. 향후 release에서 기존 증거와 대상 artifact를 대조하고 부족한 검증만 수행한다.
불필요한 중복 수집·운영 쓰기를 만들지 않는다.

## 갱신 규칙

계약은 소유 문서 한 곳에서 바꾸고 이 표에는 상태·근거 링크만 갱신한다.
종료 기록에는 날짜·commit/배포 identity·실제 진입점·readback·한계를 남긴다.
과거 보고서를 현재 검증처럼 다시 쓰지 않는다. graphify는 정리 전 분석 snapshot이며
현재 문서보다 우선하지 않는다.
