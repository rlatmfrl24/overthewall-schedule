# D1 Operations 읽기 개선 — 2026-10-27

## 범위

사용자가 승인한 유휴 큐 → 최신 성공 조회 → YouTube 소유권 인덱스3개 개선을 순차 구현했다. 별도 `codex/d1-operations-read`에서 시작 기준 `0391a5e969317c65382c7a4c216252bf52d7bade`를 사용하며, 별도 PR200의 X 참조 SQL은 포함하지 않는다.

계정 모든 DB 합산 UTC 하루5,000,000행, 배경4,000,000행 및 더 엄격한 제한, Play/AI중지, 공개/권한/보관/공유 소유자/빙하유 정책, 수집·조회 주기 설정을 유지한다. 이번 범위는 로컬 검증과 PR까지다. 운영 D1/업무·provider API, 원격 migration, 강제 수집, 병합·배포·자동화 변경을 하지 않는다.

## 동작 변경

1. 큐 상태의 activeRunCount와 전역 staleLeaseCount를 같은 SQL에서 materialize한다. active run이0일 때만 누적 outbox 집계를 CASE로 생략한다. active 상태는 기존 JOIN/조건과 미래 재시도·terminal item reconciliation·lease 경계를 유지한다. DTO4필드와 timestamp bind2개는 동일하다.
2. 최신 성공은 job별 `finished_at DESC,id DESC LIMIT1`을 사용한다. accepted_at 최신으로 대체하지 않는다. raw succeeded의 partial item 제외와 이후 YouTube 근거 기반 정규화는 그대로다. `idx_scheduled_job_runs_success_finished`는 succeeded/non-null finished_at만 포함한다.
3. `members(youtube_channel_id)`와 `member_links(youtube_channel_id,member_uid)`를 추가한다. 소유자 정책 SQL·영상 범위/transition 인덱스·실행 직전/최종 저장 guard를 변경하지 않는다.

## 실제 로컬 D1 비용

Node24.20.0/pnpm11.7.0, 기존 Vitest Worker/D1와 numbered migration fixture에서 측정했다. 일반 SQLite EXPLAIN 추정이 아니다. fixture 구성·정리 쓰기는 SELECT meter 밖이며 모든 계측 SELECT 쓰기는0이다.

| 경로와 fixture | 이전 읽기 | 최종 읽기 | SELECT SQL 수 |
|---|---:|---:|---:|
| 완료 pending reconcile2,000개, active run0·전역 stale lease1 |6,007|7|1|
| 대형 active run의 dispatched reconcile2,000개 |7|10|1|
| 성공 이력4,000개·완료 역전·failed/partial/null·누락 job, 실제 repository 전체 |4,015|25|2|
| YouTube 메타 후보, 무관한 멤버/링크 각1,000개 |12,208|64|1|
| 위 YouTube hasWork+메타 후보 |32,603|4,267|2|

유휴 큐 최적화가 active 상태의 모든 비용을 줄이지는 않는다. source/item부터 무조건 JOIN하도록 바꿔 active 대형 배치를 악화시키는 후보는 적용하지 않았다. YouTube의 남은 source 등록·대조 비용은 기존 로직이며 전체4,267행을 메타 후보64행으로 보고하지 않는다. 이 fixture 비율을 운영 하루 감소율로 바꾸지 않는다.

## 인덱스 구축·추가 쓰기

Drizzle에서 생성했다. 기존 migration은 수정하지 않았고, 새 SQL은 CREATE INDEX3개뿐이다.

| migration/index | fixture 구축 읽기 | 구축 쓰기 | 관련 INSERT 쓰기 변화 |
|---|---:|---:|---|
|0157_rapid_pixie / 최신 성공 |8,094|4,004|성공 run8→9|
|0158_aspiring_xorn / member_links 채널 소유자 |2,037|1,017|link4→5|
|0158_aspiring_xorn / members 채널 |2,029|1,013|member2→3|

수치는 각각 해당 로컬 fixture의 실제 meta다. 실제 운영 테이블 크기·추가 쓰기·구축량은 아직 확인하지 않았다. 기존 인덱스는 유지한다. 원격 적용 시 계정 read/write 예산과 기존 더 엄격한 제한 안에서 **0157→0158 순서 선행 적용 후 코드 반영**을 계획해야 한다. 이번 작업은 원격 적용을 승인하거나 실행하지 않는다.

## 회귀·정책 검증

- RED: idle6,007>12 → GREEN7; 미래 retry·expired/live/null lease와 진짜 partial/failed/skipped/throttled reconciliation 총계 보존.
- RED: 최신 성공4,015>50 → GREEN25. 실제 완료 순서·누락 job·null/failed/partial 제외, 기존 YouTube nested 결과·미해결 outbox·정규화 회귀를 같은 repository suite로 검증.
- RED: 소유권 인덱스 전 hasWork+metadata32,603행 → 인덱스 후4,267행. 메타12,208→64행. indexed/unindexed 결과 동일성, index 구축·INSERT 추가 쓰기 확인.
- 실제 수집 application에 로컬 provider 응답을 연결했다. OTW 공유 정상 소유자 영상2개는 갱신, 숨김 소유자-only와 fence 영상은 보존했다. LuvDia는 영상3개 갱신하고 동일 fence 영상은 갱신하지 않았음을 저장 readback으로 확인했다. 운영 provider 검증이 아니다.
- task별 검증 기록과 commit 범위는 실행 ledger 및 PR 검증 댓글에 남긴다. 전체 최종 검증은 독립 리뷰 수정 후 별도 기록한다.

## 검증 판단

- 기존 작업 트리는 별도 open PR200을 소유하므로 새 native worktree를 사용했다. 잘못 분리하면 다른 PR 변경이 섞일 수 있어 branch base와 staged 파일을 확인한다.
- 처음 전체 YouTube 두 SELECT에500행 상한을 잡았지만, 무관한 registry 대조 비용도 포함된 지표였다. 실제 entry별 원인을 확인해 메타 후보<200 및 전후 전체 비용 비교를 각각 검증한다. 정책 SQL을 줄이거나 전체 비용을 숨기지 않는다. 이 구분이 틀리면 개선률을 과장할 수 있으므로 원본 두 비용을 함께 보존한다.
- 새 로컬 DB 초기화·doctor는 독립 리뷰와 병행하는 최종 검증으로 이동했다. 임시 D1 전체158개 migration 검증은 먼저 통과했다. PR 게시 전 doctor 통과 조건은 유지하며, 순서 조정이 실패를 숨기지 않도록 최종 결과를 별도 기록한다.

## 남는 한계

관리자 로그인 상태의 브라우저 UI와 운영 D1/provider·배포 후 일일 사용량은 검증하지 않는다. API/설정 DTO·공개 정책·주기는 수정하지 않았다. 실제 일일 절감량과 계정5M 준수는 별도 승인된 배포 후 고정 UTC 하루 관측이 필요하다.
