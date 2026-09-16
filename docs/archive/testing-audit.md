> **아카이브 (2026-09-17)**: 조사·설계·검증 당시 기록이다. 제안의 구현 승인이나 현재 운영 상태를 의미하지 않는다. 현재 계약·잔여 작업은 [문서 인덱스](../README.md)와 [개발 상태](../development-status.md)를 따른다.

# 요구사항 중심 테스트 검토 — 2026-09-15

## 판단 기준

전체 테스트 파일을 실행 경계와 보호하는 계약에 대응시켜 검토했다. 변경 후보는 본문과 관련 구현·요구사항을 대조했다. 이름이 비슷하거나 파일이 크다는 이유만으로 삭제하지 않는다. 아래 표는 파일별 처분과 대표 보호 동작이며 모든 assertion의 명세 복사본은 아니다.

- 인증·소유권·캐시 공개 범위, D1 원자성·외래키·동시성·마이그레이션 데이터 보존, 공급자 비용·쿼터, 재시도와 실제 partial 상태는 유지한다.
- HTTP·서비스·저장소·UI에서 서로 다른 경계를 검증하는 테스트는 유지한다. 짧은 forwarding 테스트도 요청 경계의 유일한 검증이면 삭제하지 않는다.
- D1 검색 상한 fixture(곡 3,000/가창 8,000/검색어 10,000)와 rows-read·statement·bind 예산은 유지한다. 스키마 CHECK 이름 확인보다 실제 위반 쓰기·삭제 결과를 검사한다.
- 테스트 파일을 제외하거나 skip하지 않는다. 동시 worker 2개, 격리, timeout을 유지한다. 커버리지 백분율은 별도 진단으로 바꾸고 preflight에는 전체 assertion을 한 번 포함한다.
- UI 장식 assertion만 삭제하고, 긴 문자열·접근성·iframe 생명주기와 실제 저장/취소/충돌 흐름은 남긴다.

## 통합 위치

- 회원 fixture: `src/test/member-fixtures.ts`. 호출마다 새 DTO를 만들고 사례별 값은 호출부에 남긴다.
- 카탈로그·검수 fixture: `src/features/otw-play/test/catalog-fixtures.ts`. 과거 proposal → review 변환 mock을 없애고 현재 wire shape를 직접 제공한다.
- 관리자 화면 준비: `catalog-manager.test.ts` 내부의 실제 render/입력 helper. 검증 대상 컴포넌트·사용자 조작을 우회하지 않는다.
- 라우트 정책: `worker/app/routes.test.ts`의 독립 정책 표. 실행 결과에서 기대값을 생성하지 않으며 경로·메서드 누락도 실패한다.
- 마이그레이션: 기존 두 schema 통합 파일에서 외래키와 데이터 행위 검사를 유지한다. 전체 chain의 대체물로 주장하지 않는다.

## 검증과 측정

- 환경: Node 24.20.0, pnpm 11.7.0, Vitest 4.1.11, 동시 worker 2개.
- 변경한 33개 테스트 파일 + 새 공통 fixture: 13,848 → 12,165줄, **1,683줄 감소**. UTF-8 코드량 506,298 → 454,587 bytes. 새 fixture 코드도 감소량에 포함했다.
- 전체 파일 수는 292개를 유지한다. 장식 전용 테스트 2개만 제거했고 최종 일반 실행은 **2,138개 모두 통과**했다. 30개 실제 Worker/D1 통합 파일을 포함한다.
- 최종 `pnpm preflight`: architecture, typecheck, lint, 전체 test, build, 로컬 D1 doctor, mirror check 모두 통과. 일반 테스트 구간은 212.25초였다.
- 별도 `pnpm test:coverage`: 292개 파일, **2,139개 테스트 모두 통과**, 237.01초. statements 82.92%, branches 70.73%, functions 86.08%, lines 84.45%. 백분율 임계값 없이 요약과 HTML/JSON 보고서를 생성했다. 보고서에 src 57개 파일과 Worker 154개 파일이 포함되어 두 프로젝트의 계측을 확인했다.
- 로컬 D1 readback: pending migration 0, catalog/read-model revision 33/33, 가창/sort key 8/8, 검색 gram 통계 drift 0. 원격 DB를 조회·변경하지 않았다.
- 관련 5개 파일을 shuffle seed 20260915로 확인했다. 검색 인덱스 상수 누락을 복구한 뒤 전체 preflight에서 해당 테스트까지 통과했다. fixture 공유 후 UI 저장·충돌·입력 보존과 검수 목록 순서 격리를 확인했다.
- 실제 브라우저: `http://localhost:5173` 편성표 보기 전환, 관리자 카탈로그 검색(8곡→1곡), 등록 폼 입력 후 닫기 취소로 URL 입력 보존, 변경 버리기 후 검색 조건·1곡 결과 유지. 검증용 입력은 저장하지 않았고 공급자 분석을 실행하지 않았다. 실제 저장·동시성·롤백은 D1 통합 검증 결과이며 브라우저 저장 검증으로 표현하지 않는다.

### 비교 한계

초기 지정 런타임 실행(2,139개)에는 진행 중인 AI 변경의 fixture 불일치 3개가 있었다. 보정 후 기준 재실행(2,140개)에는 새 AI 응답 스트림 오류 테스트 1개가 실패했다. 두 실행 모두 성공 기준선이 아니므로 263.31초/259.96초를 최종 212.25초와 비교해 속도 개선율을 주장하지 않는다. AI 구현·새 테스트와 다른 작업의 수정은 이번 정리에서 보존했다.

preflight 이후 병행 AI 작업에서 테스트가 1개 추가되어 커버리지 실행의 테스트 수는 2,139개다. 두 실행을 동일 코드 상태의 시간 비교로 해석하지 않는다.

실측 테스트 출력은 기준 재실행 1030줄/75,505 bytes, 최종 515줄/36,617 bytes였다. 기준 실행의 실패 상세도 포함되므로 이 차이를 순수 reporter 효과나 토큰 절약률로 해석하지 않는다. `dot` reporter는 성공 파일 목록을 줄이며 경고·실패 상세를 숨기지 않는다. 기존 Dialog 설명·React mock prop 경고는 그대로 노출된다.

재현 명령은 [테스트 실행과 유지보수](../testing.md)를 따른다. 세션 로그·기계 판독 결과는 gitignore 대상 `.tmp/test-audit/`에 보관했다. 이번 테스트 정리 작업에서는 전체 테스트 검증 후 문서만 갱신했으며 같은 코드의 preflight를 반복하지 않는다.

## 파일별 판단 (292개)

### `scripts`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `architecture-check.test.ts` | 유지 | 개발·배포 안전성 — allows a feature public index import |
| `clerk-environment.test.ts` | 유지 | 개발·배포 안전성 — classifies development and production publishable keys |
| `client-build-deploy-guard.test.ts` | 유지 | 개발·배포 안전성 — accepts an entry bundle containing a Clerk production key |
| `d1-doctor-core.test.ts` | 유지 | 개발·배포 안전성 — requires migrated D-Day and pending VOD columns |
| `d1-reset-guard.test.ts` | 유지 | 개발·배포 안전성 — 기존 로컬 D1을 비강제 reset으로 교체하지 않는다 |
| `d1-seed-guard.test.ts` | 유지 | 개발·배포 안전성 — 완전히 빈 DB에서만 비강제 seed를 허용한다 |
| `generate-seo-assets.test.ts` | 유지 | 개발·배포 안전성 — replaces every shell tag exactly once |
| `local-dev-config.test.ts` | 유지 | 개발·배포 안전성 — uses one stable default for Vite and local API checks |
| `wrangler-seo-config.test.ts` | 유지 | 개발·배포 안전성 — generates a direct HTML entry for every registered static admin route |

### `src/app`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `admin/admin-gate.test.tsx` | 유지 | 정책·상태 — renders admin content from the server-authoritative decision |
| `errors/root-not-found.test.tsx` | 유지 | 정책·상태 — 중첩 경로의 404에서도 공통 안내와 홈 복귀를 제공한다 |
| `errors/root-route-error.test.ts` | 유지 | 정책·상태 — hides exception details from the nosnippet UI and retries |
| `layout/app-navigation.test.ts` | 유지 | 정책·상태 — resolves app chrome modes by route family |
| `layout/app-shell.test.ts` | 유지 | 정책·상태 — groups account and theme controls behind one footer button |
| `layout/footer.test.tsx` | 유지 | 정책·상태 — keeps the rights notice reachable from the public footer |
| `providers/interaction-provider.test.tsx` | 유지 | 정책·상태 — 실제 라우터에서 미저장 이동을 취소하면 입력을 보존하고 확인 후에만 이동한다 |

### `src/features/audit`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/audit-result.test.ts` | 유지 | 정책·상태 — does not report unchanged live schedules as unsuccessful targets |
| `model/recorded-changes.test.ts` | 유지 | 정책·상태 — preserves zero, false and explicit empty values separately from missing history |
| `ui/admin/auto-update-logs.test.ts` | 유지 | 사용자 동작 — 로그 목록과 보기 옵션을 표시한다 |

### `src/features/auth`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/auth.test.ts` | 유지 | 클라이언트 계약 — reads the authoritative admin status with required auth and no cache |

### `src/features/chzzk`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/clips.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지, 무상태 어댑터의 resetModules 제거 |
| `api/live-status.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `api/vods.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지, 무상태 어댑터의 resetModules 제거 |
| `model/clip-date-groups.test.ts` | 유지 | 정책·상태 — 일자별로 묶고 날짜 안에서는 조회수순으로 정렬한다 |
| `model/vod-date-groups.test.ts` | 유지 | 정책·상태 — 다시보기를 일자별로 묶고 날짜 안에서는 최신순으로 정렬한다 |
| `queries/use-chzzk-media.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/chzzk-clips-playlist.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |

### `src/features/configuration`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/settings-config.test.ts` | 유지 | 정책·상태 — 허용된 자동 수집 주기만 유효하게 본다 |
| `ui/admin/auto-update-settings.test.ts` | 유지 | 사용자 동작 — 압축된 자동 업데이트 KPI 바에 후보와 실행 정보를 표시한다 |
| `ui/admin/schedule-rejections-panel.test.ts` | 유지 | 사용자 동작 — 검색 조건으로 목록을 다시 조회하고 후보 스냅샷을 표시한다 |

### `src/features/ddays`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/admin-dday.test.ts` | 유지 | 정책·상태 — 생일 저장 연도를 숨기고 다음 연도 도래일을 표시한다 |
| `model/dday.test.ts` | 유지 | 정책·상태 — 색상 문자열/배열을 normalize 한다 |
| `queries/invalidate-dday-consumers.test.ts` | 유지 | 정책·상태 — D-Day와 schedule-board aggregate query를 함께 무효화한다 |
| `ui/admin/dday-manager.test.ts` | 유지 | 사용자 동작 — 공개 D-Day 캐시가 fresh여도 관리자 no-cache 조회를 수행한다 |

### `src/features/media-library`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `ui/vods-overview.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |

### `src/features/member-posts`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/feed-filters.test.ts` | 유지 | 정책·상태 — 답글과 인용을 모두 유지하며 멤버·출처만 필터링한다 |
| `queries/use-member-posts.test.ts` | 유지 | 정책·상태 — 기존 aggregate 데이터가 있는 reload 실패는 두 source를 stale로 표시한다 |
| `ui/admin/member-post-settings.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/admin/x-collection-monitoring.test.tsx` | 유지 | 사용자 동작 — keeps overall partial and collection success separate from failed hydration |
| `ui/admin/x-post-history-manager.test.ts` | 유지 | 사용자 동작 — 기본 화면에서는 보관 기록을 조회하지 않고 삭제 작업을 두 단계 안에 숨긴다 |
| `ui/admin/x-reference-health.test.tsx` | 유지 | 사용자 동작 — treats stored previews and relation-only replies as completed while showing quote errors |
| `ui/member-posts-overview.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/member-posts-page.test.tsx` | 유지 | 사용자 동작 — 공개 설정 조회 실패를 로그인 요구로 오인하지 않고 다시 조회한다 |

### `src/features/members`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/profile-background-images.test.ts` | 유지 | 정책·상태 — builds local responsive profile background variants |
| `ui/member-filter.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |

### `src/features/multiview`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/multiview-utils.test.ts` | 유지 | 정책·상태 — accepts raw 32-hex IDs and supported CHZZK URL forms |
| `ui/multiview-page.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |

### `src/features/naver-cafe`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/naver-cafe-api.test.ts` | 유지 | 클라이언트 계약 — 게시판 URL에서 cafeId와 menuId를 추출한다 |
| `model/filter-naver-cafe-posts.test.ts` | 유지 | 정책·상태 — 선택된 멤버가 없으면 원본 배열을 반환한다 |
| `queries/use-naver-cafe-posts.test.ts` | 유지 | 정책·상태 — enabled=false면 요청하지 않는다 |
| `ui/naver-cafe-post-card.test.ts` | 유지 | 사용자 동작 — 제목, 요약, no-referrer 썸네일과 원문 링크를 표시한다 |

### `src/features/notices`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/notice-thumbnails.test.ts` | 유지 | 정책·상태 — 허용 MIME type과 업로드 제한을 일관되게 노출한다 |
| `model/notice-visibility.test.ts` | 유지 | 정책·상태 — 활성 상태와 게시 기간을 함께 확인한다 |
| `queries/invalidate-notice-consumers.test.ts` | 유지 | 정책·상태 — 공지와 schedule-board aggregate query를 함께 무효화한다 |
| `ui/admin/notice-form-dialog.test.ts` | 유지 | 사용자 동작 — shows multi-link, multi-image, and related-member controls |
| `ui/admin/notice-manager.test.ts` | 유지 | 사용자 동작 — 미사용 R2 썸네일 정리는 확인 전까지 삭제 API를 호출하지 않는다 |
| `ui/notice-banner.test.ts` | 유지 | 사용자 동작 — opens the URL directly only when exactly one link exists |
| `ui/notice-page.test.ts` | 유지 | 사용자 동작 — shows every named link and related member, and advances the manual carousel |

### `src/features/operations`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/operations.test.ts` | 유지 | 클라이언트 계약 — 운영 상태 조회의 기본·지정 window를 query에 반영한다 |
| `ui/admin/operations-dashboard.test.tsx` | 일부 삭제 | 너비·grid 클래스 검사 삭제; 실제 상태·진행률·guard·재시도 유지 |

### `src/features/otw-play`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/admin.test.ts` | 유지 | 클라이언트 계약 — loads review filters through the authenticated shared route |
| `api/public.test.ts` | 유지 | 클라이언트 계약 — uses the member path and only songbook query fields in public and preview requests |
| `api/submissions.test.ts` | 유지 | 클라이언트 계약 — uses required authentication and preserves submission payloads |
| `model/catalog-route-search.test.ts` | 유지 | 정책·상태 — maps URL state to the public query without interpreting opaque group keys |
| `model/play-queue.test.ts` | 유지 | 정책·상태 — appends a batch without starting playback or changing existing queue state |
| `player/play-player-context.test.tsx` | 유지 | 사용자 동작 — revalidates a clip before loading its segment into the same player |
| `player/youtube-iframe-api.test.ts` | 유지 | 사용자 동작 — loads one script and constructs one policy-compliant player |
| `queries/use-playlists.test.tsx` | 유지 | 정책·상태 — passes the explicit playback request only after the whole playlist resolves |
| `queries/use-public-catalog.test.ts` | 유지 | 정책·상태 — catalog cursor를 infinite query page parameter로만 전달한다 |
| `ui/admin/ai-review-flow.test.tsx` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `ui/admin/ai-review-form.test.tsx` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `ui/admin/catalog-manager.test.ts` | 통합 | 현재 review DTO fixture, 화면 준비 공통화. 실제 입력·저장·오류·복귀 조작 유지 |
| `ui/admin/catalog-search-input.test.tsx` | 유지 | 사용자 동작 — keeps Korean composition local until the syllable is committed |
| `ui/admin/channel-monitor-section.test.tsx` | 유지 | 사용자 동작 — shows new uploads with a manual draft registration path |
| `ui/admin/ingestion-section.test.tsx` | 유지 | 사용자 동작 — routes playlist review to the unified inbox without rendering a second editor |
| `ui/admin/operations-section.test.tsx` | 유지 | 사용자 동작 — renders 24-hour metrics for desktop table and mobile cards |
| `ui/admin/play-automation-control.test.tsx` | 유지 | 사용자 동작 — pauses each current monitor with its version and confirms readback before enabling global pause |
| `ui/admin/review-inbox.test.tsx` | 통합 | 카탈로그·검수 row fixture 공유, 변환·실패 선택·draft 보존 유지 |
| `ui/admin/review-navigation.test.ts` | 유지 | 사용자 동작 — only preserves review drafts inside the mounted review/channel workflow |
| `ui/admin/singing-clip-review-dialog.test.tsx` | 유지 | 사용자 동작 — preserves unfinished input across channel approval readback and saves without conversion in inbox mode |
| `ui/admin/source-health-section.test.tsx` | 유지 | 사용자 동작 — groups summary, status lists, and actions into one dense panel |
| `ui/member/member-shell.test.tsx` | 유지 | 사용자 동작 — shows a login call to action without mounting member requests |
| `ui/member/submission-page.test.tsx` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/member/submissions-page.test.tsx` | 유지 | 사용자 동작 — shows a focused first-proposal action without an empty detail panel |
| `ui/otw-play-thumbnail.test.tsx` | 유지 | 사용자 동작 — prefers the 16:9 max-resolution YouTube image |
| `ui/player/now-playing-panel.test.tsx` | 일부 삭제 | 380px 폭 문자열 assertion 삭제; iframe 유지·재생·큐·모달·키보드 동작 유지 |
| `ui/playlists/default-playlist-manager.test.tsx` | 유지 | 사용자 동작 — uses the shared select and preserves the current editor when discarding is cancelled |
| `ui/playlists/playlist-editor-page.test.tsx` | 유지 | 사용자 동작 — keeps oversized saved lists intact and permits saving after enough items are removed |
| `ui/public/catalog-components.test.tsx` | 유지 | 사용자 동작 — presents title and artist before catalog metadata and playback actions |
| `ui/public/catalog-page.test.tsx` | 유지 | 사용자 동작 — searches during Hangul composition without replacing the composing input |
| `ui/public/clips-page.test.tsx` | 유지 | 사용자 동작 — shows unknown broadcast information and sends the actual segment to the shared queue |
| `ui/public/member-songbook-page.test.tsx` | 유지 | 사용자 동작 — keeps filter focus when changing a filter also clears the cursor |
| `ui/public/music-layout.test.tsx` | 유지 | 사용자 동작 — uses discovery as a compact featured entry point |
| `ui/public/participant-presentation.test.ts` | 유지 | 사용자 동작 — promotes only main vocalists in compact presentation |
| `ui/public/play-shell.test.tsx` | 유지 | 사용자 동작 — reads anonymous config before waiting for administrator preview auth |
| `ui/public/song-detail-page.test.tsx` | 유지 | 사용자 동작 — highlights the performance selected by the direct-link query |
| `ui/use-button-feedback.test.tsx` | 유지 | 사용자 동작 — animates the SVG without consuming the button action and cancels on unmount |
| `use-cases/resolve-playlist.test.ts` | 유지 | 정책·상태 — collects all pages and includes different performances of the same song |

### `src/features/rights`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `ui/rights-page.test.tsx` | 유지 | 사용자 동작 — shows the current web rights notice without the removed extension policy |

### `src/features/schedule-board`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `queries/use-schedule-data.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `queries/use-schedule-save-feedback.test.tsx` | 유지 | 정책·상태 — 서버 저장 결과와 입력 날짜를 성공 안내에 보존한다 |
| `queries/use-weekly-schedule.test.ts` | 유지 | 정책·상태 — 주간 보드 aggregate 조회 결과와 다이얼로그 동작을 처리한다 |
| `ui/components/schedule-updated-at.test.ts` | 유지 | 사용자 동작 — 업데이트 시각을 한국 표준시로 명확하게 표시한다 |
| `ui/daily/chronological-schedule-list.test.ts` | 일부 삭제 | 장식 점선의 CSS 검사 삭제; 행 편집·외부 링크 분리·긴 제목/멤버명 검사 유지 |
| `ui/daily/chronological-schedule-utils.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/daily/daily-schedule.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/daily/snapshot/snapshot-fonts.test.ts` | 유지 | 사용자 동작 — validates both full font files and embeds the exact fetched bytes |
| `ui/daily/snapshot/snapshot-output.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/daily/snapshot/use-auto-fit-text.dom.test.tsx` | 유지 | 사용자 동작 — remeasures an unchanged title after fonts settle and after system fallback |
| `ui/daily/snapshot/use-auto-fit-text.test.ts` | 유지 | 사용자 동작 — 기본 크기에서 이미 맞으면 폰트를 유지한다 |
| `ui/daily/snapshot/use-snapshot-fonts.test.tsx` | 유지 | 사용자 동작 — publishes the font CSS only after preparation and removes faces on unmount |
| `ui/weekly/components/weekly-schedule-item.test.ts` | 유지 | 사용자 동작 — 방송 카드는 축약 ON 대신 상태명과 시간을 읽기 좋게 표시한다 |
| `use-cases/use-admin-live-schedule-auto-fill.test.ts` | 유지 | 정책·상태 — 관리자에게 새 live-status 결과가 도착할 때 한 번만 POST를 실행한다 |

### `src/features/schedules`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `model/pending-time.test.ts` | 유지 | 정책·상태 — 분 단위 수집 시간을 가장 가까운 30분 단위로 반올림한다 |
| `ui/schedule-dialog.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `use-cases/save-schedule.test.ts` | 유지 | 정책·상태 — 스케줄 저장은 서버 command API에 정규화된 날짜로 위임한다 |

### `src/features/x-posts`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/x-posts-api.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `queries/use-x-posts.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/x-post-card.test.ts` | 일부 삭제 | padding·footer 배치 클래스 assertion 삭제; 멤버 색·합산 지표·공유 동작 유지 |

### `src/features/youtube`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/youtube.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `queries/use-youtube-media.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `queries/use-youtube-shorts.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `queries/use-youtube-videos.test.ts` | 유지 | 정책·상태 — 선택된 멤버가 없으면 원본 배열을 반환한다 |
| `ui/admin/youtube-cache-manager.test.tsx` | 유지 | 사용자 동작 — 수요 기반 운영 요약에서 현재 캐시와 활성 호출만 우선 표시한다 |
| `ui/youtube-playlist.test.ts` | 유지 | 사용자 동작 — 키리누키 안내에 현재 참여한 채널 리스트를 표시한다 |
| `ui/youtube-section.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `ui/youtube-video-card.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |

### `src/routes`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `-multiview.test.ts` | 유지 | 정책·상태 — mounts the multiview page without an auth gate |

### `src/shared`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `api/client.test.ts` | 유지 | 클라이언트 계약 — keeps the JSON content type for json payloads |
| `api/feature-contracts.test.ts` | 통합 | 회원 기본값 fixture 공유; 각 사례 입력·assertion 유지 |
| `lib/audit-filters.test.ts` | 유지 | 정책·상태 — keeps optional filters literal, with inclusive calendar boundaries |
| `lib/site-rights.test.ts` | 유지 | 정책·상태 — uses the first publication year when it is still current |
| `query/query-keys.test.ts` | 유지 | 정책·상태 — isolates OTW Play member submissions by signed-in user |
| `seo/site-seo-contract.test.ts` | 유지 | 정책·상태 — maps public fixed routes to canonical indexable metadata |
| `seo/site-seo-dom.test.ts` | 유지 | 정책·상태 — updates navigation metadata without creating new duplicates |
| `seo/site-seo-navigation.test.tsx` | 유지 | 정책·상태 — replaces profile and member metadata on client navigation and clears old images |
| `ui/confirm-action-dialog.test.tsx` | 유지 | 사용자 동작 — returns focus to a standalone confirmation's invoking button after Escape |
| `ui/content-page-shell.test.tsx` | 유지 | 사용자 동작 — 기본 공지·VOD 헤더는 스크롤 바깥에 유지한다 |
| `ui/elastic-slider/elastic-slider.test.tsx` | 유지 | 사용자 동작 — clears keyboard focus decoration when switching to pointer manipulation |
| `ui/post-content.test.tsx` | 유지 | 사용자 동작 — 4개 타일에서 모든 사진을 탐색하고 방향키·Escape·포커스 복원을 지원한다 |
| `ui/tabs-list.test.tsx` | 유지 | 사용자 동작 — 키보드 이동에서 비활성 항목을 건너뛰고 선택과 포커스를 함께 이동한다 |

### `worker/app`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `media-route-cache.test.ts` | 유지 | 요청·실행 경계 — sets public cache headers for chzzk vods and clips |
| `protected-routes.test.ts` | 유지 | 요청·실행 경계 — /api/settings rejects unauthenticated requests |
| `queue.test.ts` | 유지 | 요청·실행 경계 — acks successful and malformed main-queue deliveries |
| `route-registry.test.ts` | 유지 | 요청·실행 경계 — dispatches only exact path patterns |
| `routes.test.ts` | 통합 | 명세 복사본 → 독립 정책 표. 모든 method·인증·캐시·상태와 누락 검출 보존 |
| `scheduled-queue.test.ts` | 유지 | 요청·실행 경계 — 성공한 item마다 다음 pending outbox를 dispatch한다 |
| `scheduled-workflow-cron.integration.test.ts` | 유지 | 실제 D1/Worker — YouTube cron admission with real D1 retry and lease state |
| `scheduled-workflow-cron.test.ts` | 유지 | 요청·실행 경계 — hourly lanes remain staggered across one Free-plan cron expression |
| `worker-queue.test.ts` | 유지 | 요청·실행 경계 — routes manual control without waiting behind background work |

### `worker/features/assets`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — serves profile background assets from R2 with long-lived cache headers |

### `worker/features/audit`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/admin-audit-handler.test.ts` | 유지 | 요청·실행 경계 — page 경계를 정규화하고 no-store 페이지 응답을 반환한다 |
| `infrastructure/log-filter.integration.test.ts` | 유지 | 실제 D1/Worker — uses identical filters for schedule rows and total, including the entire UTC end day |

### `worker/features/auth`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — returns the Worker-authoritative admin decision without exposing a user id |

### `worker/features/chzzk`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `domain/channel-targets.test.ts` | 유지 | 정책·상태 — normalizes case and removes duplicates while preserving order |
| `http/live-status.test.ts` | 유지 | 요청·실행 경계 — GET은 승인된 채널의 상태만 조회하고 스케줄을 수정하지 않는다 |
| `http/media.test.ts` | 유지 | 요청·실행 경계 — 활성 멤버 채널을 정규화·중복 제거하고 승인된 캐시 대상으로 표시한다 |
| `infrastructure/chzzk-api.test.ts` | 유지 | 정책·상태 — D1 fresh hit에서는 origin을 호출하지 않는다 |

### `worker/features/configuration`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/settings-handler.integration.test.ts` | 유지 | 실제 D1/Worker — saves the canonical budget and returns the authoritative value with one audit |
| `http/settings-handler.test.ts` | 유지 | 요청·실행 경계 — 백그라운드 수집/예열 설정 기본값과 읽기 전용 last_run을 쓰기 없이 반환한다 |

### `worker/features/ddays`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — returns 400 for malformed JSON instead of throwing to the index |
| `infrastructure/d1-dday-repository.test.ts` | 유지 | 정책·상태 — 조회와 생성·수정·삭제를 persistence adapter에서 수행한다 |
| `infrastructure/d1-dday-schema.integration.test.ts` | 유지 | 실제 D1/Worker — migration 적용 후 type을 실제 저장하고 수정한다 |

### `worker/features/member-posts`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — 반환하는 게시글의 저장된 갱신 시각만 조회하며 compact 응답에도 보존한다 |

### `worker/features/members`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — 활성 멤버 목록과 public cache 계약을 반환한다 |

### `worker/features/naver-cafe`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `domain/board-urls.test.ts` | 유지 | 정책·상태 — 숫자 ID의 공백과 1~20자리 경계를 검증한다 |
| `http/handler-auth.test.ts` | 유지 | 요청·실행 경계 — Clerk 토큰이 없으면 회원 전용 카페 게시글 API 호출을 막는다 |
| `http/handler-cache.test.ts` | 유지 | 요청·실행 경계 — fresh response cache가 있으면 저장 조회 서비스를 다시 호출하지 않는다 |
| `infrastructure/naver-cafe-collector.test.ts` | 유지 | 정책·상태 — 게시판 목록 응답을 피드 카드 데이터로 정규화한다 |

### `worker/features/notices`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — uploads notice thumbnails into the configured R2 asset bucket |

### `worker/features/operations`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — /api/operations/status는 관리자 인증을 요구한다 |
| `infrastructure/cloudflare-d1-observability-reader.test.ts` | 유지 | 정책·상태 — returns an unconfigured read without making an external request |
| `infrastructure/data-retention.test.ts` | 유지 | 정책·상태 — selects only due policies in one read-only batch and preserves the cutoff boundary |
| `infrastructure/operations-application.test.ts` | 유지 | 정책·상태 — keeps a recent normal skip healthy even when the previous success is old |
| `infrastructure/scheduled-queue-state-sql.integration.test.ts` | 유지 | 실제 D1/Worker — reads at most ten rows with no backlog and 2,130 retained deliveries under stale statistics |

### `worker/features/otw-play`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `application/admin-catalog-service.test.ts` | 유지 | 정책·상태 — preflights and then re-verifies YouTube metadata before one integrated catalog command |
| `application/channel-monitor-service.test.ts` | 유지 | 정책·상태 — blocks new monitoring and reactivation while preserving pause and candidate readback |
| `application/ingestion-service.test.ts` | 유지 | 정책·상태 — stops automatic recovery before the next queue send when automation pauses |
| `application/member-submission-service.test.ts` | 유지 | 정책·상태 — canonicalizes YouTube without calling metadata |
| `application/playlist-artwork.test.ts` | 유지 | 정책·상태 — uses the selected playable source and excludes item arrays from summaries |
| `application/playlist-service.test.ts` | 유지 | 정책·상태 — roundtrips a page boundary with rich performance metadata without embedding it in the cursor |
| `application/public-catalog-service.test.ts` | 유지 | 정책·상태 — reads authoritative meta before a config cache hit and keeps config readable while disabled |
| `application/release-service.test.ts` | 유지 | 정책·상태 — reads the authority and at most 20 recent changes |
| `application/source-health-service.test.ts` | 유지 | 정책·상태 — uses the same observation path for manual checks and validates stored identity |
| `domain/ai-review-result.test.ts` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `domain/broadcast-metadata.test.ts` | 유지 | 정책·상태 — keeps unknown dates and originals, including partial singing |
| `domain/channel-poll-schedule.test.ts` | 유지 | 정책·상태 — does not miss the next cron slot when completion follows dispatch |
| `domain/duplicate-policy.test.ts` | 유지 | 정책·상태 — creates deterministic song key material without hashing |
| `domain/ingestion-cursor.test.ts` | 유지 | 정책·상태 — round-trips the keyset and filter identity |
| `domain/member-songbook-query.test.ts` | 유지 | 정책·상태 — defaults to vocal and featured, and binds collaboration into cursor identity |
| `domain/member-submission-cursor.test.ts` | 유지 | 정책·상태 — round-trips a Unicode-safe keyset tuple |
| `domain/playlist-query.test.ts` | 유지 | 정책·상태 — keeps performance identity and nullable date and binds the cursor to its filter/revision |
| `domain/public-catalog-cursor.test.ts` | 유지 | 정책·상태 — requires a coherent search phase and rank exactly when q is present |
| `domain/public-catalog-query.test.ts` | 유지 | 정책·상태 — normalizes search and canonicalizes equivalent member sets |
| `domain/public-group-key.test.ts` | 유지 | 정책·상태 — round-trips a Unicode unit selector |
| `domain/public-source-selection.test.ts` | 유지 | 정책·상태 — uses the stored playable primary without recomputing channel-role rank |
| `domain/search-normalization.test.ts` | 유지 | 정책·상태 — produces the same key when only whitespace and punctuation differ |
| `domain/source-health-policy.test.ts` | 유지 | 정책·상태 — clamps provider Retry-After and applies fixed retry policies |
| `domain/youtube-playlist-id.test.ts` | 유지 | 정책·상태 — YouTube playlist identity |
| `domain/youtube-video-id.test.ts` | 유지 | 정책·상태 — OTW Play YouTube video ID parser |
| `http/admin-catalog-handler.test.ts` | 유지 | 요청·실행 경계 — authenticates before reading the catalog and returns no-store |
| `http/admin-catalog-input.test.ts` | 유지 | 요청·실행 경계 — parses the workflow-first preflight and integrated catalog command |
| `http/ai-review-handler.test.ts` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `http/channel-monitor-handler.test.ts` | 유지 | 요청·실행 경계 — creates an explicit monitor by YouTube channel ID and reconciles it |
| `http/ingestion-handler.test.ts` | 유지 | 요청·실행 경계 — authenticates before resolving the ingestion service |
| `http/ingestion-input.test.ts` | 유지 | 요청·실행 경계 — accepts explicit singing imports and rejects invalid kinds and unversioned corrections |
| `http/member-submission-handler.test.ts` | 유지 | 요청·실행 경계 — returns the standard auth error without resolving a service |
| `http/member-submission-input.test.ts` | 유지 | 요청·실행 경계 — accepts only the member submission snapshot contract |
| `http/observability-handler.test.ts` | 유지 | 요청·실행 경계 — authenticates and returns a no-store partial DTO as HTTP 200 |
| `http/play-telemetry-handler.test.ts` | 유지 | 요청·실행 경계 — records a new proposal exactly once without logging the request body |
| `http/playlist-handler.test.ts` | 유지 | 요청·실행 경계 — also marks an existing creation replay as uncertain when its readback fails |
| `http/public-catalog-handler.test.ts` | 유지 | 요청·실행 경계 — serves the member index without cache validators and rejects unexpected query fields |
| `http/release-handler.test.ts` | 유지 | 요청·실행 경계 — serves GET authority and recent audits with no-store |
| `http/release-input.test.ts` | 유지 | 요청·실행 경계 — parses the exact release command contract |
| `http/websub-handler.test.ts` | 유지 | 요청·실행 경계 — retired WebSub HTTP boundaries |
| `infrastructure/admin-review-summary.test.ts` | 유지 | 정책·상태 — reads stored counts without writes or provider calls, retaining unavailable counts |
| `infrastructure/cloudflare-play-observability-reader.test.ts` | 유지 | 정책·상태 — returns an HTTP-independent unconfigured partial when credentials are absent |
| `infrastructure/cloudflare-play-telemetry.test.ts` | 유지 | 정책·상태 — maps only fixed safe slots and preserves unknown D1 metadata as -1 |
| `infrastructure/cloudflare-public-catalog-cache.test.ts` | 유지 | 정책·상태 — uses the fixed internal host and preserves JSON cache headers |
| `infrastructure/d1-admin-catalog-repository.integration.test.ts` | 유지 | 실제 D1/Worker — creates a draft and marks its ingestion candidate converted in one catalog batch |
| `infrastructure/d1-ai-review-repository.integration.test.ts` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `infrastructure/d1-architecture-hardening-schema.integration.test.ts` | 유지 | 실제 D1/Worker — uses SET NULL for proposal member snapshots and preserves the names |
| `infrastructure/d1-authority-retention-migration.integration.test.ts` | 유지 | 실제 D1/Worker — repairs false-active subscriptions and preserves valid authority |
| `infrastructure/d1-catalog-schema.integration.test.ts` | 통합 | 컬럼·일반 인덱스·CHECK 이름 목록 삭제. 외래키·실제 쓰기 제약·삭제 정책·검색 인덱스는 같은 파일과 public-reader 통합 검사에서 유지 |
| `infrastructure/d1-channel-monitor-repository.integration.test.ts` | 유지 | 실제 D1/Worker — keeps VOD registration, deletion and Play collection independent for the same YouTube channel |
| `infrastructure/d1-clip-relation-migration.integration.test.ts` | 유지 | 실제 D1/Worker — normalizes legacy broadcast relations without losing dependent reviews or credits |
| `infrastructure/d1-external-identity-consolidation.integration.test.ts` | 유지 | 실제 D1/Worker — moves every live reference to the canonical identity before enforcing uniqueness |
| `infrastructure/d1-ingestion-repository.integration.test.ts` | 유지 | 실제 D1/Worker — keeps review pages within one import while sharing candidates across histories |
| `infrastructure/d1-member-entity-backfill.integration.test.ts` | 유지 | 실제 D1/Worker — adds every active member missing from the ownership entity authority |
| `infrastructure/d1-member-submission-repository.integration.test.ts` | 유지 | 실제 D1/Worker — stores the proposal and children atomically and replays the same idempotency key |
| `infrastructure/d1-playlist-repository.integration.test.ts` | 유지 | 실제 D1/Worker — persists more than one page, reopens ordered references and does not need surviving catalog rows |
| `infrastructure/d1-proposal-search-schema.integration.test.ts` | 통합 | 컬럼·일반 인덱스·CHECK 이름 목록 삭제. 외래키·실제 쓰기 제약·삭제 정책·검색 인덱스는 같은 파일과 public-reader 통합 검사에서 유지 |
| `infrastructure/d1-public-catalog-reader.integration.test.ts` | 유지 | 실제 D1/Worker — lists every playlist performance across pages and keeps vocal roles scoped to the same performance |
| `infrastructure/d1-release-repository.integration.test.ts` | 유지 | 실제 D1/Worker — reads authoritative flags and revision readiness |
| `infrastructure/d1-source-health-repository.integration.test.ts` | 유지 | 실제 D1/Worker — blocks automatic claims and late observations or retries after pause while retaining manual review |
| `infrastructure/gemini-review-analyzer.test.ts` | 유지 | 진행 중인 AI 검수 작업: 이번 정리에서 변경하지 않음 |
| `infrastructure/youtube-metadata-reader.test.ts` | 유지 | 정책·상태 — calls fetch without rebinding the Cloudflare-compatible receiver |

### `worker/features/schedule-board`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `http/handler.test.ts` | 유지 | 요청·실행 경계 — 날짜 범위를 검증한다 |
| `infrastructure/d1-schedule-board.test.ts` | 유지 | 정책·상태 — 조회 시각이 아니라 실제 최신 변경 시각을 ISO 문자열로 반환한다 |

### `worker/features/scheduled-operations`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `infrastructure/scheduled-job-coordinator.test.ts` | 유지 | 정책·상태 — keeps manual control isolated |
| `infrastructure/scheduled-job-executor.test.ts` | 유지 | 정책·상태 — rechecks paused automation when an already dispatched source-health item arrives |
| `infrastructure/scheduled-job-planner.test.ts` | 유지 | 정책·상태 — plans no empty recovery, WebSub, YouTube, or retention work |

### `worker/features/schedules`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `application/authorize-schedule-write.test.ts` | 유지 | 정책·상태 — application 경계가 policy 판단을 그대로 적용한다 |
| `application/pending-schedule-service.test.ts` | 유지 | 정책·상태 — isolates repository exceptions while preserving order and concurrency |
| `domain/auto-update-matcher.test.ts` | 유지 | 정책·상태 — 46초와 35분 뒤 재개한 VOD를 같은 방송 세션으로 합친다 |
| `domain/pending-schedule.test.ts` | 유지 | 정책·상태 — 전체 적용은 시간 모드에 따라 시작 시각을 선택하고 제목을 유지한다 |
| `domain/schedule.test.ts` | 유지 | 정책·상태 — schedule domain status policy |
| `http/manual-auto-update-handler.test.ts` | 유지 | 요청·실행 경계 — 수동 실행을 비동기 operation으로 접수한다 |
| `http/pending-command-handler.test.ts` | 유지 | 요청·실행 경계 — returns 405 and Allow for non-POST direct calls |
| `http/pending-query-handler.test.ts` | 유지 | 요청·실행 경계 — 기존 pending 목록 응답과 no-store 계약을 유지한다 |
| `http/schedule-handler.test.ts` | 유지 | 요청·실행 경계 — 잘못된 상태값은 repository 호출 전에 거부한다 |
| `http/update-log-handler.test.ts` | 유지 | 요청·실행 경계 — legacy limit 조회 계약과 no-store 응답을 보존한다 |
| `infrastructure/auto-update-rejection.integration.test.ts` | 유지 | 실제 D1/Worker — 동일 VOD는 제목과 시간이 바뀌어도 억제하고 다른 VOD는 독립 처리한다 |
| `infrastructure/auto-update-runs.test.ts` | 유지 | 정책·상태 — auto update run CHZZK cache wiring |
| `infrastructure/auto-update.test.ts` | 유지 | 정책·상태 — 채널을 페이지 wave로 조회하고 모든 수집 호출에서 fresh cache를 우회한다 |
| `infrastructure/d1-pending-schedule-repository.integration.test.ts` | 유지 | 실제 D1/Worker — 동일 pending을 동시에 승인해도 정확히 한 transaction만 성공한다 |
| `infrastructure/live-schedule.integration.test.ts` | 유지 | 실제 D1/Worker — concurrent empty-day collection creates only one schedule and links its log |
| `infrastructure/live-schedule.test.ts` | 유지 | 정책·상태 — 시간 미정 방송 스케쥴에 라이브 제목과 시작 시간을 채운다 |
| `infrastructure/public-schedule-write-policy.test.ts` | 유지 | 정책·상태 — 현재 제품 정책에 따라 익명 일정 쓰기를 명시적으로 허용한다 |

### `worker/features/seo`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `application/site-seo-service.test.ts` | 유지 | 정책·상태 — includes only public feed and active profiles in a deduplicated sitemap |
| `http/handler.integration.test.ts` | 유지 | 실제 D1/Worker — rewrites feed metadata from public settings |

### `worker/features/x-posts`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `domain/handle-targets.test.ts` | 유지 | 정책·상태 — deduplicates handles case-insensitively |
| `http/manual-collection-handler.test.ts` | 유지 | 요청·실행 경계 — 수동 수집을 비동기 operation으로 접수한다 |
| `http/x-history-route.test.ts` | 유지 | 요청·실행 경계 — requires administrator authentication |
| `http/x-posts-route.test.ts` | 유지 | 요청·실행 경계 — case-insensitive duplicates are authorized once without refresh |
| `infrastructure/link-preview.test.ts` | 유지 | 정책·상태 — X URL entity 메타데이터가 있으면 외부 fetch 없이 프리뷰를 만든다 |
| `infrastructure/x-api-cost.test.ts` | 유지 | 정책·상태 — charges batched Post lookups for Post resources only |
| `infrastructure/x-collection.test.ts` | 유지 | 정책·상태 — 대소문자가 다른 동일 handle을 하나의 lower-case source로 정규화한다 |
| `infrastructure/x-redaction.test.ts` | 유지 | 정책·상태 — heals the facts tombstone on an idempotent retry |
| `infrastructure/x-reference-hydration.integration.test.ts` | 유지 | 실제 D1/Worker — ignores reply-only post and author backlog without reserving budget or retrying |
| `infrastructure/x-stored-feed.integration.test.ts` | 유지 | 실제 D1/Worker — reads eight handles in two queries with independent limits, tie order, and source freshness |
| `x-posts.test.ts` | 유지 | 정책·상태 — timeline 응답을 게시글 카드 데이터로 정규화한다 |

### `worker/features/youtube`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `domain/channel-targets.test.ts` | 유지 | 정책·상태 — accepts valid channel ids and removes exact duplicates |
| `domain/short-classification.test.ts` | 유지 | 정책·상태 — does not classify extended videos published before the product cutoff |
| `domain/shorts-cursor.test.ts` | 유지 | 정책·상태 — round-trips with order-independent channel fingerprints |
| `http/kirinuki.test.ts` | 유지 | 요청·실행 경계 — 40개 요청은 canonical SWR 조회를 사용하고 fresh metadata와 ExecutionContext를 전달한다 |
| `http/youtube.test.ts` | 유지 | 요청·실행 경계 — fresh 공개 응답은 cache metadata와 public cache header를 반환하고 ExecutionContext를 전달한다 |
| `infrastructure/youtube-api.test.ts` | 유지 | 정책·상태 — D1 fresh cache가 있으면 외부 YouTube API를 호출하지 않는다 |
| `infrastructure/youtube-cache-analytics-reader.test.ts` | 유지 | 정책·상태 — returns an explicit unconfigured result without querying Analytics Engine |
| `infrastructure/youtube-cache-swr.test.ts` | 유지 | 정책·상태 — official 12시간과 kirinuki 6시간 fresh 경계 및 canonical 20/40 키를 사용한다 |
| `infrastructure/youtube-cache-telemetry.test.ts` | 유지 | 정책·상태 — maps request, cache outcome, and refresh metrics to fixed dimensions |
| `infrastructure/youtube-feed.integration.test.ts` | 유지 | 실제 D1/Worker — serves an initialized complete page repeatedly without registry writes or legacy cache scans |
| `infrastructure/youtube-feed.test.ts` | 유지 | 정책·상태 — keeps a global page refreshing while any source frontier can contain a newer item |
| `infrastructure/youtube-quota.integration.test.ts` | 유지 | 실제 D1/Worker — low 70%, core 85%, critical 100% 우선순위 경계를 한 원장에 적용한다 |
| `infrastructure/youtube-quota.test.ts` | 유지 | 정책·상태 — PDT 자정에서 새 일일 quota window를 시작한다 |
| `infrastructure/youtube-warmup.test.ts` | 유지 | 정책·상태 — 공식 20개와 키리누키 40개 canonical 키를 강제 갱신하고 영상 ID 집합만으로 변경을 판정한다 |

### `worker/platform`

| 파일 | 판단 | 근거·남는 검증 |
| --- | --- | --- |
| `auth.test.ts` | 유지 | 정책·상태 — spoofed user header alone is not authenticated |
| `http-helpers.test.ts` | 유지 | 정책·상태 — ignores client-supplied actor headers |
| `http/json.test.ts` | 유지 | 요청·실행 경계 — returns a 400 response for malformed JSON |
| `scheduled-jobs/d1-scheduled-job-repository.integration.test.ts` | 유지 | 실제 D1/Worker — keeps idle atomic outbox updates bounded after retained history outgrows planner statistics |
| `scheduled-jobs/job-policy.test.ts` | 유지 | 정책·상태 — 70/85/95 percent 단계에 맞춰 낮은 우선순위부터 중단한다 |
| `scheduled-jobs/scheduled-run-client.test.ts` | 유지 | 정책·상태 — control Queue 전송 실패를 실패한 run으로 영속화한다 |
