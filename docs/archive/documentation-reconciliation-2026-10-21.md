# 문서·아카이브 재대조 — 2026-10-21

대조 기준은 master `aa58ddb8268cd44722636aed4a1b60940ab42262`다. 원본 작업 트리의 미커밋 545개 중
문서·아카이브 77개만 검토했다. 이 날짜는 문서·파일 위치 확인일이며 새 운영 관측일이 아니다.
현재 작업·중단 조건은 [현재 작업](../current-work.md)이 소유한다.

## 보관 위치와 색인

원본의 `docs/archive/2026-10-20/` 49개는 기존 보관/활성 자료의 복사 제안 39개,
퇴역 이관 시험 원본 4개, 이 배치의 색인·manifest·테스트 점검 기록 6개로 구성된다.
39개 모두 현재 master에 대응하는 문서·자산이 있으며 기존 위치를 유지한다.
새 날짜의 보관 폴더에 다시 복사하면 과거 관측일과 실제 정리 시점이 섞이고 색인·자산이 중복된다.

| 자료 | 유지하는 진입점과 범위 |
| --- | --- |
| 종료된 계획·조사·QA | [10/16 보관 색인](2026-10-16/README.md), [당시 문서 점검](documentation-audit-2026-10-16.md) |
| SUL-36 과거 검토·실행 | [현재 기록 색인](../reports/sul-36/README.md), [정리 전 기술 검토](2026-10-16/reports/sul-36/technical-review-before-closeout.md) |
| 공개 전환 작업 목록 | [10/16 원문](../reports/sul-36/2026-10-16-work-register.md). 이후 결정과 현재 승인은 단일 인계를 따름 |
| 후보01~03 완료 자료 | [10/20 보관 색인](2026-10-20-candidates-1-3/README.md), [최종 구조 검토](../architecture-review.md) |
| Play 작업 큐 | [초기 구조 기록](../otw-play-playlist-work-queue.md), [현재 가져오기·검수 계약](../otw-play-import-review-redesign.md) |
| 폐기된 3개 화면 시안 | [당시 설계](otw-play-three-screen-design.md), [프롬프트·기존 이미지 위치](../assets/otw-play-three-screen/prompts.md) |
| SUL-31 측정 | [당시 보고서](2026-10-16/reports/sul-31/README.md), [기존 측정 원본](../reports/sul-31/read-costs.json) |
| 종료 maintenance Worker | [기존 기록](../../scripts/maintenance/README.md). 배포·실행 지시로 재사용하지 않음 |

원본의 기존 문서·이미지·JSON·호환 안내 삭제 제안 13개는 반영하지 않았다.
활성 Play 계약, SUL-31 측정 원본, 디자인 이미지와 과거 계획의 짧은 이동 안내를 유지했다.
AGENTS·Design·README 및 상태표의 현행 운영 제한·공개 정책·주간표 복원 결정을 과거 사본으로 덮지 않았다.
원본 인계의 삭제된 작업 트리 링크 대신 이 저장소의 인계·검토·구조도 상대 경로를 사용한다.

## 테스트 기록의 적용 범위

10/20 보존 작업 트리의 테스트 점검은 `d27f26a4`와 당시 미커밋 입력을 대상으로 한 과거 실행 기록이다.
본문의 삭제·통합·이관 시험 판정과 실행 수를 현재 master의 적용 상태나 현재 PASS로 바꾸지 않는다.
해당 배치의 원문·JSON·퇴역 시험 사본은 원본 미커밋 자료로 보존하며 실행 대상으로 복원하지 않는다.

[PR #178](https://github.com/rlatmfrl24/overthewall-schedule/pull/178)의 선별 보완 26개는
head `323997730fe5d03774ef7e244f577ae31f7999c1`에서 merge `9e4d0886640c3b66183bbd2aac329792d4db9632`로
병합됐고, 현재 master의 해당 파일과 같다. 기존 62개 검토는 보완 26개·추가 변경 불필요 21개·퇴역/취소 제외 6개·삭제 보류 9개로 구분한다.
삭제 보류 9개는 그대로 유지하므로 과거 문서의 삭제 제안을 재적용하지 않는다.

[PR #179](https://github.com/rlatmfrl24/overthewall-schedule/pull/179)는
head `bc5366f585586335a9947b7afd20902b6a269fc4`에서 merge `aa58ddb8268cd44722636aed4a1b60940ab42262`로
병합됐다. native local D1 포트 선별 patch와 연결 설정은 현재 master에 있다.
현재 CLI 실행이나 오래된 작업 트리의 의존성 설치 상태를 이 문서 점검으로 검증한 것은 아니다.

[테스트 가이드](../testing.md)는 현행 package 명령과 세 Worker 프로젝트를 설명한다.
기본 test의 마지막 Node 검사와 앞 단계 실패 시 중단되는 `&&` 순서를 구분한다.
이번에는 테스트·빌드·migration·CLI·운영 API·유료 AI를 실행하지 않았다.

## 로컬 스크린샷 2개

독립 배포 작업의 [실행 보고서](../../.superpowers/sdd/2026-10-13-luvdia-independent-deployments/task-4-3-report.md)는
아래 로컬 보관 파일로 연결된다. 두 파일의 현재 크기·SHA-256을 10/20 보관 manifest의 해당 행과 대조했다.
원래 보고서의 관측 시점과 로컬 fixture·운영 미검증 한계는 유지한다.

로컬 보관 루트는 `C:/Users/rlatm/Documents/Codex/archives/overthewall-schedule/2026-10-20-test-audit/`다.
이 경로의 `manifest.json`에서 원래 경로와 복원 위치를 확인한다. 파일 자체는 Git에 복사하지 않았다.

| 루트 아래 파일 | bytes | SHA-256 |
| --- | ---: | --- |
| `.tmp/sul36-4-3-fix2-ui116.jpg` | 110726 | `50a406d2ab0a3acd834f111a070a1cdc26188fa113540ec47776a5504d2b14b7` |
| `.tmp/sul36-4-3-fix2-ui117.jpg` | 110684 | `3ed7582845d7755ff266d7b6a13d342186c4e6789f4febbcf9990714d2082b0f` |

이 로컬 보관 위치는 해당 Windows 환경에서만 사용할 수 있으며 GitHub에서 이미지를 제공하는 경로가 아니다.

## 복원 미확인 캡처 5개

[9/29 카탈로그 QA](2026-10-16/design-qa.md)의 OS 임시 캡처 5개는 당시 경로와 10/20 보관 manifest에 없다.
이미지 복원은 미확인으로 유지하고 당시 경로를 원문에 텍스트로 남긴다. 과거 표시 확인·수치를 이번 재실행 결과로 바꾸지 않는다.

## 이번 정리의 범위

수정은 격리 작업 트리의 문서·링크·색인에 한정한다. 선별 점검 단계에서는 커밋·PR 게시를 하지 않았다.
이후 사용자가 분리한 8개 변경의 PR 게시·검토와 문제없을 때 병합을 승인했다.
원본 7개 작업 트리와 545개 미커밋 변경, 로컬 데이터·환경·의존성·실행 중 서버를 보존한다.
삭제·수동 배포·운영 작업은 수행하지 않으며 최신 범위는 [현재 작업](../current-work.md)을 따른다.
중지된 자동화·LuvDia AI=false·유료 AI·대량 작업 보류를 유지한다.
