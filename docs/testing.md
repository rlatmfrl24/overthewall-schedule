# 테스트 실행과 유지보수

Node 버전은 `.node-version`, pnpm 버전은 `package.json#packageManager`를 따른다.
테스트는 로컬 Node/jsdom과 격리된 workerd/D1에서 실행하며 운영 DB를 사용하지 않는다.

## 실행 명령

| 명령 | 범위 |
| --- | --- |
| `pnpm test` | 단위·Worker 통합 프로젝트를 한 번씩 실행 |
| `pnpm test:unit` | `src`, `worker`, `scripts`의 단위 테스트. `*.integration.test.ts` 제외 |
| `pnpm test:worker-integration` | `worker/**/*.integration.test.ts`, workerd와 격리된 D1 |
| `pnpm test:coverage` | 별도 진단: 전체 프로젝트 실행과 합산 Istanbul 커버리지, 백분율 강제 없음 |
| `pnpm typecheck:test` | 프런트 테스트·Worker·Vite/Vitest 설정 타입 검사 |
| `pnpm preflight` | architecture, test typecheck, lint, 전체 test, build, D1 doctor, mirror check |

`preflight`는 PR 리뷰 수정이 정리된 최종 코드의 **병합 준비**, 또는 명시적으로
요청된 릴리스에서 실행한다. 일반 구현·수정·검토 요청의 완료, 최종 답변, 커밋,
PR 생성이라는 단계 전환만으로 전체 테스트나 preflight를 실행하지 않는다.
전체 coverage는 요청받거나 coverage 자체를 조사·변경할 때만 실행한다.

## 변경 범위에 따른 검증

- 기준 브랜치와의 커밋 차이 및 staged·unstaged·관련 untracked 변경을 함께 확인한다.
- 문서·스킬 변경은 링크·메타데이터·관련 보조 도구·동기화만 검사한다.
- 일반 코드는 변경된 동작과 영향을 받는 소비자 테스트를 실행한다. API·권한·DB
  변경은 해당 계약·권한·영속성 검증을 포함한다. Worker 경로라는 이유만으로
  D1 통합 테스트 전체를 실행하지 않는다.
- 의존성·테스트 설정·전역 기반 변경이나 영향 범위가 불명확한 변경은 근거를
  설명하고 검증 범위를 확대한다. 코드 변경에서 테스트가 0개 선택됐다고 성공은 아니다.
- 파일 지정 실행이나 `pnpm exec vitest related --run --config vitest.config.ts <source-files>`를
  사용할 수 있다. 정적 import로 드러나지 않는 동적 로딩·SQL·설정 의존성과
  영향받는 Worker 통합 테스트는 직접 추가한다.
- 명령·검증 범위·코드/설정 식별자·환경·결과를 기록한다. 같은 입력에서 통과한
  검증은 재사용하고 후속 수정이 무효화한 검사만 다시 수행한다.
- preflight는 전체 테스트를 커버리지 계측 없이 한 번 실행한다. 실패하면 실패하거나
  무효화된 검사와 fail-fast로 아직 실행되지 않은 후속 검사를 수행한다. 이 경우
  전체 명령 재통과가 아닌 **구성 검사별 증거를 합친 검증**이라고 보고한다.

대상 파일만 확인할 때:

```sh
pnpm test:unit worker/features/otw-play/http/playlist-handler.test.ts
pnpm test:worker-integration worker/features/otw-play/infrastructure/d1-playlist-repository.integration.test.ts
pnpm test:unit src/features/otw-play/ui/playlists/playlist-editor-page.test.tsx --sequence.shuffle --sequence.seed=20260910
```

`vitest.config.ts`는 단위 프로젝트, `vitest.worker.config.ts`는 Worker 프로젝트다.
전체 실행과 coverage는 `vitest.all.config.ts`의 같은 프로젝트 목록을 사용한다.
이전 `vitest.coverage.config.ts` 직접 호출은 전체 설정 파일로 변경한다.
공통 별칭·커버리지 범위·동시 실행 수는 `vitest.shared.ts`에서 관리한다.
동시 worker는 2개로 제한하며, 실패를 감추려고 timeout이나 assertion을 완화하지 않는다.
기본 reporter는 `dot`으로 성공 목록을 줄이고 실패 상세·최종 요약을 남긴다.
상세 시간 조사는 `--reporter=default`, 기계 판독은 `--reporter=json --outputFile=.tmp/test-result.json`을 사용한다.

## 커버리지 해석

합산 보고서는 `coverage/coverage-summary.json`과 `coverage/index.html`에 생성된다.
현재 대상은 프런트 API·model·use-cases·공통 API와 Worker application·domain·infrastructure다.
백분율 임계값은 사용하지 않는다. 누락된 요구사항·회귀 위험을 찾는 보조 진단이며
숫자를 높이기 위한 테스트를 추가하지 않는다. 콘솔에는 합계만, 파일에는 상세 결과를 남긴다.
UI·queries·player·HTTP 어댑터 등의 테스트도 실행하지만 해당 파일의 코드 커버리지는
이 수치에 포함하지 않는다. 전체 제품의 검증 비율로 해석하지 않는다.
단위 설정을 직접 `--coverage`로 실행할 때의 V8 보고서는 Worker를 제외한 진단 결과다.

## 테스트 작성·정리 기준

- 한 동작의 입력 조합은 해당 도메인·서비스에서 검증한다. HTTP는 인증·입력·응답,
  UI는 실제 조작·상태 보존·오류 복구를 검증한다. 다른 경계의 고유 위험은 중복이 아니다.
- 삭제·통합할 때는 보호하던 요구사항과 남는 검증 위치를 기록한다.
  [전체 테스트 검토 기록](archive/testing-audit.md)에서 관련 기능의 행만 참고한다.
  이 이력 전체를 매 작업마다 읽거나 다시 생성하지 않는다. 파일 수·테스트 수 목표는 두지 않는다.
- fixture는 새 객체를 반환하는 작은 함수로 공유하고, 시나리오별 차이는 테스트에 명시한다.
  기대값을 제품 로직에서 생성하거나 전역 공유 가변 상태를 만들지 않는다.
- 장식용 CSS 클래스와 전체 구현 객체의 복사본은 검증 대상으로 삼지 않는다.
  접근성·사용자에게 보이는 상태·명시된 데이터 및 운영 비용 계약은 유지한다.

- 테스트는 해당 capability 코드 옆에 둔다. Worker 단위 테스트는 `.test.ts`,
  실제 D1 실행은 `.integration.test.ts`로 구분한다.
- 요구사항이 바뀌면 기대 동작을 갱신한다. 삭제된 UI 구조를 보존하려고 제품 코드를 되돌리지 않는다.
- HTTP 테스트는 인증 주체, 공개 flag, 입력 검증, 상태 코드와 캐시 정책을 확인한다.
  서비스·저장소 테스트만 통과해도 요청 경계가 검증된 것은 아니다.
- D1 원자성·소유권·동시 수정은 실제 D1 통합 테스트로 확인한다. 선택된 migration은
  개별 테스트의 선행 조건이며, 일부 migration 테스트를 전체 migration chain 검증으로 간주하지 않는다.
- `clearAllMocks`는 호출 기록만 지운다. 테스트마다 달라지는 응답/일회성 실패는
  `resetAllMocks` 후 기본 응답을 설정하고, 전역 stub과 spy는 종료 시 복원한다.
- jsdom이 구현하지 않는 스크롤 같은 브라우저 기능은 필요한 테스트에서만 stub한다.
  라우터 이동·미저장 확인 등 검증 대상 흐름은 실제 컴포넌트를 사용한다.
- 입력 한도는 실제 숫자의 서버 경계 테스트를 유지한다. UI 분기 검증은 작은 한도를
  주입할 수 있지만, 이를 실제 최대 항목 수에서의 브라우저 성능 검증으로 보고하지 않는다.
- `skip`, `todo`, `only`로 검증 대상을 숨기지 않는다. 과거 실행 건수는 이력일 뿐이며
  현재 성공 여부·건수는 해당 실행 결과를 기준으로 기록한다.

자동 테스트는 로그인·재생·저장·모바일 조작의 실제 브라우저 검증을 대체하지 않는다.
네트워크 장애나 계정 전환을 mock으로 확인했다면 보고서에 그 한계를 명시한다.
