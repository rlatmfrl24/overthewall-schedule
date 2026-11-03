# X 정기 복구의 native Workflow 게이트웨이 누락

2026-11-03. PR207의 실제 양 사이트 배포 확인 중 발견한 후속 결함이다. 기준은 병합 `253e9d7189944394160b470321054982e18123c9`다. 배포 성공과 수집 성공을 구분하며 공통 UTC 하루$1, 사이트100c,24시간 주기와 Play/AI 중지는 유지한다.

## 운영에서 확인한 결과

- PR207은 검토 HEAD3016522를 고정해 병합했다. OTW merge-triggered build `2b3b37b0-e59f-4362-83e0-4df2492c2a8a` PASS 후 version `7aafc8b7-c57d-43de-94ca-a2b34c3a9c68`이100% 활성이다. LuvDia는 같은 병합 트리의 공식 build/deploy guard를 거쳐 version `927d0bf3-37af-4b64-99e6-acf275bb5e43`이100% 활성이다.
- 실제 양 사이트 관리자 정상 진입에서 새 REST 안내를 확인했다. LuvDia 공개 HTML/entry JS SHA256은 로컬 병합 산출물과 일치한다. 구독은 OTW5/5·LuvDia3/3이고 공급자 GET도 실제8개·valid webhook1개다. 사이트 pause와 등록 오류는 없다.
- 그러나09:23 KST Cron이 생성한 X Workflow `c576511f-4578-4531-aa10-267d26881040`은 complete/success이면서 단계·최종 output이 모두 null이었다. D1에는 새 X run이 없고 기존 이월2개·예산 오류3개가 그대로다. 같은 시각 YouTube Workflow는 정상 run ID를 반환했다.
- 직접 D1 관측은 각 스냅샷554행 읽기·쓰기0이었다. 공통 사용5,000/예약0/목표1,000,000 micros, 두 사이트100c·24시간·수집 활성·Play 중지를 유지했다. 강제 유료 수집, 커서 보정, 설정 변경과 원격 migration은 하지 않았다.

## 원인과 최소 수정

Cron·HTTP·Queue 진입점은 `withXGateway`로 사이트별 공통 예산 게이트웨이를 구성한다. 반면 `ScheduledOperationsWorkflow`는 raw `this.env`로 coordinator를 생성했다. Cron의 사전 계획은 복구 대상을 찾지만 native Workflow의 재계획은 공통 예산을 읽을 gateway가 없어 대상0개로 끝났다. 따라서 Workflow complete만 보면 실제 미실행을 놓친다.

Workflow가 coordinator를 생성할 때도 기존 `withXGateway(this.env)`를 사용한다. 구체 adapter 생성은 기존 app composition에 남기고 예산·권한·사이트 RPC·중복 방지·재시도 정책은 바꾸지 않는다. 공통 게이트웨이 실패를 우회하거나 운영 상태를 성공으로 정규화하지 않는다.

## 회귀와 검증

새 회귀는 실제 Worker를 컴파일한 기존 native 테스트에서 Cron→Workflow step→Queue→collector→D1 최종화를 실행한다. 전체24시간 주기 전 미완료 페이지를 재현하며 `X_API_GATEWAY`를 주입하지 않는다. 외부 X/Analytics만 기존 로컬 provider 경계다.

- 수정 전 Workflow output null로 FAIL했다. 수정 후 native6건 모두 PASS, 실제 run 생성/succeeded·게시물 저장·cursor/오류 해제·source의 원래 다음 점검 시각·전체 cadence 불변·100c 설정을 확인했다.
- 관련 다른5파일58건도 PASS했다. 최종 native6건을 합친 고유64건의 영향 범위 검증이다. 전체 test/worker/node 타입·전체 린트·구조 검사 PASS이며, 최종 테스트 fixture 변경 후 test 타입과 변경 린트도 다시 확인했다. 양 사이트 build와 artifact manifest도 PASS다.
- 이전 PR207의 전체401파일3,400건+보조10건·로컬 D1 doctor158개 체인·mirror27개 증거 중 변경되지 않은 범위를 재사용한다. 새 Workflow 경계와 소비자는 위64건으로 재검증한다. 전체 suite를 새 수정에서 다시 실행했다고 주장하지 않는다. 구성/lockfile/선언 patch는 기준과 동일하다. 검증된 의존성 junction의 위치 차이로 pnpm metadata 경고가 있어 재설치를 막고 동일 의존성으로 실행했다.
- 독립 Standards: hard 위반0·의미 있는 냄새0. Spec: 추가 지적0/PASS. 배포 후 자연 재개와 LuvDia native Workflow→공통 RPC 복구는 이 로컬 결과만으로 확인됐다고 하지 않는다.

운영 실패, 공개 산출물과 활성 버전, config/readback, RED/GREEN 로그는 원래 주 저장소의 `.tmp/2026-11-03-x-review/`에 보존했다. 상세 판정은 [PR207 댓글](https://github.com/rlatmfrl24/overthewall-schedule/pull/207)에 남겼다. 후속 수정은 별도 PR로 게시하며 아직 운영에 반영하지 않았다.
