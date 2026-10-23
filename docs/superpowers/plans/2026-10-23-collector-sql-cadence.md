# 카페·YouTube SQL 및 수집 주기 판정 수정

> 실행: superpowers:executing-plans로 직접 순차 구현하고 마지막에 독립 리뷰한다.

**목표:** 검증된 수집 대상의 SQL 읽기 범위를 줄이고, 정규 수집을 예약 시작시각 간격으로 판정한다. 로컬 검증 후 PR까지 생성하며 병합·배포하지 않는다.
**근거:** 사용자 승인 계획(2026-10-23), 기존 UTC10/22 관측과 로컬 SQL 검토. 실행 기준 master `6cf385f80dcea0a2337b37083860059f2a1ca9f1`.
**기술:** 기존 TypeScript, Cloudflare Worker/D1/Workflow/Queue, Drizzle, Vitest. 새 의존성 없음.

## 고정 조건

- 계정 전체 UTC 하루 읽기5,000,000행·배경4,000,000행 및 더 엄격한 기존 제한 유지. 집계 불가·상한 도달 시 새 작업 유예, 이미 수락한 작업의 완료·재시도·정리 유지.
- X30분·카페 활동별1/3/6시간·YouTube 피드6시간/메타24시간 설정값 유지. 기준은 예약 시작시각 사이의 간격이다.
- 양 사이트 Play·AI 자동화 중지, LuvDia AI=false, 공개·권한·보관·공유 소유자·빙하유 일정 정책 유지.
- 운영 D1/수집 API 조회, 원격 migration, 강제 수집, 병합·배포, X webhook 도입 없음.
- 기존 미커밋·로컬 DB·다른 작업 트리 보존. Node24.20.0/pnpm11.7.0 사용.
- 공개 API/관리자 설정 DTO 유지. 새 cadence 상태는 내부 진행 상태이며 추가 저장 비용도 측정한다.

## Review Focus

- 예약 경계 직전/정각과 UTC 자정: 설정 간격 이전에는 실행하지 않고 정각에는 가능해야 한다.
- 실제 수동·실패·partial·재시도: 실제 시각 기반 보호를 유지하고 성공으로 덮지 않는다.
- 지연/중복/진행 중 실행: 기존 lease·cursor·idempotency를 보존하고 과거 슬롯을 재생하지 않는다.
- 숨김·공유 소유자·이관 fence: 계획 뒤 정책 변경도 실제 저장 직전에 다시 검증한다.
- 오래된 상태/완료 역전: legacy fallback을 유지하고 이전 완료가 최신 cadence를 덮지 않는다.

### Task 1: 카페 최신 글 조회 제한

**소유:** scheduled-job-planner 및 관련 unit/로컬 D1 integration.
**인터페이스:** 기존 NewScheduledItem/대상 source ID/샤딩 유지.
- [ ] source별 최신 글·숨김 제외·빈 대상·활동별 주기/샤딩 회귀를 추가하고 실패 확인.
- [ ] 검증된 source ID에만 기존 `(source_id,hidden_at,created_at)` 인덱스로 역순 LIMIT1 조회. 전체 GROUP BY/MAX 제거. 새 인덱스 없음.
- [ ] 같은 fixture 결과/정렬·SQL 수·로컬 D1 rows_read/rows_written·실행계획 비교. 무관 이력 증가에도 전체 스캔 금지.
- [ ] 관련 unit/Worker integration 통과 후 로컬 커밋.

### Task 2: YouTube 보관·이관 membership 인덱스

**소유:** db/schema/index.ts, 생성 migration, YouTube/정책 로컬 D1 integration.
**인터페이스:** SQL 조건·공개 결과·기존 영상 인덱스 유지.
- [ ] 무관 membership 증가로 정책 조회가 SCAN인 비용 회귀를 추가하고 실패 확인.
- [ ] `(row_table,row_key,transition_id)` 인덱스를 추가하고 Drizzle로 생성. transition 중심 기존 인덱스 유지.
- [ ] 작업 존재 검사·메타 후보의 SEARCH 및 결과 동등성 확인. JSON projection/OR→CASE 변경 제외.
- [ ] 새 인덱스 생성/삽입·삭제·갱신 비용 기록, 로컬 검증 후 커밋. 원격 적용 없음.

### Task 3: 예약 기준과 실제 처리시각 분리

**소유:** scheduled-job-executor/planner, X·카페·YouTube 수집과 기존 상태 갱신.
**인터페이스:** 각 내부 수집 진입에 optional scheduledFor를 전달. 외부 HTTP 계약은 변경하지 않는다.
- [ ] X00:23→00:23:45 완료→00:53 가능, 카페1/3/6h, YouTube6h 경계를 실패 테스트로 고정.
- [ ] X controller는 `x_collection_cadence_state`에 완료시각/주기 기준을 저장하고 기존 완료 상태와 원자적·단조 갱신. 정상 정규 완료만 scheduled_for, 수동/실패/partial은 실제시각. legacy/불일치 상태는 실제시각 fallback.
- [ ] X handle 정상 완료 next_check_at도 예약 기준. continuation·cooldown·실패 backoff·lease는 실제시각 유지.
- [ ] 카페 nullable cadence_anchor_at을 기존 progress UPDATE에 포함. 정상 정규 점검은 예약시각, 수동/실패는 실제시각. planner는 이 기준으로 기존 적응형 간격 계산.
- [ ] YouTube 정상 피드 next_check_at은 예약+6h. 실제 시도/성공·메타 시각, 초기화·backfill·재시도 보호 유지.
- [ ] 유효하지 않은 예약/기존 행은 기존 실제시각 fallback. 새 전수 backfill 없음. 중복·지연·상태 역전·진행 중 작업·cursor 회귀·계획 후 정책 변경 검증.
- [ ] schema 변경을 Drizzle로 생성하고 전체 로컬 chain 검증. 관련 unit/integration/workflow 및 비용 비교 후 커밋.

### Task 4: 실제 로컬 흐름·리뷰·PR

- [ ] 기존 Cron→Workflow→Outbox→Queue→수집→완료를 로컬 provider로 실행하고 저장 시각/cursor/상태 재조회. 운영 provider 검증으로 표현하지 않는다.
- [ ] `pnpm d1:reset:local -- --validate-only`; 관련 테스트는 vitest.all.config.ts의 unit/worker-integration/worker-schema/worker-workflow 프로젝트 사용. 타입·변경 파일 lint·구조 검사.
- [ ] 독립 whole-branch 리뷰1회 및 유효한 지적 수정. 최종 코드의 `pnpm preflight`1회(실패 시 영향 검사만 재검증하며 composed 결과로 구분).
- [ ] 완료한 변경만 커밋/push하고 일반 PR 생성·task 연결. 원인·시간 계약·전후 비용·schema 선행 적용·남은 운영 한계를 기록.
- [ ] PR HEAD/CI/기존 리뷰/충돌 확인, material PASS/FAIL 댓글. 병합·배포·원격 migration 없음.

## 완료 판정

로컬 결과/정책/상태 보존과 SQL 비용 비교, 독립 리뷰 및 PR 근거가 있어야 한다. 주기 복원으로 실제 작업량은 늘 수 있다. 운영 절감량과 계정 하루5M 준수는 향후 별도 승인된 배포 후 관측 전까지 미확인이다.
