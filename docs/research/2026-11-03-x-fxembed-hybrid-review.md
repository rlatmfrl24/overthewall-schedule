# FxEmbed 기본 수집 + 정기 X API 보강 검토

- 검토일: 2026-11-03 KST
- 코드 기준: `fbdf9a03d620ea576c86c7c8b29fe7eb3964c4f1` — PR 208 병합
- 범위: 실제 FxEmbed 시험 결과·현재 코드·공식 문서를 근거로 혼합 수집의 적합성과 조건을 검토한다. 구현·새 외부 수집·유료 X 호출·운영 변경은 수행하지 않았다.
- 선행 근거: [대안 조사](2026-11-03-x-collection-alternatives.md), [실제 조회 시험](../reports/2026-11-03-x-alternative-live-test.md), [비용 보고서](../reports/2026-11-03-x-rest-budget-recovery.md).

## 결론

**FxEmbed를 빠른 기본 수집원으로 쓰고, X API를 독립적인 정기 대조·누락 복구에 남기는 방향은 검토할 가치가 있다.** FxEmbed만으로 전부 교체하는 안보다 이번 시험에서 확인한 발견 누락과 필드 차이를 다룰 수 있다. 다만 “FxEmbed가 알려준 ID만 X API로 보강”하는 구조는 신규 글 누락을 복구하지 못한다.

권고하는 초기 검토안은 **FxEmbed 30분 수집 + 공식 X 타임라인 24시간 대조 + 필요한 개별 글 조회**다. 기존 X 정기 후보 점검이 매시 23·53분이므로, 30분은 새 스케줄 체계를 늘리지 않는 출발점이다. 이 주기들은 제품 결정이나 실행 승인이 아닌 제안이며 실제 지연·비용을 관측해 조정해야 한다. 15분은 더 빠른 표시가 필요할 때 별도 스케줄 조정을 검토할 선택지다.[현재 Cron](../../worker/app/scheduled-workflow-cron.ts)

성립 조건은 세 가지다.

1. **발견과 공식 완료 위치를 분리한다.** FxEmbed가 본 최신 ID로 공식 복구 범위를 건너뛰지 않는다.
2. **하나의 글을 출처·필드·버전을 고려해 합친다.** 나중에 온 FxEmbed 응답이 공식 관계·접근 상태·완전한 본문/첨부를 훼손하지 않는다.
3. **절감은 유료 웹훅·첨부 보강을 줄이는 데서 계산한다.** 정기 공식 타임라인은 FxEmbed가 저장한 글도 반환할 수 있어, 공식 비용이 누락 글 비율만큼으로 줄지는 않는다.

실제 서비스 도입 가능 판정은 아직 아니다. 정상 예약→수집→저장→D1 readback→공개 화면의 혼합 경로가 없고, 공개 API의 지속성·편집/삭제·장기 누락 복구도 검증되지 않았다.

## 1. 실제 시험이 이 안을 뒷받침하는 부분과 한계

[시험 보고서](../reports/2026-11-03-x-alternative-live-test.md)에서 대상 8명 모두 4페이지를 조회했지만 기존 공개 피드 160건 중 발견은 155건이었다. 미발견 5건 중 4건은 FxEmbed 개별 ID 조회로 200을 반환했고, 1건은 404였다. 404 원인은 미확정이다. 이는 영구 누락률이 아니라 제한된 페이지 탐색의 결과다.

이때 `개별 조회가 된다`와 `모르는 새 글 ID를 타임라인에서 발견한다`는 다른 능력임이 확인됐다. 따라서 이미 아는 ID의 본문·미디어를 X API로 보강하는 것만으로 이 문제를 해결할 수 없다. X API가 FxEmbed와 독립적으로 계정 타임라인을 읽어야 미발견 ID가 들어올 기회가 생긴다.

비교 가능한 159건은 작성 시각·첨부 개수·답글 대상·인용 대상 ID가 일치했지만, 문자열 본문·URL 처리·GIF 유형·미디어 식별자 형식에 차이가 있었다. FxEmbed 응답에는 이번 시험에서 대화 루트 `conversationId`가 없었다. 부모 ID를 루트 ID로 채워 넣거나 공식 값이 있는 글을 FxEmbed 전체 객체로 바꾸면 계약이 달라진다.

반환 목록에는 다른 작성자 문맥·리포스트·중복이 섞였고 8명 모두 엄격한 작성 시각 내림차순이 아니었다. 오래된 글 하나를 만났다는 이유로 중단하거나, 첫 페이지의 `since` 204를 과거 범위 완전성으로 간주하면 안 된다. FxEmbed 문서도 `since`를 첫 페이지의 최신성 조건으로 설명하며 공식 `since_id`와 동일한 계약은 아니다.[F01]

## 2. 권고하는 두 수집 경로

| 경로 | 맡는 일 | 진행 상태의 의미 | 저장·게시 |
| --- | --- | --- | --- |
| FxEmbed 기본 수집 | 일반 글·답글·인용의 빠른 발견, 가용한 본문·첨부 | 공급자별 마지막 성공·실패·cursor·조회 범위 | 현재 공개 정책을 통과한 정상 데이터부터 기존 피드에 표시 |
| 공식 X 타임라인 | FxEmbed 미발견 ID 발견, 공식 관계·본문·첨부 대조 | 기존 공식 `since` 기준·미완료 페이지·완료 위치 | 같은 X 글 ID로 기존 데이터를 보강하거나 새 글 추가 |
| 공식 개별 lookup | 알려진 글의 필드 미완성·참조·편집/접근 상태 확인 | 해당 ID별 pending/retry/terminal | 공식 타임라인이 주지 못한 필요한 정보만 보충 |

제안하는 연결은 `Worker의 FxEmbed HTTP 조회 → 현재 X capability의 정규화/저장 → D1 → 기존 공개 피드`다. 방문자 브라우저가 매번 FxEmbed를 직접 호출하거나 별도 수집 DB를 만드는 안이 아니다. 로컬 PC·Python·테스트 X 계정도 이 혼합안의 필수 요소가 아니다. 다만 실제 FxEmbed 성공은 Windows PC에서만 확인했으며 Cloudflare Worker의 실제 외부 연결·시간 제한·응답 변환·저장/게시까지 검증한 것은 아니다. 기존 coordinator 경로 안에서 두 공급자를 구분하는 방향이며 구체적인 schema/API는 아직 정하지 않았다.

FxEmbed 글을 매번 공식 조회로 승인받을 때까지 공개 보류하면 기본 수집원으로 바꾸는 사용자 이점이 사라진다. 제안은 **정규화·현재 공개 정책을 통과한 글은 FxEmbed 수집으로 표시하되, 출처와 공식 확인 상태를 내부적으로 구분**하는 것이다. 불명확한 필드를 만들어 채우거나 현재 권한·숨김 정책을 완화한다는 뜻은 아니다.

공식 타임라인은 기존 `coordinator → Workflow → outbox/Queue → lease → collector → 저장·참조 보강 → 최종화`를 유지해야 한다. 외부 스크립트에서 D1을 직접 쓰거나 수동 lookup만으로 정기 복구를 대체하지 않는다.[수집 orchestration](../../worker/features/x-posts/infrastructure/x-collection.ts), [공식 gateway 계약](../../contracts/x-activity.ts)

### 공식 완료 위치는 FxEmbed와 공유하지 않는다

예를 들어 공식 완료 ID가 100일 때 FxEmbed가 120을 발견하고 110을 못 봤다고 하자. 공식 기준을 120으로 올리면 다음 `since_id=120`은 110을 검사하지 않는다. 공식 기준은 100을 유지하고, 공식 타임라인이 100 이후를 페이지 끝까지 처리한 다음에만 그 경로의 완료 위치를 올려야 한다.

- FxEmbed cursor/최신 관측 ID와 공식 cursor/완료 ID는 별도 진행 상태다.
- 예산·네트워크·저장 실패로 중단되면 기존 기준 ID와 페이지를 영속 보존한다. 다음 날에도 그 범위를 이어 처리한다.
- 공식 수집이 FxEmbed에 이미 있는 ID를 만나도 “이미 저장됨”만으로 공식 범위를 완료하거나 조회 자체를 건너뛰지 않는다.
- 모든 필요한 페이지·저장 결과가 확인되기 전에는 실제 미완료·재시도 대기를 succeeded로 덮지 않는다.
- 초기화·기존 데이터 이행도 같은 원칙이다. 현재 `readStored`에는 초기 수집 시각이 없을 때 최신 저장 글을 `lastSeenPostId`로 쓰는 fallback이 있어 FxEmbed 최신 ID가 공식 기준으로 섞이지 않도록 별도 확인이 필요하다.[현 저장·커서 코드](../../worker/features/x-posts/infrastructure/x-api.ts)

이 구분은 새로운 구간 재검사 알고리즘을 도입하자는 제안이 아니다. [2026-10-27 아카이브된 구간 재검사 판단](../archive/2026-10-27-x-recovery-research/2026-10-27-x-recheck-readiness.md)을 재개하지 않으며, 이번 안도 공식 API의 영구 무누락을 보장한다고 주장하지 않는다.

### 공식 API가 실제로 제공하는 복구 경계

공식 User Posts API는 `since_id`, `until_id`, 시간 범위와 `pagination_token`을 지원하고 `max_results`는 5–100이다. 통합 가이드는 `since_id` 이후·`until_id` 이전을 설명하며, 다음 token이 있으면 페이지를 계속 읽도록 안내한다. 현재 OTW는 리포스트만 제외하고 답글은 유지한다.[X01], [X02], [X03]

공식 타임라인 자체도 최근 최대 3,200개 제한이 있다. 가이드는 답글 제외 시 800개 제한과 범위 초과 시 성공 응답·빈 데이터 가능성도 명시한다. 따라서 오랫동안 복구하지 못하거나 호출 범위가 빠르게 쌓이면 24시간 주기만으로 무한 과거 복구가 보장되지 않는다. 지연 노출 글이 이미 공식 완료 ID보다 오래된 경우의 재발견 역시 이번 조사에서 증명하지 않았다.[X02]

공식 24시간 대조는 놓친 글이 대략 다음 대조에서 들어올 기회를 주는 주기다. 예산 차단·장애·페이지 이월이 생기면 더 늦어질 수 있으므로 24시간을 복구 지연의 엄격한 상한으로 안내하지 않는다.

공식 lookup은 ID를 아는 글 최대 100개를 한 요청에 조회할 수 있지만 미발견 ID를 열거하는 API가 아니다. 배치화는 요청·실행 부담을 줄일 수 있어도 반환 자원당 Post Read 요금을 없애지는 않는다.[X04], [X05]

## 3. 합치는 정책이 먼저 필요하다

현재 `writeStoredPosts`는 충돌 시 JSON `value`를 incoming 값으로 바꾸고, 같은 답글·인용의 이미 보강된 `.post`만 일부 보존한다. FxEmbed를 변환해 같은 함수에 그대로 넣으면 공식 `conversationId`, `altText`, 본문·첨부 상태 등이 나중에 사라질 수 있다. **저장 함수를 두 번 호출하는 것만으로 혼합 수집이 완성되지 않는다.** [현재 upsert](../../worker/features/x-posts/infrastructure/x-api.ts)

후속 구현에서는 한 저장 정책에서 다음을 정해야 한다. 아래는 검토 권고이며 이번에 도입한 정책은 아니다.

| 데이터 | 합치기 원칙 |
| --- | --- |
| 글/작성자 ID·답글/인용 대상·대화 루트 | 확인된 공식 관계 보존. FxEmbed 누락 값을 빈 값으로 덮지 않음. 부모와 루트를 혼동하지 않음 |
| 본문·URL·장문·첨부·alt text | 출처의 표현을 정규화하고 필드 완전성과 편집 버전 비교. 오래된 공식 본문이 더 최신 편집을 무조건 덮는 규칙도 피함 |
| 삭제·비공개·권한·기존 redaction | 권한 있는 확정 상태가 우선. FxEmbed 캐시의 글이 다시 왔다고 복원하지 않음 |
| 지표·프로필·가변 메타데이터 | 출처별 관측 시각과 가용성을 비교. 누락과 실제 0/빈 값을 구분 |
| 상태·비용·진행 위치 | 출처별 수집 상태 유지. FxEmbed 성공으로 공식 partial·이월·예산 차단을 감추지 않음 |

출처·조회 시각·필드 완전성·공식 확인 시점을 기록해야 운영자가 “빠르게 표시됐지만 아직 공식 확인 전”, “공식 복구 중단”, “양쪽 모두 실패”를 구분할 수 있다. 관리자에는 기본 수집 최근 성공과 마지막 공식 완료 시각/지연, 미완료 원인을 따로 보여주는 것이 적절하다.

또한 같은 FxEmbed 목록을 그대로 매번 upsert하면 D1/facts/references 비용이 새로 커질 수 있다. 8명×30분은 첫 페이지 기준 384회/일, 매번 4페이지면 1,536회/일이다. 실제 시험의 4페이지 913항목을 매회 처리한다고 가정하면 하루 43,824항목이며 신규 글 수가 아니다. 신규·실제로 바뀐 payload만 중앙 저장에 보내는 변경 판정과 가벼운 source health 기록을 검토해야 한다. 정확한 SQL 쓰기·청구량은 측정 전이다.

## 4. 비용은 어디서 줄어드는가

[기존 비용 보고서](../reports/2026-11-03-x-rest-budget-recovery.md)의 UTC 11/02 내부 추정은 다음과 같다. 이 하루의 구조를 그대로 유지하는 가상 비교이며 X의 확정 청구나 다음 달 예측이 아니다.

| 항목 | 기존 하루 | 혼합안의 단순 잔존 예시 | 전제 |
| --- | ---: | ---: | --- |
| `post.create` 웹훅 | $0.370 | $0 | 해당 유료 구독을 중단한 경우에만 |
| 웹훅별 첨부 보강 | $0.310 | $0 | FxEmbed/정기 타임라인이 필요한 필드를 충족한 경우 |
| 공식 타임라인 | $0.255 | $0.255 | 같은 공식 반환량·내부 추정 유지 |
| 별도 Post lookup | $0.030 | $0.030 | 같은 개별 보강량 유지 |
| User lookup | $0.010 | $0.010 | 같은 계정 조회량 유지 |
| 합계 | $0.975 | $0.295 | 추가 비용·새 복구량 제외 |

이 계산의 30일 단순 환산은 **$29.25 → $8.85, 약 70% 감소 시나리오**다. 운영 실측 예상액으로 확정할 수 없다. 기존 7일 평균의 30일 환산 $25.09는 다른 기준이며, $8.85와 동일한 월 관측치처럼 비교하지 않는다. 추가 FxEmbed 인프라·D1·유지보수, 새로 필요한 공식 보강·삭제 확인, 과금 정책 변경을 더해야 한다.

| 같은 하루를 기준으로 한 비교안 | 하루 내부 추정 | 30일 단순 환산 | 기존 대비 제거 비율 |
| --- | ---: | ---: | ---: |
| 현재 웹훅 + 공식 hydration + REST | $0.975 | $29.25 | — |
| 웹훅 유지 + FxEmbed hydration + REST | $0.665 | $19.95 | 31.8% |
| FxEmbed 기본 + 공식 정기 REST/개별 보강 | $0.295 | $8.85 | 69.7% |

두 절감안 모두 해당 hydration을 완전히 없앨 수 있다는 가정이다. **기본 수집원 이름만 바꾸고 `post.create` 구독을 유지하면 두 번째 안의 이벤트 비용이 남는다.** 반대로 유료 이벤트와 같은 UTC일 REST의 실제 중복 정산·후속 expansion 과금이 바뀌면 이 내부 구성처럼 청구액이 분리되지 않을 수 있다.

현재 공개 가격은 Post Read $0.005/자원, User Read $0.010/자원, `post.create` $0.005/이벤트다. UTC 하루 중복 제거는 soft guarantee다. FxEmbed에서 무료로 먼저 읽었다는 이유로 X가 처음 반환하는 같은 글이 무료가 되지 않는다. 로컬 DB 중복 제거는 저장 중복을 막을 뿐 공급자의 반환 과금을 없애지 못한다.[X05]

따라서 다음 계산은 사용하면 안 된다.

- **`5/160만 못 찾았으므로 공식 비용도 3.125%`:** 독립 공식 타임라인은 이미 FxEmbed로 저장한 155건도 반환할 수 있다. 미발견 5개 ID를 미리 안다는 가정도 잘못이다.
- **`공식 호출 주기를 1/24로 줄이면 비용도 1/24`:** 자원당 과금이므로 그동안 쌓인 글을 한 번에 읽어도 글 수는 남는다. 줄어드는 것은 반복 조회·요청/D1 작업이며, 수집 시점을 늘려 생기는 지연·복구 부담과 함께 봐야 한다.
- **`웹훅을 유지해도 $0.370이 사라짐`:** 구독이 활성이고 이벤트가 전달되면 이벤트 비용이 남는다. 추가 hydration만 줄이는 안과 구독까지 줄이는 안을 구분해야 한다.

참고로 공식 반환 글이 월 1,500/3,000/6,000개면 기본 Post Read만 $7.50/$15/$30이다. 사용자·첨부·참조 비용과 재조회가 추가될 수 있다. 비용 관측은 정상 수집이 기존 원장에 남긴 데이터를 읽는 방식으로 하고, 관측 자체 때문에 추가 D1 쓰기나 X 조회를 만들지 않는다.

공식 expansion은 참조 Post·User·Media 등을 `includes`로 돌려주므로 필요한 필드와 객체를 명시적으로 선택해야 한다.[X06] 저장소의 [기존 구독 조사](../operations/x-feed-subscription-research.md)는 2026-11-22부터 expansion 객체 과금이 바뀐다는 X Staff 공지 원문 관측을 기록한다. [공지](https://devcommunity.x.com/t/inform-x-api-ppu-expansions-update/279110)는 이번 재접근에서 차단돼 재확인하지 못했다. 미래 비용은 운영 콘솔의 적용 요금과 실제 반환량으로 다시 산정해야 하며 Media Read 단가를 임의로 확정하지 않는다.

## 5. 웹훅 축소와 삭제·짧은 수명 글

웹훅 구독을 줄이는 것은 단순 내부 최적화와 달리 관측 특성을 바꾼다. FxEmbed 확인과 다음 공식 대조 사이에 글이 작성·삭제되면 양쪽 폴링 모두 못 볼 수 있다. 그런 글을 끝까지 기록해야 하는 요구라면 이 안만으로 현재 실시간 생성 이벤트 경로와 같은 결과를 보장할 수 없다. 반대로 발견한 글도 이후 삭제·비공개 전환을 반영할 별도 정책이 필요하다.

현재 OTW의 [coordinator](../../worker/features/x-posts/infrastructure/x-activity-coordinator.ts)는 소유 확인·등록·복구가 `post.create`에 한정돼 있다. 현재 코드에 `post.delete` 수신 처리는 확인되지 않았다. **지금 시스템이 삭제 push를 이미 보장한다고 가정하지 않는다.**

공식 XAA는 사용자별 `post.delete` 구독을 지원한다. 삭제 전용 구독을 남기는 방향은 검토 가능하지만 새 이벤트 등록·수신·멱등 삭제 처리와 갱신/모니터링이 필요하다. 현재 가격표와 이벤트별 가격표는 `post.delete`를 not billed로 표기하나, XAA 소개의 “모든 Post event 과금” 문장과 충돌한다. 따라서 삭제 전용 경로의 실제 이용 권한·적용 가격·처리 기능을 확인하기 전 “0원 삭제 보장”이라고 보고하지 않는다.[X07], [X08], [X09]

공식 타임라인에서 기존 글이 보이지 않는다는 이유만으로 삭제 확정도 할 수 없다. 페이지 범위·노출·권한·일시 장애를 구분해야 한다. 알려진 ID의 lookup/Batch Compliance는 저장된 글의 삭제·보호·편집 상태를 확인하는 후보지만, 모르는 ID의 생성 사실을 복구하지 못한다. Batch Compliance는 ID 업로드 후 비동기로 상태를 받으며 현재 계정 권한·가격·적정 조회 범위는 미확인이다. Compliance Stream은 Enterprise access에 한정된 별도 계약이다.[X04], [X10], [X11]

`post.create` 중단을 구현한다면 이미 전달된 inbox·재시도 처리, 구독 만료·자동 재등록 방지, 공통 예산 초기화와 신규 사이트 bootstrap까지 확인해야 한다. 기존 seed가 있는 REST가 동작한다는 사실만으로 새 설치까지 웹훅 없는 혼합 경로가 완성되는 것은 아니다.[구독·예산 lifecycle](../../worker/features/x-posts/infrastructure/x-activity-coordinator.ts), [공통 gateway](../../worker/features/x-posts/infrastructure/x-shared-budget.ts)

X API를 정기적으로 쓰더라도 FxEmbed의 지속 제공·재표시 허용·원본 접근 방식에 관한 불확실성이 없어지지는 않는다. 외부 공급자 사용 조건과 공식 [X 약관](https://x.com/en/tos)·[자동화 규칙](https://help.x.com/en/rules-and-policies/x-automation)은 계속 검토 대상이다. 이번 문서는 그 허용 범위를 확정하지 않는다.

## 6. 도입 판단에 필요한 최소 검증

후속 구현을 승인받는 경우 다음 검증으로 결론을 내리는 것이 적절하다. 이번에 실행한 검증 목록은 아니다.

1. **새 글 발견/표시:** FxEmbed 정상 수집으로 공식 확인을 기다리지 않고 정책을 통과한 새 글이 의도한 공개 피드에서 보이는지 확인한다. 본문·URL·답글/인용·장문·GIF·영상·alt text와 작성자 필터를 비교한다.
2. **미발견 복구:** FxEmbed에만 없는 글을 공식 타임라인이 별도 범위로 발견해 저장하고, 같은 글을 중복 카드 없이 병합하는지 확인한다. 이미 알려진 ID를 수동으로 넣는 검사는 신규 발견 검증을 대신하지 못한다.
3. **중단과 재시작:** 예산 차단·요청 실패·저장 실패·같은 글의 경합에서 공식 partial/미완료 페이지가 보존되고 자연 다음 실행에서 이어지는지 확인한다. FxEmbed 성공이 공식 실패 상태를 지우지 않아야 한다.
4. **권위·삭제:** 공식 보강 이후 FxEmbed 재수집이 관계/alt text/접근 상태를 퇴행시키지 않는지, 편집 버전과 최신 지표를 올바르게 다루는지 확인한다. 404와 일시 실패만으로 영구 삭제하지 않는다.
5. **서비스·비용:** 기존 인증/예약→저장→D1 authoritative readback→실제 공개 화면으로 검증하고, 양쪽 수집 지연·공식 완료 지연·원장 비용·D1 부하·운영 개입 시간을 함께 읽는다. 자연 운영 관측과 수동 유료 실험은 별도 승인 범위다.

검토 결론은 **“FxEmbed를 기본 표시 경로로, 공식 API를 별도 대조/복구 경로로 두는 안을 후속 구현 후보로 권고”**다. 작은 출발점은 FxEmbed 30분·공식 24시간이며, 먼저 공급자별 진행 상태와 안전한 필드 병합을 완성해야 한다. 공식 API 호출을 더 줄이는 주기 변경보다 유료 생성 웹훅·건별 hydration을 어디까지 제거할 수 있는지 실증하는 것이 절감 판단에 직접적이다.

## 출처와 검증 한계

공식 문서와 현 코드·기존 시험 보고서를 읽어 검토했다. 이번에 새 FxEmbed 수집, 유료 X 호출, 혼합 수집 구현/운영 전환, 배포·청구 콘솔 확인, 앱 테스트·빌드는 하지 않았다. 제안의 작동·절감·복구 지연은 아직 운영 readback으로 입증되지 않았다. twscrape 테스트 계정 부재는 이번 혼합안 검토와 독립이며 별도 작업을 재개하지 않는다.

- [F01 — FxEmbed 타임라인 계약](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/)
- [X01 — 공식 User Posts endpoint](https://docs.x.com/x-api/users/get-posts)
- [X02 — 타임라인 통합·제한·편집 안내](https://docs.x.com/x-api/posts/timelines/integrate)
- [X03 — 공식 pagination](https://docs.x.com/x-api/fundamentals/pagination)
- [X04 — Post Lookup](https://docs.x.com/x-api/posts/lookup/introduction), [복수 ID endpoint](https://docs.x.com/x-api/posts/get-posts-by-ids)
- [X05 — X 가격·UTC dedup](https://docs.x.com/x-api/getting-started/pricing)
- [X06 — 공식 expansion](https://docs.x.com/x-api/fundamentals/expansions)
- [X07 — XAA 이벤트·접근/일반 설명](https://docs.x.com/x-api/activity/introduction)
- [X08 — XAA 구독 생성·event_type](https://docs.x.com/x-api/activity/create-x-activity-subscription)
- [X09 — XAA 이벤트별 가격표](https://docs.x.com/x-api/activity/event-pricing)
- [X10 — Batch Compliance](https://docs.x.com/x-api/compliance/batch-compliance/introduction)
- [X11 — Compliance Stream·Enterprise 경계](https://docs.x.com/x-api/compliance/streams/introduction)

[F01]: https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/
[X01]: https://docs.x.com/x-api/users/get-posts
[X02]: https://docs.x.com/x-api/posts/timelines/integrate
[X03]: https://docs.x.com/x-api/fundamentals/pagination
[X04]: https://docs.x.com/x-api/posts/lookup/introduction
[X05]: https://docs.x.com/x-api/getting-started/pricing
[X06]: https://docs.x.com/x-api/fundamentals/expansions
[X07]: https://docs.x.com/x-api/activity/introduction
[X08]: https://docs.x.com/x-api/activity/create-x-activity-subscription
[X09]: https://docs.x.com/x-api/activity/event-pricing
[X10]: https://docs.x.com/x-api/compliance/batch-compliance/introduction
[X11]: https://docs.x.com/x-api/compliance/streams/introduction
