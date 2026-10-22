# Worker 종료 지연 복구 — 2026-10-22

## 범위와 재현

기준은 PR #186 병합 `da95f37132e31b050d3889d4415cb6d8add63ca1`이다.
Windows, Node 24.20.0, pnpm 11.7.0, Vitest 4.1.11의 기존 기본 worker 2개를 사용했다.
사용자 요구는 남은 종료 지연 경고의 원인을 수정하고 시간 제한·검증 조건을 유지하는 것이다.

기존 전체 preflight에서 경고가 난 세 파일을 같은 combined 설정으로 실행했다.

```powershell
pnpm exec vitest run --config vitest.all.config.ts src/features/members/model/current-member-affiliation.test.ts worker/features/audit/infrastructure/log-filter.integration.test.ts worker/features/operations/infrastructure/retained-content.integration.test.ts --reporter=default
```

수정 전: 순수 함수 검사 2건은 3ms에 통과했지만 `Timeout terminating forks worker`가
발생했다. Cloudflare runner 시작 제한 초과도 발생해 2개 파일·7개 테스트만 보고됐고
명령은 실패했다(111.52초). 대상 파일 하나만 단위 설정으로 실행하면 종료 경고 없이
2개 테스트가 통과했다(409ms). 경고 파일명은 이전 전체 실행마다 달랐다.

## 원인

호스트의 종료 응답 교환, 실제 worker 종료, 이벤트 루프 지연을 임시 계측했다.
혼합 실행에서 호스트 이벤트 루프가 33.4초 막혔지만, 실제 종료 응답은 수 ms,
Node 프로세스 종료는 7ms, Miniflare 정리는 34ms였다. 리소스 누수를 원인으로 확정할
근거가 없었으며, 이 경우에는 호스트가 종료 응답과 타이머를 처리하지 못하는 것이 문제였다.

Node CPU 프로파일은 `readD1Migrations` → Wrangler 4.124.0의 `splitSqlIntoStatements`에
약 38초가 사용됐음을 보였다. 긴 trigger/CASE 문장의 매 문자마다 전체 누적 문자열을
`isCompoundStatementStart`와 `isCompoundStatementEnd`에 넘겨 반복해서 펼치고 검사했다.
다음 프로젝트의 lazy migration 준비가 이미 끝난 worker의 종료 대기와 겹쳤다.

[Cloudflare의 migration reader 계약](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
그대로 전체 migration을 읽는다. Vitest의 경고 타이머는 그대로 두고, 그 타이머가 알려 준
호스트 점유의 원인을 수정한다. 단순한 substring 검사는 누적 문자열 펼침이 남아 효과가
없었으므로 최종 patch는 최근 표식 문맥을 별도로 유지한다.

## 수정과 의미 보존

테스트 pool의 전이 의존성 Wrangler 4.124.0에 pnpm patch를 등록했다.
SQL 원문을 누적하는 동안 최근 7자를 별도로 유지하고, 기존 `BEGIN/CASE/END` 정규식에는
그 문맥만 전달한다. 시작 표식은 최대 7자, 종료 표식은 최대 5자여서 기존 매칭에 필요한
문맥을 모두 보존한다. SQL을 append하는 모든 분기와 문장 초기화에서 같은 문맥을 갱신한다.
문자열·주석·dollar quote 소비, 복합문 스택과 실제 출력 SQL은 기존 제어 흐름을 유지한다.

| 전체 canonical 입력 | 수정 전 | 수정 후 |
| --- | ---: | ---: |
| Migration 수 | 148 | 148 |
| SQL 수 | 10,582 | 10,582 |
| JSON 바이트 수 | 24,038,005 | 24,038,005 |
| 직접 reader 실행 시간 | 35,521ms | 4,483ms |

전체 JSON의 바이트 동등성과 SHA-256
`4ade712e087d97b057ae7c842d8e9318b1ac69bfa0bf44d22e2a9e29c37b3ae1` 일치를 확인했다.
실행 시간은 현재 기계의 관측값이며 모든 부하에서의 성능 보장은 아니다.

운영 의존성·제품 코드·migration 파일·Wrangler 4.129.1의 기존 D1 포트 patch는 변경하지 않는다.
Vitest나 pool 버전, timeout, 재시도, 격리, 병렬 수, 기존 assertion·test include/exclude를 바꾸지 않는다.
경고 필터나 강제 종료로 증상을 숨기지 않는다.

## 회귀 검사와 실제 혼합 실행

`scripts/d1-migration-reader.test.ts`에 공개 `readD1Migrations` API를 통한 검사 5건을 추가했다.

- 전체 canonical migration의 처리 시간이 기존 5초 테스트 범위 안에 드는지 확인한다.
  동기 작업이 Vitest 타이머 실행 자체를 막을 수 있어 실제 elapsed도 명시적으로 검사한다.
- 복합문·중첩 CASE, 대소문자, 줄바꿈·tab·비분리 공백, 따옴표·주석·dollar quote와
  산술 연산, 후속 SQL 분리를 확인한다.

수정 전에는 처리 시간 42,574ms가 5,000ms 조건을 넘겨 1건 실패했고 의미 검사 4건은 통과했다.
최종 수정과 확장 fixture에서는 5건 모두 통과했다(전체 canonical reader 3,762ms).
한도를 늘리거나 측정 범위를 줄이지 않았다.

원래 세 파일의 mixed 명령도 그대로 재실행해 **3개 파일·9개 테스트 PASS, 종료/시작 경고 0건**을
확인했다(19.33초). 모든 임시 Vitest 계측을 제거했고 설치된 Vitest 실행기 파일의 원본 SHA-256 일치를 확인했다.

## 최종 검증

구현 head `1cb7b72b43a94988a6bb72eef508fa49884819d2`에서 요구사항·구현 검토와
프로젝트 규칙·설계 검토를 독립적으로 수행했고 두 검토 모두 수정할 지적이 없었다.
같은 head의 자동 Codex 검토도 지적 없이 완료됐다.

이후 공식 `pnpm preflight`를 처음부터 끝까지 한 번 실행해 **종료 코드 0, 전체 PASS**를 확인했다.

- 구조 검사, 테스트·Worker·Node 타입 검사와 린트 PASS.
- 기본 병렬 worker 2개로 380개 파일·3,124개 테스트 PASS(395.37초).
- 정책 동기화 스크립트 검사 10건 PASS, 실패·취소·생략 0건.
- 운영 빌드, 로컬 D1 doctor와 정책 미러·참조 검사 PASS.
- 전체 로그의 worker 시작·종료 실패 및 제한 초과 경고 **0건**.

기존 테스트 시간 5초·비동기 기대 1초·종료 제한 10초, 실제 타이머, 격리,
기존 assertion과 전체 migration을 유지했다. 재시도·테스트 생략·경고 필터를 추가하지 않았다.
최종 문서 갱신 전후 코드·의존성·실행 설정 12개 파일의 SHA-256을 검증 입력 manifest와 대조했고 모두 일치했다.
최종 PR 판정과 병합 식별자는 [PR #187](https://github.com/rlatmfrl24/overthewall-schedule/pull/187)의
검증 댓글이 소유한다.

재현·CPU 프로파일·원본/수정 출력과 실행 로그는 Git 제외 `.tmp/worker-teardown-20261022/`에 보관한다.

## 검증 한계

이 작업은 로컬 테스트 실행·종료 경로를 수정한다. 운영 데이터 변경·원격 migration·추가 수동 배포는
수행하지 않으며 기존 양 사이트 일정 복구와 자동화 중지 정책은 유지한다.
