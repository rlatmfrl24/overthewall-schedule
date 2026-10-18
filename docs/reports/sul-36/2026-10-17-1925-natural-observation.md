# 2026-10-17 19:25 KST 자연 실행 관측

양 사이트의 배포 후 자연 X 실행은 실제 저장 처리까지 성공했다. 자동 일정의 자연 실행 확인은 계속 보류한다. 이번 관측에서 강제 수집, 운영 설정·데이터 변경, 배포, 메시지 소비는 하지 않았다.

## 비용과 현재 배포

- D1 SQL 전에 기존 Cloudflare 계정 합산 집계를 확인했다. 19:25:37 기준 읽기 1,454,282행/500만행(29.09%), 쓰기 12,210행/10만행(12.21%)이다. 자연 운영을 포함한 집계이며 이번 확인 비용과 구분한다.
- 원격 확인은 job_type+status 인덱스별 최신 1개, 선택된 run의 최대 20개 item, 선택 run의 PK와 설정 3개만 읽었다. 실제 직접 비용은 **147행 읽기·0행 쓰기**다. 전체 count/과거 이력 스캔·doctor·백필·외부 수집 강제 실행은 없다.
- OTW는 PR164 merge `006d835b33fa79b8a981a0c277ae4aafb92895ea`의 자동 배포이며 version `d5cdda3e-d70e-4b5e-945d-834028652e83`가 100%다. [해당 배포 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/164#issuecomment-6229289610)와 control-plane readback이 일치한다.
- LuvDia는 PR163 merge `6b0cf5152b018b424b698215f5b22037c315093f`, version `f01417ea-7853-4924-8f6b-38da2491db73`가 100%다. [해당 배포 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/163#issuecomment-6228267158)와 일치한다. PR162 당시 버전으로 되돌리지 않았다.
- 양 사이트 리소스 연결·Cron과 Queue 각 6개의 consumer/retry/retention/paused 설정은 기존과 같다. Queue 적체는 모두 0이다. LuvDia AI=false도 유지돼 있다. 빈 Queue를 업무 성공의 근거로 대신 사용하지 않았다.

## 자연 X: PASS

| 사이트 | run/source | 수락·완료 KST | 실제 결과 |
| --- | --- | --- | --- |
| OTW | `c3b1d60a-0f51-48ae-8698-a60dd69c3609` / scheduled | 19:23:33~19:24:20 | collect 2/2 succeeded, 각 attempt 1, 반환 40·postsStored 합계 10 |
| LuvDia | `c146cd50-fd24-4841-bae5-f545545f9d7d` / scheduled | 19:24:12~19:24:30 | collect 1/1 succeeded, attempt 1, 반환 15·postsStored 5 |

양쪽 item 내부 success=true/status=success/error=null이다. 참조 hydration은 complete, deferred/failed/retryAt은 0/0/null이고 선택 item의 미해결 reconcile/execute outbox는 모두 없어 retry_pending=0이다. 반환 결과만 확인한 빈 수집이 아니라 저장 처리가 포함된 완료다. 다만 postsStored는 저장 처리 카운터이며 순수 신규 INSERT 건수로 확대하지 않는다. 원격 전체 X 테이블 재검사나 로컬 11/7행 테스트 재실행은 하지 않았다.

## 자동 일정: 수동 성공과 자연 실행을 구분

OTW 최신 run `b73b0c74-8004-4806-80ef-696a68066e0c`는 11:48:15~11:49:53 KST의 **source=manual**이다. scan 4개·match 13개·finalize 1개 모두 succeeded, failed/skipped/retry_pending=0이다. terri_nunna 채널 `0a2020b09b8cc7f2285b7ae5de2ce4d3`의 scan은 complete/attempt 1이고 해당 match는 checked=0/updated=0, finalizer는 checked=8/updated=0이다. 실제 조회 경로 완료는 확인했지만 새 일정 생성이나 자연 실행 성공으로 해석하지 않는다. 9004가 실제 발생해 fallback을 통과했는지는 이 결과만으로 확인하지 못했다.

이 수동 finalizer가 auto_update_last_run을 `1792205392844`(10/17 11:49:52.844 KST)로 갱신했다. 현재 계약은 manual도 최종 완료 시각을 저장하며 scheduled admission은 그 값에서 24시간을 기다린다. 따라서 이전 예상 10/17 17:03에 새 자연 run이 없는 것은 실패가 아니다. 설정이 다시 바뀌지 않으면 다음 예상은 **10/18 12:03 KST**이며 같은 예약으로 12:10에 관측한다. 과거 실제 partial `f1195a83-a4ab-4efd-8590-23f771a72d9c`와 10/11의 오래된 running 기록은 변경하지 않았다.

LuvDia 최신 자동 일정은 여전히 10/16 22:03 수락의 scheduled run `f06c8a71-b733-4d47-9c33-85714f0fe1c8`다. enabled=true/24시간, last_run=10/16 22:04:21.355 KST이므로 다음 예상 10/17 23:03, 관측 23:10 KST를 유지한다. 이전 실행을 새 배포의 자연 실행으로 사용하지 않는다.

## 예약의 실제 시각 오류와 수정

이번 heartbeat의 실제 발화는 `2026-10-17T10:25:01Z`(19:25 KST)였다. Codex 예약의 read-only readback에서 기존 BYHOUR=10은 10:25 UTC로, 19일 BYHOUR=0은 `2026-10-19T00:01:00Z`(09:01 KST)로 저장돼 있었다. 로컬 시각 의도와 실제 예약에 9시간 차이가 있었다.

예약 변경은 automation 도구로만 수행했다. automation-4는 10/17 23:10 KST(`2026-10-17T14:10:00Z`)로, 기존 19일 관측은 의도했던 10/19 00:01 KST(`2026-10-18T15:01:00Z`)로 바로잡았다. 변경 뒤 read-only 로컬 예약 저장소의 실제 next_run_at이 두 UTC 시각과 정확히 일치하는 assert를 통과했다. `automation-readback.json`에 저장했다. 공개 전환 자체는 서버 정책이 00:00 KST에 결정하며 이 관측 예약에 의존하지 않는다. 중복 예약은 만들지 않았으며 otw-9-d1은 PAUSED를 유지한다.

## 보존과 한계

이번 변경은 이 새 관측 문서와 ignored 관측 증거·예약 갱신에 한정한다. 원본 WIP·별도 X 작업 트리·기존 보호 보고서·마이그레이션 이력은 수정하지 않았다. 증거는 `.tmp/natural-observation-20261017-1925/`의 metadata.json, runs.json, source-and-settings.json에 있다.

양 사이트 자연 자동 일정, 9004 fallback 발생 시 경로, 실제 19일 전환은 아직 미확인이다. Play 자동화·LuvDia AI 중지와 고비용 작업 보류를 유지한다.
