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

## 자동 빌드 실패와 검증 경계 보완

PR210 병합 `d14c01f6`의 자동 빌드가 실패했고 기존 운영9415는 유지됐다. 최초 의존 검색에서 `worker/test-support/native-workflow-provider.ts`의 이전 이름 기반 URL 참조를 놓쳤다. 추가 로컬 native Workflow 검증에서3건의 실패를 재현했다. 제품 계약을 되돌리는 대신 fixture를 동일한 숫자 ID 경로에 맞추고, 기존 native Cron→Workflow→Queue 검증에 ID 경로4회와 페이지 상한의 확인을 추가한다. CI 상세 로그는 브라우저 주소 확인 제한으로 읽지 못했으므로 로컬 재현과 실제 CI 결과를 구분한다. 실패 기록은 소유 PR에 보존한다.

fixture 수정 후 native Workflow·혼합 수집22건 및 타입·변경 lint가 통과했다. 이 경계의 추가 실패로 전체 `pnpm test` 검증을 확장하며 최종 판정과 운영 artifact/readback은 PR 원장에 기록한다. 브라우저 조작이 현재 주소 확인 제한으로 중단되어 새 관리자 수동 실행·화면 캡처는 미확인으로 남기고, 정상 정기 Cron→Workflow→Queue와 기존 읽기 전용 인터페이스로 운영 수집을 확인한다.

게시·배포·운영 복구의 실제 결과는 소유 PR의 검증 원장에 추가한다. 이 문서의 로컬 mock 통과나 공급자 직접200만으로 운영 복구를 주장하지 않는다.

## 운영 제약

기존 공통 UTC 하루$1 목표·사이트 보호·자동충전·웹훅 Disabled와 수동 재활성화 기능·Play/AI 중지를 유지한다. 강제 공식 유료 호출·pending 재개·예산 증액·직접 SQL 수리는 하지 않는다. 실제 서비스 확인은 정상 관리자 기본 수집원 실행→Workflow/Queue→Fx→D1→공개 피드로 수행한다. 공급자의 일시 장애나 짧게 게시됐다 삭제된 글의 무누락을 보장하지 않는다.
