# WebSub 해제 장애 진단 — 2026-09-09 KST

> 후속 결정: 사용자 요청에 따라 WebSub 자체를 종료하고 기존 시간당 업로드 조회로 통합한다. 아래 `expired` 상태 추가안은 채택하지 않았다. [실제 수정 및 운영 계약](channel-upload-polling.md)을 따른다. 원인과 Google 실측 증거는 그대로 유효하다.

**해당 Google 구독은 이미 만료됐다. Google 허브의 요청 처리 실패와 서비스의 만료 상태 부재가 겹쳐 불필요한 해제 재시도가 이어지고 있다. 해제 callback을 계속 기다리는 방식으로 해결할 문제가 아니다.**

## 실제 확인 결과

대상은 온하루 노래클립 채널 `UCJvI-tjsxs30etEsp9zaD1w`, monitor `47fd62dd-88c9-4aa3-9e33-4b4aa864c74f`, subscription `707abaee-0ee6-4260-bedb-0471a7d68cc3`이다. 운영 Worker 기준 버전은 `d9729252-2e96-4350-98fd-43271fb323ea`이다.

| 항목 | 확인된 사실 |
| --- | --- |
| Google 허브의 실제 구독 상태 | **expired** |
| Google의 마지막 정상 검증 | 2026-09-01 05:14:10 UTC |
| Google의 만료 시각 | **2026-09-06 05:14:08 UTC / 14:14:08 KST** |
| 서비스 DB | `unsubscribing`, `pending_mode=unsubscribe`, `lease_expires_at=NULL`, `hub_timeout` |
| 운영 정책 | 전역 Play 자동화 중지, monitor paused |
| 기본 통신 | 로컬 허브 GET 약 0.35초. Cloudflare 원격 실행 GET·잘못된 mode의 POST는 약 0.2~0.4초에 200·400 반환 |
| 요청 형식 비교 | URLSearchParams·문자열 모두 기본 POST 통신 정상. 정상 형식 해제는 `/subscribe`·`/`, secret 포함·생략, async·sync에서 단기 시간 제한을 넘김 |
| 기존 구독의 실제 해제 요청 | 동일 callback hash를 검증하고 기존 pending unsubscribe 의도로 sync POST 1회. **20,409ms 후 HTTP 503: `Transient error; please try again later`** |
| 해제 요청 이후 허브 재조회 | 여전히 `expired`; 마지막 subscribe/unsubscribe 기록과 검증 오류 `n/a` 유지 |

기존 production secret은 Cloudflare 원격 preview 안에서 기존 HMAC 함수에만 전달했다. root secret이나 실제 callback token을 출력하지 않았고, 계산한 callback hash가 현재 D1 구독의 hash와 일치함을 확인한 뒤 Google의 Subscriber Diagnostics를 조회했다. 진단 출력은 callback·secret을 가렸다. 원격 preview는 운영 배포를 교체하지 않으며, 이번에 신규 유효 구독을 생성하지 않았다.

HTTP 503은 허브의 정상 형식 요청 처리 경로에서 확인됐다. Google 내부의 정확한 장애 원인(예: 내부 저장소 또는 작업 큐)은 공급자 로그가 없어 확정할 수 없다. Cloudflare 전체 통신 장애나 callback 구현 오류라고 단정할 근거는 없다. 동기 방식 또는 timeout 연장만으로 해결된다는 가설은 실제 요청 결과로 기각했다.

## 서비스 내부 원인

1. `GoogleWebsubHubClient`는 10초 timeout으로 두 번 요청한다. 약 20초 후 돌아오는 공급자의 503이 timeout으로 가려진다. 짧은 timeout 자체보다, 유효한 구독이 없어도 같은 종료 요청을 반복하는 것이 운영 낭비의 핵심이다.
2. `music_channel_websub_subscriptions_time_check`는 `lease_expires_at >= requested_at`을 강제한다. 마지막 검증으로 부여받은 lease 만료와 가장 최근 요청의 시각은 별도 사실인데 하나의 선후 조건으로 묶여 있다.
3. 이 제약을 맞추려고 `prepareSubscription`은 재요청 시 이미 지난 lease를 NULL로 지운다. 그 결과 유효했던 구독의 실제 만료 이력이 사라져, 자동화가 만료를 판단할 수 없다.
4. `listStaleIntents`는 오래된 `unsubscribing`을 계속 선택한다. 별도의 `expired` 종료 상태가 없어 이미 만료된 구독도 끝없이 재요청된다.
5. 기존 D1 테스트는 만료 lease를 NULL로 지우는 동작을 정답으로 검증한다. 이 검사는 만료 이력 보존이라는 운영 의미를 검증하도록 변경해야 한다.

## 검토한 상태 모델 수정안 — WebSub 종료 결정으로 대체

**정상 종료의 기준을 `명시적 해제 확인`과 `lease 만료 확인`으로 구분한다.**

1. 구독에 `expired` 종료 상태를 추가한다. 이번 건은 Google이 확인한 정확한 만료 시각을 근거로 해당 구독 한 건을 CAS와 감사 event를 통해 종료 처리한다. `unsubscribed` 또는 callback 성공으로 위장하지 않는다.
2. lease 시각과 요청 시각을 분리하는 DB 시간 제약으로 수정하고, 재요청에서 마지막 검증 lease를 지우지 않는다. 새 검증 callback이 성공했을 때 새 lease로 갱신한다. 출처를 알 수 없는 NULL lease를 추정 날짜로 채우지 않는다.
3. 만료가 확인된 중지 구독은 cleanup·stale intent·Workflow eligibility에서 제외한다. 대상이 없다면 WebSub Workflow·run·item을 만들지 않는다. callback 처리, 다른 수집의 공용 Outbox 복구, 후보 검수는 유지한다.
4. 관리자에서 `구독 만료됨`, 실제 만료 일시, Google 요청 오류를 각각 표시한다. 허브 진단은 관리자의 명시적인 읽기 전용 조작으로 제공하며, root secret은 노출하지 않는다. 정상적인 예약 경로에 반복 HTML 진단 조회를 추가하지 않는다.
5. 공개 전 재개는 기존 관리자 승인·monitor generation·전역 pause 해제 절차를 거쳐 명시적으로 새 구독을 요청한다. 이번 만료 정리가 자동 재구독을 유발해서는 안 된다.

검증에는 유효한 lease 유지, 만료된 중지 구독의 자동 요청 0, NULL lease의 보수적 처리, callback/재요청 CAS 경쟁, 부분 실패, 명시적 재개, 후보 검수 및 공용 복구 보존을 포함한다. 운영 완료 판정은 관리자 화면과 D1의 `expired`·정확한 만료 시각·감사 event, 다음 예약 시각의 불필요한 WebSub 작업 생성 0으로 한다.

이 수정은 기존 CHECK 제약과 상태 집합을 다루므로 Drizzle migration이 필요하다. 초기 최적화의 스키마 변경 없는 범위와 구분해 검토해야 한다. 이번 문서는 원인 조사와 실제 허브 검증 결과이며, 위 상태 모델·migration·운영 설정 변경은 아직 적용하지 않았다. 이전 실패 이력은 사실대로 보존한다.

## 근거

- [Google Subscriber Diagnostics](https://pubsubhubbub.appspot.com/subscribe): 기존 callback/topic tuple을 사용해 원격 preview에서 직접 조회. 실제 token이 포함된 진단 URL은 문서에 남기지 않는다.
- [Google 허브 지원 규격](https://pubsubhubbub.appspot.com/): 0.3/0.4 지원, 유한 lease와 갱신 안내.
- [WebSub lease 규칙](https://www.w3.org/TR/websub/#verification-details): 허브는 lease 만료를 강제하며 구독 유지는 만료 전 재요청이 필요하다.
- 로컬 진단 산출물: `.tmp/hub-subscription-diagnostics-redacted.json`, `.tmp/hub-real-unsubscribe-response.json`. 이 파일들은 운영 관측 증거이며 제품 구현을 대신하지 않는다.
