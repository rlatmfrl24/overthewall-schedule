# X 무료 수집 오류 복구 — 2026-11-04

## 실제 장애와 범위

운영 소스 `9415f208`에서 무료 우선 전환 후 OTW9개·LuvDia13개의 신규 글을 정상 저장·공개했다. LuvDia의 `binghayu`·`u_lili__` 후속 페이지와 `yangmei1126` 첫 페이지는 `fx_http_404`였고 미완료 cursor와 실패를 보존했다. 같은 저장 cursor/첫 페이지를 후속 조회했을 때 모두200이었다. 당시 실패 body가 없으므로 공급자 내부의 handle 해석 실패인지 타임라인 지시문 부재인지 구분할 수 없다.

OTW의4페이지 상한과 pending은 실제로 남은 탐색이다. 저장 cursor 뒤에도 수집 시작일 이후의 글이 존재했다. 이를 장애로 간주해 cursor를 삭제하거나 완료로 표시하지 않는다.

## 최소 수정

`fetchFxTimelinePage`가 이미 확보한 신뢰된 계정 ID로 `/2/profile/id:<id>/statuses`를 조회하도록 변경한다. [공식 parseHandleOrId 원본](https://github.com/FxEmbed/FxEmbed/blob/main/packages/atmosphere/src/providers/twitter/profile.ts)과 [공식 타임라인 구현](https://github.com/FxEmbed/FxEmbed/blob/main/packages/atmosphere/src/providers/twitter/userStatuses.ts)이 이 경로를 지원한다. 실제 LuvDia3계정의 ID 경로가200·일치하는 작성자를 반환했다. 페이지마다 반복하던 handle→ID 해석 의존성을 제거하며 요청 횟수나 재시도를 추가하지 않는다.

HTTP 전에 숫자 ID를 검증한다. 같은 ID의 변경된 handle 응답은 빈 성공으로 삼지 않고 identity 오류로 보존한다. 다른 작성자 문맥·리포스트 제외, 고정 HTTPS 호스트·무인증, 기존 저장/lease/CAS·공식 커서/시계·예산·D1 보호는 유지한다. 실제404는 여전히 실패이며 이미 저장한 첫 페이지와 durable cursor를 보존한다.

## 로컬 검증

- Node24.20.0·pnpm11.7.0, 기준 `9415f208`.
- RED: 기존 handle 의존 경로2개 단위·1개 D1 회귀 실패, 변경 handle을 빈 페이지로 승인하는 회귀1개 실패를 확인했다.
- GREEN: Fx API20건·Fx 수집 D1 통합11건 통과. 실제404에서 첫 페이지 보존·미완료 cursor/실패 유지와 ID 경로 복구에서 공식 cursor/clock 불변·기존 공개 reader readback을 포함한다.
- `pnpm typecheck:test`, `pnpm architecture:check`, 변경3파일 ESLint 통과.
- 전체 preflight는 기준9415의 통과한 전체420파일3,856 PASS/3SKIP·Node10·lint/타입/구조/로컬 D1/mirror와 수정 후 영향 검사를 결합한다. 최종 소스의 전체 명령을 재실행한 것으로 보고하지 않는다.

독립 scoped 리뷰는 열린 유효 지적0건이며 `git diff --check`가 통과했다. 양 사이트 production build/manifest와 agent mirror 참조 검사도 통과했다. schema·migration·의존성·설정 변경은 없다.

게시·배포·운영 복구의 실제 결과는 소유 PR의 검증 원장에 추가한다. 이 문서의 로컬 mock 통과나 공급자 직접200만으로 운영 복구를 주장하지 않는다.

## 운영 제약

기존 공통 UTC 하루$1 목표·사이트 보호·자동충전·웹훅 Disabled와 수동 재활성화 기능·Play/AI 중지를 유지한다. 강제 공식 유료 호출·pending 재개·예산 증액·직접 SQL 수리는 하지 않는다. 실제 서비스 확인은 정상 관리자 기본 수집원 실행→Workflow/Queue→Fx→D1→공개 피드로 수행한다. 공급자의 일시 장애나 짧게 게시됐다 삭제된 글의 무누락을 보장하지 않는다.
