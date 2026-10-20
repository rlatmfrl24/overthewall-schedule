# Play 카탈로그 조회 검토 지적 1~3 수정

기준: `b2be7c7e1f976a8702eb9fa386186ada0f28ed82` + `codex/play-catalog-retry`의 로컬 미커밋 변경. 구조 검토 **후보 02**에서 확인한 세 문제를 수정했다. 직전 후보 01의 저장 재시도·migration 0148 변경은 보존했다. 이번 조회 수정에 신규 schema·migration·의존성은 없다.

## 수정과 사용자가 도달하는 경로

1. 관리자 카탈로그 진입 → 서버 페이지 조회 → URL의 페이지 밖 선택 곡 보완을 기존 `use-admin-catalog.ts`가 함께 관리한다. 기존 `mergeAdminCatalogRows`로 songs/performances/entities/channels의 높은 version을 채택하고, 같은 version은 최신 snapshot revision의 내용을 사용한다. 최초 페이지·행의 위치는 유지한다. 화면의 중복 선택 query·Map 병합은 제거했다. 마지막 페이지의 `paged`·커서·메타데이터 계약을 유지하며 혼합 결과를 완전한 snapshot이라고 인증하지 않는다.
2. 선택 조회가 대기 중이면 상태를 표시한다. 실패하면 성공한 목록을 유지한 채 오류와 **선택한 곡 다시 불러오기**를 제공한다. 버튼은 해당 조회만 재시도하고 진행 중 중복 클릭을 막는다. 캐시가 남아 있는 재조회 실패도 오류를 표시한다.
3. 같은 관리자 GET → HTTP handler → 저장소의 검색에서 항상 SQL LIMIT을 사용한다. 정렬 키·ID의 커서로 최대 26개 후보씩 읽고 기존 Unicode/구두점 판정을 통과한 `limit+1`개가 모이면 멈춘다. 후보가 최종 규칙에서 탈락하면 다음 묶음을 계속 읽는다. 공개 커서는 마지막 반환 행에서 만들므로 다음 페이지의 곡을 건너뛰지 않는다. 첫 페이지 밖의 정확한 제목·별칭은 기존 인덱스를 각각 좁혀 확인하며, 같은 정규화 키의 원문 충돌도 나눠 읽는다. 인증·보관 제외·필터·전체 게시의 명시적 전체 조회 경로는 유지한다.

## 먼저 실패시킨 회귀 사례

- 목록 성공 + 페이지 밖 선택 503: 오류 안내가 없어 실패했다. 수정 후 오류 → 버튼 재시도 → 선택 곡 표시, 기존 목록 유지까지 통과했다.
- 페이지 revision9의 인물 version3 + 선택 캐시 revision7의 같은 인물 version1, 선택 재조회 실패: 실제 관리자 **곡 정보 수정 → 원곡 가수 검색**에서 최신 인물이 사라져 실패했다. 수정 후 최신 인물 표시·과거 인물 미표시를 확인했다.
- 5,000곡 실제 로컬 D1: `q=Cost`의 1,000행 미만 읽기 예산 assert가 실패했다. 일반 목록 659행 대비 검색은 10,607행, 곡 선택기는 5,254행이었다.
- 독립 검토에서 새 snapshot 정렬이 다음 페이지를 앞으로 보내는 회귀를 발견했다. 첫 페이지 revision7 → 둘째 페이지 revision8에서 DOM 순서가 예상 following(4) 대신 preceding(2)로 실패했다. 행 위치와 최신 내용 선택을 분리한 뒤 같은 테스트가 통과했다.

## D1 비용

동일한 5,000곡·5,000가창 fixture, 25곡 응답, 실제 `D1AdminCatalogRepository`와 `meterD1` 기준이다. 운영 과금이나 네트워크 지연 측정은 아니다.

| 조회 | 수정 전 rowsRead | 수정 후 rowsRead | 수정 후 SQL 수 | rowsWritten |
| --- | ---: | ---: | ---: | ---: |
| 일반 목록 | 659 | 659 | 13 | 0 |
| 검색 목록 `q=Cost` | 10,607 | 659 | 13 | 0 |
| 곡 선택기 `q=Cost` | 5,254 | 283 | 9 | 0 |

검색 목록 읽기는 약93.8%, 곡 선택기는 약94.6% 줄었다. 곡 선택기의 정확 일치 확인에 좁은 SQL 2개가 추가된다. 이는 위 fixture의 측정이며 모든 검색의 비용 상한을 보장하지 않는다.

## 검증과 실행 환경

Node `24.20.0`, pnpm `11.7.0`. **관련 109개 사례를 단계별 합성 검증했다**: 관리자 UI78 + 선택기7 + Ready 캐시5 + HTTP handler13 + 실제 D1 조회6. 제품 동작을 테스트에 맞춰 축소하거나 시간 제한을 확대하지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| 최종 관리자 화면 핵심 회귀 | 3개 PASS: 최신 행·선택 실패 복구·서로 다른 revision의 페이지 순서 |
| 실제 D1 조회 회귀 | 6개 PASS: 페이지/필터/전체 조회, 5,000곡 비용, Unicode/구두점 후보 탈락, 멤버 제외, 페이지 밖 정확한 제목, 정규화 충돌 30건 뒤 Unicode 정확 별칭 및 후속 페이지 |
| 선택기·Ready 캐시·HTTP handler | 25개 PASS (7+5+13) |
| 기존 관리자 전체 사례 | 78개 합성 PASS: 최초45개 + 실패33개만 재실행하여28개 + 남은5개를 별도 프로세스에서 각각 PASS. 원래 5초/15초 제한 유지 |
| 타입 검사 | 최종 소스의 `pnpm typecheck:test` PASS (테스트·Worker·Node), 양 사이트 build의 `tsc -b`도 PASS |
| 변경 파일 lint | 최종 변경 파일5개의 ESLint PASS |
| 구조 검사 | PASS |
| 양 사이트 production build | OTW·LuvDia 모두 PASS, 각 artifact manifest 확인. 기존 500kB chunk 경고는 남음 |
| 독립 정적 재검토 | 페이지 순서 지적 수정 후 잔여 지적 0건 |

관리자 전체 파일의 단일 실행은 33개 시간 초과로 FAIL이었다. 중간 재실행도 5개 시간 초과로 FAIL이었으며, 이 실행들을 전체 PASS로 표현하지 않는다. 최종 핵심3개는 페이지 순서 보완 후 별도 실행에서 모두 통과했고, 나머지 기존 흐름은 위의 단계별 결과로 확인했다. UI 묶음 실행의 시간 안정성은 여전히 제한이다.

공식 Cloudflare Vitest pool은 `vitest.all.config.ts`와 `vitest.worker.config.ts`에서 시작 시간 초과로 두 번 중단되어 실행 사례 0개다. 이를 PASS로 계산하지 않았다. 대안으로 원본 검증 DB를 SQLite backup으로 별도 `.tmp/review2/d1-query-regressions`에 복제하고, 설치된 Wrangler의 Miniflare/workerd와 실제 D1에 연결했다. 전체 canonical migration 148개가 `d1_migrations`에 존재함을 확인한 fixture setup에서 **정식 저장소 테스트 파일의 검색 관련 6개 사례를 그대로** 실행했다. SQL·저장소·DTO 변환·D1 메타데이터를 mock하지 않았다. 이미 적용된 migration 확인만 임시 setup이 담당하며, 생략된 migration 요청은 오류로 처리한다. 선택하지 않은 나머지 22개 쓰기 사례의 이번 실행 통과를 주장하지 않는다.

UI 검증은 실제 관리자 컴포넌트와 TanStack Query를 렌더링하고 API 응답만 통제했다. HTTP handler 13개는 기존 단위 테스트다. 이번 변경에서 운영 브라우저나 새 HTTP→D1 통합 mutation을 실행한 것은 아니다. 후보 01의 별도 HTTP 저장 재시도 증거는 [이전 보고서](2026-10-20-play-catalog-retry.md)가 소유한다.

실행 증거는 ignored `.tmp/review2/`의 `ui-fix-red.log`, `ui-stale-red.log`, `ui-order-red.log`, `ui-final-green.log`, `cost-native-red.log`, `cost-native-green.log`, `d1-native-regressions.log`, `unit-owner-green.log`, `ui-rerun.log`, `ui-isolated.log`, `types-final.log`, `lint-final.log`, `architecture.log`, `build-sites.log`에 있다. 임시 실행 setup은 제품 테스트 구성을 변경하지 않는다.

빌드는 기존 정식 `scripts/build-site.mjs`를 양 사이트에 순서대로 실행했다. 원본 checkout의 공개 origin·Clerk 공개 식별 설정만 메모리에서 사용했으며 비밀 설정을 복사·출력하거나 파일에 저장하지 않았다. 변경 파일의 `git diff --check`도 통과했다.

## 남는 한계와 운영 상태

- 희소·무결과 부분 문자열 검색은 여전히 인덱스의 많은 행을 훑을 수 있다. 정당한 검색 결과를 누락시키는 임의 상한은 두지 않았다. 실제 비용이 문제로 관측되면 별도 검색 인덱스 설계가 필요하며, 이 한계와 전환 조건을 코드의 `shortcut:` 주석에 남겼다.
- 이 작업은 로컬 미커밋 수정이다. PR·push·병합·배포·원격 SQL·운영 업무 API 호출은 하지 않았다. 원본 개발 DB와 기존 미커밋 변경을 보존했다. 전체 preflight는 PR 병합 준비 범위가 아니므로 실행하지 않았다.
- 중지된 자동화·유료 AI를 재개하지 않았다. LuvDia AI=false와 기존 운영 제한을 유지했다.
