# 2026-10-17 23:10 KST LuvDia 자연 자동 일정 관측

**LuvDia의 배포 후 자연 자동 일정은 PASS다.** 23:03에 예약 실행이 수락됐고 scan→match→finalize가 전부 끝났다. 새 일정 생성은 0건이며 기존 일정 대조와 동일 일자 중복 억제의 정상 결과다. OTW 자연 자동 일정과 9004 fallback 관측은 아직 완료하지 않았다.

## 실제 실행과 최종 기록

- run: `811cde66-4144-478f-aa85-2264a9ece42e`, source=`scheduled`.
- 수락: 2026-10-17 23:03:34.252 KST, 완료: 23:04:12.090 KST.
- run은 succeeded, total/completed=10/10, failed/skipped=0/0, last_error=null이다.
- scan 2개가 3개 채널을 모두 complete로 처리했다. 내부 attempted/succeeded=3/3, failed/queryFailed/incomplete=0/0/0이다.
- match 7개와 finalize 1개도 모두 succeeded/attempt 1이다. 선택된 10개 item의 error code는 null, 미해결 reconcile/execute outbox를 확인한 retry_pending은 전부 0이다.
- finalizer는 checked=6/updated=0이다. 기존 일정 5개와 same_day_suppressed 1개를 기록했다. 새 일정이 만들어졌다고 확대하지 않는다.
- auto_update_last_run이 `1792245851846`(23:04:11.846 KST)로 갱신돼 최종 기록 단계가 실행됐음을 확인했다. wrapper나 빈 Queue만 보고 성공으로 판정하지 않았다.
- source·수락 시각·전체 item 수·완료 수·내부 scan 결과·재시도·last_run 시각의 assertion을 모두 통과했다.

## 비용과 배포 식별

D1 SQL 전 기존 Cloudflare UTC 당일 계정 집계를 읽었다. 23:10:24 KST 기준 읽기 1,640,620행/500만행(**32.81%**), 쓰기 14,856행/10만행(**14.86%**)으로 중단 기준에 근접하지 않았다. 이는 자연 운영을 포함한 계정 사용량이다.

이번 직접 D1 표본은 **44행 읽기·0행 쓰기**다. job_type+status의 `idx_scheduled_job_runs_job_status_accepted`별 최신 1개, 선택 run의 item LIMIT 20, 양 사이트의 설정 3개만 읽었다. LuvDia는 실제 item 10개가 전체 run item 수 10개와 일치한다. 업무 API·관리자 화면·전체 count/scan·doctor·과거 X 이력은 호출하지 않았다.

현재 control-plane의 적용 100% 버전은 직전 관측과 같다.

| 사이트 | Worker 버전 | 소스 근거 |
| --- | --- | --- |
| OTW | `d5cdda3e-d70e-4b5e-945d-834028652e83` | PR164 merge `006d835b33fa79b8a981a0c277ae4aafb92895ea` |
| LuvDia | `f01417ea-7853-4924-8f6b-38da2491db73` | PR163 merge `6b0cf5152b018b424b698215f5b22037c315093f` |

배포·리소스·데이터·자동화 flag를 변경하지 않았다. 이전 양 사이트 자연 X PASS와 로컬 11/7행 비용 검증은 반복하지 않았다. Play 자동화와 LuvDia AI를 재개하지 않았으며 원본 WIP·별도 X 작업 트리·보호 보고서·마이그레이션 이력은 수정하지 않았다.

## 다음 관측

OTW 설정은 enabled=true/24시간, last_run=`1792205392844`(10/17 11:49:52.844 KST)로 직전 관측과 같다. 다른 작업의 해당 수동 실행을 자연 실행으로 바꾸지 않는다. 다음 자연 admission 예상은 **10/18 12:03 KST**이며 동일 `automation-4`를 **10/18 12:10 KST = 2026-10-18T03:10:00Z**로 갱신했다. read-only 로컬 예약 저장소의 실제 next_run_at이 이 UTC 시각과 일치하는 assert도 통과했다. 새 run의 source와 terri_nunna 채널 scan→match→finalize·최종 기록·미해결 재시도를 확인한다. 9004 fallback이 실제 동작한 증거가 없으면 정상 수집과 fallback 검증을 구분한다.

19일 00:01 KST의 기존 공개 관측은 next_run_at=`2026-10-18T15:01:00Z`, otw-9-d1은 PAUSED로 유지된 것을 재확인했다. 관측 증거는 `.tmp/natural-observation-20261017-2310/usage-before.json`, `observation.json`, `verdict.json`, `automation-readback.json`에 저장했다. 실제 정각 전환·OTW 자연 일정·9004 fallback은 이번 PASS 범위에 포함하지 않는다.
