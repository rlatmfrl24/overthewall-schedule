# 수집 SQL·예약 주기 수정 검증 — 2026-10-23

기준 master `6cf385f80dcea0a2337b37083860059f2a1ca9f1`. [승인 계획](../../superpowers/plans/2026-10-23-collector-sql-cadence.md)에 따라 격리 작업 트리에서 직접 순차 구현했다. 이 문서는 로컬 결과이며 운영 최적화 달성 보고가 아니다.

## 변경과 계약

1. 카페 최신 글은 검증된 source ID별 기존 `(source_id,hidden_at,created_at)` 인덱스의 역순 LIMIT1로 조회한다. 숨김 제외·빈 대상·활동별 주기·샤딩을 유지한다.
2. membership에 `(row_table,row_key,transition_id)` 인덱스를 추가했다. 기존 transition 중심 인덱스와 보관·이관·공개·공유 소유자 SQL 조건을 유지했다. 효과가 없었던 JSON/CASE 재작성은 포함하지 않았다.
3. 정규 수집의 정상 완료는 서버 소유 `scheduled_for`를 기준으로 다음 주기를 판정한다. X controller와 handle, 카페 source, YouTube 정상 피드에 끝까지 전달한다. 실제 시도·성공·완료 표시와 manual·실패·partial·continuation/backoff·lease는 실제시각 기준을 유지한다. 기존 상태나 잘못된 예약시각은 기존 실제시각으로 fallback한다.
4. X 내부 `x_collection_cadence_state`는 실제 마지막 완료와 원자적으로 저장하고 이전 완료의 덮어쓰기를 방지한다. 공개/관리자 설정 DTO에 추가하지 않는다. 카페 nullable `cadence_anchor_at`은 기존 진행 UPDATE에서 저장한다. 전수 backfill은 없다.

## 같은 fixture의 실제 로컬 D1 비용

일반 SQLite VM 추정과 구별한 Miniflare D1 `meta.rows_read/rows_written`이다. fixture 생성과 EXPLAIN은 SELECT 비용에서 제외했다. 데이터 조건이 다른 행을 합산하거나 일일 운영 절감률로 환산하지 않는다.

| 경로 | 변경 전 읽기 | 변경 후 읽기 | SQL 수 / 쓰기 |
| --- | ---: | ---: | --- |
| 카페 계획: 대상5개·무관 글5,000개 | 10,032 | 32 | 전체 계획2문, 쓰기0 |
| YouTube 존재 검사+메타 후보: source20개·무관 membership5,000개·fence1개 | 207,138 | 2,099 | SELECT2문, 쓰기0 |

- 카페 계획은 무관 이력 추가 전후 모두32행이다. 현재 통합 fixture에서는 기존 전역 최신 글 SQL만10,015행을 읽는다. 첫 전후 비교의 전체 계획10,032행과 서로 다른 분모임을 구분한다.
- membership 정책 조회는 `SCAN held`에서 `SEARCH held USING COVERING INDEX idx_content_transition_membership_lookup`로 바뀐다. 결과와 정렬이 같고 fenced source의 영상은 계속 제외된다.
- 5,001개 membership fixture의 인덱스 재생성은 읽기10,123행·쓰기5,002행이었다. membership 단건 INSERT는 쓰기3→4행, DELETE는 양쪽1행으로 계측됐다. DELETE 수치를 근거로 인덱스 유지 작업 자체가 없다고 해석하지 않는다.
- X 성공 완료의 최초 저장은 기존2문/읽기0/쓰기4행 → 새3문/읽기5/쓰기6행이다. 추가 내부 상태1개 때문이며 정확한 재전달은 새3문/읽기9/쓰기0행이다. 정상 주기 복원과 상태 저장을 비용 절감으로 포장하지 않는다.

## 실행한 검증

Node24.20.0 / pnpm11.7.0 / 새 의존성0. 각 작업의 RED 실패를 확인한 뒤 최소 수정했다.

- 기준 unit4파일35건 PASS.
- 카페 SQL unit/schema2파일12건 PASS. 무관 글 증가의 읽기10032>48 회귀가 수정 전 실패했다.
- membership schema3건 PASS. 생성 인덱스 부재 회귀가 수정 전 실패했다.
- 주기 관련 unit/integration/schema5파일107건 PASS. X controller·handle과 카페·YouTube의 지연 회귀를 재현했다. X 페이지 continuation은 실제시각+15분을 유지한다.
- 추가 unit/schema7파일179건 PASS. 양 사이트 공개·보관·공유 소유자 정책, planner/executor/coordinator/Cron 및 설정 DTO를 포함한다. 수치는 중복이 있으므로 합산하지 않는다.
- 최종 비용 schema12건 PASS. 실제 완료를 미래로 보관한 상태에서는 조기 실행하지 않는 회귀도 RED→GREEN으로 확인했다.
- 실제 native Workflow5건 PASS: X·카페·YouTube 각각 Cron→Workflow→Outbox→Queue→수집→실제 D1 저장/readback, 같은 예약 재전달에서 run/provider 호출 증가0. 기존 일정 Workflow/Queue와 finalizer 회귀도 통과했다. 정상 Worker·Workflow·Queue는 그대로 실행하고 외부 provider 경계만 로컬 응답으로 대체했다.
- 타입, 변경 파일 ESLint, architecture 검사 PASS.
- `pnpm d1:reset:local -- --validate-only`: 전체 migration151건 임시 D1 실제 적용/검증 PASS, 기존 로컬 DB 교체 없음.
- 독립 리뷰·최종 preflight·PR 상태: 최종 검증 후 이 문서와 PR ledger에 보완한다.

## migration과 운영 한계

Drizzle가 `0150_ambitious_scrambler.sql`(인덱스)과 `0151_old_captain_britain.sql`(nullable 카페 상태 열)을 생성했다. 기존 migration은 수정하지 않았다. 향후 별도 승인된 운영 반영에서는 양 DB의 schema를 먼저 적용하고 Worker를 배포해야 한다. 초기 인덱스 빌드 비용은 실제 membership 크기에 따라 달라진다.

계정 합산 UTC 하루5M행, 배경4M/더 엄격한 제한과 집계 불가 시 신규 유예·기존 작업 복구를 유지한다. X30분·카페1/3/6시간·YouTube6시간/메타24시간 설정, Play·AI 중지, LuvDia AI=false와 공개·권한·보관·공유 소유자·빙하유 일정 정책을 변경하지 않았다.

운영 D1/수집 API 조회·원격 migration·강제 수집·병합·배포·X webhook 등록은0회다. 로컬 provider 흐름은 실서비스 공급자의 동작 증명이 아니다. 예약 주기 복원은 실행량을 늘릴 수 있으며 실제 일일 비용과5M 준수는 향후 승인된 배포 후 관측 전까지 미확인이다.
