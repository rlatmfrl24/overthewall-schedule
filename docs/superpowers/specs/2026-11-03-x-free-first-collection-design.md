# JSON 기본·RSS 보완·공식 X 누락 복구 설계

- 작성일: 2026-11-03 KST. 검토 코드 기준 `a6b9463111eba8c8a40a27856da55d2a74fce69e`.
- 상태: **2026-11-03 계획 승인, Subagent-driven 구현·로컬 검증 진행. 배포·운영 전환·실제 유료 API 호출은 계속 보류.** 구체적인 실행 범위는 [현재 작업](../../current-work.md)이 우선한다.
- 사용자 확정: JSON 기본 + RSS 저빈도 보완. 무료 수집 우선, 공식 API로 누락 보완. 복구 허용 지연 24시간 이내. 웹훅 기능 보존·기본 Disabled·필요시 관리자 활성화.
- 작성자 제안: JSON 30분·RSS 6시간·공식 정기 대조 12시간 및 아래 처리 상한/관측 기준. RSS 파서용 직접 의존성 1개 한정 예외도 승인 대상이다. 방식 선택을 이 수치나 예외 전부의 승인으로 해석하지 않는다.

## 1. 의도와 성공 기준

월 약 $25–30의 X 수집 비용을 줄이면서, 대상 8명의 공개 피드와 기존 본문·첨부·답글·인용을 보존한다. 무료 공급자가 놓친 글은 독립 공식 타임라인이 발견하고 동일 X 글 ID로 병합한다. 관리자에게 무료 정상 상태와 공식 복구 지연·예산 차단을 각각 보여 준다.

사용자의 24시간 조건은 게시 시각부터 공개 저장까지의 복구 지연에 대한 수용 기준이다. **예산 부족·upstream 장애·늦은 노출 때문에 이를 넘으면 기준 미충족으로 보고한다.** 24시간 주기로 실행했다는 사실을 성공으로 대체하지 않는다. 알려지지 않은 글의 실제 누락 지연은 사전에 계산할 수 없으므로 공식 점검의 경과 시간은 위험 지표로, 나중에 복구한 글의 `storedAt - createdAt`은 관측 지연으로 구분한다.

기존 공통 UTC 하루 $1 목표·사이트 보호·보수적 선예약·정산·자동충전 설정과 D1/Queue guard를 유지한다. 이 제약 아래 24시간 상한을 항상 보장한다고 약속하지 않는다. 충족 불가능 시 지연/차단을 드러내고 관리자가 판단한다. 자동 예산 증액·웹훅 자동 활성화는 하지 않는다.

수집 활성화 이전 글의 일반 백필, 임의의 X 계정 수집, twscrape/개인 쿠키/헤드리스 로그인, 새로운 외부 수집업체, Play/AI 자동화 재개는 범위 밖이다. 과거 아카이브한 ID 구간 분할 재검사도 재개하지 않는다. 멤버 허용 목록·공개 범위·보관·삭제/redaction 정책을 유지한다.

## 2. 근거와 선택한 접근

[8명 실측](../../reports/2026-11-03-rss-json-comparison.md)에서 RSS 16요청/JSON 64요청은 모두 200이었다. 양쪽 모두 공개 기준 160건 중 같은 153건을 발견하고 7건을 놓쳤다. RSS 단독 13건은 모두 24시간 이전 글이다. 하루의 RSS는 대상 58→20건, 최근 24시간 44→20건으로 줄었지만 200이었다. JSON ID 집합은 두 관측에서 같았다. 약 4분 관측은 장기 안정성·청구 감소의 증거가 아니다.

| 접근 | 이점 | 대가 | 결정 |
| --- | --- | --- | --- |
| JSON 기본 + RSS 저빈도 보완 | 기존 numeric 작성자 검증·관계·cursor·저장 경로 활용. RSS에만 있는 ID 추가 발견 가능 | RSS도 같은 공급자이며 추가 요청·후보 검증이 필요 | **사용자 선택** |
| RSS 기본 + JSON 검증/보강 | 목록 HTTP 왕복 감소 가능 | 작성자 ID·관계 축약, 범위 축소/중간 실패를 완료로 오인할 위험, 후보별 보강 요청 | 미선택 |
| 매주기 RSS/JSON 병렬 | 항상 합집합 확보 | 이번 최근 24시간 창의 추가 발견 0건에 비해 중복 작업 증가 | 기본 구성에서 제외 |

RSS는 별도 독립 공급자가 아니다. 최대 100항목을 같은 타임라인에서 내부 병합하고 외부 cursor를 제공하지 않는다. 개별 ID 조회는 이미 알려진 ID를 확인할 뿐 미지의 ID를 발견하지 못한다. [공식 RSS 검토](../../research/2026-11-03-fxembed-rss-tracking-review.md), [공식 복구·과금 조사](../../research/2026-11-03-x-free-first-recovery-options.md)

## 3. 정상 진입점과 데이터 흐름

관리자는 기존 X 수집 관리 화면에서 무료 기본 모드로 전환한다. 공통 예산 초기화 → 해당 사이트 웹훅 Disabled → 소유 원격 유료 구독 중단/readback → 기본 수집원 저장 순서를 유지한다. 배포/migration만으로 전환하지 않는다.

이후 기존 Cron → Worker planner → native Workflow → Queue → 기능 소유 수집 use case → 출처 병합 → D1 → 기존 공개 피드/카드를 따른다. RSS용 별도 daemon·스케줄러·외부 큐·공개 조회 시 upstream fetch는 만들지 않는다. 모든 사이트는 기존 인증·사이트 경계와 수집 guard를 통과한다.

| 경로 | 책임 | 저장 출처 | 완료 상태 |
| --- | --- | --- | --- |
| Fx JSON timeline | 기본 발견·정규화·무료 저장 | `fxembed` | head 성공과 전체 cursor 탐색 완료 분리 |
| RSS → 무료 JSON 개별 검증 | 보조 ID 발견·이미 저장한 글 제외·검증 후 저장 | **검증된 JSON만 `fxembed`** | RSS 응답 확인·후보 처리 완료만 기록 |
| 공식 timeline/lookup | 독립 발견·미해결 ID 확인·공식 필드 보강 | `x_api` | 해당 공식 범위의 마지막 페이지 저장 성공 후 완료 |
| 관리자 활성 웹훅 | 선택한 사이트의 유료 이벤트 수신 | `webhook` | 기존 이벤트 멱등 처리·비용 정산 |

RSS HTML을 공개 카드 본문으로 직접 저장하지 않고 RSS를 새 권위 출처로 추가하지 않는다. 공식 확인 필드 → 웹훅 확인 필드 → Fx JSON 순서를 유지하며 불완전 응답은 정상 필드를 지우지 않는다. 숨김/삭제/공개 제한이 모든 출처보다 우선한다. 같은 내용·지표만 바뀐 재생은 posts/facts/references 재쓰기를 만들지 않는다. revision/CAS 충돌을 해결하지 못하면 실패로 남기고 진행 위치를 전진시키지 않는다.

## 4. 주기·계정별 공식 계획

초기 제안은 JSON 30분, RSS 6시간, 공식 정기 대조 12시간이다. 기존 매시 23·53분 점검에서 실행 자격을 판단하므로 벽시계 정확히 해당 간격의 실행을 보장하지 않는다. 현재 브랜치 공식 24시간과 달리 12시간은 24시간 수용 기준에 재시도 여유를 두기 위한 제안이다. 실제 비용 최적값으로 측정된 주기가 아니다.

공식 정기 실행 자격은 **계정별 `regular_completed_at`** 기준으로 판단한다. 완료 후 12시간이 지나면 다음 기존 점검의 정기 대상이다. 미완료 계정 하나가 사이트 전체 정기 anchor를 붙잡아 다른 계정의 다음 대조를 막지 않는다. 기존 사이트 `x_collection_last_run`은 legacy 공식 기본 모드/집계 호환 용도로 보존하고 무료 혼합 모드의 모든 계정을 묶는 gate로 쓰지 않는다. 사이트의 최종 전체 점검 표시는 계정 상태를 집계한 값이며 성공 계정의 다음 실행을 막는 기준이 아니다.

계정별 우선순위는 공식 pending 재개 → 정기 대조 → 장애 fallback이다. 같은 계정·같은 점검에 이중 유료 작업을 만들지 않는다. 계정 간에는 pending의 오래된 순서와 정기 대조 지연을 함께 고려하고 매번 같은 실패 계정이 전 예산을 독점하지 않도록 기존 사이트 보호·작업 공정성을 유지한다. backoff/lease/예산 때문에 실행 불가인 계정을 제외해도 다른 계정의 자격은 유지된다.

`scope=regular`로 시작한 범위가 여러 item/점검에 걸쳐 pending으로 이어져도 **원래 regular 범위임을 continuation에 보존**한다. 마지막 페이지 저장·필수 파생 저장·정산 성공 뒤에만 그 계정의 정기 완료를 기록한다. fallback/pending 단독 실행·Fx/RSS 성공은 정기 완료 시각을 갱신하지 않는다. 미완료 공식 cursor는 무료 복구 성공으로 버리지 않는다.

모드 전환 시 기존 공식 cursor·계정별 완료 이력을 보존한다. 공식 완료 이력이 없는 계정은 첫 정기 대조에 즉시 자격을 주되 유료 admission은 그대로 적용한다. 기존 기본 `x_api` 모드의 주기를 배포로 자동 변경하지 않는다.

## 5. JSON 기본 수집

현재 [Fx 수집기](../../../worker/features/x-posts/infrastructure/fx-collection.ts)를 유지한다. 매 실행 head를 읽고 저장된 pending cursor가 있으면 남은 처리량으로 이어 읽는다. 계정당 실행 최대 4페이지, 고정 Fx 호스트, 기존 15초 timeout/본문 문자열 길이 2,000,000 제한/수집 User-Agent/redirect 차단을 사용한다. 기존 문자열 길이 제한을 실제 wire bytes로 보고하지 않는다.

numeric 작성자 ID·설정 handle·공개 여부·날짜·미디어·payload code를 검증하고 다른 작성자 문맥·리포스트·중복을 제외한다. 비정렬이므로 오래된 ID 하나나 unchanged head를 만났다는 이유로 탐색을 완료하지 않는다. 수집 시작 시각 이전 글은 일반 백필하지 않는다. 시작 시각이 없으면 해당 계정의 기존 Fx 수집 시작 기준을 만들고 고정하는 정상 초기화 절차를 재사용한다.

account lease와 출처 저장을 재사용하고 durable 저장 성공 뒤만 cursor를 인정한다. D1/Queue guard가 막히면 남은 진행을 보존한다. 새 글이 없다는 정상 응답·lease 경합·사용자 중지·저장/예산 차단을 공급자 장애로 세지 않는다.

## 6. RSS 저빈도 보완과 후보 처리

RSS 요청은 고정 `https://fxtwitter.com/{handle}/feed.xml?count=100&with_replies=true`만 사용한다. 초기에는 RSS 2.0 한 형식만 도입하고 media-only/Atom/번역/safe 필터를 추가하지 않는다. 15초 timeout, 압축 해제 후 본문 2MB, redirect 거절을 적용한다. 본문은 상한을 넘으면 읽기를 중단하고, DTD·외부 entity를 허용하지 않는 XML 파서를 사용하며 regex만으로 XML을 해석하지 않는다.

**기존 제약에 대한 승인 대상 예외:** 현재 package에는 Worker용 직접 XML 파서 의존성이 없고 `saxes@6.0.0`은 jsdom을 통한 테스트 간접 의존성이다. 이를 미등록 직접 import로 제품에 끌어오지 않는다. 기존 계획의 “새 의존성은 추가하지 않는다”에서 **RSS 파서용 직접 의존성 1개만 허용**하는 예외를 제안한다. 패키지/버전은 구현 계획에서 공식 유지보수·라이선스·Worker bundle·CDATA/namespace·malformed XML·DTD 거절을 확인해 선택하고 승인된 범위를 벗어난 추가 패키지 선택은 하지 않는다. 개발 시점에 이미 잠긴 `saxes`도 [원본 저장소가 archived](https://github.com/lddubeau/saxes)이므로 자동 채택하지 않는다. 이 예외가 승인되지 않으면 JSON/공식/웹훅 설계는 유지하되 RSS 구현 계획 확정은 보류한다. 지금은 dependency 설치/manifest/lockfile 변경을 하지 않는다.

RSS는 다음 순서로 처리한다.

1. 현재 사이트의 정상 공개·활성 허용 멤버만 읽는다. GUID/link는 허용 X permalink 호스트·대상 handle·숫자 글 ID·유효 시각을 검사하고 중복/다른 작성자를 제외한다. feed의 작성자 이름으로 모든 항목을 멤버 글로 간주하지 않는다.
2. 이미 저장한 ID는 공개/숨김 여부와 관계없이 일괄 조회해 제외한다. 숨긴 글을 다시 등록하거나 RSS로 삭제를 취소하지 않는다. JSON 수집 시작 이전 항목도 제외한다. 이 단계의 RSS 시각은 후보 선별에만 쓰고 정식 저장 시각/작성자 권위가 아니다.
3. 남은 후보는 기존 scheduled item continuation에 최대 100개를 내구 저장한다. 각 후보는 ID·firstSeenAt·시각 힌트·attempt/nextAttempt/error만 가지며 본문·HTML 전체를 넣지 않는다. 새 RSS scan은 해당 계정의 이전 후보 item이 pending이면 만들지 않고 pending 처리를 우선한다. pending은 UI에서 보이며 새 feed 성공으로 덮지 않는다.
4. 후보 처리 item 한 실행은 계정당 최대 5개 무료 개별 JSON lookup(`https://api.fxtwitter.com/2/status/{id}`)을 수행한다. 다음 기존 30분 점검에서 나머지를 재개한다. 대상의 신뢰된 numeric 작성자 ID·handle·실제 생성 시각·공개 여부·리포스트 여부·첨부/관계를 검증한 결과만 기존 병합에 넣는다. 직전 DB 존재/가시성 확인과 lease/CAS fence도 적용한다.
5. HTTP/payload 일시 오류·404는 게시물 삭제 근거가 아니다. 재시도 가능한 후보를 보존하고 30분 이후 재시도한다. 잘못된 작성자·리포스트·범위 이전은 명시적 처리 제외 사유를 남긴다. 계정당 후보 100개 상한과 새 scan 억제로 backlog를 무한히 키우지 않는다. 한 계정의 RSS 처리는 다른 계정 JSON 수집/공식 복구를 막지 않는다.
6. 무료 후보 lookup 2회 실패 이후에도 남은 유효 후보는 공식 복구 후보로 표시한다. 먼저 다음 독립 공식 타임라인 결과로 충족되는지 확인하고, 그 범위의 공식 저장 완료 뒤에도 미해결이면 예산 내 공식 ID lookup으로 확인한다. 후보 `firstSeenAt + 24h`가 가까우면 pending/정기 복구와 함께 지연 우선순위를 높인다. X 생성 시각을 확인한 뒤 실제 24시간 기준 충족 여부를 별도로 판정한다.

공식 ID lookup은 기존 공식 fetch·예산 예약·정산·응답 재사용 경로로 묶고 최대100 IDs의 API 한도보다 실제 예산이 허용하는 작은 묶음을 우선한다. 동일 UTC일에 이미 성공한 응답/저장으로 후보가 충족됐다면 재요청하지 않는다. 공식 API에서 확인한 작성자와 허용 범위가 맞을 때만 저장한다. 이 fallback도 공통/사이트 예산·backoff·보관/삭제 정책을 우회하지 않는다. 공식의 not-found도 기존 삭제/redaction 정책에 따라 처리하며 임의 삭제 규칙을 추가하지 않는다.

RSS 후보는 정상 JSON/공식 저장 시 다음 후보 재개에서 충족으로 제거할 수 있다. 별도 RSS↔JSON 동기화 쓰기나 per-ID 작업/테이블을 만들지 않는다. 중복 scan/item 재전달이 있더라도 DB 존재 재확인·기존 멱등 저장으로 중복 카드·중복 유료 lookup을 막는다.

RSS `lastHttpSuccessAt`은 HTTP/유효 XML 수신, `lastCheckCompletedAt`은 해당 응답의 모든 후보가 저장/검증/명시적 제외로 처리됐다는 뜻이다. **둘 다 X 전체 목록 탐색 완료가 아니다.** raw/대상 개수 감소는 관측 주의 상태로 남기며 자동 삭제·공식 전체 완료·Fx fallback 횟수로 변환하지 않는다. 새 글이 없는 계정을 정상으로 인정한다.

## 7. 장애 전환·지연 상태

기존 계정별 Fx JSON 공급자 연속 실패 2회 → 해당 계정만 공식 2시간 fallback, JSON 조회·저장 연속 성공 2회 → fallback 해제를 유지한다. RSS 성공이 JSON 장애 횟수를 초기화하지 않으며 RSS 한 번의 짧은 목록이 추가 유료 fallback을 만들지 않는다. fallback도 기존 공식 pending·backoff·계정/사이트 예산에 종속된다.

공식 정기 완료가 12시간을 넘으면 due, 18시간을 넘으면 24시간 수용 기준 위반 위험, 24시간을 넘으면 공식 대조 지연을 표시한다. 이 구분은 작성자가 제안한 운영 기준이다. 개별 실제 복구 지연이 24시간을 넘으면 별도의 기준 미충족으로 기록한다. 점검 경과 시간만으로 실제 누락 수 0/유무를 꾸미지 않는다.

오류의 원인을 provider/D1 guard/Queue guard/lease/예산/backoff/사용자 중지로 구분한다. 관리자 상태 API는 기존 작업 결과·원장·source 상태를 읽고 새 관측용 쓰기·외부 호출을 만들지 않는다. 알림용 새 서비스/자동화는 범위 밖이며 기존 관리 화면에서 확인할 수 있게 한다.

## 8. 웹훅 Disabled와 명시적 활성화

`primarySource`와 **웹훅을 원하는 상태(desiredEnabled)**를 별개로 관리한다. 무료 기본 모드에서도 인증된 해당 사이트 관리자가 기존 확인 절차와 예산/소유권 검사를 거쳐 웹훅을 켤 수 있어야 한다. 현재 [coordinator](../../../worker/features/x-posts/infrastructure/x-activity-coordinator.ts)와 [사이트 처리기](../../../worker/features/x-posts/infrastructure/x-activity-site.ts)의 Fx 기본 start/resume 409는 이 동작과 다르므로 후속 구현 수정 대상이다.

모드 전환 진행 중의 start/resume 거절은 유지한다. 관리자 disable·enable·source 전환과 remote reconcile은 사이트 제어의 동일 직렬화/버전 fence를 거치고, 오래된 reconcile 결과가 최신 desired 상태를 뒤집지 못하게 한다. 이미 외부 요청이 진행 중이면 비용을 정산하고 최신 상태에 맞춰 remote 구독을 재조정한다. 직렬화의 구체적 방식은 기존 coordinator/RPC 경계에 맞춰 구현 계획에서 정한다.

| 상태/행동 | 제어 규칙 |
| --- | --- |
| 처음 무료 기본 모드로 전환 | desired Disabled·로컬 신규 유료 보강 차단 → 해당 사이트에만 필요한 소유 원격 구독 중단/readback → 모드 저장 |
| 원격 중단 실패 | Disabled 요청/전환 실패와 원격 잔존을 표시. 전환 성공·원격0으로 보고하지 않고 자동 재활성화하지 않음 |
| 기본 Disabled 이후 cron·Fx 장애·UTC 예산 리셋 | desired Disabled 유지. subscription 생성/자동 start 없음 |
| 관리자가 명시적으로 활성화 | desired Enabled 기록·감사 후 기존 remote reconcile. 무료 기본 수집/공식 독립 대조도 계속 유지 |
| desired Enabled 상태의 예산 pause | 유료 구독/새 보강은 기존 보호에 따라 중지. 기존 허용된 budget resume은 desired가 여전히 Enabled인 경우만 가능 |
| 관리자가 비활성화 | desired Disabled를 먼저 고정. 이미 과금/진행 중인 이벤트는 멱등 정산 보존, 미시작 보강은 사유와 함께 제외 |
| 이미 Fx인 상태에 동일 primarySource 요청 | 명시적 활성화 상태를 뜻밖에 해제/재설정하지 않음. 웹훅 변경은 별도 관리자 행동 |
| 기본 수집원 `x_api` 복귀 | 공식 cursor·저장·장부·desired 상태 보존. Disabled를 자동 Enabled로 바꾸지 않음 |

원격 webhook endpoint·CRC·secret·코드·설정·이력을 보존하며 미사용 endpoint를 자동 삭제하지 않는다. 다른 사이트가 공유하는 계정 구독은 삭제하지 않고 해당 사이트의 수신/보강만 차단한다. 현재 분리된 8명은 해당 사이트 소유 활성 구독0을 확인하되, 향후 공유가 있으면 타 사이트 사용 구독과 해당 사이트 활성 상태를 구분한다.

Disabled는 로컬 처리 skip만을 뜻하지 않는다. 원격 유료 subscription의 중단과 authoritative readback이 필요하다. 원격에 이미 전달돼 과금된 이벤트는 로컬 skip로 비용이 사라지지 않는다. 수신 당시 Disabled인 이벤트를 나중에 수동 활성화했다는 이유로 신규 유료 보강으로 재생하지 않는다.

## 9. 비용·D1/Queue 보호

공식은 반환 자원 기준으로 과금하므로 무료로 확보한 글이 공식 대조에 다시 반환될 수 있다. 공식 단가의 Post Read $0.005를 적용한 100개/일은 월30일 $15, 200개/일은 $30인 **Post Read만의 산술 예시**다. 사용자/확장 자원·이벤트·UTC 재조회·현재 계정 실제 요금을 포함한 견적이 아니다. 같은 UTC일 중복 차감 제외도 soft guarantee이므로 선예약을 깎는 근거로 쓰지 않는다. [공식 요금](https://docs.x.com/x-api/getting-started/pricing)

따라서 비용 개선은 기본 웹훅 유료 이벤트 중단, 불필요한 profile/lookup 중복 억제, 성공 응답 재사용, 같은 계정 유료 작업 합치기, 실패 backoff와 내구 pending으로 평가한다. 필요한 필드를 제거하거나 RSS 최신 ID를 공식 완료로 복사해 비용을 낮추지 않는다. 공식 12시간은 요청 횟수를 늘릴 수 있으며 비용 감소를 미리 확정하지 않는다.

무료 JSON은 최대4페이지×8명×48회=1,536 목록 요청/일, RSS는8명×4회=32 목록 요청/일이라는 상한 예시다. 실제 중단/완료/지연에 따라 다르고 후보 lookup은 별도다. RSS 내부 호출도 측정하지 않았으므로 이 수치로 공급자 전체 부하·청구를 계산하지 않는다. 동시 외부 호출은 초기 최대2, RSS 후보 lookup은 계정/실행당5로 제한한다.

RSS pending은 계정당 한 응답의 최대100 후보로 제한하고 30분마다 최대5개 처리한다. 처리 중에는 새 RSS scan을 합치지 않는다. JSON 기본 수집은 계속되며 공식 대조가 후보를 충족할 수 있다. 처리율보다 backlog가 크거나 guard로 재개하지 못하면 RSS 지연을 표시한다. 사라진 후보를 성공 처리해 정상처럼 만들지 않는다.

실제 쓰기는 기존 저장/작업의 필요한 결과와 RSS 계정 요약 갱신에 한정한다. 공개/관리 GET, 차단된 실행 자격 조회, RSS와 겹치는 기존 글 때문에 per-post 재쓰기를 만들지 않는다. D1/Queue 차단이 우선하며 미완료 진행을 보존한다. 공통 예산 초기화는 webhook start와 분리돼 REST admission이 독립 동작해야 한다.

## 10. 계약·데이터와 영향 범위

기존 `x_collection` 작업 유형과 `provider: fxembed | x_api`를 유지한다. item continuation에 `mode: timeline | rss_candidates`를 구분하고 mode 없는 이전 작업은 timeline으로 해석한다. RSS는 Fx 제공 경로의 보완 작업이며 `primarySource`의 세 번째 선택지로 노출하지 않는다. 기존 수동 실행에서 provider 생략은 공식 API이며 `scope=pending`을 보존한다. RSS 수동 실행용 새 공개 endpoint는 추가하지 않는다.

RSS 요약/cadence는 계정별 Fx source에 additive 필드로 관리한다. 최소 의미는 RSS 마지막 시도·성공 응답·후보 처리 완료·정기 anchor·최근 오류·raw/후보 개수다. 기존 JSON 성공·전체 완료·실패 횟수 필드를 재사용하지 않는다. pending 후보 상세/원래 정기 scope는 기존 scheduled item continuation에 저장한다. 신규 별도 candidate 테이블이나 신규 큐는 기본 설계에 없다. 정확한 column/type은 구현 계획에서 정하며 Drizzle SQL/metadata와 전체 migration 체인을 함께 관리한다.

[상태 계약](../../../contracts/x-collection.ts)의 primary JSON·공식·웹훅에 RSS 별도 요약과 계정별 nominal due/실제 실행 자격·차단 이유·대조 경과를 더한다. 같은 공급자임을 표현하고 RSS의 HTTP 성공을 기본 JSON/공식 정상으로 합치지 않는다. [기능 소유 application](../../../worker/features/x-posts/application/x-collection-service.ts) 및 HTTP/RPC adapter가 기존 관리자 인증/사이트 경계를 유지한다. 공개 게시물 DTO와 공개 D1 전용 읽기는 바꾸지 않는다. 공개 신선도는 실제 검증/저장된 JSON/공식 상태로 판단하고 RSS HTTP 성공만으로 최신이라고 표시하지 않는다.

후속 구현 영향은 다음 범위다. RSS XML 파서용 직접 의존성 1개 외에는 새 의존성을 추가하지 않는 제안이다. 파서의 전이 의존성도 잠금/검토 대상으로 포함하며 실제 패키지 선택 전에 dependency tree를 확인한다.

| 범위 | 실제 연결/검증 대상 |
| --- | --- |
| `worker/features/x-posts` | RSS adapter·후보 use case·기존 개별 Fx 파서 재사용·병합/lease·계정별 hybrid 정책·공식 응답 재사용·webhook coordinator/site |
| `worker/features/scheduled-operations`, `worker/platform/scheduled-jobs` | RSS mode 계획/재개·실행/최종화·regular 출처 보존·계정별 due·결과 read model |
| `contracts/x-collection.ts`, `contracts/scheduled-operations.ts` | continuation 호환·RSS 상태·계정별 일정/차단·기존 수동 provider 기본값 |
| `worker/app`·기능 HTTP adapter | 기존 제어·RPC readback/감사·인증·사이트 경계. 공개 카드 조회에 외부 호출 추가 금지 |
| `src/features/member-posts/ui/admin`·관련 API 소비자 | JSON/RSS/공식/웹훅 별도 상태, 관리자 수동 웹훅 활성화, 지연/예산 표시 |
| `db/schema`·Drizzle migration/meta | RSS 요약 additive 필드·기존 source/커서/장부 보존·배포만으로 운영 상태 변경 금지 |
| 해당 단위/통합/native/UI fixture | 200 짧은 RSS·문맥·중복·새 ID·재전달·권위/CAS·멀티사이트/예산/주기 의미 |

## 11. 검증과 향후 운영 판단

구현 승인 후의 정상 대표 흐름은 관리자 무료 모드 전환 → owned remote 상태 확인 → 정상 Cron/Workflow/Queue → 실제 JSON 수집·RSS 후보 발견/무료 JSON 검증 → D1 저장 → 공개 카드 readback이다. RSS 후보 ID를 SQL로 주입하거나 알려준 ID의 개별 조회만으로 전체 발견 성공을 주장하지 않는다. 실응답에서 RSS 추가 후보가 없으면 그 사실을 보고하고 fixtures만으로 실운영 보완 효과를 주장하지 않는다.

공식 독립 복구는 무료 목록에서 안 보인 ID를 **정상 공식 timeline**이 발견하는 경로로 검증해야 한다. 공식 lookup 성공은 별도다. 실제 유료 검증/원격 변경은 별도 승인된 릴리스에서만 수행한다. 현재 무료 실측과 과거 로컬 혼합 검증으로 이 완료 기준을 충족했다고 표시하지 않는다.

필수 회귀는 200 RSS 목록 축소·타 작성자/리포스트 제외·유효 후보 검증·개별 조회 실패 후 후보 보존·동시 JSON 저장 후 중복 제거·숨김 복원 금지·공식 권위 보존·RSS pending이 공식 커서를 바꾸지 않음·계정 하나의 지연에도 다른 계정12시간 자격 유지·regular pending 완료 의미·예산/UTC 이월·Disabled 자동 재구독 없음·관리자 Fx 모드 웹훅 활성화·타 사이트 구독 보존이다.

합성 회귀/타입/구조/변경 lint·양 사이트 빌드·로컬 migration/doctor는 변경 범위에 맞춰 실행한다. 최종 병합 준비에서만 preflight를 실행한다. 실운영 전환은 승인된 릴리스에서 OTW→LuvDia 관리자 정상 경로로 수행하며 원격 구독·실제 Worker 저장·공개 readback을 각 사이트에서 확인한다.

승인된 정상 운영 후 초기7일은 기존 실행 결과/원장을 읽어 다음을 평가한다. 별도 강제 유료 실험·새 자동화·관측 전용 D1 쓰기를 만들지 않는다.

- RSS 추가 발견 ID와 JSON 검증 후 실제 새 저장 ID, 최근24시간 추가 기여, 후보 lookup 요청 수.
- RSS raw/대상 범위 축소, pending 후보 나이, JSON/공식 계정별 성공·실패·backoff·완료 경과.
- 공식만 발견한 새 ID·복구 지연 및24시간 초과, 예산 때문에 미완료인 계정/페이지.
- 기존 원장의 반환 자원/사용·예약액과 X 실제 청구. 내부 추정과 청구를 섞지 않는다.
- D1/Queue 사용과 동일 응답의 불필요한 재쓰기 유무.

7일간 RSS의 최근24시간 추가 저장이0이어도 자동 주기 변경/제거하지 않는다. 추가 발견당 요청과 지연을 보고한 뒤 저빈도 간격을 유지/늘릴지 관리자가 판단한다. 7일은 장기 안정성 보증 기간이 아니다.

롤백은 관리자 기본 수집원을 `x_api`로 변경한다. 데이터·공식 cursor·원장·이미 발생한 비용은 되돌리지 않는다. RSS/JSON 보조 정기 작업은 해당 모드 실행을 멈추고, 운영자가 Disabled로 둔 웹훅은 그대로 유지한다. 이미 명시적으로 Enabled인 웹훅의 중지는 별도 관리자 행동이다. rollback/회원 숨김/수집중지 중 pending candidate가 공개 저장을 만들지 않도록 실행 시 현재 모드·허용 상태를 재검사한다.

## 12. 승인할 때 확인할 작성자 판단

선택된 접근은 사용자 결정이다. **JSON30분/RSS6시간/공식12시간, RSS 후보100개·실행당5 lookup·외부 동시2, 공식18시간 주의/24시간 지연, 초기7일 관측**은 구현 계획을 구체화하기 위한 작성자 제안이다. **RSS XML 파서용 직접 의존성 1개 예외**도 기존 무의존성 추가 조건에서 달라지는 미승인 제안이다. 24시간 복구 요구와 예산 제약이 충돌할 때 자동으로 예산을 늘리거나 성공으로 완화하지 않는다.

Builder Check: 별도 검토자는 초안과 관련 코드를 읽고 `nothing important left`를 반환했다. 파서의 직접 의존성 부재를 추가 확인해 승인 대상 예외로 명시한 수정본도 검토했고 같은 결과를 반환했다. 이는 runtime 검증/구현 승인 판정이 아니다.

설계 검토·승인과 구현/통합/배포 재개는 별도다. 현재는 문서 작성·검토만 수행한다. 승인 후에도 사용자의 보류 해제 없이 제품 코드·의존성·DB·설정·원격 구독·유료 호출·commit/push/PR/merge/deploy를 진행하지 않는다.

## 13. 계획 단계의 구체화 — 승인 대기

사용자가 writing-plans로 검토·계획 작성을 요청해 [7개 작업의 구현 계획](../plans/2026-11-03-x-free-first-collection.md)을 작성했다. 다음은 기존 의도를 구현 경계로 구체화한 작성자 판단이며 구현/운영 승인이 아니다.

- 배포만으로 기존 Fx 모드에 RSS/12시간 정책을 켜지 않도록 관리자 적용 표식 `x_collection_hybrid_policy='rss_v1'`과 적용 시각을 저장한다. 같은 관리자 PATCH를 사용하며 명시적 웹훅 Enabled를 덮어쓰지 않는다.
- 공식 원래 범위 scope/시작 시각을 source에 내구 저장하고 RSS 후보는 lease 조건 checkpoint와 source의 최신 pending item pointer로 다음 Cron에 재개한다. 후보가 남은 item/run은 완료 이력 정리로 유실되지 않게 한다. 기존 보관 기간·삭제 정책은 유지한다.
- 파서 후보는 직접 의존성 **`@rgrove/parse-xml@5.1.0`** 한 개다. 공식 문서·배포 metadata에서 ISC·전이 의존0·Node 요건을 확인했으며 실제 Worker bundle/runtime 검증은 계획의 필수 단계다. 기존 의존성 예외는 여전히 승인 대기이고 설치하지 않았다.
- provider가 Fx인 RSS item도 공식 후보 보완 비용이 발생할 수 있으므로 `mode`·`paidApiCalls`로 관리 결과를 구분한다. 비용을 무료로 표시하거나 공식 완료 시각을 후보 lookup으로 갱신하지 않는다.

정확한 파일·타입·테스트·작업 경계와 미래 실행 명령은 계획서를 따른다. 계획 작성 요청이 설계 제안값·XML 예외 승인이나 보류 해제를 뜻하지 않는다.
