# 멤버 게시물 저장·운영 이력 정책

X의 장기 기록·Compliance 후속 설계는
[`x-member-history-and-compliance-design.md`](./x-member-history-and-compliance-design.md)를
권위 문서로 사용한다. 이 문서는 현재 X·네이버 게시물 저장과 운영 이력의 공통
정책 및 구현 Closeout을 기록한다.

## 수집 범위

- X와 네이버는 archive가 아니라 소스 활성화 이후의 신규 게시물 피드다.
- 최초 활성화는 현재 위치만 watermark로 잡고 활성화 이전 게시물을 소급 저장하지
  않는다.
- 일시적인 공급자 장애는 비활성화가 아니므로 저장된 cursor·continuation에서
  재개한다.
- 관리자 또는 글로벌 킬스위치로 비활성화한 기간은 소급하지 않는다. 재활성화
  시각을 새 시작점으로 저장한다.
- 현재 저장된 게시물은 정책 전환 전부터 D1에 있던 행을 포함해 보존하되, X나
  네이버에 과거 데이터를 추가 요청하지 않는다.

## 장기 보존

- X와 네이버 게시물은 일반 TTL prune 대상에서 제외한다.
- 게시물 ID, 출처 식별자, 게시 시각, `first_seen_at`, 숨김 시각과 사유는 장기
  보존한다.
- X 게시물은 1,000건 같은 개수 기준으로 삭제하지 않는다.
- 네이버 소스 삭제는 보관 처리하며 게시물 FK는 실제 소스 삭제를 제한한다.
- 이미지 파일은 D1이나 R2에 복제하지 않고 공급자가 반환한 URL만 게시물 내용과
  함께 저장한다.
- 소스 비활성화는 신규 수집과 공개 노출을 멈추지만 저장 행을 삭제하지 않는다.

## 내용 제거

- X Compliance 또는 관리자 판단으로 삭제·비공개·정지가 확정되면 `value`를 비우고
  `hidden_at`, `hidden_reason`, `content_removed_at`을 기록한다.
- 네이버 게시물도 관리자 확인 시 제목·요약·URL·썸네일을 비우고 같은 숨김 상태를
  기록한다.
- 숨긴 게시물은 공개 API에서 제외한다. 관리자 숨김과 X Compliance 숨김은
  재수집으로 자동 복구하지 않는다.
- 관리자 수동 제거는 Clerk 관리자 인증 후 X
  `DELETE /api/x/posts/{postId}`, 네이버
  `DELETE /api/naver-cafe/posts?id={postId}`로 실행하며 감사 로그를 남긴다.
- X 참여 지표 재조회와 engagement snapshot은 제거한다. redaction된 게시물은
  원문 없이 최소 tombstone만 유지한다.

## 조회와 운영 이력

- 공개 X·네이버 API는 요청당 5~20건 제한을 유지하며 전체 누적 이력을 한 응답으로
  반환하지 않는다.
- 공개 API는 D1 저장 데이터만 읽고 사용자 요청으로 X나 네이버 공급자 API를
  호출하지 않는다.
- 전체 X 기록은 관리자 전용 cursor API로만 제공한다.
- X API 사용 이벤트, X 수집 실행, 네이버 소스 검사는 30일 보존한다.
- YouTube API 사용 이벤트와 기타 수집·스케줄 실행은 최대 90일 보존한다.
- 일별 사용량 집계는 장기 보존한다.
- D1 용량은 구성된 DB 상한을 기준으로 60% 알림, 75% 경고, 85% 위험으로 표시한다.
  상한 설정이 없으면 Cloudflare Free 단일 DB 상한 500MB를 사용한다.

## 2026-09-01 구현 Closeout

기준은 production D1과 Worker를 `2026-09-01T11:40:17Z`에 읽기 전용으로 확인한
snapshot이다. 운영 수치는 이후 수집에 따라 변할 수 있다.

| 영역                   | 판정      | 근거                                                                                                                                                    |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X 장기 저장            | 완료      | `x_posts` 160건·8 handle, 숨김 0건. 일반 TTL과 개수 기준 prune에서 제외됨                                                                               |
| X 신규 피드 cursor     | 부분 완료 | 8개 source 모두 watermark, continuation 0. 단, 기존 source 8개의 `last_attempt_at`·`last_success_at`이 NULL이라 source별 정상 실행 readback은 남아 있음 |
| X 공개 read            | 완료      | production `/api/member-posts?sources=x` 호출 전후 `x_api_usage_events`가 1,604건·max ID 7,161로 동일해 공급자 호출 0회를 확인                          |
| X redaction 저장 계약  | 완료      | `value`, `hidden_at`, `hidden_reason`, `content_removed_at`과 관리자 DELETE 경로 구현. 숨긴 행의 자동 복구 방지 구현                                    |
| X 자동 Compliance      | 부분 완료 | 장기 facts·관리자 history API·Compliance 상태 머신을 배포했다. 참여 지표 재조회·snapshot·일별 engagement 집계는 2026-09-02 비용 절감 결정으로 제거한다. Compliance upload URL 404는 공급자 게이트로 남아 있다. |
| 네이버 장기 저장       | 완료      | 360건·숨김 0건, 8개 active source 모두 초기화·watermark 완료, continuation 0                                                                            |
| 네이버 운영 제어       | 완료      | 수집 킬스위치와 표시 설정 분리, 소스 보관·관리자 redaction·영구 저장 정책 구현                                                                          |

Closeout은 저장·노출·운영 이력 구현의 완료 여부만 판정한다. X Developer Console
use-case 확인, migration, 배포와 장기 기록 flag 활성화는 완료했다. 다만 실제
Compliance 전체 상태 전이를 권위 readback하기 전에는 X 자동화 전체를 완료로
판정하지 않는다. 실패한 Compliance job은 안전 중단됐고 게시물
본문·노출 상태는 변경되지 않았다.

## 2026-09-02 X Compliance 재진단

Compliance 기능 권한 `x_compliance_enabled`는 유지하고 자동 rollout
`scheduled_v2_x_compliance_enabled`만 비활성화했다. 아직 Queue에 전달되지 않은 run
3건은 `skipped` 처리했으며 실행 가능한 Compliance item·outbox는 0건이다. 실패
job과 이미 완료된 run은 감사 이력으로 유지한다.

당일 X 원장 `$0.630` 중 Compliance는 `$0.015`로 주 비용원은 아니었다. 그러나 같은
계약 오류로 세 번 create한 재시도는 제거 대상이다. 일일 Compliance 상한을
`$0.05`로 낮추고 terminal 계약 오류 재시도 금지, 24시간 due-only Workflow, D1
write 예약 현실화를 적용한다. 장기 저장 본문을 공개하는 동안 삭제·비공개·정지
상태 반영은 필수이므로 Compliance 기능 자체는 유지하되 전체 상태 전이 canary
전까지 운영 활성화하지 않는다.

운영 화면의 Compliance D1 5,500은 실제 write가 아니라 item admission 추정치였다.
5개 item이 내부 40,000 목표 중 27,500을 예약해 다른 job을 조기 throttling한 것은
확인했지만 Cloudflare D1에 같은 수의 행을 쓴 것은 아니다. 예약치를 100/item으로
낮춘다. 하루 한 cycle은 일반적으로 500~600행/일을 예약하고, 보수적 최악은 약
1,200행/일이다. 이동 24시간 actual
408,039 writes의 대량 원인은 과거 search gram 전체 재구축과 migration copy였으며,
최근 6시간 query insight에서는 Compliance·search gram write 모두 0이었다.

참여 지표 재조회 flag 두 개는 `2026-09-02T02:38:56Z` 운영 readback에서 모두
`false`로 전환했다. 당시 관련 item은 `failed` 2·`partial` 3·`skipped` 4뿐이고
실행 가능한 상태는 0건이었다. 기존 outbox 9건도 모두 이미 `dispatched`된 감사
이력이므로 추가 공급자 호출을 일으키지 않는다. contract migration은 이 관련
설정·실행 이력·전용 테이블을 삭제한다.

### 2026-09-02 X 참여 지표 제거 Closeout

[PR #103](https://github.com/rlatmfrl24/overthewall-schedule/pull/103)으로 재조회
job·API·관리자 UI·공급자 lookup을 먼저 제거하고 production Worker
`0948db90-1d51-48ae-84a6-f43822047819`의 100% 배포를 확인했다. 그 뒤
[PR #104](https://github.com/rlatmfrl24/overthewall-schedule/pull/104)의 migration
`0077_ambiguous_post.sql`을 운영 D1에 적용했다.

`2026-09-02T02:58:29Z` readback에서 snapshot 227건·일별 집계 48건·관련 run
15건·item/outbox 각 9건·usage event 3건·두 setting이 제거됐다. 전용 table·index와
모든 관련 운영 행은 0건이고, `x_post_facts` 127건·`x_posts` 198건은 유지됐다.
pending migration과 FK 위반도 0건이다. 이 시점부터 참여 지표는 일반 신규 수집
응답에 포함된 수집 시점 값만 피드 호환용으로 저장하며 별도 재조회하지 않는다.
