# 종료 구현 유지 계약

기준: 2026-09-17. 이 문서는 종료한 기능의 재도입을 방지하는 유지 계약이다.
원래 제거 절차·49시간 계획·검증 수치는 [과거 기록](../archive/retired-implementation-cleanup-before-2026-09-17.md),
실제 잔여 메시지 기준으로 바꾼 결정은 [관측 유효성 기록](../archive/observation-validity-2026-09-09.md),
제거 상태의 마지막 운영 확인은 [2026-09-16 보고서](backend-cost-observation-final-2026-09-16.md)에 있다.

## 보존할 경계

- 현재 수집은 Cron → Workflow → Outbox → Queue다. 승인·pause·CAS·lease·generation·중복·예산 검사를 유지한다.
- WebSub producer/consumer/Queue·secret·binding은 종료되었다. callback과 종료 관리자 명령은 410이다.
  과거 subscription·delivery·job·migration 이력은 삭제하지 않는다.
- YouTube warmup 설정 키는 GET DTO에서 제외하고 PUT에 포함되면 혼합 요청 전체를 400으로 거부한다.
  거절된 요청으로 저장·감사 event를 만들지 않는다.
- `youtube_api_daily_quota_units`만 사용한다. migration 0086의 canonical 보존/legacy 이관은 이력이며
  런타임에서 초기화 SQL·legacy fallback을 다시 수행하지 않는다. 예산 손상은 외부 요청 전에 실패한다.
- D-Day type·pending schedule VOD 컬럼 누락을 fallback 조회·축약 저장으로 숨기지 않는다.
- X context API는 저장된 데이터만 조회한다. 명시적 회원 제안 철회, 대표/대체 소스와 DB dedupe 제약을 유지한다.

## 검증과 남은 운영 확인

변경 시 HTTP 거부/무쓰기, D1 무결성·CAS·재시도와 현재 executor 경계를 검사한다.
최종 `pnpm preflight`는 unit·Worker 통합 테스트를 coverage 계측 없이 한 번 실행한다.
실제 운영 상태 확인에는 해당 배포의 관리자 흐름·설정·이력·다음 정규 수집 readback이 필요하다.
Play 신규 업로드 canary는 global pause 동안 미완료로 남긴다.
7일 비용 관측은 종료되었으며 새 제거 대기 작업으로 다시 등록하지 않는다.
