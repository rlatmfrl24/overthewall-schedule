# 무료 우선 수집의 공식 X 복구·과금 제약 조사

- 확인일: 2026-11-03 KST. 로컬 코드 기준 `a6b9463111eba8c8a40a27856da55d2a74fce69e`.
- 범위: 공식 문서·현재 코드의 읽기 전용 조사. 사용자 요청의 RSS/JSON 8명 실측은 별도 보고서가 담당한다.
- 상태: 설계 선택을 돕는 조사이며 최종 설계·구현 승인 문서가 아니다. 구현·통합·배포, 공식 유료 호출, DB·설정·구독 변경, commit/push는 계속 보류한다.

## 결론

무료 수집으로 빠르게 공개하고 공식 타임라인으로 독립 대조하는 방향이 적절하다. 다만 **“누락만 저장”은 가능해도 “누락만 과금”을 뜻하지 않는다.** 양쪽 무료 경로가 모두 발견하지 못한 ID는 알려진 ID lookup으로 복구할 수 없기 때문이다. RSS/JSON의 상대 발견량은 실측으로 판단하되, 공식 대조를 생략할 근거로 바꾸지 않는다. [공식 타임라인](https://docs.x.com/x-api/posts/timelines/integrate), [ID lookup](https://docs.x.com/x-api/posts/lookup/introduction)

## 1. 공식 과금에서 설계가 지켜야 할 조건

현재 공개 단가는 반환 Post당 **$0.005**, User당 **$0.010**이다. 같은 UTC일 재조회는 중복 과금 제외 대상이나 자정에 초기화되고, X는 이를 예외가 가능한 soft guarantee로 설명한다. 무료 공급자로 먼저 확보한 글에 대한 할인·면제는 이 계약에 없다. 따라서 공식 응답에 이미 저장한 글이 섞여도 비용을 예상해야 한다. [공식 요금·중복 처리](https://docs.x.com/x-api/getting-started/pricing#deduplication)

**추론:** 같은 신규 글 40건 중 무료로 39건을 확보했더라도 공식 타임라인에서 40건을 처음 반환하면 Post Read 기준 $0.20의 가능성을 예산에 반영해야 한다. 저장 1건만 추가됐다고 $0.005로 계산하지 않는다. 실제 청구는 응답·확장 자원·UTC 경계 및 X의 중복 처리에 따라 별도 확인한다. [반환 자원 기준](https://docs.x.com/x-api/getting-started/pricing#read-operations)

일반 타사 멤버 8명에 app-owner 전용 Owned Reads 할인을 가정하지 않는다. 자동충전은 결제 보충 기능이고 예산 상한과 다르다. 기존 공통 UTC $1 목표·사이트 제한·선예약·정산과 자동충전 설정을 유지한다. 중복 과금 제외를 미리 확정해 예약액을 줄이지 않는다. [할인 자격·결제 설정](https://docs.x.com/x-api/getting-started/pricing#owned-reads)

## 2. 독립 발견과 알려진 ID 보강은 다른 작업이다

| 작업 | 공식 계약 | 권고하는 사용 범위 |
| --- | --- | --- |
| 독립 발견 | User Posts의 `since_id`·`until_id`·시간 범위, `pagination_token`; 페이지당 최대100 | 무료 경로가 모르는 ID를 정기적으로 발견. 무료 최신 ID를 공식 완료 위치로 복사하지 않음 |
| 알려진 ID 보강 | `/2/tweets`에 최대100개 ID | 무료로 발견했지만 본문·첨부·관계가 불완전한 후보만 묶어 확인. 아직 모르는 ID의 탐색으로 보고하지 않음 |
| 완료 판정 | `next_token`이 없어질 때까지 페이지 조회 | 저장·정산 성공 뒤 공식 완료 위치 갱신. 예산·오류로 끊기면 pending 보존 |

계약 근거: [타임라인 페이지·범위](https://docs.x.com/x-api/posts/timelines/integrate#pagination), [Get Posts 요청](https://docs.x.com/x-api/users/get-posts), [lookup 일괄 조회](https://docs.x.com/x-api/posts/lookup/introduction).

공식 User Posts도 최근 최대3,200건, 답글 제외 시800건으로 유한하다. 한도 밖 요청은 성공·빈 데이터일 수 있다. 답글을 보존하는 현재 공개 범위를 유지하며, 장기 중단·빠른 누적·지연 노출·삭제된 글까지 무누락을 약속하지 않는다. `24시간 주기`도 예산 차단·미완료 이월이 있으면 `24시간 이내 복구 보장`과 다르다. [공식 제한](https://docs.x.com/x-api/posts/timelines/integrate#volume-limits)

**설계 제안:** 필요한 첨부·답글·인용 필드를 정기 타임라인 응답에서 함께 확보하고, 이미 충족된 글에 자동으로 추가 lookup을 붙이지 않는다. ID 묶음은 요청 횟수를 줄이지만 반환 자원 요금 자체를 없애지는 않는다. 기존 공식 응답 재사용·멱등 정산·출처 우선 병합을 보존한다. [공식 필드·확장](https://docs.x.com/x-api/posts/timelines/integrate#fields-and-expansions), [현 수집 경로](../../worker/features/x-posts/infrastructure/x-collection.ts)

## 3. 웹훅 기본 Disabled와 관리자 재활성화

최신 요구는 **웹훅 기능은 남기고 기본 Disabled, 필요시 관리자가 활성화**다. 현재 브랜치의 coordinator `start()`는 기본 수집원이 `fxembed`면409를 반환하고 사이트 처리기도 활성화를 거절한다. 따라서 무료 기본 수집을 유지한 채 웹훅을 켜려는 요구와 기존 구현은 일치하지 않는다. 이는 요구 변경에 따른 설계 결정이며 이번 조사에서 코드를 수정하지 않는다. [coordinator](../../worker/features/x-posts/infrastructure/x-activity-coordinator.ts), [사이트 제어](../../worker/features/x-posts/infrastructure/x-activity-site.ts)

**제안:** 기본 수집원과 웹훅 사용 여부를 별개 제어로 표현한다. 수동 활성화는 인증된 관리자·해당 사이트·대상 계정에 한정하고 기존 예산 admission·감사·소유권 검사를 거친다. 기본 Disabled 상태를 cron·provider 장애·budget resume이 자동 활성화로 바꾸지 않도록 구분한다. 유료 구독 생성과 endpoint/CRC 보존도 구분해야 한다. 공식 구독은 별도 webhook ID와 caller tag를 사용하고 ID별 삭제 기능이 있다. [구독 생성](https://docs.x.com/x-api/activity/create-x-activity-subscription), [구독 삭제](https://docs.x.com/x-api/activity/deletes-x-activity-subscription)

웹훅 `post.create`는 전달 이벤트당 $0.005, `post.delete`는 비과금이다. 로컬 수신 후 무시하는 것만으로 원격 이벤트 과금이 중단된다고 보지 않는다. Disabled 적용은 소유 원격 구독의 중단과 readback을 포함해야 한다. 이미 전달·진행 중인 이벤트의 실제 비용은 보존한다. [이벤트 과금](https://docs.x.com/x-api/activity/event-pricing), [전체 요금 안내](https://docs.x.com/x-api/getting-started/pricing#webhook-events)

## 4. 비교 결과 뒤 선택할 현실적인 대안

아래는 미선택 제안이며 무료 주기·공식 복구 지연은 사용자 판단과 8명 실측 결과로 확정한다.

| 대안 | 이점 | 비용·안정성의 대가 |
| --- | --- | --- |
| RSS 발견 → 새/불완전 ID의 무료 JSON 보강 → 공식 독립 대조 | RSS가 한 번에 더 넓은 유효 범위를 보여 준 경우 클라이언트 왕복 감소 가능 | RSS의 작성자·관계 축약 때문에 검증/보강 요청 필요. XML 성공이 전체 탐색 완료를 뜻하지 않음 |
| JSON 기본 → RSS 저빈도 보완 → 공식 독립 대조 | 기존 신뢰 작성자·cursor·정규화·저장 경로 활용 | 상호 보완 ID가 적으면 RSS 주기마다 같은 일을 반복 |
| RSS와 JSON을 매주기 병렬 → 공식 독립 대조 | 짧은 관측에서 서로 다른 ID를 더 확보할 가능성 | 같은 공급자 장애는 공유. 외부 요청·처리·D1 부담을 늘릴 수 있어 추가 발견량으로 정당화해야 함 |

RSS 제약은 [공식 기능 조사](2026-11-03-fxembed-rss-tracking-review.md)를 따른다. RSS/JSON 중 어느 것을 우선할지는 실측 전 확정하지 않는다. 성공한 무료 스냅샷은 공식 완료 cursor·정기 대조 기준을 전진시키지 않는다. 계정별 실패·복귀는 기존 보호 경로를 재사용하고, HTTP200이어도 비정상적으로 오래된 목록·서로 다른 발견 결과는 관측 대상으로 남긴다. 모든 지연된 글을 판별하는 새 보장으로 표현하지 않는다.

공식 실행은 미완료 페이지 재개와 복구 필요 계정을 먼저 다루되 정기 독립 대조를 없애지 않는다. 오래된 실패 계정이 다른 계정의 예산을 계속 독점하지 않도록 공정성·사이트 제한을 유지한다. 과거 아카이브된 ID 구간 분할 재검사를 재개하지 않는다. [기존 보류 판단](../archive/2026-10-27-x-recovery-research/2026-10-27-x-recheck-readiness.md), [현 정책](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts)

## 검증·한계

공식 문서의 현재 공개 내용을 열고 현재 브랜치의 제어·예약 코드를 읽었다. 공식 API·Console에 인증하지 않았고 유료 반환량·실청구·웹훅 원격 상태·운영 안정성을 확인하지 않았다. 청구 표의 단가와 현재 계정별 적용 요금의 일치도 미확인이다. 비교 실측으로 얻을 수 있는 것은 그 관측 시간의 반환 집합·상대 미발견·클라이언트 요청 수이며, 공급자 내부 조회 수나 장기 절감률이 아니다.
