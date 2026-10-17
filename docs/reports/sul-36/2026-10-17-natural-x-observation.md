# 2026-10-17 자연 X 관측 — D1 중단 유지

## 판정

**HOLD / UNVERIFIED.** 2026-10-17 08:12 KST(`2026-10-16T23:12:09.771Z`)에 기존 Cloudflare 집계와 운영 메타데이터·저장 로그만 조회했다. 계정 읽기는 문서 기준 일일500만 행을 넘어 **5,042,361행(100.85%)**이다. D1/SQLite·서비스/API/UI·강제 수집은 실행하지 않았다. 시간 경과나09시 할당량 초기화로 검증을 자동 재개하지 않는다.

양 사이트의 기존 배포·리소스·Cron·Queue 설정은 일치한다. 이것은 최종 X 작업·Workflow·원본 저장 성공의 증거가 아니다. 실제 성공/partial/실패/실행 중, result_json 내부 결과와 retry_pending은 D1 중단으로 구분하지 못했다. 정상 관측 완료로 처리하지 않는다.

## 계정 기존 집계

UTC 2026-10-16 00:00~23:12의 `d1AnalyticsAdaptiveGroups` 집계이며, D1 데이터베이스 쿼리가 아니다. 집계 지연이 있을 수 있고 서비스의 현재 접속/오류 상태를 별도 확인한 값은 아니다.

| 사이트 | rowsRead | rowsWritten |
| --- | ---: | ---: |
| OTW | 4,484,813 | 29,094 |
| LuvDia | 557,548 | 10,796 |
| 계정 합산 | **5,042,361** | **39,890** |

문서 기준 읽기 한도보다42,361행 많다. 전날20:31 집계4,530,857행에서511,504행 증가했지만, 이를 이번 관측의 D1 비용으로 해석하지 않는다. 이번 직접 D1 호출·로컬 SQL 실행은0건이다. 실제 DB 쿼리를 실행하지 않았으므로 쿼리별 rows_read/rows_written은 미측정이다. 쓰기 집계를 애플리케이션의 별도 lane/ledger guard와 동일시하지 않는다.

## 배포·메타데이터

| 항목 | OTW | LuvDia |
| --- | --- | --- |
| Worker | overthewall-schedule | luvdia-schedule |
| 운영 버전(100%) | d76f0228-f235-4be2-ad33-a1f472d42f2b | b935842a-b8f1-49cf-9011-a23d812bbb80 |
| deployment | 1394a6db-5193-41e5-9820-654183d35d35 | 2d97a9f9-2a97-4906-862d-dd74fcd19022 |
| Cron | `3,13,23,33,53 * * * *` | 동일 |
| Queue | 기존6개, paused=false, 적체0 | 기존6개, paused=false, 적체0 |
| 리소스·Queue 설정/consumer | 기존 스냅샷과 동일 | 동일 |

PR161의 merge OID `462779cf1db6b7e06fadc46d0dc3f878762e241b`와 기존 source-parity/운영 버전 관계를 유지한다. DB schema141은 이전 검증 기록이며 이번에는 재조회하지 않았다. PR162는 `db7288d551cb04d408b47fdf5d1faf45cd9ea5af`, OPEN/Draft/autoMergeRequest=null이다. CHZZK9004 및 추가 리뷰 수정은 운영 배포되지 않았다.

## 저장 로그의 확인 범위

기존 Workers 로그에서07:42:09~08:12:09 KST의 작은 표본만 읽었다. 실제 사이트 URL을 호출한 것이 아니다.

- 두 운영 버전의08:03 Cron 호출에 outcome=ok가 있다. OTW07:53:49·07:54:01 background Queue invocation도 outcome=ok다. 이는 플랫폼 호출의 종료이며 내부 작업/최종 저장 성공이 아니다.
- LuvDia의 같은 시간 범위 Queue 표본은0건이다. 미실행/실패로 단정하지 않는다.
- `x_collection`과 `D1_ERROR` 문자열 검색은 각 사이트 모두0건이었다. X 실행 없음·D1 오류 없음의 증거가 아니다. 전체18:53 이후 이력을 검증하지 않았다.
- OTW08:03 로그에 `play.ingestion.read_budget_unavailable`, 일반 요청 표본에 `OTW Play public catalog cache read ignored a corrupt entry`가 있다. 이번 범위에서 원인·영향을 확정하지 않았고 신규 X 회귀로 분류하거나 설정을 바꾸지 않았다.
- Workflow 생성/종료, run/item 상태·미완료 증거, 실제 신규 저장과 X11/7행 읽기 비용은 미확인이다. 배포 전 CHZZK 실패 run `f1195a83-a4ab-4efd-8590-23f771a72d9c`도 수정하거나 성공으로 정규화하지 않았다.

증거는 로컬 `.tmp/natural-x-observation-20261017/`의 metadata.json(호출 목록 포함), stored-invocations.json, stored-cron-queue.json이다. API 토큰은 인증 헤더로만 사용했으며 출력·보고서에 넣지 않았다. 메타데이터 요청만 허용하는 경로 제한으로 D1 query/사이트 요청을 배제했다.

## 보존과 다음 행동

원본409개 WIP·별도 X10개·기존 보고서3개·앱 코드·데이터·schema 이력·운영 설정을 보존한다. 보호된 기존 운영 보고서를 덮어쓰지 않고 이 문서를 별도로 남긴다. 이번 heartbeat에서는 문서와 PR161 ledger만 갱신하며 PR162 커밋/병합/배포는 하지 않는다.

automation-4는 자연 실행이 진행 중이라고 확인된 상태가 아니라 **D1 중단에 따른 관측 보류**다. 정상 완료/PAUSED로 바꾸거나5분 재예약을 만들지 않는다. 기존 ACTIVE·16일19:01 COUNT1 설정은 그대로이며 새로운 미래 확인을 등록했다는 뜻은 아니다. 19일 관측과 PAUSED인 otw-9-d1도 변경하지 않는다.

사용자의 명시적 재개 후 계정 예산을 확인하고, 필요한 최소 run/item/최종 저장만 확인해야 한다. 현재 한도 초과 수치와 관측 미확인을 알리되 운영 실패나 정상화를 추정하지 않는다.
