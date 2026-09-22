# 개발·운영 상태와 인계

기준일: 2026-09-22. 소스 기준: `cec6d273402c18e0fe1b66d8c982cbaf64db273f`.
분산된 계획의 **현재 상태와 남은 작업**을 통합한다. 계약은 [PRODUCT](../PRODUCT.md)와
[Play 요구사항](otw-play-product-requirements.md), 화면은 [Design](../Design.md), 구조는
[architecture](architecture.md)를 따른다. `구현 반영`은 현재 소스에 존재한다는 뜻이며
`운영 확인`은 해당 날짜의 실제 흐름·권위 readback이 필요하다. 이번 정리에서 운영을 재조회하지 않았다.

## 구현 반영 범위

9월 17일 이후 PR #143–147과 SUL-26·SUL-28 통합을 반영했다. [브랜치 통합 기록](archive/branch-consolidation-2026-09-22.md)의 운영 마이그레이션 readback은 당시 증거이며 이번 문서 정리에서 다시 실행하지 않았다.

| 후속 반영 | 근거 / 검증 경계 |
| --- | --- |
| 공개 페이지 AEO·테마별 초기 로딩, 회원 전용 Play 정책 유지 | [AEO 계약](aeo.md). 검색 노출·AI 답변 채택 효과는 별도 관찰 |
| Play 탐색·재생 UX, Ready 검색 projection, 회원 곡 요청·가수 재사용 | PR #143–146 및 현행 Play 구현. 모든 역할별 운영 흐름 완료를 뜻하지 않음 |
| AI 완료 알림·비프음, 기존 곡 자동완성, 요청 재사용 최적화 | [AI 검수](otw-play-ai-review.md), [9/22 분석](archive/ai-review-optimization-2026-09-22.md). 소수 영상 비교와 전체 품질 인증을 구분 |
| VOD 저장 조회수 24시간 갱신·회당 최대 100개·할당량 유지 | [YouTube 운영](youtube-optimization.md), SUL-26 |
| 휴방 추정 승인·기존 일정 비교·추가 방송 간격·조회 실패 처리 | SUL-28, migration 0096. 로컬 검토 UI와 통합 테스트 확인; 실제 운영 수집·휴방 승인 흐름은 미검증 |

| 영역 | 현재 범위 | 근거 / 한계 |
| --- | --- | --- |
| 편성표·이미지 출력 | 일간/주간 편성, live 연계, 스냅샷·포스터·기존 편성 출력 | PR #141/#142가 기준 HEAD에 포함. [디자인](../Design.md), [스냅샷 QA](archive/sul-10-snapshot-design-qa.md), [포스터 QA](archive/snapshot-poster-design-qa-2026-09.md) |
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
| X 비용 추적 / OPS-X-30D | 2026-09-17 사용자 판단: 현재 비용 수용 가능. 추가 추적·30일 비용 보고 종료; 일반 수집·예산 제한 유지 |
| 관측 예약 종료 | 같은 보고서에 예약 7 삭제·동일 작업 잔여 0건 기록. 이번에 재삭제하지 않음 |
| 문서 통합 | [이번 closeout](archive/documentation-closeout-2026-09-17.md). 기능·운영 전체 완료와 구분 |

## 2026-09-17 사용자 결정

- **X 비용 추적 종료:** 현재 비용이 괜찮다는 사용자 판단으로 종료한다. 10/2까지 관측하거나 최종 비용 보고를 작성하는 의무는 해제한다. 정량 절감 목표 달성을 새로 입증했다는 뜻은 아니다.
- **AI 품질:** 테스트 예정으로 유지한다.
- **자동 수집:** 기능 확인이 필요한 작업으로 유지한다. 이 문서 변경으로 운영 pause를 해제하지 않는다.
- **요구사항 삭제:** player 원곡 가수 표시(BACKLOG-PLAYER / FR-021의 해당 표시 부분), 제작 참여·만든 곡(LATER-CREDIT / FR-045·ADM-031 및 관련 제작 참여 확장), 외부 공유 배너를 이 프로젝트 범위에서 제외한다.
- **별도 프로젝트 분리:** VOD AI 요약·하이라이트를 이 프로젝트의 요구사항·잔여 작업에서 제외한다. 별도 프로젝트 생성·구현은 이번 반영에 포함하지 않는다.
- 삭제 항목은 완료 기능으로 집계하지 않는다. 기존 원곡 가수 데이터·목록/상세 표시와 가창자 credit은 이번 잔여 요구사항 정리로 제거하지 않는다. 대표곡 지정과 기존 참여 정보 정정은 남기되, 삭제된 제작 참여 기능을 다시 전제하지 않는다.

## 남은 작업

나열 순서는 새 구현 승인이나 착수 순서를 뜻하지 않는다. 각 종료 조건을 충족한 항목만 닫는다.

| ID | 상태 / 다음 행동 | 종료 조건 |
| --- | --- | --- |
| OPS-PLAY-UPLOAD | 기능 확인 필요(사용자 지정). 수집 제어·예약 전달·후보 저장의 기존 증거와 미검증 구간을 확인; 운영 재개는 별도 결정 | 예약 전달 → candidate → 관리자 검수/draft readback; 중지 기간 자동 소급 금지 |
| OPS-PLAY-RELEASE | 실제 재생·역할별 접근·source-health 전체 시나리오는 각 release에서 확인 | 대상 Worker/flags와 실제 흐름 증거. 과거 flags 1/1만으로 통과 아님 |
| OPS-ACCOUNT | runtime 통합 검증됨, 전용 계정 provisioning/cutover 대기 | [계정 이전](cloudflare-production-account-migration.md)의 별도 승인·대상 리소스·데이터·실사용 readback |
| AI-QUALITY | 9/22 공개 영상 3건 모델 비교 완료. 메들리·듀엣·장시간 및 전체 정확도 평가는 미완료 | [AI 문서](otw-play-ai-review.md)의 원본 입력·출력·관리자 적용·실패/예산 확인 |
| LATER-PIN | FR-047·ADM-032 대표곡 pin | 최대 5곡·순서·fallback과 재조회 |
| LATER-CORRECTION | FR-048·ADM-037 참여 정보 정정 | 본인 제출·근거·승인 전 비반영·승인/거절 |
| BACKLOG-MERGE | ADM-009 가창 병합 | 실제 관리자 병합과 참조/중복/이력 무결성 |
| NEXT-LIBRARY | 좋아요·최근 청취·멤버 라디오·공동/공개 공유 목록 | 소유·보관·동기화·공유 정책 확정 후 구현. 개인 비공개 playlist와 분리 |
| NEXT-BROADCAST | 방송별 setlist·원본 방송만으로 재생 | [클립 계약](otw-play-singing-clips-requirements-and-plan.md)과 구분해 범위 결정 |

과거 playlist canary·source-health 등의 증거는 이번 정리만으로 모두 완료 또는 미완료로
재판정하지 않았다. 향후 release에서 기존 증거와 대상 artifact를 대조하고 부족한 검증만 수행한다.
불필요한 중복 수집·운영 쓰기를 만들지 않는다.

## 갱신 규칙

계약은 소유 문서 한 곳에서 바꾸고 이 표에는 상태·근거 링크만 갱신한다.
종료 기록에는 날짜·commit/배포 identity·실제 진입점·readback·한계를 남긴다.
과거 보고서를 현재 검증처럼 다시 쓰지 않는다. graphify는 정리 전 분석 snapshot이며
현재 문서보다 우선하지 않는다.
