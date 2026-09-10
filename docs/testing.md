# 테스트 실행과 유지보수

Node 버전은 `.node-version`, pnpm 버전은 `package.json#packageManager`를 따른다.
테스트는 로컬 Node/jsdom과 격리된 workerd/D1에서 실행하며 운영 DB를 사용하지 않는다.

## 실행 명령

| 명령 | 범위 |
| --- | --- |
| `pnpm test` | 단위·Worker 통합 프로젝트를 한 번씩 실행 |
| `pnpm test:unit` | `src`, `worker`, `scripts`의 단위 테스트. `*.integration.test.ts` 제외 |
| `pnpm test:worker-integration` | `worker/**/*.integration.test.ts`, workerd와 격리된 D1 |
| `pnpm test:coverage` | 전체 프로젝트 실행과 합산 Istanbul 커버리지 |
| `pnpm typecheck:test` | 프런트 테스트·Worker·Vite/Vitest 설정 타입 검사 |
| `pnpm preflight` | architecture, test typecheck, lint, 전체 coverage, build, D1 doctor, mirror check |

`preflight`의 coverage 단계는 테스트 assertion도 실행한다. 같은 변경에서 이미
`preflight`가 통과했다면 단순 확인 목적으로 전체 `test`를 다시 실행할 필요는 없다.
실행 구성 자체를 바꿀 때는 `test`와 `test:coverage` 양쪽 진입점을 확인한다.

대상 파일만 확인할 때:

```sh
pnpm test:unit worker/features/otw-play/http/playlist-handler.test.ts
pnpm test:worker-integration worker/features/otw-play/infrastructure/d1-playlist-repository.integration.test.ts
pnpm test:unit src/features/otw-play/ui/playlists/playlist-editor-page.test.tsx --sequence.shuffle --sequence.seed=20260910
```

`vitest.config.ts`는 단위 프로젝트, `vitest.worker.config.ts`는 Worker 프로젝트다.
전체 실행과 coverage는 `vitest.all.config.ts`의 같은 프로젝트 목록을 사용한다.
이전 `vitest.coverage.config.ts` 직접 호출은 전체 설정 파일로 변경한다.
공통 별칭·커버리지 범위·임계값·동시 실행 수는 `vitest.shared.ts`에서 관리한다.
동시 worker는 2개로 제한하며, 실패를 감추려고 timeout이나 assertion을 완화하지 않는다.

## 커버리지 해석

합산 보고서는 `coverage/coverage-summary.json`과 `coverage/index.html`에 생성된다.
현재 대상은 프런트 API·model·use-cases·공통 API와 Worker application·domain·infrastructure다.
임계값은 statements 70%, branches 60%, functions 70%, lines 70%다.
UI·queries·player·HTTP 어댑터 등의 테스트도 실행하지만 해당 파일의 코드 커버리지는
이 수치에 포함하지 않는다. 전체 제품의 검증 비율로 해석하지 않는다.
단위 설정을 직접 `--coverage`로 실행할 때의 V8 보고서는 Worker를 제외한 진단 결과다.

## 테스트 작성·정리 기준

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
