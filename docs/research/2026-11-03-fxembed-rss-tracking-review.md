# FxEmbed RSS·Atom 및 멤버 새 글 추적 검토

- 검토일: 2026-11-03 KST
- 범위: FxEmbed 공식 문서·공개 원본과 제한된 공개 GET 응답을 읽어, 기존 JSON 혼합 수집보다 RSS가 나은 발견·추적 경로인지 검토한다.
- 로컬 코드 기준: `a6b9463111eba8c8a40a27856da55d2a74fce69e`. 기존 혼합 수집은 구현된 상태이며, 이번 요청에 따라 통합·배포·추가 구현은 보류한다. [현재 작업](../current-work.md), [선행 검토](2026-11-03-x-fxembed-hybrid-review.md)
- FxEmbed 원본 기준: 조사 당시 `main`의 [`f6a2ca986cfdc3728fe826abe124a107ebd82c46`](https://github.com/FxEmbed/FxEmbed/commit/f6a2ca986cfdc3728fe826abe124a107ebd82c46), commit 시각 `2026-11-03T05:52:53Z`. 아래 소스 링크는 이 commit에 고정한다. 공개 서비스가 이 commit과 정확히 같은 배포인지는 확인하지 않았다.
- 판정 표기: **문서**는 공식 공개 계약, **소스**는 위 원본의 구현, **관측**은 이번 공개 응답, **판단**은 이를 OTW 요구에 대입한 추론이다.

## 결론

**RSS·Atom은 실제 제공되는 편리한 구독 기능이다. 그러나 현재 JSON 수집을 더 완전한 독립 발견원이나 실시간 push로 바꾸는 기능은 아니다.** RSS는 같은 FxEmbed 프로필 타임라인 공급자를 내부에서 여러 페이지 읽고 XML로 축약한다. HTTP 한 번에 더 많은 항목을 받을 수 있다는 이점은 있으나, 총 100개 창·외부 재개 cursor 부재·일부 실패의 HTTP 200 처리 때문에 기존의 페이지 지속·오류 관측을 대체하면 퇴행할 수 있다. [공식 RSS 안내](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/), [RSS 호출 경로](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts#L143-L192), [내부 페이지 병합](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L223-L320)

**현재의 JSON 기반 Fx 30분 + 독립 공식 X 24시간 대조 구조를 RSS 때문에 교체하거나 공식 대조를 제거할 근거는 찾지 못했다.** 개인 RSS 리더에서 멤버 글을 받아 보는 목적에는 적합하다. OTW의 본문·첨부·답글·작성자 확인·미완료 재개를 맡길 수집원으로는 JSON이 현재 요구에 더 직접적이다. 이는 도입 판단이며 구현 변경은 하지 않는다. [현 JSON 요청·검증](../../worker/features/x-posts/infrastructure/fx-api.ts), [현 cursor 저장·재개](../../worker/features/x-posts/infrastructure/fx-collection.ts), [독립 공식 대조 정책](../../worker/features/x-posts/infrastructure/x-hybrid-policy.ts)

## 1. 공식 제공 범위

아래 주소는 로그인이나 구독 등록 절차 없이 RSS 리더에 추가하는 공개 피드다. 문서는 이를 클라이언트가 주기적으로 읽는 기능으로 소개한다. `fixupx.com` 등 같은 X realm 도메인으로 바꿀 수 있다. [공식 RSS 안내](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/)

| 목적 | RSS 2.0 | Atom |
| --- | --- | --- |
| 프로필 최근 목록 | `https://fxtwitter.com/{handle}/feed.xml` | `https://fxtwitter.com/{handle}/feed.atom.xml` |
| 미디어 목록 | `https://fxtwitter.com/{handle}/media.xml` | `https://fxtwitter.com/{handle}/media.atom.xml` |

| 항목 | 확인한 동작 | OTW에서의 의미 |
| --- | --- | --- |
| `count` | **문서·소스:** 기본 90, 1–100으로 제한 | 100개가 모두 대상 멤버의 새 글이라는 뜻은 아님 |
| `with_replies` / `withReplies` | **문서:** 답글 포함 옵션. **소스:** 두 피드 모두 생략 시 false | 답글 유지가 필요하면 `with_replies=true`를 명시해야 함 |
| 리포스트 | **문서:** 프로필 API가 반환한 원문·리포스트 포함. **소스:** feed query에 리포스트 제외 옵션 없음 | 기존 작성자·리포스트 필터를 피드 이름만 믿고 제거하면 안 됨 |
| `safe` | 민감한 글과 인용 본문을 숨김 | 필터 후 항목 수가 `count`보다 적을 수 있고 수집 범위를 줄임 |
| `lang` / `language` | 번역 요청. 문서가 번역 동작의 불확실성을 명시 | 원문 보존 수집의 완전성 개선 근거가 아님 |

위 표의 문서 범위는 [RSS 안내](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/), 기본값·허용 query는 [feed query 파서](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts#L19-L51), 답글 공급자 선택은 [프로필 statuses 구현](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L51-L109)으로 확인했다. 미디어 피드는 별도 `UserMedia` 탭을 읽으며 기본적으로 답글을 걸러낸다. 따라서 일반 글 전체를 추적할 때 `media.xml`로 바꾸면 본문만 있는 글을 잃는다. [미디어 공급자·필터](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L402-L504)

## 2. JSON과 같은 upstream, 다른 페이지 제어

**소스:** JSON `/2/profile/{handle}/statuses`는 `profileStatusesAPI`에 count·cursor·답글 옵션을 전달한다. RSS는 `profileStatusesAPIPaginated`를 통해 같은 함수를 반복 호출한다. 그 아래에서는 X의 `ProfileTimeline` / `UserTweets` 또는 답글 포함 변형을 선택한다. 독립적인 RSS 전용 새 글 저장소나 전달 이벤트를 읽는 구조가 아니다. [JSON route](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/api/routes/twitter.ts#L218-L273), [공통 프로필 함수](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L51-L109), [RSS wrapper](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L300-L320)

**소스:** RSS 내부에서는 페이지당 count 100을 요청하고 `cursor.bottom`을 따라 최대 10페이지를 읽으며 ID 중복을 제거한다. 목표 90개 또는 요청한 최대 100개를 채우면 멈춘다. 첫 cursor는 매 요청 null이다. 목표 달성·빈 페이지·cursor 종료/반복·페이지 한도 중 하나로 끝난다. **100개는 멤버 작성자 필터 이후 수가 아닌 공급자 결과 수에 대한 창이다.** [페이지 병합 전체](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L223-L320)

| 비교 | 기존 OTW JSON 구현 | RSS 구현 |
| --- | --- | --- |
| 한 번의 외부 요청 | 현재 count 20; upstream 문맥에 따라 결과 수가 달라질 수 있음 | 내부 페이지를 병합해 요청한 최대 100개를 목표로 함 |
| 다음 페이지 | JSON cursor를 읽어 저장·재개 | 내부에서만 사용하며 XML에는 내보내지 않음 |
| 미완료 | 현재 계정별 cursor·오류·pending 보존 | 외부 호출자가 범위 종료와 내부 중단을 구분하기 어려움 |
| 중간 페이지 실패 | 현재 호출 실패가 공급자 실패/미완료로 남음 | 이미 받은 항목이 있으면 loop를 끝내고 code 200 목록 반환 가능 |

기존 구현은 한 실행에서 최대 네 페이지를 처리하고, 다음 실행에서도 미완료 cursor를 보존하며 최신 첫 페이지 확인을 병행한다. [현 collector](../../worker/features/x-posts/infrastructure/fx-collection.ts), [현 요청](../../worker/features/x-posts/infrastructure/fx-api.ts). RSS의 내부 오류 처리와 code 200 반환은 [원본 246–292행](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L246-L292), XML 응답 처리는 [feed route](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts#L165-L192)에서 확인했다. 이 문서는 기존 구현의 재리뷰나 신규 수정 요청을 대신하지 않는다.

**소스:** RSS query 파서는 `cursor`, `since`, `since_id`, `until_id`를 읽지 않는다. XML에도 다음 페이지 링크·cursor·범위 완료 표시가 없다. 주소에 이런 query를 덧붙여도 현재 피드 함수의 재개 조건이 되지 않으며 self-link에 문자열이 보존되는 것과 동작 지원은 다르다. 반면 JSON은 cursor와 첫 페이지의 `since` 최신성 조건을 제공한다. JSON `since`도 공식 X `since_id`와 같은 완료 범위 계약은 아니다. [RSS query·self-link](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts#L30-L126), [XML 출력 전체](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L238-L343), [JSON since 처리](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/api/routes/twitter.ts#L218-L260)

**판단:** RSS의 내부 병합은 클라이언트 왕복·페이지 작성 부담을 줄일 수 있다. 하지만 동일 공급자에서 페이지를 더 읽은 효과와 새로운 독립 발견원의 효과를 구분해야 한다. 장애·빠른 게시·긴 중단으로 창을 넘은 글, 공급자 자체의 미발견 글이 RSS로 모두 복구된다는 근거는 없다. RSS 성공을 기존 공식 완료 cursor를 전진시키는 근거로 삼으면 안 된다. [같은 공급자·유한 병합](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L223-L320), [독립 완료 위치의 선행 판단](2026-11-03-x-fxembed-hybrid-review.md)

## 3. RSS가 보존하는 정보와 잃는 구조

| 데이터 | 소스에서 확인한 XML 표현 | 추적·수집상 한계 |
| --- | --- | --- |
| 항목 식별자 | RSS `guid`와 Atom entry `id`는 원문 permalink URL | 숫자 Post ID·작성자 ID 객체가 그대로 전달되는 것은 아님 |
| 시각 | `created_timestamp`를 RSS `pubDate`, Atom `published`·`updated`에 모두 사용 | `updated`가 편집 시각이나 마지막 수집 시각이라는 뜻이 아님 |
| 피드 시각 | 항목의 최대 생성 시각을 `lastBuildDate` / feed `updated`에 사용 | 같은 최신 글 아래의 편집·지연 노출을 이 시각 하나로 판별할 수 없음 |
| 본문·인용 | HTML 본문; 인용은 링크와 최대 280자 요약 | JSON 관계 객체·인용 본문 전체와 동등하지 않음 |
| 미디어 | HTML에 여러 첨부를 표현하고, enclosure는 첫 적합 첨부 하나 | enclosure 하나만 읽으면 여러 사진·영상의 전체 목록이 아님 |
| 영상 | progressive MP4 우선, HLS 제외; 가능하면 poster thumbnail | JSON의 전체 formats·크기·식별자 정보를 보존하지 않음 |
| 작성자·답글·리포스트 | Atom 작성자는 feed 수준; item에 JSON author/replying_to/reposted_by 구조를 출력하지 않음 | 현재의 계정 ID 확인·문맥/리포스트 제외를 그대로 대체할 수 없음 |

이 표는 [항목 변환·생성 시각](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L211-L235), [HTML 본문·인용](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L176-L208), [enclosure 선택](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L84-L173), [RSS·Atom 출력](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L238-L343)을 대조했다. 따라서 RSS로 ID만 발견한 후 JSON으로 다시 보강하는 안은 추가 경로와 외부 조회를 만들며, 현재 JSON을 직접 읽는 구현보다 단순하거나 싸다고 입증되지 않았다. [현 검증·정규화](../../worker/features/x-posts/infrastructure/fx-api.ts)

## 4. 캐시·304와 조회 주기

**소스:** 정상 피드 응답은 `Cache-Control: public, max-age=120`이며, 실패는 `no-store`다. 전역 Worker cache middleware는 일반 GET 캐시 조회·저장을 수행하고 API realm의 read-through는 건너뛴다. 이것은 RSS의 캐시 활용 여지이지만 120초마다 새 글을 보장한다는 계약은 아니다. [피드 헤더](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts#L173-L192), [전역 cache 등록](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/worker.ts#L250-L251), [캐시 처리](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/caches.ts#L43-L99)

**문서·소스:** 확인한 RSS 안내에는 별도의 권장 polling 주기·허용 요청량·재시도 SLA가 없다. 확인한 feed route·serializer·cache middleware에는 ETag/Last-Modified 생성이나 `If-None-Match` / `If-Modified-Since` 비교·304 응답 로직이 없다. 다만 Cloudflare 앞단과 미래 배포를 포함해 서비스 전체에서 절대 304가 없다고 단정하지 않는다. API v2의 공식 1 IP당 분당 1,000회 한도를 RSS 별도 보장으로 옮겨 쓰지도 않는다. [RSS 안내](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/), [feed route](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/twitter/routes/feed.ts), [cache middleware](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/caches.ts), [API 한도](https://docs.fxembed.com/api/introduction/#rate-limiting)

**판단:** 동일 30분 polling이면 RSS라는 형식만으로 발견 지연이 짧아지지 않는다. 짧은 주기로 바꾸면 기회는 늘지만 외부 요청·내부 다중 페이지 작업이 늘며, 순간 생성 후 삭제된 글을 보장하지도 않는다. 여러 리더가 같은 캐시를 쓰면 upstream 작업을 줄일 가능성은 있으나 실제 cache hit·내부 호출량·운영 비용을 측정하지 않았으므로 절감액을 확정하지 않는다. [유한 목록·내부 호출](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L223-L320), [캐시 경로](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/caches.ts#L65-L99)

## 5. 새 글 push·WebSub·멤버 추적 기능의 확인 범위

**문서·소스:** 조사한 공식 RSS 안내와 X 공개 API route 목록에는 멤버 새 글을 받을 WebSub hub, callback 구독, webhook 등록, SSE 또는 WebSocket 구독 계약이 확인되지 않았다. RSS·Atom XML도 `rel="hub"`를 출력하지 않는다. 따라서 이번에 확인한 사용 방식은 **계정별 피드를 polling하고 기존 항목과 비교하는 구독**이다. RSS 리더나 자동화 도구가 이를 알림으로 보여 주는 것과 FxEmbed가 직접 새 글을 push하는 것은 별개다. [RSS 안내](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/), [X API route 등록](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/realms/api/router.ts#L69-L101), [XML 링크 출력](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts#L238-L343)

정확한 탐색 범위는 위 commit의 `src/`, `packages/atmosphere/src/`, `docs/src/content/docs/` 아래 `.ts`, `.mdx`, `.md`, `.json` **284개 파일**이다. 공식 tarball을 메모리에서 읽고 `websub`, `pubsubhubbub`, `webhook`, `event-stream`, `server.sent`, `websocket`, ETag·Last-Modified·조건부 헤더·304 관련 문자열을 검색했다. webhook 일치는 공급자 실패 예외를 알리는 Discord 경로였으며, 이것을 새 글 구독으로 해석하지 않았다. 외부 비공개 서비스·미공개 계획·별도 프로젝트 전부의 부재를 주장하는 조사는 아니다. [검토 snapshot](https://github.com/FxEmbed/FxEmbed/tree/f6a2ca986cfdc3728fe826abe124a107ebd82c46), [예외 알림 설정](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/docs/src/content/docs/deployment/configuration.mdx#L89-L97), [Discord 실패 알림 구현](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/proxy/discord.ts#L49-L106)

## 6. 제한된 공개 실응답 관측

2026-11-03 `07:16:16.676Z`에 대표 멤버 `binghayu`에 대해 아래 공개 주소를 GET했다. 로그인·개인 쿠키·공식 유료 X API는 사용하지 않았고 수집기·DB에 넣지 않았다. 값은 이 시점의 관측이며 장기 안정성이나 영구 계약이 아니다.

| 주소·옵션 | HTTP | 항목 | 본문 UTF-8 크기 | 주요 헤더 |
| --- | ---: | ---: | ---: | --- |
| [RSS `count=20&with_replies=true`](https://fxtwitter.com/binghayu/feed.xml?count=20&with_replies=true) | 200 | 20 | 10,212 bytes | `public, max-age=120` |
| [Atom 같은 옵션](https://fxtwitter.com/binghayu/feed.atom.xml?count=20&with_replies=true) | 200 | 20 | 11,333 bytes | `public, max-age=120` |
| [JSON 같은 옵션](https://api.fxtwitter.com/2/profile/binghayu/statuses?count=20&with_replies=true) | 200 | raw 27, 대상 작성자·비리포스트 16 | 84,827 bytes | 다음 cursor 있음 |

두 XML 응답에서 `ETag`, `Last-Modified`, HTTP `Link` 헤더를 관측하지 못했다. 이 확인에서 조건부 GET을 실행하지 않았으므로 304 성공·실패를 시험했다고 보고하지 않는다. 표의 크기는 Node fetch가 압축을 푼 뒤 본문을 UTF-8로 계산한 값이며 실제 wire 전송량이 아니다. 각 형식은 별도 순차 응답이고 항목 범위·필드가 다르므로 위 차이를 동일 데이터 압축률이나 전체 수집비 절감률로 계산하면 안 된다.

RSS GUID에는 다른 작성자 문맥 글인 `2117206245006569542`, `2117187271371960643` 등이 섞였다. 후속 공개 JSON 조회에서 각각 `hoicobe`, `creamppog1`의 작성자 정보를 대조했다. **계정 피드 20항목이 곧 그 계정의 글 20건은 아니었다.** 이는 기존 JSON의 `author.screen_name`, trusted author ID, `reposted_by` 검사를 보존해야 한다는 판단과 맞는다. [관측 RSS](https://fxtwitter.com/binghayu/feed.xml?count=20&with_replies=true), [관측 JSON](https://api.fxtwitter.com/2/profile/binghayu/statuses?count=20&with_replies=true), [현 필터](../../worker/features/x-posts/infrastructure/fx-api.ts)

같은 날 별도 [기존 실제 시험](../reports/2026-11-03-x-alternative-live-test.md)의 155/160 발견 결과를 이번 RSS 20건 표본과 합쳐 새로운 발견률로 계산하지 않는다. 기존 미발견 5건을 RSS로 모두 복구했는지, 같은 전체 범위를 두 방식으로 비교했는지, Cloudflare Worker에서 RSS→정규화→저장→공개가 작동하는지는 이번에 검증하지 않았다.

## 7. 기존 혼합 수집 대비 판단

| 판단 축 | RSS의 실제 이점 | 교체 근거로 부족한 부분 |
| --- | --- | --- |
| 접근성 | 멤버 URL을 RSS 리더에 바로 등록 가능 | OTW의 정상 저장·공개 경로를 대신하지 않음 |
| 발견 | 한 HTTP 응답에서 내부 여러 페이지를 합칠 수 있음 | 같은 upstream, 총 100개 창, 대상 외 문맥 포함, 외부 재개 불가 |
| 완전성 | ID 중복 제거가 내장됨 | 부분 성공 200, 편집·삭제 이벤트·전구간 완료 증거 없음 |
| 지연 | polling 간격에 따라 새 글을 다시 볼 수 있음 | push 증거 없음; 30분 간격을 유지하면 형식 자체의 이득 없음 |
| 비용 | XML의 좁은 표현·공유 캐시가 전송·왕복을 줄일 가능성 | 내부 조회·재보강 비용은 남고 실제 X 청구 감소 근거 없음 |

판단 근거는 [같은 provider·페이지 한도](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/packages/atmosphere/src/providers/twitter/userStatuses.ts#L223-L320), [XML의 축약 구조](https://github.com/FxEmbed/FxEmbed/blob/f6a2ca986cfdc3728fe826abe124a107ebd82c46/src/helpers/syndicationFeeds.ts), [공식 구독 용도](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/)다. 따라서 이번 결론은 **RSS를 사용자용 구독 선택지로 이해하되, 구현된 JSON 혼합 수집을 유지하고 통합·배포는 계속 보류**하는 것이다. 공식 대조는 Fx가 알려 주지 못한 ID를 독립적으로 발견하는 역할이므로 그대로 필요하다. 이는 공식 API 자체의 영구 무누락을 보장한다는 뜻은 아니다. [선행 완료 위치·복구 한계](2026-11-03-x-fxembed-hybrid-review.md)

## 검증 및 실행 한계

공식 문서·고정 원본·현재 로컬 구현을 읽었고 공개 피드의 대표 응답을 관측했다. 테스트·fixture가 공급자 계약을 바꾸도록 해석하지 않았으며 합성 하네스는 만들지 않았다. 조사 문서의 로컬 Markdown 참조를 검사해 깨진 링크 0개를 확인했다. 기존 작업을 보존하며 조사 문서와 현재 작업의 보류 조건 기록만 변경했다.

운영·로컬 수집기 실행, DB·설정·웹훅 변경, 계정 인증·쿠키 접근, 구현 수정, 커밋·푸시·PR·병합·배포는 수행하지 않았다. 앱 테스트·빌드·장기 polling·304·공식 X 실청구·RSS 통합 정상 흐름은 확인하지 않았다. 현재 원본과 공개 서비스의 정확한 artifact 동일성도 미확인이다. 이 한계 때문에 RSS가 기존 공식 대조를 없애도 된다는 결론을 내리지 않는다.
