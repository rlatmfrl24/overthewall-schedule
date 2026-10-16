# OTW·LuvDia 운영 점검과 공개 준비

- 점검일: 2026-10-15, Asia/Seoul. 원격 관측 범위 약 21:39–21:47 KST.
- 작업 기준: `397love/sul-36-스케쥴-사이트-관련-기술-검토`, HEAD `d27f26a4`. 시작 당시 변경·신규 경로 334개. HEAD만으로 현재 작업 트리나 운영 artifact를 식별할 수 없다.
- 최초 점검·계획 작성 단계에서는 제품 코드를 변경하지 않았다. 이후 사용자가 이 세션의 직접 구현을 승인하여 공개 전환 코드를 구현했다. 운영 데이터·배포는 변경하지 않았다. [구현·검증 기록](2026-10-15-publication-cutover-execution.md)을 함께 참조한다.

## 확정 요구와 우선순위

사용자가 이번 대화에서 공개 범위와 시각을 확인했다. **2026-10-19 00:00:00 Asia/Seoul = 2026-10-18T15:00:00Z** 이전에는 LuvDia의 모든 공개 페이지·공개 콘텐츠 API를 숨기고 카운트다운을 표시한다. 정상 관리자 로그인·작업은 유지한다. 정각 이후에는 기존 공개/회원/관리자 권한을 그대로 적용한다. 공개가 회원 전용 Play를 익명 공개로 바꾸는 것은 아니다.

같은 시각 OTW에서는 이관 대상 빙하유(`bing_hayu`), 유리리(`u_lili`), 양메이(`yang_mei`)와 관련 콘텐츠를 일반 이용 동선에서 숨긴다. 과거 기록과 관리자 열람을 보존한다. 기존 10월 18일까지 동시 수집 허용의 종료도 이 시각과 일치시킨다. LuvDia 메뉴명은 정확히 **멀티뷰**로 바꾼다.

이 일정은 이전 설계의 10/18 11:00 공개 목표를 대체한다. 10/17 초기 개통 및 10/15 실제 개통 기록은 역사적 사실로 유지하며 새 공개 정책의 근거로 혼용하지 않는다. 현재 사이트에는 카운트다운이나 새 비공개 정책이 아직 적용되지 않았다.

| 순서 | 결과물 | 실행 계획 |
| --- | --- | --- |
| P0 | LuvDia 사전 숨김·관리자 유지·정각 공개, OTW 대상 숨김/수집 종료, 메뉴명 | [공개 전환](../../superpowers/plans/2026-10-15-site-publication-cutover.md) |
| P1 | 이미지 지연 개선, 계정 합산 비용과 예약 경로 판정 | [성능·운영 검증](../../superpowers/plans/2026-10-15-site-performance-operations.md) |
| P1/P2 | 동일 소스 release 증명, 임시 이관 책임 정리와 현행 구조 문서 | [버전·구조 정리](../../superpowers/plans/2026-10-15-shared-release-architecture.md) |

독립 작업으로 나누되 공개·숨김을 담당하는 공통 접근 정책은 하나만 사용한다. 시간 제약을 이유로 인증, 데이터 보존, retry/idempotency를 약화하지 않는다. 대량 D1 작업은 여유 회복 후 수행한다.

## 실제 확인 결과

### 동일 소스 구조와 현재 운영 버전은 다르다

| 항목 | OTW | LuvDia |
| --- | --- | --- |
| Worker | `overthewall-schedule` | `luvdia-schedule` |
| 현재 version, 100% | `6435fde3-4cf7-4ed8-9bdd-02ef1ade5022` | `f4df03db-0692-4506-a736-52857ca60a1d` |
| version 생성 UTC | 2026-10-13 06:32:50 | 2026-10-15 12:22:35 |
| D1 | `otw-db`, `133b980d-1701-427e-93fd-8c9dcca1132e` | `luvdia-db`, `ce8eec7f-0922-4119-ab75-f67133b94312` |
| R2 | `otw-schedule` | `luvdia-schedule` |
| Workflow | `otw-scheduled-operations` | `luvdia-scheduled-operations` |
| Queue/DLQ | `otw-*` 6개 | `luvdia-*` 6개 |
| AI flag | true | false |

Cloudflare settings/deployments/version/schedules/queues GET으로 위 값을 재확인했다. 양쪽 모두 peer Service binding이 없고 Queue delivery가 활성화되어 자기 Worker를 가리킨다. 같은 계정의 별도 자원이다. 인증도 별도 Clerk 앱을 쓰는 설계이며 실제 로그인·역할 분리는 [초기 개통 기록](initial-service-launch.md)에 검증되어 있다.

`wrangler.jsonc`와 `wrangler.luvdia.jsonc`는 같은 `worker/index.ts`, `drizzle` migration chain과 프런트 소스를 사용한다. 따라서 **공통 소스 기반은 맞지만 현재 동일 소스 버전 운영은 아니다. DB/데이터 외에도 Worker·R2·Queue·Workflow·Clerk·브랜드·플래그가 분리된다.** 서로 다른 version ID만으로 코드 차이를 판단한 것이 아니다. [재개 기록](otw-resume-and-luvdia-collection.md)이 OTW는 이전 코드/schema 0101을 유지하고 LuvDia는 신규 작업 코드/schema 0136을 사용했다고 명시한다. 이번에는 원격 migration 표를 다시 읽지 않아 schema 숫자는 해당 기록 기준이다.

`scripts/site-build-manifest.mjs`는 HEAD SHA·사이트·config hash·issuer를 기록하지만 dirty tree와 실제 JS artifact의 내용을 증명하지 않는다. 같은 HEAD에서 WIP가 바뀌어도 동일 소스처럼 보일 수 있다. 현재 폴더에 `.github/workflows`가 없으며, Cloudflare 연결 build의 실제 자동 배포 설정은 별도 확인이 필요하다. 자동 배포가 없다고 단정하지 않는다.

### D1: 읽기 예산이 우선 제약이다

Cloudflare GraphQL Analytics를 한 번 읽었다. 범위는 2026-10-15 UTC 00:00부터 조회 시각까지이며 계정에 반환된 두 DB 합계다.

| 자원 | 읽은 행 | 쓴 행 |
| --- | ---: | ---: |
| OTW | 785,142 | 8,396 |
| LuvDia | 3,802,459 | 38,673 |
| 합계 | **4,587,601** | **47,069** |

무료 기준 500만 읽기의 **91.752%**, 10만 쓰기의 **47.069%**다. 실제 계정 요금제를 확인하지 않았으므로 이를 계약상 잔여 한도로 단정하지 않는다. 사용자 요청의 80% 보수 기준에 따라 추가 D1 분석·대량 작업은 뒤로 미룬다. 분석 집계는 지연될 수 있다. 무료 일일 제한은 계정 기준이며 UTC 00:00, 한국시간 09:00에 재설정된다. [공식 D1 요금 문서](https://developers.cloudflare.com/d1/platform/pricing/)

기존 `CloudflareIngestionReadBudget`은 계정 전체 읽기를 확인하지만 Cron의 `hasScheduledD1WriteCapacity`는 자기 DB의 `scheduled_usage_daily` 쓰기 ledger를 확인한다. 따라서 **자기 DB 쓰기 guard 통과가 계정 전체 읽기 여유를 증명하지 않는다.** 관측 때문에 ledger를 추가 작성하지 않는다. 이번 점검에서 직접 D1 SQL, doctor, migration, 수집/AI 실행은 하지 않았다. 일반 페이지/API/이미지 조회는 앱 내부 읽기를 발생시키며 그 총량은 별도 계측하지 않았다.

### 프로필: 파일 크기보다 경로 지연을 먼저 조사

정상 Chrome 홈의 프로필 버튼으로 빙하유 화면에 진입하고 이미지 표시를 확인했다. 로그인 상태에서는 폭 3,790px 이미지가 Blob URL로 렌더링된다. 브라우저 도구가 Performance API를 제공하지 않아 전체 waterfall/LCP는 측정하지 못했다.

익명 HTTP 단발 측정은 아래와 같다. 지역·연결 재사용·실행 시점이 달라 p95 또는 개선률의 증거가 아니다.

| 요청 | 응답 | TTFB | 총 소요 | bytes | Cache-Control |
| --- | --- | ---: | ---: | ---: | --- |
| LuvDia `/api/members/bing_hayu` | 200 | 미분리 | 1,440ms | 미측정 | no-store |
| LuvDia `/profile/bing_hayu.webp` | 200 | 1,456ms | 2,650ms | 31,446 | no-store |
| OTW 동일 이미지 경로 | 200 | 474ms | 489ms | 31,446 | public, max-age=0, must-revalidate |

두 이미지의 ETag body hash가 같고 둘 다 `CF-Cache-Status: HIT`였다. 따라서 CDN 미적중만으로 설명할 수 없다. 이 헤더가 Worker 전체 응답이 D1 검사 없이 캐시되었다는 뜻도 아니다.

현재 코드에서 확인한 비용 후보:

- `worker/app/content-transition-access.ts`: 일반 읽기마다 inactive target workspace 확인.
- `worker/features/assets/infrastructure/d1-asset-access-reader.ts`: 멤버·프로필 참조·공지·카페 참조 UNION과 별도 접근 revision 조회.
- `worker/features/assets/http/handler.ts`: 공개 이미지도 no-store, 조건부 요청의 304 분기 없음.
- `src/shared/hooks/use-authenticated-image.ts`: 로그인 세션에서 same-origin 이미지를 Blob으로 다시 받음.
- `member-profile-page.tsx`: 최적화 이미지와 원본 fallback을 함께 요청하는 입력, 배경 이미지 전체 high priority preload.

이 경로들은 보관 자료 접근 보호를 담당한다. 검사 삭제나 public immutable의 일괄 적용은 개선안이 아니다. 실제 병목을 분리하고 동일 권한 의미를 유지한 채 조회·중복 전송을 줄인다. API의 `backgroundImages=[]`는 확인했으나 모든 멤버/파일 누락을 증명하지는 않는다.

### R2·Cron·Queue·AI 판정

- R2 최신 집계: OTW 21:00 KST 76 objects / 49,519,256 bytes, LuvDia 21:10 KST 0 objects / 0 bytes. LuvDia R2 버킷은 실제 APAC에 존재한다. 오늘 LuvDia R2 operations는 success 102, userError 2다. 집계 지연과 요청 종류를 확인하기 전 장애·유실·용량 부족으로 판정하지 않는다. public static profile은 R2 객체와 다른 경로다. [공식 R2 분석 문서](https://developers.cloudflare.com/r2/platform/metrics-analytics/)
- 양쪽 Cron은 `3,13,23,33,53 * * * *`, 자기 Workflow binding과 6개 Queue를 가진다. LuvDia Workflow instance 목록 GET은 21:46 KST 빈 배열이다. 등록 정상과 예약 실행 성공은 구분한다. 최근 활성화 시점과 job flag/due가 원인일 수 있으며 이것만으로 고장을 판정하지 않는다.
- [수집 재개 기록](otw-resume-and-luvdia-collection.md)의 관리자 UI → Queue → D1 → 실제 화면 성공은 일정·X·카페·공식 YouTube 4종이다. 당시 nonterminal/실패 item 0은 현재 전체 건강 상태의 증거로 재사용하지 않는다.
- LuvDia AI false는 이번 원격 조회로 확인했다. AI·키리누키·Play 채널 감시 중지는 기존 결정이다. 새 분석 발행/정상 완료는 미검증이며 점검 명목으로 활성화하지 않는다.

### 아키텍처: 경계는 있지만 과도한 책임과 현행 문서 공백이 있다

`node scripts/architecture-check.mjs`는 이번 작업 트리에서 PASS다. `routes/app → feature → domain/ports`, infrastructure의 외부 I/O, composition root 규칙은 존재한다. 따라서 계층화가 전혀 없다는 판단은 정확하지 않다.

그러나 `d1-transition-repository.ts` 3,196줄, `worker/app/routes.ts` 1,452줄, `member-profile-page.tsx` 1,161줄이며 이관 기능이 조회·파일·수집·AI 처리까지 걸친다. 줄 수 자체를 결함으로 삼지 않고, 정상 기능이 임시 이관 상태를 얼마나 알아야 하는지와 변경 시 동반 수정 범위를 줄이는 방향으로 정리한다. `docs/architecture.md`의 기본 기준일은 8/27이며 최신 독립 사이트 운영과 대규모 WIP를 종합하지 못한다. 전면 폴더 재배치보다 runtime read/write/automation 흐름과 운영 책임 문서 갱신이 우선이다.

## 이전 과정 대조

| 항목 | 판정 | 다음 행동 |
| --- | --- | --- |
| LuvDia 별도 도메인·인증·핵심 초기 복사·관리자 저장·Play 화면 | 기존 실제 성공 기록 있음 | 바뀐 release의 영향만 재검증 |
| OTW 재개·4종 LuvDia 수집·YouTube VOD 화면 | 기존 실제 성공 기록 있음 | 자연 예약 실행과 장기 retry 경로 추가 관측 |
| Chrome 음악 재생 | 사용자 정상 확인, 임시 진단/효과 없던 수정 제거 기록 | 미해결 버그로 다시 등록하지 않음 |
| 19일 공개/OTW 숨김·동시 수집 종료·메뉴명 | 이번 새 요구, 미구현 | 공개 전환 계획 |
| 전체 과거 콘텐츠·파일·공동 관계 완전성 | 초기 개통 이후 보완 범위 | 원본을 보존하고 차이 목록부터, 재복사 금지 |
| AI·키리누키·Play 채널 자동화 | 의도적 비활성/미검증 | 일반 수집과 구분, 예산 회복 후 승인된 기능 검증 |
| 양 사이트 동일 release·자동 배포 | 미완료/설정 미확인 | artifact·schema·자동 배포 검사 |
| R2 업로드 사고 | 재발 방지 구현 기록 있음, 사고 전 상태·실사용 영향 미확인 | [사고 기록](operational-upload-incident.md)을 보존; 정상 운영 최적화와 구분 |
| Task 4.4 전체·실시간 인계 플랫폼 | 초기 개통의 필수 조건에서 해제 | 오래된 체크박스를 이유로 재개하지 않음; 남은 책임 보존 후 정리 |
| 전체 preflight | 이전 실패/중단 기록, 이번 미실행 | 최종 merge/release 때만 실행 |

## 증거와 한계

신규 분석 원본은 `.tmp/2026-10-15-operations-plan/analytics.json`, `profile.json`, `image-timing.json`, `runtime-metadata.json`에 있다. scratch 소실에 대비해 핵심 값과 시각은 이 문서에 기록했다. 인증값·토큰은 출력/문서에 포함하지 않았다.

신규 SQL 쓰기·D1 전수 조회·R2 업로드/삭제·배포·수집 요청·AI 호출·commit/push는 실행하지 않았다. 사진 전체·모바일 waterfall·정각 운영 전환·자연 예약 성공·실제 요금제·원격 최신 migration·자동 배포 설정은 미확인이다. 운영이 계속되므로 수치와 상태는 시점 관측이다.

신규 문서4개의 상대 링크12개, 필수 계획 header/checklist, 시각 변환과 공백 검사를 통과했다. `node scripts/architecture-check.mjs` PASS, `pnpm.cmd sync:agent-cursor:check` PASS(27 managed files, 변경0). 실행 환경 Node `25.2.1`은 package.json 요구 `>=24.20.0 <25` 밖이므로 구현·앱 테스트·build 전에 Node24를 사용한다. 이번 문서 검증을 앱/배포 preflight PASS로 확대하지 않는다.
