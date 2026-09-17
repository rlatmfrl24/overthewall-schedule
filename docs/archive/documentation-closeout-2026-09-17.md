# 프로젝트 문서 통합 closeout — 2026-09-17

대상: OTW Schedule. 기준 소스 `58cb3f7e26146614b0af06dc4cc61ab086a35702`.
작업 branch: `codex/docs-consolidation-closeout-20260917`.
상태: 문서 통합·검증·잔여 작업 인계 완료.
문서 정리·인계의 종료 기록이며 제품 backlog·운영 검증·배포 전체의 완료 선언이 아니다.

## 결과와 문서 권위

[문서 인덱스](../README.md)를 현재 계약의 진입점으로 정리하고
[개발·운영 상태](../development-status.md)에 구현 범위·종료 작업·잔여 gate를 통합했다.
Play 네 문서와 운영 runbook 두 문서를 현재 구현 기준으로 재구성했다.
정리 전 원문 여섯 개와 조사·검증 기록 17개는 [아카이브](README.md)에 보존했다.
내용 보존 비교에서 이동한 23개 모두 링크 변경 외 원문이 동일했다.

`PRODUCT.md`는 제품 결정, `Design.md`는 화면 규칙, 각 capability/runbook은 세부 계약을
소유한다. 과거 계획은 현재 작업을 재개시키는 지침이 아니다. 미완료 DEC/FR/ADM/NFR를
아카이브 이동으로 삭제하지 않았고 명시적 대체 관계와 backlog를 남겼다.

## 수정한 불일치

| 이전 설명 | 현재 기준과 근거 |
| --- | --- |
| 음악 기능이 앞으로 시작할 roadmap | catalog/player·가져오기·개인 playlist 구현 반영. [루트 개요](../../README.md) 수정 |
| 익명 Play catalog·관리자 전용 preview 단계 | 회원 catalog와 서버 관리자 preview, config 이외 인증/no-store. [현재 계약](../otw-play-product-requirements.md) |
| 곡 수 gate 기반 멤버 노래책·검색 색인 | 멤버 필터 검색, 기존 URL redirect, Play 검색 noindex·프로필 SEO 유지 |
| 저장형 playlist 제외·큐레이션 구현 전 | 기본 전체 가창 모음·개인 비공개 저장 구현. 상세 추가 완료 후 첫 곡 재생도 실제 호출과 대조 |
| 노래방송 입력 제외·공식곡과 clip 혼합 가능 | singing_clip 검수/게시 경계와 관리자 clip 탐색, 일반 회원 공식 범위 격리 |
| WebSub 구독·drain·49시간 제거 대기 | 시간당 uploads polling; WebSub 제거 완료 기록·과거 DB 보존 |
| 7일 비용 관측을 앞으로 수행 | UTC 9/9~9/15 종료와 예약 삭제를 9/16 최종 보고에 연결 |
| preflight가 coverage 비율 gate 포함 | unit/Worker 한 번, coverage는 선택 진단. 실제 runner에 맞게 수정 |
| 폐기한 시안·로컬 검토 branch가 현재 UI 기준 | 현재 Play 스타일·탐색 동선, 과거 시안은 archive |
| 문서 이름·경로 불일치 | `DESIGN.md` → `Design.md`, 이동 문서의 inbound/outbound·anchor 링크 정리 |

## 분석과 검증 경계

이전 graphify 전체 분석과 `apiFetch` 연결 추적을 탐색 출발점으로 사용했다.
그래프는 문서 정리 전 snapshot이며 구현·권한·상태 판단은 실제 source를 재확인했다.
그래프를 이번 문서 변경에 맞춰 다시 생성했다고 주장하지 않는다.

대표 읽기 연결은 Play UI → Query → capability API → apiFetch → Worker registry → 인증
→ application → D1 reader다. 쓰기는 검수/게시·CAS·원자성·권위 재조회 경계를 유지한다.
이 흐름의 문서상 정합성을 확인했으며 이번 작업에서 실제 등록·게시·외부 API 호출을 수행하지 않았다.
코드에 맞추기 위해 승인된 제품 의미를 바꾸거나 테스트 기대값을 수정하지 않았다.

운영 종료 판단은 날짜가 있는 기존 권위 readback 보고서에만 근거한다.
X 30일 관찰, 계정 이전, pause 중 Play 신규 업로드 canary, AI 전체 품질과 제품 backlog는
[잔여 상태표](../development-status.md)에 남겼다. 비용 수치를 청구액 절감으로 확대 해석하지 않았다.

## 이번 작업의 검사

- Markdown 76개 파일의 상대 링크 1,254개와 Markdown anchor 링크 22개를 검사했다.
  현행 문서의 누락 경로·대소문자·anchor 오류 0건, 원문 23개 보존 비교 통과다.
- 과거 UI audit가 참조하는 임시 로그 여섯 개는 현재 없다. 당시 기록을 조작하거나
  오늘의 로그로 대체하지 않고 [원래 감사 기록](ui-system-audit.md)에 경로를 보존한다.
- `.agent`의 canonical 참조를 유지하고 동기화 검사와 관련 회귀 검사 5개가 통과했다.
- 프로젝트 지정 Node 24.20.0 / pnpm 11.7.0에서 `pnpm preflight` 전체 통과:
  architecture, test typecheck, lint, 301개 파일·2,271개 테스트, Worker/웹 build·SEO 자산 생성,
  local D1 doctor, agent mirror check. 별도 `node --test scripts/sync-agent-to-cursor.test.mjs`
  5개도 같은 Node 버전에서 통과했다.
- `git diff --check` 통과. staged 변경은 Markdown만 포함하며 source·test·migration·의존성 변경 0건이다.
- 작업 중 링크 정규화가 canonical agent 참조를 축약해 mirror 검사가 실패했으나,
  canonical 경로를 복원한 뒤 sync·5개 회귀 검사·최종 preflight를 모두 다시 확인했다.
- 원시 검사 결과는 로컬 `.tmp/docs-consolidation-20260917/`의 `preflight.log`,
  `link-check.json`에 있다. 이 디렉터리는 임시 자료이며 위 요약을 지속 보존 근거로 남긴다.

## 전달 범위

애플리케이션·Worker·DTO·DB schema·migration·의존성은 변경하지 않는다.
운영 설정·배포·DB·자동화·GitHub에는 쓰지 않는다. 기존 graphify 산출물과 미커밋 변경을
이 문서 정리와 분리해 보존한다. 문서 자체의 closeout과 운영 release 승인을 혼동하지 않는다.
