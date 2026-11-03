# X 수집비 절감을 위한 로컬·헤드리스·비공식 수집 대안 조사

- 조사일: 2026-11-03 KST
- 저장소 기준: `fbdf9a03` — PR 208 병합 커밋. 운영 배포·현재 청구 화면은 이번 조사에서 재확인하지 않았다.
- 범위: 공개 문서·원본 코드·저장소의 기존 비용 증거를 읽고 방향성을 판단한다. 수집기 구현·실제 X 조회·설정 변경은 하지 않았다.

후속: 사용자가 실제 테스트를 승인해 [별도 실행 보고서](../reports/2026-11-03-x-alternative-live-test.md)에 결과를 남겼다. 아래 내용은 사전 조사 시점의 판단이며, 이후 실제 결과는 실행 보고서를 따른다.

## 결론

**대체 수집은 기술적으로 검토할 가치가 있다. 다만 월 $25~30 전체를 절약하려면 REST 복구뿐 아니라 유료 웹훅·첨부 보강까지 대체해야 한다.** 현재 증거로 바로 운영 전환할 후보는 없다. 먼저 공개 FxEmbed API v2를 저비용 비교 후보로, 자체 수집이 필요하면 로컬 `twscrape`를 비교하는 순서가 적절하다. Playwright는 별도 로그인 브라우저를 사용하는 보조 후보로 둔다. 이는 조사자의 권고이며 제품 결정이나 실행 승인이 아니다.

- **FxEmbed API v2 우선 평가:** 문서뿐 아니라 타임라인·답글·페이지 처리 코드도 존재한다. 소비자에게 X 쿠키를 요구하지 않는 공개 API 형태라 로컬 계정 유지보다 부담이 작을 가능성이 있다. 공개 호스트의 실제 배포·작동·지속적인 무료 제공·지원 수준은 미확인이다.[S08], [S09], [S10]
- **자체 운영은 `twscrape` 우선:** 최근 유지보수와 구조화된 데이터 모델이 확인된다. 로그인 세션과 비공식 GraphQL 변경 대응이 필요하며, 현재 X에서 안정적으로 작동한다는 검증은 하지 않았다.[S04], [S05], [S06]
- **관리형 저가 REST는 조건부:** 건당 단가는 낮지만 최근 20건을 자주 재조회하면 현재 비용을 넘는다. 같은 공급자의 실시간 Stream은 8명 기준 월 $39이므로 절감 대안에서 제외한다.[S13], [S14], [S16]
- **신규 도입 제외:** `snscrape`는 유지관리자의 X 수집 장애 이슈가 열린 상태이고, Nitter 원본은 2026-10-09 보관 처리됐다. 이들을 무료·무인증의 안정적인 대체재로 전제하면 안 된다.[S18], [S19]

X의 2026-10-09 시행 약관은 명시적 서면 허가 없는 scraping을 제한하고, 2026-04 자동화 규칙은 웹사이트 scripting 같은 비 API 자동화에 계정 영구 정지 가능성을 명시한다. 로컬·헤드리스·저빈도라는 이유만으로 이 제한이 사라지지 않는다. 이는 수집 방향에 직접 영향을 주는 원문 조건이며, 실제 허용 범위·집행 확률은 이번에 확정하지 않았다.[S02], [S03]

## 1. 현재 비용에서 무엇을 줄일 수 있는가

기존 [REST 예산 복구 보고서](../reports/2026-11-03-x-rest-budget-recovery.md)의 UTC 10/27~11/02 내부 추정 합계는 $5.855, 하루 평균 약 $0.8364다. 30일 단순 환산은 **$25.09**로 사용자가 체감한 월 $25~30과 비슷하다. 다만 뒤 이틀은 예산 중단의 영향을 받았으므로 무중단 수집 수요나 X 확정 청구액으로 해석할 수 없다. 대상 8명도 해당 보고서 시점의 구성이다.

같은 보고서의 UTC 11/02 하루를 기능별로 분해하면 다음과 같다. 각 항목의 30일치는 절감 규모를 비교하기 위한 산술 예시이며 예측치가 아니다.

| 내부 비용 항목 | 하루 | 같은 패턴 30일 | 대체해야 줄어드는 부분 |
| --- | ---: | ---: | --- |
| `post.create` 웹훅 이벤트 | $0.370 | $11.10 | 신규 글 발견 경로 |
| 웹훅 첨부 보강 | $0.310 | $9.30 | 본문·첨부 조회 경로 |
| REST 타임라인 | $0.255 | $7.65 | 누락 복구·전체 점검 |
| 별도 Post lookup | $0.030 | $0.90 | 참조 글 등 개별 보강 |
| User lookup | $0.010 | $0.30 | 계정 조회 |
| 합계 | $0.975 | $29.25 | 전체 |

따라서 **REST만 비공식 수집으로 바꾸면 이 하루 기준 제거 대상은 약 $7.65/월**이다. 첨부 보강까지 대체하면 제거 대상은 커지지만 실시간 웹훅 이벤트 비용은 남는다. 모든 금액은 내부 추정 제거 대상의 크기이며, 대체 서비스비·유지보수·복구 호출을 뺀 순절감액이 아니다. 11/02 첨부 보강 62회는 서로 다른 글 62개여서 단순 중복 제거만으로 해당 비용을 없앨 수 없다.

공식 공개 단가는 Post Read $0.005, User Read $0.010, `post.create` 이벤트 $0.005다. 같은 UTC 날짜의 자원 중복 과금 제거는 soft guarantee이며 다음 날 다시 읽으면 같은 창이 아니다. 내부 보수적 추정과 실제 청구를 구분해야 한다. Owned Reads의 할인은 개발자 앱 소유자 본인 데이터 조건이므로 8명의 외부 계정을 소유자 조회로 취급할 수 없다.[S01]

기존 [구독 조사](../operations/x-feed-subscription-research.md)에 2026-11-22 expansion 과금 변경 기록이 있으나, [당시 X 공지](https://devcommunity.x.com/t/inform-x-api-ppu-expansions-update/279110)는 이번 접근에서 403으로 본문 재확인이 안 됐다. 그 미래 변경을 확정 전제로 절감액에 더하지 않았다.

## 2. 후보 비교

표의 지원은 문서·소스에서 확인한 기능이다. **어느 후보도 이번 조사에서 X의 실제 글을 수집해 검증하지 않았다.**

| 후보 | 계정·실행 환경 | 확인된 기능·제약 | 판단 |
| --- | --- | --- | --- |
| FxEmbed 공개 API v2 | 공개 문서·OpenAPI는 소비자 인증 키를 요구하지 않음; HTTP로 이용하는 구조 | 프로필 타임라인·답글 옵션·cursor·개별 글·미디어. 공개 호스트 실행·무료 지속성·완전성 미검증 | 첫 비교 후보 |
| 로컬 `twscrape` | Python·로그인된 X 계정 세션·로컬 SQLite | 타임라인/답글/검색/인용/미디어 모델; 약 3,200개 타임라인 제한을 프로젝트가 명시 | 자체 수집 1순위 |
| 로컬 Playwright | 별도 브라우저 프로필·로그인·상시 실행 환경 | 브라우저 조작/인증 상태 재사용 가능. X용 수집·정규화·페이지 복구는 직접 구현 | 보조 후보 |
| Cloudflare Browser Run | 관리형 브라우저; 로컬 PC 의존도 감소 | Playwright 사용 가능. 클라우드 세션·접근 성공은 별도 검증 필요 | 자체 브라우저 운영의 대안 |
| `twikit` | Python·X 계정 로그인/세션 | 계정 글·검색 등 API; 오래된 릴리스 및 최근 장애/수정 PR 다수 | twscrape보다 후순위 |
| `snscrape` | Python; 과거 익명 수집 방식 | 유지관리자의 login-wall 장애 이슈가 여전히 열림 | 신규 도입 제외 |
| Nitter/RSS | 자체 서버·캐시 등 운영 필요 | RSS는 인스턴스별 제공, 원본 프로젝트 보관·삭제 요구 공지 | 신규 도입 제외 |
| FxEmbed RSS/Atom | 공개 feed URL 또는 자체 호스팅 | 최근 최대 100개·첫 적합 첨부 enclosure; 전체 미디어·복구에 JSON보다 불리 | 간단 구독용 |
| VxTwitter/BetterTwitFix | 임베드 보정 서비스/자체 호스팅 | 원본 프로젝트 목적은 개별 링크의 영상 임베드 | 주 수집원 후보로 올릴 근거 부족 |
| twitterapi.io REST | 공급자 API 키; 별도 X 로그인 없는 소비 형태 | 타임라인/검색/보강. 반환 건수와 빈 요청도 과금 | 저빈도·새 글 필터 검증 후 비교 |

### FxEmbed: 과거의 단일 글 보강 도구라는 가정은 현재와 다르다

현재 공식 문서는 `/2/profile/{handle}/statuses`에 `count`, `cursor`, `with_replies`, `since`를 제공한다. `since`는 첫 페이지에 더 최신인 글이 없으면 204를 반환하는 조건이며 공식 API의 `since_id`와 같은 계약이 아니다. JSON API는 답글 옵션·인용·사진·영상·tombstone 형태를 문서화한다.[S09]

소스 `17561a89`에는 route 정의, handler, GraphQL 타임라인 호출과 cursor 처리가 실제로 있다. OpenAPI 2.0.0은 공개 서버 `api.fxtwitter.com`을 지정하고 전역/해당 operation의 인증 요구를 선언하지 않는다. 문서의 공개 API 제한은 IP당 분당 1,000회다. 이 사실들은 **소스 구현과 문서상 소비 방식**을 확인할 뿐, 해당 버전이 공개 호스트에 배포됐거나 실제 8명 수집이 성공함을 증명하지 않는다.[S08], [S10]

공개 서비스를 이용하면 사용자의 X 로그인 쿠키를 맡기는 운영을 피할 가능성이 있다. 다만 요금 보장·SLA·재배포 허용 범위·장애 복구·캐시 지연은 확인이 필요하다. 직접 호스팅하면 자체 X 계정 세션과 비공식 업스트림 유지 부담이 돌아온다. 프로젝트도 자격 증명이 없으면 제한이 낮아지고 일부 민감 콘텐츠를 가져올 수 없다고 설명한다.[S11]

RSS/Atom도 실제 문서와 구현이 있다. 하지만 최근 창 최대 100개, 첫 적합 첨부 중심 enclosure, 이미지 카드와 실제 첨부의 구분 때문에 현재 피드의 미디어 완전성을 그대로 맡기기 어렵다. 주 수집을 평가한다면 JSON 타임라인을 우선하고 RSS는 보조 입력으로 판단한다.[S12]

### twscrape: 자체 수집 중 가장 구체적인 후보

프로젝트는 비공식 GraphQL을 HTTP 클라이언트로 호출하고 계정 세션을 SQLite에 저장한다. 로그인 세션이 필요하지만 수집 중 브라우저를 계속 실행하는 방식은 아니다. 기본 HTTP backend가 일부 요청에서 차단될 수 있음도 README에 명시돼 있다. Python 라이브러리 설치만으로 무인증·무제한 수집이 되는 구조가 아니다. 타임라인 한계와 반환 개수의 변동도 문서화돼 있다.[S04]

원본 모델은 답글·리포스트·인용·장문·사진/영상/GIF·편집 정보를 다룬다. 이는 현재 계약으로 변환할 재료가 있다는 뜻이다. 누락 없는 반환·삭제 알림·영상 URL의 장기 유효성을 보장하지 않는다. 파서가 실패한 항목을 기록하고 건너뛰는 경로가 있으므로 200 응답이나 반환 목록만으로 완료 처리하면 안 된다.[S05]

최근 변경은 2026-10-30 `e8745961`, 최신 릴리스는 2026-08-25 `v0.20.1`이다. 반면 2026년에도 스크립트 변경 및 Cloudflare 응답 관련 장애 보고가 존재한다. 최근 유지보수는 후보 선정의 근거이며, 안정적 운영의 증거는 아니다.[S06]

Windows에서 기존 브라우저 세션을 자동으로 재사용하는 편의도 별도 검증 대상이다. README가 소개하는 `unjar`는 현재 지원표에서 Windows Chrome/Edge를 미구현으로 표시한다. 이 도구가 사용자 PC에서 바로 쿠키를 읽어줄 것으로 가정하지 않는다. 이번 조사에서는 쿠키나 자격 증명에 접근하지 않았다.[S07]

### Playwright·헤드리스: 브라우저는 제공하지만 수집 계약은 제공하지 않는다

Playwright는 인증 상태 저장/재사용과 별도 영속 프로필을 지원한다. 인증 파일은 계정 사칭에 쓰일 수 있는 민감 자료다. 기본 Chrome 프로필 자동화는 지원하지 않고 동일 프로필의 동시 실행도 제한하므로, 평소 쓰는 Chrome에 단순 연결하면 해결된다고 볼 수 없다.[S20], [S21]

평가한다면 사용자가 로그인할 별도 프로필의 브라우저 실행과 이후 headless 실행을 분리해 관찰해야 한다. DOM 텍스트만 긁으면 인용 원문·장문·영상 변형·페이지 경계를 잃을 수 있고, 네트워크 응답을 읽으면 다시 비공식 응답 구조 의존성이 생긴다. **headless가 차단을 해결한다거나 로컬 IP가 성공률을 보장한다는 근거는 없다.** CAPTCHA·접근 차단이 발생하면 추가 우회 동작 대신 중단 상태로 기록해야 한다.

Cloudflare Browser Run은 Workers Paid에 월 10시간 포함, 이후 시간당 $0.09이며 동시 브라우저 월평균 10개를 넘으면 추가 1개당 $2다. Free는 하루 10분이다. 기존 Paid 요금·다른 사용량·Workers 실행 비용은 별도다. 예를 들어 8명을 15분마다 계정당 10초 처리한다는 가정이면 64시간/월, 포함 시간을 모두 쓸 수 있을 때 브라우저 시간 추가분 약 $4.86이다. 10초는 측정값이 아니며 로그인·스크롤·재시도는 더 든다. 낮은 브라우저 가격이 X 접근 가능성을 뜻하지 않는다.[S22]

### twikit·snscrape·Nitter·VxTwitter

`twikit`은 로그인과 cookie 재사용, 사용자 글/검색 API를 제공한다. 2026-03-10 최신 변경은 README이고 최신 정식 릴리스 2.3.1은 2025-02-06이다. 2026년 로그인·transaction 파싱·응답 필드 누락 장애와 미병합 수정 PR이 확인된다. 새 수집기의 첫 의존성으로 채택하기에는 twscrape보다 근거가 약하다.[S17]

`snscrape`의 기본 브랜치 마지막 변경은 2023-06-22다. 유지관리자가 2023-06-30 연 login-wall로 인한 X 수집 실패 이슈 #996은 현재 열린 상태다. 과거 사용법만 보고 현재 무료 수집기로 추천하지 않는다.[S18]

Nitter는 RSS가 인스턴스별로 제공되며 악용 때문에 비활성화되기도 한다고 설명한다. 더 결정적으로 원본 저장소는 2026-10-09 보관됐고, README는 X가 2026-08-24 중단 요구서를 보냈으며 10월 법률 지원을 구한다고 기록한다. 외부 인스턴스 주소를 연결하는 것만으로 공급 안정성을 해결하지 못한다.[S19]

BetterTwitFix/VxTwitter의 확인된 프로젝트 목적은 Discord·Telegram 영상 임베드 보정이다. 최근 커밋은 2026-11-02이지만, 이번 조사에서는 현재 요구에 맞는 계정 타임라인·페이지 복구 계약을 확인하지 못했다. 유지보수 여부와 주 수집원 적합성은 별개다.[S23]

## 3. 관리형 저가 API: 단가보다 반복 반환과 최소 요금을 봐야 한다

twitterapi.io 공개 REST 가격은 반환 글 1,000개당 $0.15, 요청당 최소 $0.00015다. 따라서 반환 글 수를 `n`이라 할 때 단순 모델은 요청당 `$0.00015 × max(1, n)`이다. 공식 X의 UTC일 중복 제거 규칙을 이 공급자에도 적용할 근거는 확인하지 못했다.[S13]

8명, 30일, 계정별 한 번에 한 페이지를 읽는 계산은 다음과 같다. 로그인/계정 조회·추가 페이지·복구 호출·세금은 제외했다.

| 주기 | 월 요청 수 | 매번 빈 응답일 때 최소 합계 | 매번 최근 20건을 다시 받을 때 |
| --- | ---: | ---: | ---: |
| 60분 | 5,760 | $0.864 | $17.28 |
| 30분 | 11,520 | $1.728 | $34.56 |
| 15분 | 23,040 | $3.456 | $69.12 |
| 5분 | 69,120 | $10.368 | $207.36 |

**신규 글이 없어도 최근 20건이 반환되면 빈 요청 가격이 아니다.** 받은 뒤 우리 DB에서 중복 제거해도 공급자의 반환 과금은 이미 발생한다. 저가 API를 5분 폴링으로 바꾸면 싸진다는 결론은 성립하지 않는다.

공급자의 `last_tweets`는 최신순 최대 20개·cursor·답글 옵션을 제공하지만 `since_id` 전용 파라미터는 없다. 문서 자체가 X 검색에 숨겨진 계정은 글이 있어도 빈 목록일 수 있다고 설명하며, 그때 프로필 타임라인을 사용하라고 한다. 따라서 빈 목록을 무조건 “새 글 없음”으로 확정하면 누락이 생길 수 있다.[S14]

`advanced_search`는 `from:`, `since_time:`, `until_time:` 검색 예와 `Latest`·cursor를 명시한다. 시간 창을 좁혀 반복 반환 비용을 줄일 가능성은 있지만, 검색 지연·계정 노출·페이지 변동·경계 포함 여부·지연 게시물 발견은 검증되지 않았다. 검색을 공식 REST 복구와 동등한 완전성으로 취급하지 않는다.[S15]

같은 공급자의 Twitter Stream은 별도 월정액이다. Starter $29/월에 6명, 추가 계정당 $5여서 **8명은 $39/월**이다. “계정당 $1” 광고는 500명 상위 요금제 기준이다. 현재 대상 규모에는 비용 절감 후보가 아니다.[S16]

관리형 서비스의 데이터 취득 권한·재표시 허용·장애 보상·삭제 전파는 가격표로 증명되지 않는다. 공급자에게 사용자 X 쿠키를 주지 않는 읽기 API도 데이터 신뢰 경계를 추가한다. 계약과 실제 표본을 확인하기 전 선결제·자동충전·운영 연결을 권고하지 않는다.

## 4. 로컬 비용과 전체 교체의 손익

로컬 수집의 X 공식 API 사용료를 $0로 만들 수 있더라도 총비용은 `전력 + 상시 장비/서버 + 네트워크 + 유지보수 + 실패분 공식 복구 + 초기 구현비`다. 이미 켜져 있는 PC의 추가 전력과 수집 때문에 새로 24시간 켜두는 PC의 전력은 분리해야 한다.

- 추가 평균 소비전력을 `W`라 하면 30일 전력량은 `W × 24 × 30 ÷ 1000` kWh다. 예: 20W는 14.4kWh, 100W는 72kWh. 전력단가·실제 부하는 측정하지 않았다.
- 유지보수 시간을 `H`, 시간 가치를 `$R`라 하면 비용은 `$H×R`다. 현금성 추가비 $5, 시간 가치 $20/시간을 가정하면 월 $25~30을 이기려면 월 유지보수가 약 1~1.25시간 미만이어야 한다. 초기 개발비는 여기에 별도다.
- REST만 대체하는 경우 같은 예시의 절감 대상 $7.65에서 추가비 $5를 빼면 유지보수 여유는 약 8분/월이다. 단순한 무료 라이브러리 도입도 작은 절감 폭에서는 손익이 나쁘기 쉽다.

로컬 PC가 꺼지거나 절전·네트워크 단절·로그인 만료가 발생하면 정기 수집은 멈춘다. 재시작 때 저장된 마지막 ID까지만 한 페이지 확인하고 완료하면 장기 중단·게시량 급증·지연 노출 글을 놓칠 수 있다. 별도 내구성 있는 완료 위치와 미완료 페이지를 유지하고 기존 범위를 이어 읽는 능력이 필요하다. 조회 사이에 작성 후 삭제된 글은 폴링만으로 관측되지 않을 수 있어 실시간 웹훅의 의미도 완전히 같지 않다.

## 5. 현재 OTW 구조와 연결할 때 지켜야 할 경계

현재 정상 흐름은 `coordinator → Workflow → outbox/Queue → collector → D1 → public feed`다. X Activity 웹훅은 HMAC 검증·inbox·이벤트 멱등성을 갖는다. 공식 gateway 요청은 `user_lookup | timeline | tweet_lookup`과 공식 API 경로·공통 예산·redaction 계약으로 제한돼 있다. **공급자 URL만 바꾸거나 비공식 데이터를 X 웹훅처럼 넣는 변경으로 끝나지 않는다.** [gateway 계약](../../contracts/x-activity.ts), [공통 예산·실행](../../worker/features/x-posts/infrastructure/x-shared-budget.ts), [라우트](../../worker/app/routes.ts)를 근거로 한다.

현 라우트에 로컬 수집 agent가 데이터를 넣는 별도 인증된 ingestion 경로는 없다. 향후 실제 구현을 결정하면 다음과 같은 전달이 필요하다. 이는 이번에 구현하거나 확정한 설계가 아니다.

`대체 수집원 → 출처를 구분한 정규화/검증 → 기존 저장·공개 정책 → D1 → 실제 공개 피드`

로컬 agent라면 인증·서명/재전송 방지, site/member 허용 목록, 배치 한도, X 글 ID 멱등성, 저장 성공 후 ACK, 영속 재시도·커서를 포함한 입력 경계가 추가로 필요하다. D1 직접 쓰기나 XAA 웹훅 위장은 기존 신뢰 경계·저장 결과·수집 이력을 깨뜨리므로 제안하지 않는다.

현재 [X API 수집기](../../worker/features/x-posts/infrastructure/x-api.ts)의 페이지·완료 위치 보존과 [저장 흐름](../../worker/features/x-posts/infrastructure/x-collection.ts)을 유지해야 한다. 리포스트 제외 정책, 답글/인용 참조, 장문·이미지·영상 preview, 공개 범위·삭제/redaction은 대체 공급자 때문에 달라져서는 안 된다. 공식 API 커서를 비공식 cursor로 재해석하거나 기존 완료 위치를 새 소스가 검증하지 않은 최신 ID로 올리면 안 된다.

웹훅만 남기고 REST나 보강을 대체하는 혼합 방식은 초기 위험을 줄일 수 있지만 웹훅 이벤트 비용이 남는다. 전체 대체는 더 큰 절감 여지가 있는 대신 실시간성·삭제 감지·누락 복구를 모두 새 수집원이 맡게 된다. 단계를 나누더라도 최종 저장 권한·정규화·관측 구조가 달라지는 임시 우회로를 기반으로 삼지 않아야 한다.

## 6. 다음 평가를 한다면 확인할 내용

아래는 조건부 후속 평가 제안이다. 이번 조사에서 시작하지 않았다. X 접근 허용·실제 수집 방법을 정한 뒤 기존 공식 원장을 기준으로 비교해야 한다.

1. **FxEmbed v2 공개 호스트의 실제 기능:** 8명 중 대표 계정의 타임라인·답글·cursor·미디어·본문을 확인하고, 소스 구현과 배포 기능이 같은지 판별한다. HTTP 200·204만으로 성공 판정하지 않는다.
2. **자체 수집 비교:** 필요할 때 twscrape 한 계정 세션과 Playwright 별도 프로필을 비교한다. 로그인 갱신 횟수·요청 실패·운영자 개입 시간·PC 중단 뒤 복구를 기록한다. 계정/프록시 순환이나 CAPTCHA 우회로 실패를 숨기지 않는다.
3. **계약 비교:** 일반 글·답글·인용·장문·다중 이미지·영상·편집·삭제/비공개 전환을 글 ID와 필드 단위로 대조한다. 빠진 항목은 근거와 함께 남기고 숨김·삭제·차단·파서 실패를 서로 구분한다.
4. **정상 서비스 경로 검증:** 구현을 승인한 경우 실제 인증된 수집 진입점→기존 저장→D1 authoritative readback→공개 피드까지 확인한다. 샘플 JSON이나 단위 테스트만으로 대체 완료라 하지 않는다.
5. **손익 판정:** 최소 한 주기 이상의 자연 발생·중단 복구 관측에서 누락 원인, 지연 분포, 반환 중복, 총 호출비·추가 인프라·운영 시간을 계산한다. 유료 fallback이 계속 필요하면 그 비용을 포함한다. 7일 정도의 관측은 실험 길이 제안이며 안정성 보증이 아니다.

권고 순서는 **FxEmbed 공개 JSON API의 실제 가용성 확인 → 필요 시 twscrape/로컬 브라우저 비교 → 계약·비용·지속운영 확인 후 교체 여부 결정**이다. 관리형 REST는 시간 단위 지연을 받아들이거나 새 글 창의 완전성이 검증될 때만 별도 견적 후보로 남긴다. 현재 공통 $1/UTC일·자동충전·수집 설정·Play/AI 중지 조건은 이번 조사로 변경하지 않는다.

## 7. 검증 범위와 출처

완료: 공식 문서·원본 코드·공개 GitHub metadata 조회, 비용 산술, 현재 코드의 연결 경계 확인, 조사 문서 작성. GitHub metadata의 커밋/릴리스 날짜는 2026-11-03 조회 시점이며 최신 커밋이 항상 기능 수정인 것은 아니다.

미검증: 실제 X/대체 API 수집, 로그인·계정 정지 확률, 공개 FxEmbed의 현재 배포·무료 지속성·운영 허용, 누락률·지연·삭제 감지, Windows 상시 실행, 실전 전력·유지보수 시간, 현재 운영 배포·청구 원장. 코드는 바꾸지 않았으므로 애플리케이션 테스트·빌드·배포도 수행하지 않았다.

- [S01 — X 공식 가격·이벤트·UTC dedup·Owned Reads](https://docs.x.com/x-api/getting-started/pricing)
- [S02 — X 약관, 2026-10-09 시행](https://x.com/en/tos)
- [S03 — X 자동화 규칙, 2026-04 갱신](https://help.x.com/en/rules-and-policies/x-automation)
- [S04 — twscrape README, 조사 시점 커밋 고정](https://github.com/vladkens/twscrape/blob/e87459615053aea171178ba19608e63718a85788/readme.md)
- [S05 — twscrape API](https://github.com/vladkens/twscrape/blob/e87459615053aea171178ba19608e63718a85788/twscrape/api.py), [데이터 모델·파서](https://github.com/vladkens/twscrape/blob/e87459615053aea171178ba19608e63718a85788/twscrape/models.py)
- [S06 — twscrape 커밋](https://github.com/vladkens/twscrape/commit/e87459615053aea171178ba19608e63718a85788), [v0.20.1](https://github.com/vladkens/twscrape/releases/tag/v0.20.1), [2026-08 장애 #330](https://github.com/vladkens/twscrape/issues/330), [2026-09 장애 #337](https://github.com/vladkens/twscrape/issues/337)
- [S07 — unjar 지원 플랫폼 표](https://github.com/vladkens/unjar)
- [S08 — FxEmbed API v2 문서](https://docs.fxembed.com/api/introduction/), [OpenAPI 고정 소스](https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/docs/specs/fxtwitter-openapi.json)
- [S09 — FxEmbed 타임라인 파라미터·응답](https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/)
- [S10 — FxEmbed route](https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/src/realms/api/routes.ts), [handler](https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/src/realms/api/routes/twitter.ts), [타임라인 구현](https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/packages/atmosphere/src/providers/twitter/userStatuses.ts)
- [S11 — FxEmbed 자체 호스팅](https://docs.fxembed.com/deployment/), [계정 세션 의존성](https://docs.fxembed.com/deployment/credentials/)
- [S12 — FxEmbed RSS/Atom 규격](https://docs.fxembed.com/guide/advanced/rss-atom-feeds/), [feed 구현](https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/src/realms/twitter/routes/feed.ts)
- [S13 — twitterapi.io 공식 REST 가격](https://twitterapi.io/pricing)
- [S14 — twitterapi.io last_tweets 원문 OpenAPI](https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets.md)
- [S15 — twitterapi.io advanced_search 원문 OpenAPI](https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search.md)
- [S16 — twitterapi.io Stream 가격·REST와의 구분](https://twitterapi.io/twitter-stream)
- [S17 — twikit README](https://github.com/d60/twikit), [최신 커밋](https://github.com/d60/twikit/commit/c3b7220866f8582009fe2d1155b6fe92192a2711), [릴리스](https://github.com/d60/twikit/releases), [장애 이슈](https://github.com/d60/twikit/issues), [미병합 수정 PR](https://github.com/d60/twikit/pulls)
- [S18 — snscrape 마지막 커밋](https://github.com/JustAnotherArchivist/snscrape/commit/614d4c2029a62d348ca56598f87c425966aaec66), [유지관리자 장애 #996](https://github.com/JustAnotherArchivist/snscrape/issues/996)
- [S19 — Nitter 보관 상태](https://github.com/zedeus/nitter), [원본 README의 중단 요구·RSS·운영 의존성](https://github.com/zedeus/nitter/blob/145ca9eb68d195a74598ae39a4d6da002b252c38/README.md)
- [S20 — Playwright 인증 상태와 민감성](https://playwright.dev/docs/auth)
- [S21 — Playwright 영속 프로필·기본 Chrome 프로필 제약](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [S22 — Cloudflare Browser Run 가격](https://developers.cloudflare.com/browser-run/pricing/)
- [S23 — BetterTwitFix/VxTwitter 프로젝트](https://github.com/dylanpdx/BetterTwitFix), [확인한 최신 커밋](https://github.com/dylanpdx/BetterTwitFix/commit/d7524bbc7bf5e00fe141ca3e3b78580ca357e677)

[S01]: https://docs.x.com/x-api/getting-started/pricing
[S02]: https://x.com/en/tos
[S03]: https://help.x.com/en/rules-and-policies/x-automation
[S04]: https://github.com/vladkens/twscrape/blob/e87459615053aea171178ba19608e63718a85788/readme.md
[S05]: https://github.com/vladkens/twscrape/blob/e87459615053aea171178ba19608e63718a85788/twscrape/models.py
[S06]: https://github.com/vladkens/twscrape/commit/e87459615053aea171178ba19608e63718a85788
[S07]: https://github.com/vladkens/unjar
[S08]: https://docs.fxembed.com/api/introduction/
[S09]: https://docs.fxembed.com/api/twitter/operations/2profilehandlestatuses/
[S10]: https://github.com/FxEmbed/FxEmbed/blob/17561a898fd5e0cf2ef9be01a05447b4c574400a/src/realms/api/routes/twitter.ts
[S11]: https://docs.fxembed.com/deployment/credentials/
[S12]: https://docs.fxembed.com/guide/advanced/rss-atom-feeds/
[S13]: https://twitterapi.io/pricing
[S14]: https://docs.twitterapi.io/api-reference/endpoint/get_user_last_tweets.md
[S15]: https://docs.twitterapi.io/api-reference/endpoint/tweet_advanced_search.md
[S16]: https://twitterapi.io/twitter-stream
[S17]: https://github.com/d60/twikit
[S18]: https://github.com/JustAnotherArchivist/snscrape/issues/996
[S19]: https://github.com/zedeus/nitter
[S20]: https://playwright.dev/docs/auth
[S21]: https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
[S22]: https://developers.cloudflare.com/browser-run/pricing/
[S23]: https://github.com/dylanpdx/BetterTwitFix
