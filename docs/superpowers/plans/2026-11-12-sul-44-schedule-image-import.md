# SUL-44 Schedule Image Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 이미지 일정표를 Luna로 읽고 사용자가 편집·선택한 내용을 정상 일정 저장 경로로 반영한다. 별도 사용자 재개 지시로 코드와 로컬 검증을 진행하며 실제 모델 실측·운영 적용은 보류한다.

**Architecture:** 기존 `schedules` 기능 안에 이미지 인식과 편집 초안을 둔다. Worker가 Luna를 호출하고, 검증된 초안을 프런트엔드로 반환한다. 적용은 기존 권한·사이트 정책·충돌·감사·중복 방지 경계를 보존하는 일정 저장 경로를 거친다.

**Tech Stack:** Node.js 24 LTS, pnpm 11.7.0, React 19, TypeScript, TanStack Query, 기존 shared UI, Cloudflare Worker/D1, 공급자 HTTP API. 추가 SDK·OCR 서버·Queue/Cron을 전제하지 않는다.

**Spec:** [2026-11-12-sul-44-schedule-image-import-design.md](../specs/2026-11-12-sul-44-schedule-image-import-design.md)

## Global Constraints

- 사용자 재개 지시에 따라 구현·로컬 검증·로컬 커밋을 진행한다. 유료 실험·원격 변경·게시·병합·배포는 보류한다.
- Node.js >=24.20.0 <25, pnpm@11.7.0과 기존 React·Worker·D1 구조를 따른다.
- 기본 모델은 gpt-6-luna이며 claude-haiku-5-5는 비교 후보로만 둔다.
- AI 이미지 인식은 OTW·LuvDia 모두 로그인 사용자에게 제공한다.
- 사용자 적용 전에는 실제 일정 데이터를 쓰지 않는다.
- 기존 직접 입력·사이트별 공개 쓰기·보관·운영 종료 권한을 약화하거나 전역 로그인 의무로 바꾸지 않는다.
- 모델 응답·시안·테스트는 실제 저장과 정상 화면의 재조회 증거를 대신하지 않는다.
- Play·AI 자동화 재개, 유료 모델 실험, 원격 DB 변경, Git 게시, 병합·배포는 이번 승인에 포함하지 않는다.

## Review Focus

1. 시간 미정·인식 실패를 기존 `status: "미정"` 삭제 명령으로 바꾸는 입력: Task 1·3에서 일정 삭제가 없음을 검증한다.
2. 연도 없는 주간표·잘못 연결된 멤버·다른 사이트 멤버: Task 1·2에서 확인 전 적용할 수 없음을 검증한다.
3. 한 날짜의 여러 방송·휴방 충돌·편집 중 타인 변경: Task 3에서 승인된 변경만 일어나고 오래된 확인으로 덮어쓰지 않음을 검증한다.
4. 중복 적용·응답 유실·일부 저장 성공·저장 뒤 조회 실패: Task 3에서 확정한 재시도 단위와 실제 결과를 보존하고 조회만 재시도함을 검증한다.
5. 취소·재선택·동시 유료 요청·상한 도달: Task 1·2에서 오래된 결과가 새 편집을 덮지 않고 승인된 비용 제한을 넘지 않음을 검증한다.

---

## 구현 재개 — 2026-11-12

사용자가 별도 브랜치에서 이 계획의 직접 실행을 요청했다. 구현·로컬 검증·계획 단위 로컬 커밋을 진행하며 유료 실험·원격 변경·게시·배포 보류는 유지한다. 아래 최초 문서 작성 당시 보류 문구는 이 최신 지시로 구현 범위에서 해제한다. 실행 기록은 이 계획 전용 ledger에 남긴다.

확정 인터페이스: `POST /api/schedules/image-import/analyze`는 로그인과 이미지 1장·기준 주/멤버 목록을 검증한 뒤 Luna 초안을 반환한다. `GET /api/schedules/image-import/context?memberUid=&date=`는 기존 권한으로 비교 가능한 전체 묶음과 snapshot을 반환한다. `POST /api/schedules/image-import/apply`는 `{operationId, memberUid, date, expected, changes, confirmedDeletedIds}` 한 묶음을 원자 적용한다. `GET /api/schedules/image-import/result?operationId=`는 같은 사용자/사이트의 24시간 결과만 반환한다. 미확인·실패·완료를 구분하고 독립 묶음 처리는 UI가 조정한다. 모든 경로는 정확히 등록하며 수동 API를 바꾸지 않는다.

새 영속 경계: 이미지 인식 비용/횟수 예약 ledger와 이미지 적용 결과 receipt를 canonical Drizzle schema에서 생성한다. 비용 기록은 월 한도에 사용하고 receipt의 24시간 수명과 분리한다. 원본·미적용 초안·전체 모델 응답은 저장하지 않는다. D1의 기존 저장 SQL을 공유하고 비교 snapshot·멤버/사이트 권한·삭제 확인·감사·receipt를 동일 batch에서 검증한다.

## 실행 상태와 계획의 한계

작성 기준: 2026-11-12, 로컬 `a9ed7abd`. Task 0~3의 구현과 로컬 검증을 수행했다. 각 실행 증거는 개발 기록과 전용 ledger를 따른다. Task 4의 실제 모델 실측은 자료·실행 준비를 기다리며 미완료다.

**Task 0 완료 전에는 Task 1~4를 실행하지 않는다.** D1~D7의 제품 정책·초기 설정·품질/속도 기준·일회성 비교 범위와 예산은 모두 확정했다. 실제 구현·유료 실험 실행은 계속 보류한다. 아래 파일·함수 이름은 인계를 위한 설계자 제안이며 사용자 확정 정책으로 취급하지 않는다. Task 0에서 확정 규칙에 맞는 인터페이스·저장 경계·파일 목록과 검증 절차를 상세화한 뒤 실행 가능한 계획으로 다시 검토한다. 설계 확정으로 미완료 준비나 별도 재개 지시를 대체하지 않는다.

각 제품 작업은 최종 흐름의 일부이며, 전체 인식·편집·저장·재조회가 연결되기 전에는 SUL-44 이미지 기능 완료로 보고하지 않는다.

## 파일 책임 지도

아래는 후보 지도다. 실제 생성·수정 파일은 Task 0 이후 확정하며, 현재는 이 문서와 설계·현재 작업 기록만 수정한다.

| 후보 파일/기존 경계 | 책임 |
| --- | --- |
| `contracts/schedule-image-import.ts` | 모델에서 읽은 초안과 확인 필요 항목의 wire DTO. 저장 명령은 기존 `contracts/schedules.ts`와 승인된 D3·D4 계약을 따른다. |
| `worker/features/schedules/domain/schedule-image-result.ts` | 외부 모델 결과 검증. 멤버·날짜·시간 미정을 기존 삭제 상태와 구분한다. |
| `worker/features/schedules/application/ports/schedule-image-reader.ts` | 이미지 bytes와 정형 결과를 주고받는 공급자 포트. 런타임·HTTP·D1을 import하지 않는다. |
| `worker/features/schedules/infrastructure/luna-schedule-image-reader.ts` | Luna HTTP 호출·정형 출력·사용량·오류 변환. D7의 Haiku 비교는 별도 실행 재개 지시 후에만 준비하며 운영 자동 전환 경로로 만들지 않는다. |
| `worker/features/schedules/application/read-schedule-image.ts`, `http/schedule-image-handler.ts` | 승인된 유료 호출 인가·한도·검증과 초안 생성. 일정 쓰기 없음. |
| `worker/app/schedule-image-import.ts`, `worker/platform/types.ts` | 서버 키와 실제 어댑터 조립. 비밀값은 문서·프런트엔드·로그에 넣지 않는다. |
| `contracts/api-routes.ts`, `worker/app/routes.ts`, `worker/features/schedules/index.ts` | 후보 `POST /api/schedules/image-import/analyze`와 public export를 정확하게 등록. 양 사이트 모두 서버가 로그인 여부를 확인한 뒤 AI 호출을 허용한다. 기존 수동 저장 인가를 바꾸지 않는다. |
| `src/features/schedules/api/schedule-image-import.ts` | 기존 `apiFetch`와 FormData를 사용하는 인식 요청. shared API를 중복 구현하지 않는다. |
| `src/features/schedules/model/schedule-image-draft.ts`, `use-cases/apply-schedule-image-draft.ts` | 편집 상태·선택 항목·확인 필요 표시와 승인된 적용 단위. |
| `src/features/schedules/ui/schedule-add-menu.tsx`, `schedule-image-import-dialog.tsx` | 공통 입력 선택과 업로드·원본 대조·빠른 편집·결과 화면. |
| `src/features/schedules/index.ts`, 일간 화면·주간 화면/헤더 | public export와 정상 진입점 연결. 기존 직접 입력을 보존한다. |
| 기존 일정 handler/service/write repository, `use-schedule-save-feedback.ts` | 인가·부수 삭제·감사·재시도와 저장/재조회 분리의 재사용 경계. 무조건 수정 대상으로 삼지 않는다. |
| D3·D4의 저장 검증/재시도 경계, D6의 비용 예약/계측 저장소 | 같은 멤버·날짜 묶음의 원자 저장, 서버의 중복 요청 결과 확인, 독립 묶음의 성공 보존이 필요하다. 기존 단건 저장 반복으로 이를 충족한다고 가정하지 않는다. 결과 확인 최소 기록은 D5에 따라 24시간이며, 정확한 adapter·스키마·마이그레이션 파일과 안전한 만료 처리는 Task 0에서 고정한다. 비용 계측 보관을 이 24시간과 혼동하지 않는다. |

## 제안 인터페이스

아래는 인식과 UI 간 이름을 맞추는 후보 계약이다. 확정된 D2 보정·D5 업로드/보관·D6 비용/실행 한도를 반영하여 Task 0에서 고정한다. 기준 주 확인 상태와 자정 이후 변환의 원문·날짜 변경 표시, 초과/응답 잘림을 전달할 계약도 이때 고정한다. 아직 소스에 존재하지 않는다.

확정 계약은 [이미지 입력 DTO](../../../contracts/schedule-image-import.ts)와 [서버 reader/budget port](../../../worker/features/schedules/application/ports/schedule-image-reader.ts)를 따른다. 원문 날짜/시간·요일·날짜 이동·기준 주 확인 상태와 비용 사용량을 보존한다.

`memberUid`는 공급자가 정한 권위 있는 ID가 아니다. 실제 사이트 멤버 목록과 검증한 값만 채운다. `date`는 기존 저장 계약에 맞는 실제 날짜이며, 인식하지 못한 값은 `null`과 `needsReview`로 보존한다. 사용자가 확정하지 않은 추측을 실제 값으로 승격하지 않는다.

### Task 0: 확정 정책에 따른 인터페이스 상세화와 재개 조건 확인

**Files:** Modify: 연결 설계의 D1~D7, 이 계획의 후보 파일/인터페이스/테스트, `docs/current-work.md`.

**Interfaces:** Consumes: 사용자 확정 사항과 D1~D7. Produces: 승인된 인가·사이트·파일 제한·보관·날짜 보정·충돌·원자성·재시도·비용·품질 기준과 별도 구현 재개 지시.

확정 기록: D1은 **OTW·LuvDia 모두 적용, 로그인 사용자에게 AI 인식 제공**이다. D2는 **현재 표시 주의 후보 확인 후 날짜 일괄 보정, 같은 이름의 멤버 일괄 연결, 한국 시간의 자정 이후 변환과 원문 표시, 시간 미정과 인식 실패 구분, 빈칸을 휴방이나 임의 제목으로 채우지 않기, 미확인 행 제외 후 나머지 선택 적용**으로 확정했다. D3는 **완전 중복 제외, 기존 유지 기본값, 수정 대상 지정 또는 새 일정 추가의 명시적 선택, 여러 방송 보존, 부수 삭제 추가 확인, 초안 내부 충돌 해결, 동시 변경 재비교**로 확정했다. D4는 **같은 멤버·날짜 묶음의 전부 성공/취소, 독립 묶음의 성공 보존, 실패 묶음만 재시도, 결과 확인 중 구분과 중복 저장 방지, 권한·충돌 재확인, 조회만 재시도, 편집 보존과 모델 재호출 금지**로 확정했다. D5는 **1장·PNG/JPG/WEBP·10MB 이하·최대 100건, 원본/초안의 편집창 내 임시 유지, 결과 확인 최소 기록 24시간·만료 재실행 금지, OpenAI 전송 안내**로 확정했다. D6는 **사이트별 월 $0.50·각 사이트 계정당 하루 10회/동시 1건, Luna Standard·추론 none, 입력 50,000/출력 12,000토큰·업로드 후 분석 20초, 자동 재시도/모델 전환 없음, 최대 비용 선예약·실사용 정산, 한도 후 AI 인식만 중단**으로 확정했다. D7은 **실제 이미지 30장(멤버표 12장·통합표 12장·어려운 사례 6장), 핵심 항목이 모두 맞는 일정 95% 이상(누락/추가 포함), 편집 가능 중앙값 멤버표 5초/통합표 10초 및 전체 요청 95%가 20초 내 완료, 전체 작업 시간 중앙값 직접 입력 대비 50% 이상 단축, 저장/재조회 100% 일치·의도하지 않은 삭제/덮어쓰기/중복 0건, Luna·Haiku 각 1회·총 60회 또는 별도 $0.50 중 먼저 도달하면 종료**로 확정했다. 기준과 예산의 확정이며 별도 구현·유료 실험 재개 지시는 아직 없다.

- [x] D1~D7 각각의 선택 결과와 근거를 설계에 기록했다. 월 비용 예상·운영 월 한도·일회성 비교 예산과 실제 실험 결과를 구분했다. 제품 작업이나 유료 호출은 수행하지 않았다.
- [x] D3·D4에 맞는 적용 요청/결과와 동시성·중복 방지 인터페이스를 기존 저장 경계와 함께 확정한다. 기존 `save`를 단순 반복하는 것으로 안전성이 충족됐다고 가정하지 않는다.
- [x] D1·D5·D6에 따라 유료 호출 인가·취소/만료·이미지 전달·비용 예약/정산의 정확한 소유 파일과 저장소를 확정한다. 새 DB가 필요하면 생성형 마이그레이션 절차를 계획에 포함한다.
- [x] 확정된 D5를 계약과 미래 회귀에 고정한다: 이미지 1장·PNG/JPG/WEBP·10,000,000바이트 이하·최대 100건, 편집창 종료/새로고침 시 원본·초안 폐기, 미적용 편집 닫기 확인, 원본/전체 응답 영구 보관 금지, 결과 확인 최소 기록 24시간·만료 재실행 금지, OpenAI 전송 안내다.
- [x] 확정된 D6를 호출·비용 예약 경계와 미래 회귀에 고정한다: 한국 시간의 사이트별 월 $0.50, 각 사이트 계정당 하루 10회/동시 1건, Standard·추론 none, 입력 50,000/출력 12,000토큰, 업로드 후 분석 20초, 자동 재시도 0회/모델 전환 없음, 최대 비용 선예약/실사용 정산·불명 비용 유지, 한도 후 AI만 차단이다. 별도 구현 재개 지시는 아직 없다.
- [x] 확정된 D7의 표본 구분·정답 대조·행 단위 정확도(누락/추가 포함)·속도·전체 작업 시간·저장/재조회 일치 측정 절차를 Task 4에 연결한다. 30장·모델별 1회·총 60회 또는 별도 $0.50 중 먼저 도달하면 종료하고 예산 부족 범위는 미검증으로 기록한다. 기준 확정을 실험 실행 승인으로 바꾸지 않는다.
- [x] 후보 계약과 아래 테스트의 정책별 기대값을 확정하고 설계 검토를 받는다. 실행 방법과 구현 재개 승인을 따로 기록한다.

Check: D1~D7 정책 기록은 완료했다. 저장/비용 경계의 정확한 계약·파일·검증 절차 고정과 재개 지시가 남아 있어 Task 0 전체를 완료한 것으로 처리하지 않는다.

### Task 1: 실제 Luna 인식 요청과 검증된 초안

**Files:** 위 책임 지도의 인식 계약·도메인·reader port/adapter·application·handler·조립·정확 경로와 public export. Test: 각 소유 파일 옆의 `*.test.ts`, `worker/app/routes.test.ts`, `worker/app/route-registry.test.ts`. 실제 비용 한도 동시성 저장 검사는 Task 0에서 확정한 소유 경계의 integration test로 둔다.

**Interfaces:** Consumes: Task 0 정책과 실제 사이트 멤버 목록. Produces: `readScheduleImage(file: File, signal?: AbortSignal): Promise<ScheduleImageDraft>`인 프런트엔드 API와 `parseScheduleImageResult(value: unknown): ScheduleImageDraft | null`인 도메인 parser. Worker reader는 실제 사이트 멤버를 포함한 `ScheduleImageInput`을 받아 `count(image, signal): Promise<number>`와 `read(image, signal): Promise<{draft: ScheduleImageDraft | null; usage: ImageReadUsage | null}>`를 제공한다. 잘린 응답도 사용량을 정산하기 위해 결과와 사용량을 구분한다.

- [x] 실패 테스트 `preserves_unreadable_time_without_delete_status`, `rejects_unknown_member_and_invalid_calendar_date`, `does_not_write_schedules_during_analysis`, `denies_unapproved_paid_request_before_provider_call`, `enforces_approved_budget_under_concurrency`, `does_not_auto_switch_model_on_timeout`를 작성한다. 예: `expect(result.rows[0]).toMatchObject({ startTime: null, timeState: "unreadable", needsReview: ["time"] })`; 양 사이트 모두 비로그인 요청의 reader 호출 수와 일정 쓰기 수는 0이며 로그인 사용자의 AI 진입을 허용한다. 기존 비로그인 수동 저장 회귀도 보존한다.
- [x] D2 회귀 `normalizes_explicit_25_hour_to_next_kst_date`, `preserves_missing_title_without_inventing_holiday`, `keeps_ambiguous_midnight_expression_for_review`를 추가한다. `2026-11-12 25:00`은 `2026-11-13 01:00`으로 정규화하되 원문·날짜 변경 표시를 보존하고, 빈 제목/빈 칸에서 휴방·제목을 만들어내지 않음을 검증한다.
- [x] D5 회귀 `rejects_multiple_unsupported_or_oversized_images_before_inference`, `does_not_accept_truncated_or_more_than_100_rows_as_complete`를 추가한다. 10,000,001바이트나 2장 요청에서 reader 호출은 0이며, 응답 잘림/101건은 첫 100건만 정상 결과로 반환하지 않는다. 원본 이미지·전체 모델 응답이 영구 저장소나 일반 로그에 남지 않음을 소유 경계에서 확인한다.
- [x] D6 회귀 `reserves_site_budget_atomically_before_inference`, `counts_manual_retries_and_limits_ten_daily_one_active_per_account`, `retains_uncertain_cost_after_timeout`, `uses_standard_none_and_enforces_50000_input_12000_output_20000ms`, `keeps_prepared_draft_usable_after_ai_budget_exhaustion`를 추가한다. 잔여 예산보다 최대 비용 예약이 크면 인식 호출은 0이며 동시 예약 합계는 사이트별 $0.50를 넘지 않아야 한다. 비용 불명과 저장 영수증 만료로 월 한도가 복구되지 않으며, 모델 자동 재시도/전환과 편집/적용에 따른 재호출은 0이어야 한다.
- [x] `pnpm exec vitest run worker/features/schedules/domain/schedule-image-result.test.ts worker/features/schedules/http/schedule-image-handler.test.ts`로 실패를 확인한다. 초기에는 파일/구현 미존재가 원인이며, 이후에는 해당 계약 위반이 실패 원인이어야 한다.
- [x] 승인된 형식·크기·인가·상한을 호출 전에 검사하고 Luna 한 번으로 초안을 반환한다. provider schema와 앱 parser를 모두 적용한다. 필수 원본 정보가 모호하면 확인 항목을 보존하고 실제 일정에 쓰지 않는다. 공급자 key·이미지·원문 응답을 일반 로그에 남기지 않는다.
- [x] 같은 집중 테스트와 `pnpm typecheck:test`, `pnpm architecture:check`를 통과한다. 실제 계정의 인식률·응답 시간 검증은 Task 4의 승인된 실험으로 남긴다.
- [x] 승인된 작업 파일만 명시적으로 stage하여 구현 커밋을 만든다. 현재 문서 작성 중 이 단계는 실행하지 않는다.

### Task 2: 정상 추가 버튼에서 업로드·원본 대조·빠른 편집

**Files:** 후보 프런트엔드 API·draft model·menu/dialog·public export, `src/features/schedule-board/ui/daily/daily-schedule.tsx`, `src/features/schedule-board/ui/weekly/weekly-schedule.tsx`, `src/features/schedule-board/ui/weekly/components/weekly-header.tsx`. Test: `src/features/schedules/ui/schedule-image-import-dialog.test.tsx`, 해당 일간/주간 소비자 테스트.

**Interfaces:** Consumes: Task 1 `readScheduleImage`와 `ScheduleImageDraft`. Produces: `ScheduleAddMenu({members, initialDate, onManual, isAdmin})`와 `ScheduleImageImportDialog({onOpenChange, members, initialDate, isAdmin})`. 메뉴가 조건부 mount/종료 폐기를 소유하고, 편집창은 기능 내부의 실제 적용 use-case/API를 사용한다. 기능 간 접근은 public export를 통한다.

- [x] 실패 테스트 `opens_import_from_daily_and_weekly_add_menu`, `keeps_manual_entry_available`, `editing_does_not_repeat_model_call`, `blocks_unresolved_member_or_date`, `explicit_undecided_time_keeps_broadcast_status`, `ignores_response_from_replaced_or_cancelled_image`, `excluded_rows_never_reach_apply`를 작성한다. 핵심 검증은 `expect(readScheduleImage).toHaveBeenCalledTimes(1)`과 확인되지 않은 행이 적용 요청에 없다는 것이다.
- [x] D2 회귀 `requires_confirmation_before_using_displayed_week`, `maps_same_unresolved_name_once_for_all_matching_rows`, `allows_excluding_unresolved_rows_without_resolving_them`를 추가한다. 확인 전 기준 주를 저장값으로 사용하지 않고, 같은 이름만 일괄 연결하며, 제외한 미확인 행 때문에 나머지 확정 행의 선택 적용을 막지 않음을 검증한다.
- [x] D5 회귀 `confirms_unsaved_close_and_clears_image_and_draft`, `shows_external_image_transfer_notice_before_reading`를 추가한다. 편집창 종료 전 확인과 확정 종료 시 정리, 폐기된 초안이 재개 시 복원되지 않는 동작, 인식 전 OpenAI 전송 안내를 검증한다. 브라우저 정상 새로고침 뒤 원본·초안이 남지 않음도 확인한다.
- [x] `pnpm exec vitest run src/features/schedules/ui/schedule-image-import-dialog.test.tsx` 및 변경한 진입점 소비자 테스트로 실패를 확인한다.
- [x] 기존 shared UI·FormData API 지원을 사용해 입력 선택·원본 비교·직접 편집·선택·검증·명시적 적용을 연결한다. 컴포넌트 외형을 테스트가 고정하지 않게 한다. 모델 요청 결과가 교체된 이미지나 사용자의 편집을 덮어쓰지 않게 한다.
- [x] 집중 테스트와 `pnpm typecheck:test`, `pnpm architecture:check`를 통과하고 실제 앱에서 키보드·좁은 화면의 정상 진입을 확인한다. Task 3 연결 전에는 저장 기능 완료로 보고하지 않는다.
- [x] 승인된 작업 파일만 명시적으로 stage하여 구현 커밋을 만든다.

### Task 3: 선택 적용·충돌 확인·실제 저장·재조회

**Files:** `src/features/schedules/use-cases/apply-schedule-image-draft.ts`와 Task 0에서 확정한 적용 요청/결과·서버 저장 경계. 기존 저장 경계가 부족한 경우 정확한 변경 파일을 Task 0에서 확정한 뒤 수정한다. Test: 같은 use-case의 `*.test.ts`, `worker/features/schedules/infrastructure/schedule-image-apply.integration.test.ts`, `src/features/schedule-board/queries/use-schedule-save-feedback.test.tsx`.

**Interfaces:** Consumes: 사용자가 확정한 선택 행, 비교한 기존 일정 상태, 실제 인증 actor/site, 같은 멤버·날짜 묶음의 확정 원자성. Produces: 묶음별 적용 완료·실패·결과 확인 중·적용 제외와 별도의 재조회 상태. 결과 확인 최소 기록은 24시간이며 만료 요청의 자동 재실행은 금지한다. 최종 함수 시그니처·API 경로·저장소·만료 검증은 Task 0에서 고정한다. 이 계약이 비어 있으면 Task 3는 실행 불가다.

- [x] 실패 테스트 `unknown_time_never_invokes_delete_conflicts`, `requires_confirmation_of_exclusive_status_deletions`, `rejects_changed_target_without_silent_overwrite`, `replay_after_lost_response_does_not_duplicate_write`, `reports_approved_atomic_or_partial_outcome`, `refresh_failure_retries_only_reads`를 작성한다. 삭제 예상 ID와 실제 삭제 ID, actor/site 경계, 승인된 원자성의 실패 후 DB 상태를 직접 단언한다.
- [x] D4 회귀 `rolls_back_entire_member_date_group_and_preserves_other_groups`, `keeps_unknown_commit_in_confirming_state`, `retries_failed_groups_without_reapplying_success_or_calling_model`를 추가한다. 한 묶음의 중간 실패에서 삭제·수정·생성이 모두 복원되고 다른 묶음의 성공은 남아야 한다. 응답 유실은 실패로 단정하지 않으며 동일 요청 결과를 재사용하고, 성공 묶음과 모델의 실행 횟수는 재시도 때문에 늘지 않아야 한다.
- [x] D5 회귀 `scopes_saved_results_to_actor_and_site_for_24_hours`, `rejects_expired_replay_instead_of_treating_it_as_new_write`를 추가한다. 결과 확인 기록은 원본 이미지/미적용 초안을 보관하지 않고, 만료 여부를 검증하지 않은 새 저장 경로로 빠지지 않아야 한다. 기존 감사 기록의 수명은 바꾸지 않는다.
- [x] D3 회귀 `excludes_exact_duplicates_against_saved_and_draft_rows`, `requires_explicit_existing_target_or_new_schedule_choice`, `preserves_other_broadcasts_on_same_date`, `blocks_mutually_exclusive_draft_rows_until_resolved`를 추가한다. 멤버·날짜·상태·시간·제목의 완전 일치만 중복 제외하며, 기본 유지에서 쓰기 0건, 지정하지 않은 기존 일정 수정 0건, 확인하지 않은 삭제 0건을 검증한다.
- [x] `pnpm exec vitest run src/features/schedules/use-cases/apply-schedule-image-draft.test.ts`와 `pnpm exec vitest run --config vitest.all.config.ts --project=worker-integration worker/features/schedules/infrastructure/schedule-image-apply.integration.test.ts`로 실패를 확인한다. D1 테스트는 승인된 정책에 맞는 실제 저장/충돌 경계를 통과해야 한다.
- [x] 정상 저장 orchestration을 사용해 인가·부수 삭제·동시성·중복 방지·감사를 보존한다. 기존 service를 직접 호출하며 HTTP 인가를 생략하거나 신규 SQL로 같은 정책을 복제하지 않는다. 저장 성공 후 조회 실패는 저장 재실행과 분리한다.
- [x] 집중 단위/D1 검사와 `pnpm typecheck:test`, `pnpm architecture:check`를 통과한다. 실제 선택 적용 후 서버 일정/일정표 재조회로 제목·시간·상태·기존 일정 영향과 화면 표시를 확인한다.
- [x] 승인된 작업 파일만 명시적으로 stage하여 구현 커밋을 만든다.

### Task 4: 실제 일정표 검증과 사용량·품질 판정

**Files:** Modify: 연결 설계의 D7 판정과 `docs/current-work.md`. Create: 승인된 표본·예산으로 확인한 날짜의 `docs/reports/` 증거 문서. 원본 이미지 보관 위치는 D5를 따른다.

**Interfaces:** Consumes: 실제 앱의 완성된 업로드→편집→적용 흐름, 승인된 모델 비교 표본·예산. Produces: 원본 대비 필드/행 오류·편집 시간·전체 지연·사용량·실제 저장/재조회 판정과 한계.

- [ ] 별도 구현·실험 재개 지시 후 실제 이미지 30장(멤버표 12장·통합표 12장·어려운 사례 6장)과 대조 정답을 준비한다. OTW·LuvDia와 작은 글씨·자정 표기 등을 포함하고 자료 취급은 D5를 따른다.
- [ ] 정상 앱의 실제 진입점에서 Luna를 사용해 인식과 편집·적용·서버 재조회를 확인한다. 명확한 일정의 95% 이상에서 멤버·날짜·시간·상태가 모두 맞는지 대조하고 누락·잘못 추가도 오류로 집계한다. 모호한 값의 확인 필요 표시와 제목 수정량도 기록한다.
- [ ] 업로드 완료부터 전체 결과 편집 가능까지 멤버표 중앙값 5초 이하·통합표 중앙값 10초 이하·전체 요청 95%가 20초 내 완료인지 측정한다. 첫 토큰 도착과 구분하며 시간 초과/실패도 포함한다. 업로드 시간을 따로 기록하고 전체 업로드→수정→적용→확인 시간 중앙값이 직접 입력보다 50% 이상 단축되는지 비교한다.
- [ ] 최종 확인 내용과 실제 저장·정상 일정표 재조회 결과 100% 일치 및 의도하지 않은 삭제·덮어쓰기·중복 저장 0건을 확인한다. 모델 인식률 허용 오류를 저장 오류 허용으로 해석하지 않는다.
- [ ] 같은 이미지와 평가 기준으로 Haiku를 비교한다. 모델별 이미지당 1회·총 60회 또는 운영 월 예산과 별도인 $0.50 중 먼저 도달하면 종료한다. 호출 전 비용 예약·불명 비용 보존을 적용하고 예산 부족은 미검증으로 남긴다. 실패 표본을 재호출 결과로 대체하거나 Luna를 묵시적으로 교체하지 않는다.
- [ ] 실제 토큰과 요금으로 월 30장 비용 추정을 갱신하고, D7 합격 기준별 PASS/FAIL과 미검증 범위를 기록한다. 합성 테스트 통과를 실제 인식률·속도·저장 성공으로 전환하지 않는다.
- [ ] 실제 전달 범위가 확정되면 필요한 변경 범위 검사와 최종 PR 준비 절차를 따른다. 현재는 PR·병합·배포를 실행하지 않는다.

## 작성 시 자체 검토

- 설계의 확정 UI 흐름·Luna/Haiku 선택·월 30장 계산·기존 저장 의미·D1~D7 정책을 작업과 연결했다.
- D1~D7은 모두 확정했고 Task 4에 실제 품질·속도·편집 효용·저장 안전성 기준과 일회성 비교 예산을 연결했다. Task 0의 정확한 저장/비용 인터페이스와 파일 지도 상세화는 남아 있다.
- 인식 DTO·API·UI의 제안 이름을 일치시켰고 기존 타입과 새 후보 타입을 구분했다.
- Review Focus 다섯 항목을 Task 1~3의 실패 테스트에 연결했다.
- 제품 구현 코드·의존성·스키마를 생성하지 않았다. 미래 테스트 명령은 실행 결과가 아니다.

현재 구현 기록은 [개발 기록](../../reports/2026-11-12-sul-44-image-import-implementation.md)을 따른다. 구현·로컬 검증을 재개했으며 Task 4의 실제 모델 실측과 운영 적용은 보류한다. 과거 문서 단계의 중단 문구는 이 실행 지시보다 우선하지 않는다.
