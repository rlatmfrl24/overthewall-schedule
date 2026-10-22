# 로컬 테스트 경로 이식성 — 2026-10-22

## 범위와 기준

사용자가 Relay를 설치하지 않고 `C:/workspace` 하드코딩을 수정하고, 메일에서 주장한
macOS 임시 디렉터리/Rollup 문제를 추가 점검하도록 요청했다.
기준 HEAD는 `8065d065cee8e022272751ce2886e50299f43366`이다.
제품 코드·리소스 격리·의존성·시간 제한·assertion은 유지하고 테스트 파일 2개만 수정했다.
이 기록은 메일 발신자의 실제 실행 횟수나 환경을 입증하지 않는다.

## 원인과 수정

`scripts/local-site-config.test.ts`는 `C:/workspace`를 절대 경로로 가정했다.
Linux에서 기존 Vitest 테스트를 실행하면 실제 결과가
`/workspace/C:/workspace/worker/index.ts`가 되어 실패했다.
OS의 `tmpdir()`와 `join()`으로 절대 경로와 기대값을 구성하도록 수정했다.
실제 설정 생성 함수와 원격 리소스 금지 검사는 그대로다.

`scripts/generate-seo-assets.test.ts`의 Vite 빌드는 일반 임시 경로에서는 통과했지만,
임시 디렉터리가 별칭인 경우 실패했다. Windows의 실제 junction에 `TEMP`·`TMP`를,
Linux의 실제 심볼릭 링크에 `TMPDIR`를 지정해 기존 테스트를 실행했다.
양쪽 모두 아래 Rollup 오류가 발생했다.

```text
[vite:build-html] The "fileName" or "name" properties of emitted chunks and assets
must be strings that are neither absolute nor relative paths,
received "../../physical/site-seo-vite-<unique>/index.html".
```

Vite가 입력 HTML을 실제 경로로 해석했으나 테스트의 `root`는 별칭 경로여서,
HTML 출력 이름 계산에 상위 디렉터리 이동이 포함됐다. 실제 설치된 Vite 7.3.6의
HTML 빌드 플러그인과 Rollup 4.60.4 스택을 대조했다.
[Vite 공식 문서](https://vite.dev/config/shared-options.html#resolve-preservesymlinks)도
기본 모듈 식별에 심볼릭 링크를 해석한 실제 경로를 사용한다고 설명한다.
임시 부모를 `realpath()`로 먼저 확정한 뒤 `mkdtemp()`를 수행하도록 수정했다.
부모 경로 검사·고유 임시 디렉터리·`finally` 정리와 실제 Vite 빌드·HTML 검사는 유지한다.

## 실제 검증

Windows는 Node 24.20.0, Linux 컨테이너는 Node 24.22.1을 사용했다.
두 환경의 pnpm은 11.7.0, Vitest는 4.1.11이며 Vite/Rollup 버전도 같다.
Linux는 기준 커밋의 `git archive`와 frozen lockfile로 격리 복사본을 구성했다.
설치는 `--ignore-scripts`로 수행했으며, 정상 Linux 의존성을 사용한 기존 테스트를 실행했다.
수정 후에는 변경한 테스트 2개만 이 복사본에 덮어써 재검증했다.

| 조건 | 수정 전 | 수정 후 |
| --- | --- | --- |
| Linux 일반 임시 경로, 관련 3개 파일 | 1 FAIL / 12 PASS | 13 PASS |
| Windows 일반 임시 경로, 관련 3개 파일 | 이번 작업의 변경 전 실행은 생략 | 13 PASS |
| Windows junction 임시 경로, SEO 테스트 | 1 FAIL / 5 PASS | 6 PASS |
| Linux 심볼릭 링크 임시 경로 | SEO 1 FAIL / 5 PASS | 관련 3개 파일 13 PASS |

관련 3개 파일은 `local-site-config.test.ts`, `generate-seo-assets.test.ts`,
호출자 회귀 확인용 `site-resources.test.ts`다. 고유 테스트는 13건이며,
조건별 재실행 횟수를 새 테스트 수에 합산하지 않는다.
표의 별칭 조건은 모듈/파일시스템 mock 없이 실제 파일시스템과 기존 Vite 빌드를 사용했다.

기본 명령:

```text
pnpm exec vitest run scripts/local-site-config.test.ts scripts/generate-seo-assets.test.ts scripts/site-resources.test.ts
pnpm typecheck:test
pnpm exec eslint scripts/local-site-config.test.ts scripts/generate-seo-assets.test.ts
pnpm architecture:check
git diff --check
```

타입 검사 3개 프로젝트·변경 파일 린트·구조 검사·공백 검사는 모두 PASS다.
전후 실행 출력과 Windows 별칭 진단 스크립트는 Git 제외
`.tmp/portability-20261022/`에 보관한다. Relay는 설치하거나 실행하지 않았다.

## 독립 검토

기준 HEAD 대비 테스트 2개 파일의 미커밋 diff를 독립 에이전트 두 명이 검토했다.
Standards: 문서 기준 위반·보고할 코드 스멜 0건.
Spec: 요구사항 누락·범위 확장·잘못된 구현 0건.
두 검토자는 테스트를 재실행하지 않았으며 실행 판정은 위 실제 검증에 한정된다.

## PR 준비 전체 검증 — 조합 검증 PASS

사용자가 전체 preflight 실행과 통과 후 커밋·PR 생성·검토 및 다른 세션 인계를 요청했다.
Windows Node 24.20.0·pnpm 11.7.0에서 공식 `pnpm preflight`를 실행했다.
구조·타입·전체 린트·391개 파일의 3,208개 테스트·동기화 스크립트 자체 검사 10건과
production 빌드는 PASS였다. 전체 테스트 시간은 420.44초였다.
이후 로컬 D1 doctor가 기존 `0149_multiview_channels.sql` 미적용과 테이블 부재로 실패해
전체 명령은 종료 코드 1로 중단됐다. 정책 동기화 단계는 그 실행에서 도달하지 못했다.

로컬 migration 목록에서 대기 항목이 기존 0149 하나임을 확인했다. SQLite backup API로
기존 DB를 보존한 후 `pnpm drizzle:migrate:local`로 해당 migration만 증분 적용했다.
기존 업무 테이블 121개의 행 내용 해시가 모두 같고, 새 `multiview_channels`는 0행임을
재조회했다. 변경된 기존 테이블은 Wrangler·migration 내부 메타데이터 3개뿐이다.
DB reset·seed·원격 SQL·새 migration 생성은 수행하지 않았다.

저장소의 실패 후 재검증 규칙에 따라 이미 통과한 테스트·빌드 증거를 유지하고,
`pnpm d1:doctor`와 미실행 단계인 `pnpm sync:agent-cursor:check`를 실행해 모두 종료 코드 0을 확인했다.
정책 동기화는 27개 파일 동일·링크 유효이며, 검사 조건은 완화하지 않았다.
두 테스트·package.json·lockfile·preflight 실행기의 해시가 최초 실행과 같음을 확인했다.
최종 판정은 **모든 preflight 구성 단계 PASS인 조합 검증**이며,
전체 명령을 처음부터 재실행해 종료 코드 0을 얻은 것으로 표현하지 않는다.
로그·로컬 DB 보관본·전후 데이터 비교는 Git 제외 `.tmp/portability-20261022/preflight/`에 있다.

## 한계

macOS 장비에서의 직접 실행은 하지 않았다. 재현·수정한 것은 실제 임시 경로와 별칭 경로가
다른 조건의 Rollup 오류이며, 메일 작성자의 macOS 실행 자체를 확인한 것은 아니다.
전체 테스트와 preflight 구성 단계는 위 PR 준비 검증을 따르며, 운영 UI 검증·배포는 수행하지 않았다.
변경은 테스트 입력 경로에만 한정되며 제품 동작이나 배포 산출물을 수정하지 않는다.
