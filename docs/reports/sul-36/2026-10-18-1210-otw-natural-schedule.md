# 2026-10-18 12:10 KST OTW 자연 자동 일정 최종 관측

**OTW의 배포 후 자연 자동 일정은 PASS다.** 테리 눈나 채널을 포함한 scan→match→finalize가 정상 완료됐다. 앞서 확인한 양 사이트 자연 X와 LuvDia 자연 자동 일정까지 이번 예약의 관측 범위를 모두 마쳤다. 9004 fallback이 실제 발생해 동작했는지는 이 성공 결과만으로 확정하지 않는다.

## 실제 실행과 최종 기록

- run `00b40752-911f-4355-a3ff-d7251c121644`, source=`scheduled`.
- 수락: 2026-10-18 12:03:35.651 KST, 완료: 12:04:53.343 KST. 이전 수동 실행과 구분했다.
- run은 succeeded, total/completed=16/16, failed/skipped=0/0, last_error=null이다. scan 4개·match 11개·finalize 1개가 전부 succeeded/attempt 1이다.
- 8개 채널의 내부 scan 결과가 모두 complete이고 failed/queryFailed/incomplete=0/0/0이다. 전체 16개 item의 error code는 null, 미해결 reconcile/execute를 확인한 retry_pending은 모두 0이다. 조회된 item 수가 실제 run의 전체 수와 일치한다.
- 테리 눈나 채널 `0a2020b09b8cc7f2285b7ae5de2ce4d3`는 scan complete다. `member:2:date:2026-10-17` match는 checked=1/updated=0이며 기존 일정 3104와 시간 범위로 대조했다. 같은 결과가 최종 기록에도 포함됐다. 빈 조회나 다른 채널 성공으로 대신하지 않았다.
- finalizer는 checked=12/updated=1, segmentCount=12/sessionCount=11/resumeMergedCount=1이다. existing 10개와 auto_collected 1개를 기록했다. 마지막 항목은 김아테의 missing_schedule 자동 수집 후보이며, 일반 일정이 새로 게시됐다고 해석하지 않는다.
- auto_update_last_run은 `1792292692932`(12:04:52.932 KST)로 갱신됐다. 현재 finalizer가 이력·last_run·result_json을 같은 트랜잭션으로 기록하는 경로와 대조했고, 영속화된 완료 결과와 마지막 실행 시각을 확인했다.
- source·수락 시각·전체 item/완료 수·내부 scan·테리 눈나 match와 finalizer 포함·재시도·last_run 시각의 로컬 assertion이 모두 통과했다. wrapper 성공이나 빈 Queue만으로 판정하지 않았다.

## 비용과 실제 배포

D1 SQL 전에 기존 Cloudflare UTC 당일 계정 집계를 읽었다. 12:10:37 KST 기준 읽기 **100,255행/500만행(2.01%)**, 쓰기 **2,995행/10만행(3.00%)**으로 중단 기준에 근접하지 않았다. 이는 자연 운영을 포함한 계정 사용량이다.

이번 직접 D1 표본은 **76행 읽기·0행 쓰기**다. job_type+status의 `idx_scheduled_job_runs_job_status_accepted`별 최신 1개, 선택 run item LIMIT 20과 OTW 설정 3개만 읽었다. 업무 API·관리자 화면·전체 count/scan·doctor·과거 X 이력을 조회하지 않았다. 이전 PASS인 X와 LuvDia 자연 일정도 반복 검증하지 않았다.

control-plane의 적용 100% 버전은 직전 관측과 같다.

| 사이트 | Worker 버전 | 기존 배포 ledger의 소스 |
| --- | --- | --- |
| OTW | `d5cdda3e-d70e-4b5e-945d-834028652e83` | PR164 merge `006d835b33fa79b8a981a0c277ae4aafb92895ea` |
| LuvDia | `f01417ea-7853-4924-8f6b-38da2491db73` | PR163 merge `6b0cf5152b018b424b698215f5b22037c315093f` |

이번 관측 중 배포·운영 데이터/설정·권한을 변경하지 않았고 강제 수집·메시지 소비/purge·유료 AI·Play 자동화 재개를 하지 않았다. 원본 WIP·별도 X 작업 트리·보호 보고서·마이그레이션 이력도 수정하지 않았다. 과거 실제 partial `f1195a83`와 10/11 running 기록을 그대로 보존했다.

## 관측 종료와 남은 한계

양 사이트 자연 X·LuvDia 자연 자동 일정·OTW 자연 자동 일정 관측이 완료돼 도구로 `automation-4`를 삭제했다. 삭제 결과 `deleteStatus=deleted`와 read-only 로컬 예약 저장소에서 해당 행이 없는 것을 확인했다. 19일 00:01 KST 공개 전환 관측 `otw-luvdia-19`는 ACTIVE/next_run_at=`2026-10-18T15:01:00Z`, `otw-9-d1`은 PAUSED로 유지된 것도 assert로 재확인했다. 결과는 `automation-readback.json`에 저장했다.

테리 눈나의 실제 자연 수집 경로는 정상 완료됐지만 HTTP 9004 발생 및 fallback 경유 여부는 미확인이다. 실제 19일 공개 전환과 의도적으로 중지된 Play/AI 기능도 이번 PASS 범위에 포함하지 않는다. 기존 데이터·파일 보존과 고비용 작업 보류를 유지한다.

증거는 `.tmp/natural-observation-20261018-1210/usage-before.json`, `observation.json`, `verdict.json`에 저장했다. 앞선 관측은 [LuvDia 자연 일정](2026-10-17-2310-luvdia-natural-schedule.md), [양 사이트 자연 X](2026-10-17-1925-natural-observation.md)를 따른다.
