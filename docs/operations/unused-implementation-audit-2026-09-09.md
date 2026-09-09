# 미사용·잔여 구현 점검 — 2026-09-09

> 과거 진단 기록: 아래 위치·코드·상태는 점검 당시 기준이다. 후속 구현과 현행 운영은 [정리 적용 계약](retired-implementation-cleanup.md)을 따른다. 종료된 WebSub·warmup 설명을 재활성화 지침으로 사용하지 않는다.

현재 서비스 기능을 크게 줄이기보다, 전환 뒤 남은 실행 코드·설정 계약·운영 문서를 정리하는 것이 우선이다. 확인한 잔여물 대부분은 현재 자동 실행되지 않아 직접적인 운영 요금보다 유지보수 혼선과 잘못된 재연결 위험을 만든다. 의미가 없어진 설정을 정상 변경으로 받아들이는 문제는 먼저 수정할 필요가 있다.

이번 작업은 진단이다. 애플리케이션 코드, 운영 설정, 리소스와 데이터를 변경하거나 삭제하지 않았다. 원래 작업 폴더의 병행 프런트엔드·멤버 노래책·SEO 변경도 보존했다.

## 검토 기준과 증거

- 최신 `origin/master`: `b996572082645e8deb8cd5eea7ee43a75efd4372` (PR #129). 격리 작업 폴더의 `edb50ec`와 source tree가 동일함을 재확인했다.
- 운영 Worker: `aebc630f-3d1b-4e68-a327-cf4253d6efc9`, 100%. 2026-09-09 08:48:52 KST 리소스 조회 기준이다.
- Git 추적 TS/TSX/JS/MJS 852개를 대상으로 import/export 연결을 탐색하고, 운영 진입점·라우트·barrel export·테스트·설정·배포 구성을 수동 대조했다. 선언 파일, CSS, 동적 자산과 외부 API 사용량까지 이 숫자가 대표하지는 않는다.
- Cloudflare 버전의 binding 이름, Queue 생산자·소비자·backlog, D1 스키마·설정·작업 이력을 읽었다. 비밀키 값과 메시지 본문은 읽지 않았다. 조회한 D1 결과는 모두 `rows_written=0`, `changed_db=false`였다.
- 아키텍처 검사 통과. 에이전트 규칙 mirror 16개 일치, drift 0. 코드 수정이 없는 진단이므로 전체 테스트·빌드는 재실행하지 않았다.
- 정적 탐색의 자동 후보를 그대로 미사용으로 판정하지 않았다. 예를 들어 Worker의 `index.ts` export, type-only 사용, barrel 재노출, 동적 coverage provider는 별도로 확인했다.

## 먼저 정리할 사항

### 1. 실제 동작에 영향을 주지 않는 YouTube warmup 설정 — 중간 우선순위

`worker/features/youtube/infrastructure/youtube-warmup.ts:129`의 `readYouTubeWarmupSettings`는 `enabled=false`, `intervalHours=0`, 공식/키리누키 포함 여부는 항상 `true`를 반환한다. 기존 예약 warmup은 현재 스케줄러에 등록되어 있지 않다.

반면 `contracts/configuration.ts:497` 이후의 설정 계약은 다음 4개를 여전히 쓰기 가능으로 처리한다.

- `youtube_warmup_enabled`
- `youtube_warmup_interval_hours`
- `youtube_warmup_official_enabled`
- `youtube_warmup_kirinuki_enabled`

운영 DB에도 각각 `true`, `2`, `true`, `true`가 남아 있다. `/api/settings`는 해당 변경을 파싱하고 저장·감사 기록 후 성공으로 응답하는 코드 경로를 유지한다. 따라서 이 설정을 API로 수정하면 예약 동작을 바꾼 것으로 오해할 수 있다. 이번 진단에서 실제 설정 변경 요청은 수행하지 않았다.

**수정 방향:** 종료된 설정을 쓰기 대상에서 제외하고, 읽기 계약에서도 종료 상태를 명시하거나 소비자를 함께 정리한다. `youtube_api_daily_quota_units`는 실제 공용 예산이므로 유지한다. 옛 `youtube_warmup_daily_quota_units`는 canonical 값이 없을 때의 quota fallback으로 아직 참조되므로, 나머지 4개와 달리 이관·fallback 종료 여부를 확인한 뒤 정리한다. 수동 캐시 갱신, 수요 기반 캐시, 일반 YouTube 피드 수집, 과거 실행 이력은 유효한 기능이다.

### 2. 구형 직접 실행 스케줄러와 전용 테스트 — 낮은 우선순위

`worker/app/scheduled.ts:227`의 `handleScheduled`와 같은 파일의 orchestration은 현행 Worker 진입점에서 호출되지 않는다. 실제 `worker/index.ts:13`은 `handleScheduledWorkflowCron`을 등록한다. 구형 파일은 정적 production import 그래프에서도 진입 경로가 없는 파일로 확인했다.

그런데 `worker/app/scheduled.test.ts`는 여전히 이 구형 직접 실행 경로의 병렬 수집을 검증한다. 현재 Workflow → coordinator → outbox → queue 경로를 검증하는 테스트와 별개의 계약이다.

**수정 방향:** 구형 composition과 해당 경로만 검증하는 테스트를 제거한다. 이 파일에서만 호출되는 `runScheduledXCollection`, `runScheduledNaverCafeCollection`, `runScheduledDataRetentionPrune` 등의 wrapper/export도 함께 재검토한다. 공용 collector와 `runScheduledYouTubeFeedCollection`은 현행 executor에서 사용하므로 유지한다. 현재 두 스케줄러가 동시에 실행된다는 뜻은 아니다.

### 3. 사용하지 않는 두 번째 ingestion Queue 핸들러 — 낮은 우선순위

`worker/features/otw-play/http/ingestion-handler.ts:420`의 `createIngestionQueueHandler`는 export만 되고 실제 composition에서 호출되지 않는다. 실행 중인 경로는 `worker/app/worker-queue.ts` → `worker/app/queue.ts`의 `handleQueue`다.

**수정 방향:** 미사용 핸들러와 export·전용 import를 제거하고, 현행 Queue 라우터의 메시지 검증·재시도·DLQ 처리만 유지한다. 두 핸들러를 함께 유지하면 한쪽만 수정되는 문제가 생길 수 있지만 현재 중복 소비가 일어난 증거는 없다.

### 4. WebSub 제거 후 남은 직접 의존성 — 낮은 우선순위

`package.json:62`의 `fast-xml-parser`는 최신 소스에서 import·호출이 없다. 이전 사용자는 삭제된 WebSub feed parser였다. `pnpm why`에서도 프로젝트의 직접 dependency로만 확인했다.

**수정 방향:** 직접 의존성과 lockfile 항목을 정상 패키지 명령으로 정리한다. 효과는 설치·업데이트·검토 대상 감소다. 현재 요청당 실행 비용이나 번들 감소량은 측정하지 않았으므로 절감액으로 환산하지 않는다.

## 전환 종료 조건을 갖춘 리소스 정리 후보

### 5. WebSub secret·Queue·재생성 설정 — 조건부 정리

실제 운영에 `OTW_PLAY_WEBSUB_SECRET_V1` secret binding이 남아 있으나 최신 Env와 코드에서 읽지 않는다. `wrangler.jsonc`의 secret 설정 예시에도 아직 등장한다.

`otw-websub` Queue의 현재 조회 결과:

| 항목 | 결과 |
| --- | --- |
| Worker producer | 0 |
| consumer | 기존 메시지를 종료 처리하는 Worker 1개 |
| backlog_count / backlog_bytes | 0 / 0 |
| message_retention_period | 86,400초 |
| 배포 이후 종료된 두 job의 신규 run | 0 (배포 후 약 19분의 짧은 관측 구간) |

Queue의 consumer는 이전 메시지를 정상 종료하기 위해 의도적으로 남긴 구현이다. 반면 `scripts/provision-ops-queues.mjs:19`는 여전히 이 Queue를 신규 생성 목록에 포함하므로, 나중에 Queue만 삭제하면 provision 실행 때 다시 생성된다.

**수정 방향:** 전환 관측과 rollback 필요성을 확인한 뒤 provision 목록, Wrangler consumer, Queue routing/retirement telemetry, 실제 Queue, unused secret을 하나의 정리 단위로 취급한다. 현재 backlog는 0이지만 Cloudflare가 best-effort 값으로 제공하므로 단 한 번의 0을 무조건 삭제 근거로 삼지 않는다. 임의의 구독 해제 확인을 기다릴 필요는 없다.

Queue 요금은 생성된 Queue 수 자체가 아니라 메시지 operation 기준이다. 따라서 빈 Queue 삭제를 곧바로 월 운영비 절감이라고 주장할 수 없다. [Cloudflare 요금](https://developers.cloudflare.com/queues/platform/pricing/), [Queue metrics 정의](https://developers.cloudflare.com/api/resources/queues/methods/get_metrics/)

## 코드·테스트·문서의 잔여물

### 6. 화면에서 호출하지 않는 훅과 컴포넌트 — 낮은 우선순위

다음은 최신 코드와 원래 작업 폴더의 병행 변경을 검색해도 정의·재노출·테스트 외의 사용이 확인되지 않았다.

| 심볼 | 파일 / 위치 | 판단 |
| --- | --- | --- |
| `useXPostContext` | `src/features/x-posts/queries/use-x-post-context.ts:8` | 답글은 저장된 미리보기 또는 직접 링크로 바뀌어 카드에서 훅을 호출하지 않음 |
| `useFilteredXPosts` | `src/features/x-posts/queries/use-x-posts.ts:92` | 소비자 없는 추가 필터 훅 |
| `useFilteredNaverCafePosts` | `src/features/naver-cafe/queries/use-naver-cafe-posts.ts:78` | 소비자 없는 추가 필터 훅 |
| `useAllMembersLatestVods` | `src/features/chzzk/queries/use-chzzk-vods.ts:52` | 현행 화면 소비자 없음 |
| `OtwPlayMemberHome` | `src/features/otw-play/ui/member/member-shell.tsx:45` | 라우트에 연결되지 않은 과거 회원 홈 |
| `SourceOperationalSummary` / `SectionIntro` | `src/features/member-posts/ui/admin/member-post-settings.tsx:266`, `:457` | 관리자 UI에서 소비하지 않는 컴포넌트 |

`x-post-card.test.ts:17`에도 현행 카드가 import하지 않는 `useXPostContext` mock이 남아 있다. 해당 mock 설정은 현재 카드 검증에 기여하지 않는다.

**수정 방향:** 미사용 export·컴포넌트와 해당 전용 테스트/mock을 함께 정리한다. 같은 파일에서 쓰이는 정상 훅이나 `OtwPlayMemberShell`까지 삭제하면 안 된다. 또한 기존 X context API는 현재 D1 저장 데이터만 읽는 호환 계약으로 유지되고 있어, 훅 미사용과 외부 API 비용 발생을 혼동하면 안 된다.

### 7. 현행 진입점과 어긋나는 운영·설계 문서 — 중간 우선순위

새 요구사항 DEC-078과 `channel-upload-polling.md`는 시간당 polling을 명시하지만 다른 활성 문서에는 이전 내용이 남아 있다.

- `docs/architecture.md:56`의 도식은 여전히 `worker/index.ts → worker/app/scheduled.ts`와 직접 orchestration을 표시한다.
- `docs/operations/scheduled-jobs-v2.md:43`은 WebSub를 1차 경로, 채널 조회를 6시간 복구 경로로 설명한다. 같은 문서의 secret·cron·Queue 설명도 이전 구성이다.
- `docs/otw-play-system-design.md:1737`, `docs/otw-play-ui-ux-design.md:913`, `docs/otw-play-implementation-guide.md` 등에 WebSub runtime/관리 UI를 현행처럼 읽을 수 있는 설명이 남아 있다.
- `docs/operations/backend-cost-optimization.md`의 미해결 unsubscribe 및 재가입 안내도 후속 종료 결정을 연결해야 한다.

**수정 방향:** 현행 설명을 hourly polling/Workflow 진입점으로 정합화하고, 당시 배포·진단 증거는 날짜가 있는 과거 기록으로 분리한다. 기록 자체를 삭제하지 않는다. 이 문서들을 기준으로 복구·재배포할 때 구형 구성을 되살릴 가능성을 줄이는 것이 목적이다.

### 8. 오래된 스키마를 지원하는 fallback — 조건부 정리

- `worker/features/ddays/infrastructure/d1-dday-repository.ts:21`: `ddays.type`이 없을 때 재조회/재저장을 수행한다. 생성·수정 fallback에서는 요청한 type을 저장하지 않는다.
- `worker/features/schedules/infrastructure/d1-pending-schedule-query.ts:255`: VOD metadata 컬럼이 없을 때 legacy select로 재조회한다.

운영 PRAGMA에서 `ddays.type`, pending의 `vod_started_at`, `vod_duration_seconds`, `vod_thumbnail_url`, `processed_reset_at`이 모두 존재한다. migration 이력도 `0085`까지 적용돼 있다.

**수정 방향:** 지원하는 모든 실행 환경이 canonical migration을 적용한다는 전제하에 fallback과 오래된 schema 전용 테스트를 정리한다. 정상 운영에서는 이 catch 분기가 실행되지 않으므로 지금 반복 조회 비용이 발생한다고 볼 근거는 없다. 제거 시 미이관 환경은 명시적으로 실패하게 해야 하며, 기존 데이터 호환 DTO까지 한꺼번에 삭제하지 않는다.

### 9. 테스트에서만 사용하는 도메인 정책 — 추가 통합 검토

`assessExactSourceDuplicate`, `assessSoftDuplicate`, `selectPreferredOfficialSource`와 일부 status-transition 함수는 production caller 없이 barrel export와 단위 테스트만 남아 있다. 실제 저장·조회는 별도 repository/서비스 경로로 실행된다.

현재 단위 테스트 통과가 실운영 정책 적용을 증명하지 않는다는 의미다. 해당 요구사항이 사라졌다고 결론 내리지는 않았다. 실제 중복 판정·재생 소스 선택·상태 전이와 대조해 공용 정책으로 연결할지, 중복 선언을 제거하고 실제 경로의 검증으로 교체할지 결정해야 한다. 데이터 무결성·승인·CAS 검사를 줄이는 방향으로 처리하면 안 된다.

## 유지할 항목과 오탐 제외

- WebSub 구독 1행·전달 1행, migration, 감사 이력과 종료 job type: 과거 기록을 해석하기 위해 보존한다. 저장량을 줄이려 테이블을 재구축할 근거가 없다.
- WebSub 정확한 기존 경로의 인증 및 HTTP 410 응답: 구형 요청을 종료시키는 작은 호환 경계다. 실시간 구독 기능과 구분한다.
- `completeSupplemental` / `last_recent_reconciled_at`: 자동 recent job은 종료됐지만 수동 최근 영상 backfill의 완료 기록에서 여전히 사용한다.
- Play 수집·source health·일반 ingestion Queue: 전역 일시 중지 상태라는 이유만으로 불필요한 구현으로 분류하지 않는다. 검수·재개 계약이 존재한다.
- X/Naver/일반 YouTube 공용 outbox 복구와 retention, CHZZK 캐시, Play 검색 인덱스, Queue 격리: 현행 흐름에서 사용한다.
- `@vitest/coverage-v8`: 기본 `vitest.config.ts:23`에서 사용한다. 전체 preflight는 Istanbul을 쓰지만 이 패키지를 미사용으로 단정할 수 없다.
- Tailwind CSS, `tw-animate-css`, jsdom, 타입 패키지, tsx: CSS·도구·테스트 설정으로 사용한다. 정적 TS import 부재만으로 삭제하지 않는다.
- `baseline-browser-mapping`: 직접 import는 없어도 Browserslist/Babel 빌드 의존 경로에 있으므로 이번 즉시 정리 대상에서 제외한다.

## 권장 순서와 검증 범위

1. 효과 없는 warmup 설정 계약과 활성 운영 문서를 먼저 정리한다.
2. 구형 scheduler, 중복 ingestion handler, 미사용 XML 패키지 및 화면의 미사용 심볼을 제거한다. 전용 테스트를 함께 정리하고 실제 Cron/Workflow/Queue·수동 수집 경로의 검증은 유지한다.
3. 전환 관측과 되돌리기 조건을 정한 뒤 WebSub Queue/secret을 배포 설정·provision 스크립트와 함께 정리한다.
4. 스키마 fallback과 도메인 정책 중복은 지원 환경·최종 계약을 확인한 뒤 별도로 축소한다.

이번 점검은 코드 연결과 실제 배포/DB/Queue 상태의 대조다. 모든 API의 장기 access log, 모든 사용자 화면, R2 전체 객체 참조, 실제 청구서까지 조사한 결과는 아니다. 정적 호출 부재를 공개 API의 외부 사용자 부재로 확대 해석하지 않았다. 확인한 범위에서 서비스 기능을 추가로 크게 축소하거나 DB/Queue 아키텍처를 재구축해야 할 근거는 찾지 못했다.
