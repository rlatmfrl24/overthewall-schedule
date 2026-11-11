# 공식 X 대조 학습 자료

## Knowledge

- [공식 X 대조 설계](../../superpowers/specs/2026-11-03-x-free-first-collection-design.md#L49) — 계정별 정기 대조가 완료 시각을 기준으로 다시 시작되는 조건.
- [X 사용자 타임라인](https://docs.x.com/x-api/posts/timelines/introduction#time-based-filtering) — `since_id`와 `until_id`가 각각 어느 쪽의 글을 반환하는지 확인할 때 사용한다.
- [X 읽기 요금](https://docs.x.com/x-api/getting-started/pricing#credit-consumption-details) — 요청 횟수와 반환 리소스 과금을 비교할 때 사용한다.
- [Cloudflare D1 한도](https://developers.cloudflare.com/d1/platform/limits/) — Worker 실행당 D1 호출 한도와 `db.batch()` 집계 방식.
- [Cloudflare Queue 전달 보장](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) — 같은 메시지가 다시 도착할 수 있는 이유와 재개 상태의 역할.
- [직전 로컬 구현 조사](../../reports/2026-11-11-x-reconciliation-algorithm-research.md) — 이전 33구간의 대기 시뮬레이션과 인용 적체 실패의 증거.
- [현재 큐 통합 테스트](../../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L49) — 33개 구간의 재개, 인용 대기 20건, 예산·백오프 상황의 응답 재사용 확인.
- [과거 보완 ID 재생 테스트](../../../worker/features/x-posts/infrastructure/x-hybrid-policy.integration.test.ts#L46) — 운영 이력에서 확인된 4개 ID의 경계 조건과 D1 저장 확인.
- [임대 만료 뒤 메시지 회차](../../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L190) — 이전 메시지가 복구된 실행을 취소할 수 없는지 확인한다.
- [인용 원문·작성자 응답 재사용](../../../worker/features/scheduled-operations/infrastructure/x-hybrid.integration.test.ts#L211) — 로컬 저장 실패 뒤 신규 요청 예산을 0으로 설정하고 복구를 확인한다.

## Gaps

현재 구현의 운영 완료 시간과 실제 X 청구액은 아직 측정하지 않았다.
