# 미사용 구현 정리 적용 계약

기준: 2026-09-09, 병합 기준 `b996572082645e8deb8cd5eea7ee43a75efd4372`.
최초 진단은 [미사용 구현 점검 기록](unused-implementation-audit-2026-09-09.md)에 보존한다.

현재 수집 경로는 **Cron → Workflow → Outbox → Queue → 수집기**다. 승인된 활성 Play 채널의 시간당 uploads playlist 조회, 전역 자동화 중지, 공개 flag, 검수와 승인·철회·CAS·lease·중복 방지·예산 제한을 유지한다. X context API는 저장 데이터만 조회한다.

## 설정과 데이터 이관

관리자 설정의 종료 키는 `youtube_warmup_enabled`, `youtube_warmup_interval_hours`, `youtube_warmup_daily_quota_units`, `youtube_warmup_official_enabled`, `youtube_warmup_kirinuki_enabled`, `youtube_warmup_last_run`이다. GET DTO에서 제외하며 PUT에 하나라도 포함되면 키 이름을 포함한 HTTP 400으로 전체 요청을 거절한다. 혼합 요청도 설정 저장과 변경 감사 기록을 생성하지 않는다.

예산은 `youtube_api_daily_quota_units` 하나로 관리한다. 생성 도구로 만든 데이터 migration `0086_canonical-youtube-quota.sql`은 유효한 canonical 값이 있으면 보존하고, 없으면 legacy 값을 복사하며 둘 다 없으면 1,000을 기록한다. 사용될 값이 정수 1..10,000이 아니면 쓰기 전에 실패한다. 유효한 canonical이 있으면 사용하지 않을 잘못된 legacy 값은 이관에 영향을 주지 않는다. 과거 설정 행과 수집 이력은 삭제하지 않는다.

이관 후 런타임은 설정 초기화 SQL이나 legacy fallback을 실행하지 않는다. 예산 누락·손상은 외부 요청 전에 실패한다. 첫 예약과 동시 예약 모두 기존 low/normal/critical 우선순위 한도를 원자적으로 적용한다. 수요 기반 캐시, 관리자 수동 갱신, 일반 YouTube 피드는 유지한다.

## 스키마와 정책

D-Day `type`과 pending schedule VOD 컬럼이 필요하다. 정상 nullable 값은 유지하지만 컬럼 누락 시 재조회·축약 저장으로 성공을 가장하지 않는다. D1 doctor와 배포 전 원격 검사는 필요한 컬럼 및 canonical 예산을 확인한다. migration 적용과 readback을 먼저 끝내고 병합 기반 자동 배포를 진행한다.

구형 직접 스케줄러, 중복 ingestion Queue 핸들러, 사용하지 않는 UI/hook/export, XML parser 의존성과 테스트 전용 소스 선택·상태 전이·중복 평가 함수를 제거한다. 실제 dedupe key와 DB 제약, 저장된 대표 소스와 사용 가능한 대체 소스 정책, 회원 제안 철회 경로는 유지한다. 과거 migration을 수정하거나 새로운 자동 병합 정책을 추가하지 않는다.

## 검증 계약과 한계

- 실제 D1에서 migration의 canonical 보존·legacy 이관·초기 기본값·잘못된 값 차단·재실행을 확인한다.
- 종료 키 단독/혼합 PUT 400, 쓰기·감사 없음, canonical 변경 성공을 HTTP 경계에서 확인한다.
- 실제 서비스·repository·공개 조회 테스트에서 승인·철회·중복·동시 수정·재생 대체 정책을 유지한다. 구형 스케줄러 전용 테스트를 삭제해도 현행 source-health repository의 lease·CAS·원자 갱신과 executor의 상태·중지 검증을 보존한다.
- 최종 `pnpm preflight`는 coverage 안에서 unit·Worker 통합검사, 타입·lint·빌드·D1 doctor·에이전트 동기화 검사를 수행한다.
- 배포 후 관리자 설정, 수동 수집 진입점, 후보 검수와 공개 화면을 확인하고 D1 설정·이력과 다음 정규 수집 결과를 읽는다. 검증 목적으로 운영 수집을 강제하지 않는다.
- Play 자동화 중지 중 신규 업로드 수집과 7일 효과는 즉시 검증 완료로 표시하지 않는다. 실측 전 비용 절감액이나 응답시간 개선율을 확정하지 않는다.

## WebSub 리소스 후속 제거

2026-09-09 로컬 최종 검증: `pnpm preflight` 통과, 259개 파일·1,893개 테스트. Coverage는 statements 82.25%, branches 69.43%, functions 85.80%, lines 83.72%다. 임시 D1에서 전체 migration 86개 적용을 검증했고 `0086`의 schema snapshot은 직전과 동일하다. 운영 배포 identity와 반영 후 readback은 PR 검증 댓글에 기록한다.

생산자 제거 배포는 `aebc630f-3d1b-4e68-a327-cf4253d6efc9`, 2026-09-08 23:30:12.91995 UTC다. 49시간 조건은 **2026-09-11 09:30:12.91995 KST** 이후 충족한다. Hub 해제 응답은 조건에 포함하지 않는다.

1. 해당 배포 이후 신규 `websub_maintenance`/`recent_reconcile` 작업·WebSub 생산자 재등장이 없는지 확인한다. 원 Queue와 공용 DLQ 중 WebSub 관련 메시지의 보존·오류도 확인한다.
2. 제거 직전 15분 이상 간격의 두 조회에서 `otw-websub` backlog 0을 기록한다. 시간, queue ID, producer/consumer 및 배포 identity를 함께 남긴다. 조건이 불충족하면 이 단계만 보류한다.
3. provision 목록·Wrangler consumer·Queue 라우팅·과거 메시지 전용 telemetry 분기를 제거하고 회귀검사와 preflight 후 병합 기반으로 배포한다. HTTP 410 종료 경로와 이력 해석 타입은 유지한다.
4. 실제 consumer 해제 및 새 producer 부재를 확인한 다음 `otw-websub` Queue와 미사용 `OTW_PLAY_WEBSUB_SECRET_V1`을 삭제한다. 공용 DLQ와 ingestion Queue는 보존한다.
5. 계정 리소스·배포 binding·provision 잔여 참조를 재조회한다. rollback도 polling이 유지되는 버전으로만 수행한다.

현재 코드 정리 배포에는 drain consumer와 Queue를 포함한다. 관측 조건 전에 구성만 선제 제거하거나 오래된 구독 기능으로 되돌리지 않는다. 기존 7일 관측은 종료 작업 생성 0, 일반 수집 최신성, Outbox 읽기·오류 회귀와 이 리소스 제거 결과를 함께 확인한다.
