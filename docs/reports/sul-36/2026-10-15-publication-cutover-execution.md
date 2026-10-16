# 10월 19일 공개 전환 구현·검증 기록

**10/16 후속:** 아래 10/15 판정은 당시 증거로 보존한다. 현재 OTW 인증 설정 분리와 양 사이트 build, 현 정책 collector 2건, 추가 X 정각 경계 수정을 진행·검증했으며 최신 판정은 문서 하단의 **2026-10-16 재개 결과**와 [현재 작업 목록](2026-10-16-work-register.md)을 따른다. 공개 전환은 여전히 운영 미반영이다.

## 결과와 적용 범위

2026-10-19 00:00 KST (`2026-10-18T15:00:00Z`) 기준의 공개·숨김 정책을 작업 트리에 구현했다. 운영에는 아직 배포하지 않았다. 운영 URL에서 카운트다운이 제공되거나 19일 자동 전환이 보장된 상태라는 의미가 아니다.

사용자가 이 세션에서 직접 구현, 공개 전환 우선, D1 고비용 작업 연기, 기존 미커밋 작업 보존을 지시했다. 기존 branch `397love/sul-36-스케쥴-사이트-관련-기술-검토`, HEAD `d27f26a4`에서 진행했다. 기존 WIP를 먼저 `.tmp/publication-cutover-20261015/baseline`에 복사하고 1,809개 파일의 해시를 기록했다. reset/stash/branch 변경, 일괄 stage, commit/push를 하지 않았다. 이번 변경은 기존 이관 WIP와 연결되므로 HEAD 기준 diff를 이번 작업만의 diff로 취급하면 안 된다.

## 실제 구현

| 진입점·대상 | 구현한 동작 |
| --- | --- |
| LuvDia 일반 HTML | Worker가 서버 시간으로 콘텐츠 없는 카운트다운을 직접 응답한다. Clerk 초기화나 D1 조회에 의존하지 않는다. `no-store`, `noindex` 적용. |
| LuvDia 공개 콘텐츠 API·이미지·직접 링크 | 공개 전 익명·일반 회원 모두 차단. HEAD, URL 인코딩 경로, SEO/파일 진입점에도 앞단 정책 적용. 정각 후 기존 권한으로 복귀. |
| 관리자 | `/admin`의 정상 앱 bootstrap과 기존 서버 JWT·관리자 확인 유지. 공개 API를 사용하는 관리자 준비 작업은 현재 관리자 인증으로 통과. 로그인 우회나 회원 권한 확장은 없다. |
| 보류 스위치 | LuvDia `SITE_PUBLICATION_HOLD=true`면 정각이 지나도 공개 보류. 기본값은 시간에 따라 공개. 정각 대량 UPDATE나 Cron이 필요 없다. |
| 열린 탭 | 서버 시각과 monotonic elapsed로 경계 판단. 정각에 콘텐츠를 숨긴 뒤 Query 취소·제거, 서버 상태 재확인, 자식 화면 재마운트 순서로 처리. |
| OTW 멤버·관련 콘텐츠 | `bing_hayu`, `u_lili`, `yang_mei`를 정각부터 조회 SQL에서 제외. members/schedules/notices/feeds/Play/파일/SEO/cache identity에 적용. 저장된 원본 접근 상태를 일괄 변경하지 않는다. |
| 공유 자료·개인 재생목록 | 남아 있는 멤버의 정당한 공유 참조는 유지. 숨긴 공연은 저장된 재생목록에서 재생할 수 없지만 재생목록 자체는 삭제하지 않는다. |
| D-day | 스키마에 멤버 연결이 없는 전역 자료는 제목으로 추측하지 않는다. 검토된 이관 membership과 해당 세 멤버의 plan이 있는 자료만 시간 정책에 포함한다. |
| 수집 | 대상 선택과 최종 SQL 저장에서 모두 시간 검사. YouTube/Cafe는 결과와 진행 위치를 D1 batch에 함께 저장. X는 게시글·facts·references·원문 캐시·진행 위치에 검사 적용. 일정 collector/live/CHZZK의 이관 commit/resume, Play source health·채널 모니터에도 적용. 정상 비선택 공연이 사용하는 공유 영상 source는 유지. 거절된 쓰기를 성공으로 기록하거나 watermark를 전진시키지 않는다. |
| 메뉴 | LuvDia 메뉴명 `멀티뷰`. OTW 메뉴명과 기존 Mul.Live 동선은 유지. |

공개 정책은 기존 archive root 관계를 재사용한다. Worker→feature public interface→infrastructure 경계를 유지하며 별도 저장소·복사된 멤버 snapshot을 런타임 권한 근거로 만들지 않았다. 원본 삭제를 막기 위해 YouTube registry 정리와 retention에서도 시간상 보관 대상을 보호한다.

## 검토 중 발견·수정한 결함

독립 읽기 전용 검토로 다음 결함을 찾아 수정했다: 정각 이후 YouTube registry DELETE의 영상 cascade, 캐시 제거보다 빠른 자식 remount, X 답글 원문/작성자 캐시 우회, 건너뛴 수집의 거짓 성공과 watermark 전진, Play 제보 검색·참여자 검증 누락, X 원문 캐시 선행 저장. 검토자는 최종 X 캐시 수정까지 연결을 재확인했다. 테스트 재실행 결과와 운영 검증을 대신하는 판정은 아니다.

영상과 진행 위치의 batch는 실패 시 전체 rollback된다. 따라서 새 영상이 하나도 없는 첫 페이지의 저장 실패는 부분 9건을 보여 주던 상태 대신 기존 unavailable 응답(503)이 되고, 원본 cursor를 유지해 다음 시도에서 같은 페이지를 저장한다. 이 변화에 맞춰 회귀 테스트를 수정했다. [D1 batch의 transaction 보장](https://developers.cloudflare.com/d1/worker-api/d1-database/)도 확인했다.

## 검증 및 한계

- 런타임: 작업 scratch에 공식 Node 24.20.0을 두고 실행. 시스템 Node/인증 설정은 바꾸지 않았다.
- 로컬 실제 Worker `http://localhost:5184/`에서 LuvDia 로고, 확정 공개 시각, 동작하는 일/시/분/초, 관리자 링크를 브라우저로 확인했다. 스크린샷은 `.tmp/publication-cutover-20261015/countdown.png`다.
- 관리자 링크는 정상 앱으로 이동했다. 운영용 Clerk 키가 localhost origin을 거부하여 브라우저의 실제 로그인 완료는 검증하지 못했다. 별도의 로컬 Workerd HTTP 테스트에서는 서명된 JWT와 실제 인증 검증으로 일반 회원 차단·관리자 통과를 확인했다.
- 테스트는 원격 공급자 응답만 fixture로 대체하고 로컬 Workerd/D1에서 정상 Worker HTTP, 조회, 저장, rollback, 원본 readback을 확인한다. 실제 운영 데이터 및 외부 공급자의 정상 상태를 증명하지 않는다.
- 검증 명령과 최종 판정은 아래 최종 확인표에 기록한다. 실패 후 수정과 재실행 기록은 `.tmp/publication-cutover-20261015/*log`에 보존했다.

| 확인 | 최종 판정 |
| --- | --- |
| 변경 파일 scoped lint | PASS. 초기 1,809개 파일 중 없어진 파일 0개. 변경 85경로 기준. |
| `tsc -b`, `pnpm typecheck:test` | PASS |
| architecture check | PASS |
| 공개 정책·UI·수집 단위 테스트 | PASS: 15파일 142건. `unit-final-pass.log`. |
| Workerd/D1 archive·YouTube 통합 테스트 | PASS: archive 36건, YouTube 24건. `archive-final-confirmed.log`, `worker-final-pass.log`. OTW 관리자 monitor 생성도 실제 repository `findApprovableChannel → create()`를 거친다. source health/monitor 기존 두 repository 통합 파일도 PASS(`collectors-verified.log`의 해당 두 파일). |
| 추가 기존 이관 collector 통합 테스트 2건 | FAIL: `capturing()`이 `protect()`의 최종 maintenance stop 증명 전제를 충족하지 못해 새 collector commit에 도달하기 전에 중단. 초기 WIP의 test 파일 및 protect 구현과 동일함을 비교 확인. `transition-collector-verified.log`. 검사를 우회하거나 이 두 건을 PASS로 처리하지 않았다. |
| LuvDia build | PASS. 기존 console chunk 659KB 경고는 별도 최적화 항목. |
| OTW build | FAIL: production 환경 로딩 결과 publishable key는 `clerk.otw-schedule.info`, issuer는 개발 Clerk 앱이라 불일치. 키나 보안 검사를 바꾸지 않았다. |
| 운영 배포·실제 관리자 계정 로그인·19일 실제 시각 | 미실행/미검증 |

## 10/15 당시 후속 작업

1. OTW Clerk 빌드 설정을 정상 사이트 자격 정보로 맞추고 양 사이트 빌드를 다시 확인한다. 비밀 값은 문서에 넣지 않는다.
2. 기록상 OTW schema 0101 / LuvDia 0136 차이가 있어 현재 전체 WIP를 그대로 양쪽에 배포하지 않는다. D1 여유 회복 후 최소 호환 migration 경로·비용·리허설을 검증한다.
3. 기존 이관 통합 fixture의 실제 maintenance stop 증명 경로를 정리하고 collector/Queue 이관 검증을 완료한다. 그 후 검토된 공통 소스/각 사이트 artifact를 식별하고 release preflight와 운영 readback을 수행한다. 배포 전까지 운영 공개 상태는 바뀌지 않는다.
4. 공개 후 기존 회원 권한, 일반 도메인→정상 메뉴→콘텐츠, OTW 직접 링크와 관리자 보관 열람을 운영에서 확인한다.

원격 D1 SQL/doctor/migration/대량 검증, R2 변경, 외부 수집 실행, 운영 flag 변경, 배포는 이번 구현 단계에서 하지 않았다. 프로필 지연 개선, 동일 소스 배포 증명, Cron/Queue/예약/AI의 전체 운영 점검과 대규모 구조 정리는 별도 승인 계획에 남아 있다. 이 구현으로 그 항목들이 완료됐다고 판단하지 않는다.

## 2026-10-16 재개 결과

사용자가 기존 공개 전환 작업의 직접 실행 계속과 보류 목록 통합을 지시했다. 대량 이관·전수 검증은 재개하지 않았다. 기존 작업은 `.tmp/publication-resume-20261016/before/`에 해당 파일별로 보존하고 그 차이만 수정했다. commit/push, 원격 migration, R2 변경, 공개 전환 배포는 하지 않았다.

### 수정한 문제

- **OTW 빌드 설정:** 기존 production key가 root 개발 issuer/localhost party와 섞임을 실제 검증 함수에서 재현했다. root 환경은 그대로 두고 ignored `config/sites/otw/.env.production.local`에서 기존 production key와 동일한 app의 issuer/JWKS/public-origin party를 명시했다. 키·토큰은 로그/문서에 출력하지 않았다.
- **TEST DRIFT:** 이전 collector 두 시험은 최종 maintenance stop 없이 protect 후 원본에서 새 작업을 접수하는 지속 이관 전제였다. 현재 독립 운영의 정상 전체 candidate/전역 휴방 batch와, 정각 이후 OTW 선택 대상 raw 보존으로 교체했다. 업무·감사·원본 assertion을 유지했으며 실제 보호/권한 코드를 완화하지 않았다.
- **전역 X repair:** 남은 OTW 멤버의 정상 수집이 정각 이후 숨긴 멤버의 과거 facts/references까지 복구하던 문제를 실제 수집 진입점에서 재현했다. 두 backfill의 siteId를 필수로 만들고 최종 fact 쓰기·reference 쓰기·ack에 현재 시간 정책을 전달했다. 숨긴 pending은 거짓 완료하지 않는다. 100개 후보를 먼저 materialize하고 숨김/오류 작업의 checked_at만 회전해 읽기 범위와 대기 순서를 유지한다.
- **정각을 넘긴 quote hydration:** 공급자 응답/최종 attachment 사이에 경계가 오면 원문·reference·linked post/user cache를 저장하지 않는다. 현재 source·site·lease·선택 scope를 SQL 최종 mutation에서도 확인하고 lease는 정상 해제한다. 실제 commit이 없으면 terminal/author 완료 카운터도 올리지 않는다.
- **LuvDia 일반 X 피드:** `D1MemberPostsPort → xPostFeedService → fetchXPostsForHandles` 사이에서 빠지던 siteId를 명시했다. 정각 이후 일반 `/api/member-posts?sources=x`는 LuvDia 자료를 계속 표시하며 OTW에서는 숨긴다. HTTP fixture도 명시적 사이트를 사용한다.

### 실제 검증과 비용

| 확인 | 현재 판정·근거 |
| --- | --- |
| OTW/LuvDia 최종 build | 양쪽 PASS. `otw-build-final.log`, `luvdia-build-final.log`. 기존 console chunk 약659KB 경고는 성능 후속으로 유지. |
| 현 정책 collector 2건 | 2/2 PASS, `collector-current-contract.log`. |
| 실제 Workerd/D1 3개 파일 | **89/89 PASS**: archive/cutoff 41, X hydration 39, X 비용/복구 9. `worker-final.log`. |
| 최종 빌드의 실제 로컬 HTTP | 별도 빈 persistence의 `http://127.0.0.1:5186`: 홈 countdown·admin 앱 shell·status200, members GET/HEAD·profile·encoded API403. 7진입점 PASS, `local-http.json`. 브라우저 countdown 증거는 UI가 동일한 10/15 기록을 재사용하며 production Clerk 실제 로그인 완료를 대신하지 않음. |
| 단위·소비자 검증 | 변경 없는 6파일 34건과 수정한 member-posts fixture 16건을 합쳐 **50건 PASS의 조합 증거**. 최초 전체 명령 PASS로 표현하지 않음. `unit-green.log`, `member-posts-unit-final.log`. |
| test/Worker/Node TypeScript, scoped lint, architecture | PASS. `types-final.log`, `worker-types-final.log`, `node-types-final.log`, `scoped-lint-final.log`, `architecture-final.log`. |
| 현재 로컬 빈 X repair/hydration | 완료 이력512건에서 합계 **11행 읽기**. 앞선 배포 전 최적화의9행과 구분. 미래 재시도512건은 **7행**. |
| 숨긴 pending512건 + 처리 가능한 tail | 매회 후보100개 이하, selector 최대 **506행 읽기**, tail 처리 후 숨긴512건의 pending 유지. 완료/과거 이력 전체를 매회 다시 읽지 않음. |
| 실패를 실제로 관측한 회귀 | global repair의 숨김 대상 fact 생성, LuvDia feed 소실, 경계 후 quote 원문 저장, 참조 최종 저장/ack, commit 없는 terminal1을 각각 재현 후 수정. `x-cutover-red.log`, `x-boundaries-red.log`, `x-repair-race-red.log`, `x-terminal-count-red.log`. 최초 참조 race는 잘못된 함수 인자와 URL 없는 fixture 때문에 유효한 RED가 아니었고, 이를 바로잡은 별도 red 로그만 해당 근거로 인정. |

독립 코드 검토는 현재 변경 범위에 남은 중대한 코드 결함이 없다고 판정했다. 검토는 로컬 소스·기록 범위이며 운영 공개 성공의 증거가 아니다. Vitest pool 종료 timeout 경고가 있었으나 세 파일 결과와 프로세스는 PASS/exit0이며, 의도한 cursor rollback 오류 로그는 해당 회귀의 오류 주입 결과다.

별도로 실행한 기존 `maintenance stop preserves prepared writes...` 시험은 직접 completeItem 후 terminal reconciliation outbox를 남겨 `scheduledDispatch=1`로 **FAIL**했다(`collector-green.log`). 이를 지워 PASS로 만들지 않았다. 정상 취소→원래 Queue 마무리→재정지의 기존 owning 사례는 `scheduled_finalization_stop`이다. 구형 fixture 정리는 LEGACY-TESTS에 남기며 Task4.4 전체를 공개 선행 조건으로 되살리지 않는다. 전체 mixed WIP preflight/운영 release 완료로 보고하지 않는다.

### 운영 반영의 구체적 남은 조건

11:21 KST 최소 메타데이터에서 LuvDia는 실제 **0136**까지 적용, 버전 `f4df03db-0692-4506-a736-52857ca60a1d` 100%였다. 이 조회는 **3행 읽기/0행 쓰기**였다. OTW는 별도 X release의 0101 + 0137/0138이다. 양 운영 도메인의 `/api/publication-status`는 **404**로, 공개 전환 코드가 운영에 없음을 확인했다. 근거: `.tmp/publication-resume-20261016/production-compatibility.json`.

현재 OTW에 전체 작업 트리를 그대로 배포하면 일반 요청의 `readTransitionAccess → readInactiveTargetWorkspace`가 아직 없는 `content_transitions`를 읽는다. 새 조회도 `content_access` 등 0102 이후 기반에 의존한다. 이는 코드 dirtiness만의 문제가 아니라 **평상시 요청 실패를 일으킬 실제 schema 비호환**이다. 필요한 호환 schema·선택 소스 범위·작업 비용을 검토하고 안전하게 분리한 release를 먼저 만들어야 한다. 양 사이트의 source/artifact identity와 일반 관리자 로그인·사전 countdown·정각 실동작 readback도 남아 있다. 현재 운영의 19일 자동 전환을 보장한다고 말하지 않는다.

Hydration의 기존 handle/기한 조회는 다른/숨긴 handle의 due 미완료가 대량 누적되면 읽기가 늘 수 있다. 현재 빈 운영 selector와 새 정규 수집에 비춰 가능성은 낮으며 내용 노출·원본 갱신 우회는 SQL guard로 차단한다. 대량 repair 재개 전 handle별 work 인덱스/정지 상태의 비용 검토를 D1-BUDGET에 남겼다. 모든 pending 비용이 일정하다는 주장은 하지 않는다.

다음 실행 순서와 D1/R2/프로필/Cron·Queue/AI/구조·기존 Play 잔여는 [통합 작업 목록](2026-10-16-work-register.md)과 [10/16 실행 계획](../../superpowers/plans/2026-10-16-release-readiness-and-backlog.md)에 모았다. X 복구 후속은 10:55에 새 버전의 정규 run2300/2301 성공까지 확인하고 예약을 PAUSED로 종료했다.

최종 소스 10경로·사이트별 Worker 산출물의 SHA256, 검사/미완료 구분은 `.tmp/publication-resume-20261016/verification.json`에 보존했다. 문서7개 상대 링크84개·계획 필수 header/review focus·증분 diff 공백 검사도 PASS(`document-verification.json`). 새 로컬 preview는 확인 후 종료했다. 기존 dev 서버·사이트 상태는 변경하지 않았다.
