> **완료된 로컬 구현·검증 원문:** 본문의 미배포·미커밋 표기는 당시 상태다. 후보01~03은 PR #176에서 병합·양 사이트 반영을 완료했다. [최신 검토 결과](../../../architecture-review.md)와 [최종 운영 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/176#issuecomment-6291519609)를 먼저 읽는다.

# 일정 자동 갱신 검토 지적 1~5 수정

## 결과와 범위

구조 검토 후보03에서 확인한 다섯 문제를 `codex/play-catalog-retry`의 로컬 미커밋 변경으로 수정했다. 기준 HEAD는 `b2be7c7e1f976a8702eb9fa386186ada0f28ed82`이다. 후보01·02의 카탈로그 변경과 migration0148은 보존했다. 이번 수정에는 신규 migration·설정·의존성이 없다.

운영 자동화·유료 AI를 재개하지 않았으며 운영 D1·외부 공급자·GitHub를 변경하지 않았다. 이번 요청은 PR·push·병합·배포 승인이 아니다.

## 수정한 동작

| 지적 | 수정과 확인한 결과 |
| --- | --- |
| 1. 계획 후 중지해도 예약 scan 실행 | 예약 scan·match는 현재 `auto_update_enabled`를 확인한다. 이미 발송된 scan을 중지하면 공급자 호출0·관측0이며 `skipped`로 정리한다. 공급자 응답 대기 중 중지해도 관측 저장을 차단한다. 명시적인 수동 실행과 완료·재조정 절차는 유지한다. |
| 2. 소유권을 잃은 업무 쓰기 | 현재 run·item·lease token·만료·단계 순서를 업무 변경과 같은 D1 batch에서 확인한다. scan과 match 모두 적용하며 사이트 공개·멤버 종료 정책도 유지한다. 만료 후 새 소유자가 저장한 제목과 `last_seen_at`을 이전 scan이 덮지 못한다. |
| 3. 완료 메시지 재전달 시 새 날짜 작업 생성 | 단계 계획과 실행 시도 표식을 같은 batch로 저장한다. 이미 진행한 시도는 기존 작업·outbox만 재조정한다. 다음 날 완료 scan을 재전달해도 항목3개·완료 상태·완료 시각이 유지되고 새 공급자 호출이나 작업이 생기지 않는다. |
| 4. 예약 retry가 최초 주기로 다시 계산되어 skipped | 이미 항목이 있는 queued run은 최초 계획·cadence 계산을 반복하지 않고 기존 outbox를 이어간다. 일일 예산 검사는 유지한다. 수동·예약 retry 모두 실제 `ScheduledRunClient`→control Queue handler→업무 Queue handler→D1 경로로 성공했다. |
| 5. retry 성공 후 이전 실패 완료 기록 재사용 | 실제 실행 재시도 항목의 현재 결과를 비우고, 다시 실행하는 상위 단계의 하위 match·finalize도 재계산한다. 재조정 전용 retry의 완료 결과는 유지한다. 기존 실패 이력1건은 보존하고 성공 이력1건·후보1건·완료 결과 `updated=1`을 확인했다. 완료 메시지를 다시 전달해도 이력이 추가되지 않는다. |

`summary_json.autoUpdatePhases`는 scan·match의 실행 시도 합계를 보관한다. 단순 Queue 재전달은 시도를 늘리지 않으며, 실제 재시도에서만 새 계획을 허용한다. 기존 표식 없는 run은 이미 존재하는 후속 단계로 완료 진행을 판별한다. 새 재시도는 상위 단계가 끝나고 계획이 저장될 때까지 하위 작업을 발송하지 않는다.

독립 검토에서 이전에 발송된 match·finalize 메시지가 이 발송 제한을 우회할 수 있음을 추가로 확인했다. 같은 단계 조건을 outbox 발송, `claimItem`의 단일 UPDATE, 업무 저장 batch에 공유 적용했다. 수정 전 실제 Queue handler에서 실패한 회귀 사례를 추가했고 수정 후 통과했다. 읽기 전용 재검토에서 이 경합은 해결됐으며 추가 확정 지적은 없었다.

## 실행 검증

모든 검증은 task 소유 로컬 환경에서 수행했다. Node `24.20.0`을 사용했다. 테스트가 기존 오류를 정상으로 정의하지 않도록 원하는 동작을 먼저 단언했고, 최초 공식 Worker pool 실행에서 7개 중6개가 실패해 원래 지적5건과 공급자 대기 중 중지를 재현했다.

| 검증 | 결과 |
| --- | --- |
| 신규 공식 Worker schema/D1 회귀 | 12개 PASS: 사전 중지, 조회 중 중지, scan 소유권 교체, match batch의 중지·소유권 교체, 다음 날 완료 재전달, 수동·예약 retry, 재조정 전용 retry, 동시 단계 계획, 늦은 하위 단계 메시지, 수동 실행 보존 |
| 기존 D1 상태·outbox·CAS·롤백 및 일정 거절 처리 | 59개 PASS |
| 관련 planner·coordinator·executor·Queue·Cron·retry client·HTTP 단위 사례 | 97개 PASS |
| 기존 멤버 종료·사이트 정책 D1 통합 | 6개 PASS |
| 기존 실제 native Workflow·Queue 소비자·완료 기록 D1 통합 | 2개 PASS |
| `pnpm typecheck:test`·변경 파일 ESLint·`pnpm architecture:check`·`git diff --check` | PASS |
| OTW·LuvDia 정식 로컬 Worker·클라이언트 빌드 및 artifact manifest | 양 사이트 PASS |

실행 로그는 `.tmp/review3/fixes-red-worker.log`, `late-delivery-red-2.log`, `fixes-green-final.log`, `fixes-d1-state.log`, `fixes-units-final.log`에 남겼다. 단위 HTTP fixture의 `db.batch is not a function` 경고는 기존 부분 fixture의 상태 조회 경고이며 실제 D1 검증 결과로 계산하지 않았다. 거절 처리의 의도적인 trigger 실패 로그는 롤백 단언을 통과했다.

관련 사례 총 **176개**가 통과했다. 네이티브 경로와 정책의 최종 로그는 `fixes-native-workflow-final.log`, `fixes-member-policy.log`이며 빌드 결과는 `fixes-build-sites.log`이다. 양 사이트 빌드는 기존 로컬 사이트 설정에서 공개 빌드 식별자만 전달했으며 토큰·비밀 키를 복사하거나 출력하지 않았다. 기존 500kB 초과 청크 경고는 남아 있다. 소스9개의 최종 SHA-256은 `.tmp/review3/final-source-sha256.json`에 기록했다. 후보01·02 기준 파일22개의 의도하지 않은 바이트 변경은0개다.

`docs/current-work.md`와 기존 아키텍처 검토 HTML의 후보03 완료 기록을 갱신했다. 원래 결함 검토 보고서는 당시 증거로 보존했다. 전체 preflight는 실행하지 않았으며 현재 요청에 필요한 변경 범위 검증을 수행했다.

## 실제 경로와 검증 한계

PR [#176](https://github.com/rlatmfrl24/overthewall-schedule/pull/176)의 자동 리뷰에서 scan 재시도 후 새 날짜·허용 채널 계획에 없는 이전 match까지 queued로 남는 P2를 추가로 확인했다. 실제 D1 회귀2개를 먼저 실패시킨 뒤, phase guard와 같은 batch에서 제외된 match를 `skipped/auto_update_target_superseded`로 보존하고 미해결 outbox를 종료했다. 새 match가0개면 match marker도 확정해 finalizer가 진행한다. 기존 대상 유지·새 대상 추가·제외 대상의 늦은 메시지 차단·빈 계획·삽입 실패 전체 롤백을 포함한 상태 테스트32개 PASS와 독립 정적 재검토의 잔여 지적0건을 확인했다. 최종 preflight·배포 판정과 운영 증거는 PR의 검증 댓글이 소유한다. 위176개 결과는 이 추가 수정 직전 증거이며, 최종 소스에 영향받는 검사는 별도로 갱신한다.

신규 회귀는 실제 application·repository·Queue handler와 로컬 D1을 사용한다. Queue 메시지 전달과 외부 CHZZK 응답을 통제해 중지·소유권 교체·재전달 시점을 재현한다. 별도의 기존 native Workflow 사례는 실제 Worker 번들, workerd Workflow와 네이티브 Queue 소비자를 사용해 Cron 진입부터 관측→후보→완료 이력까지 확인한다. 단위 fixture나 직접 repository 호출만으로 실제 Queue 경로를 통과했다고 판단하지 않는다.

공급자·계정 사용량 응답은 로컬 fixture이므로 실서비스 공급자 응답·운영 Cloudflare Queue·운영 부하를 확인한 것은 아니다. 운영 UI·원격 D1·배포는 이번 검증 대상이 아니다. 중지된 운영 자동화와 유료 AI 설정은 그대로 유지했다.
