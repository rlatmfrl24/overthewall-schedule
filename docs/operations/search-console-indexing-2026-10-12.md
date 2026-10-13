# Google Search Console 색인 점검·조치 (2026-10-12)

## 결론

이 문서는 10/12~10/13의 확인 시점별 조사·조치 기록이다. 마지막 확인 이후의
Google 처리 상태를 보장하지 않으며, 각 시점의 접수·관측 결과를 구분한다.

Search Console에서 실제 대상 URL을 확인한 뒤 사이트맵을 재제출하고,
공개 피드의 색인 생성과 두 보고서의 수정 결과 검증을 요청했다.
요청 접수와 Google의 최종 색인·검증 완료는 구분한다.
추가 조사에서도 사이트맵 보고서의 **성공·발견 15개는 아직 확인되지 않았다**.
현재 서버 장애나 Googlebot 차단은 재현되지 않았으며, 최초 실패의 정확한 원인은
Google 보고서가 오류 코드를 제공하지 않아 확정하지 못했다.

**2026-10-13 종료 결정:** 사용자가 예약 점검을 불필요하다고 판단하여 삭제를 요청했다.
자동 점검 `otw`는 삭제 도구의 `deleteStatus: deleted`와 설정 파일·디렉터리 부재로
실제 제거를 확인했다. 사이트맵이 정상 처리됐다는 뜻은 아니다.
최종 기술·성과 평가는 [AEO·SEO 최종 평가](aeo-seo-final-evaluation-2026-10-13.md)에 기록한다.

## 보고서와 운영 응답

보고서 최종 업데이트 표시는 2026-10-04였다. 알려진 페이지 6개 중 색인 4개,
제외 2개였으며, 색인된 페이지 중 내용 없는 페이지 경고가 1개 있었다.

| 사유 / 대상 | 실제 확인 | 조치 |
| --- | --- | --- |
| 리디렉션이 포함된 페이지: `http://otw-schedule.info/` | HTTPS 홈으로 301 한 번 이동. 최종 주소는 200, self-canonical, `index,follow` | 정상적인 비표준 URL 제외로 유지. HTTP 주소를 색인하기 위해 HTTPS 전환을 제거하지 않음 |
| 크롤링됨 - 현재 색인이 생성되지 않음: `https://otw-schedule.info/feed` | 보고서의 마지막 크롤링은 8/2. 현재 익명 HTML에 공개 게시글 본문과 `/feed` canonical, `index,follow` 제공. Google 실시간 검사에서 **URL을 Google에 등록할 수 있음** | **색인 생성 요청됨**과 우선순위 크롤링 대기열 접수를 확인. 보고서 수정 결과 검증도 **시작됨** |
| 내용 없이 페이지 색인이 생성됨: `https://clerk.otw-schedule.info/` | 인증 서비스의 빈 JSON 응답. 현재 `X-Robots-Tag: noindex, nofollow`가 이미 있음. 공개 웹 홈의 본문 누락과 다른 대상 | 서비스 응답·인증을 변경하지 않고 해당 경고의 수정 결과 검증 **시작됨**을 확인 |
| 사이트맵 가져오기 실패: `https://otw-schedule.info/sitemap.xml` | 기존 보고서는 8/10부터 알 수 없음·가져올 수 없음·발견 0개. 현재 GET/HEAD 200, `application/xml; charset=utf-8`, 직접 응답이며 올바른 sitemap namespace의 URL 15개. 10/12 09:51 KST Google 실시간 검사에서 크롤링 허용 예·**페이지 가져오기 성공** | 동일 사이트맵 재제출. Google의 **사이트맵이 제출됨** 확인; 사이트맵 보고서의 처리 성공·발견 수 갱신은 별도 확인 필요 |

## 검증 범위

- 운영 사이트맵의 15개 URL 모두 직접 200, 자기 주소 canonical, `index,follow`를 확인했다.
- 공개 일정·프로필·피드·VOD 등의 서버 HTML 본문을 확인했다. 멀티뷰는 기존 AEO 제외 정책을 유지한다.
- 일반 브라우저 User-Agent와 Googlebot User-Agent의 피드 응답은 모두 공개 본문을 제공했다. 이 요청은 실제 Googlebot IP를 증명하지 않으며, 실제 Google 접근은 Search Console 피드 실시간 검사 결과로 별도 확인했다.
- Clerk의 실시간 검사는 JSON 응답의 본문·렌더링 근거를 제공하지 않았다. 따라서 Google에서 `noindex` 처리 완료를 확인했다고 보고하지 않는다. 현재 HTTP 헤더와 보고서 검증 접수를 근거로 한다.
- 현재 운영 응답에서 확인된 정책은 기존 코드에 존재한다. 이 조치에서는 앱 코드·Worker·DNS·인증 설정을 수정하거나 배포하지 않았다. 기존 미커밋 멀티뷰 작업도 유지했다.
- 로컬 HEAD: `36737d6001ff3080b7f1c1c2fbfceaf01f643cf4`. Cloudflare 배포 화면에서 같은 커밋에 연결된 Worker 버전 `b6142795-503d-491e-8ca4-8d06092f68ee`의 100% 배포를 확인했다. 실제 Google 검사 요청도 이 버전에서 처리됐다.

## 사이트맵 추가 조사와 복구 시도

- Google 실시간 검사의 **테스트된 페이지 > 소스**에서 XML 원문과 15개 URL 전체를 확인했다. 추가 정보는 `application/xml`, `200 OK`였다. 따라서 단순 200 응답으로 HTML 오류 페이지를 전달한 경우와 구분했다.
- Cloudflare Worker 로그에서 10/12 09:51:05 KST의 실제 `Google-InspectionTool/1.0` 요청이 Google 네트워크에서 도착했고, `/sitemap.xml`에 200, `outcome: ok`, wall time 21ms로 응답한 것을 확인했다. Ray ID: `a4921d3708c4d46a`.
- Cloudflare 보안 이벤트의 최근 24시간 17건을 조사했다. 사이트맵 차단은 ClaudeBot, GPTBot, PetalBot과 로컬 Python-urllib 점검 요청이었다. Google 네트워크 ASN에서 온 다른 차단 요청은 `/wp-config.php.bak` 탐색으로 사이트맵 크롤러가 아니었다.
- Cloudflare Traffic의 검증된 검색 크롤러 집계는 최근 7일 352건, 그중 GoogleBot 브라우저 분류 117건이며 완화된 요청은 표시되지 않았다. 샘플 로그에는 Bingbot의 사이트맵 접근이 있었으나 정기 Googlebot 사이트맵 요청은 발견되지 않았다. 집계·샘플은 과거 전체 요청에 대한 무차단 보증이 아니다.
- Google 크롤링 통계(최종 업데이트 10/8)는 본 도메인의 최근 90일 호스트 문제 없음, 응답의 95%가 200을 표시했다. 직접 조치와 보안 문제 보고서도 감지된 문제 없음을 확인했다.
- 직접 응답은 gzip과 비압축을 각각 XML 파싱해 15개 URL을 확인했다. Python 기본 UA의 403은 브라우저 무결성 검사에 의한 것이므로 Googlebot 장애로 해석하거나 보안을 해제하지 않았다.
- 동일 URL 재제출 후에도 오류가 유지되어 약 10:11 KST에 실패 제출 기록을 제거하고 **같은 정식 URL**을 다시 등록했다. Google 안내에 따라 이 작업은 보고서 기록만 제거하며 검색 색인과 사이트 파일을 삭제하지 않는다.
- 도메인 속성의 문제인지 비교하기 위해 `https://otw-schedule.info/` URL 접두어 속성을 기존 DNS 소유권으로 자동 인증했다. 그 속성에도 같은 사이트맵 제출 기록·실패 상태가 표시됐다. 별도 우회 URL이나 사이트맵은 생성하지 않았다.
- 재등록 뒤 보고서의 마지막 읽은 날짜는 빈 값, 유형은 알 수 없음, 상태는 가져올 수 없음, 발견 수는 0이었다. 확인한 Worker 로그에는 재등록 뒤 새 사이트맵 가져오기 요청이 없었다. **Google의 재처리 대기 가능성은 있으나 지연만이 원인이라고 확정하지 않는다.** 7일 Worker 조회는 데이터 양으로 불완전할 수 있다는 경고가 있어 전체 기간의 오류 부재를 주장하지 않는다.

## 2026-10-13 추가 원인 조사

사용자의 추가 조사 요청에 따라 08:12 KST에 Google 실시간 검사를 새로 실행했다.
**현재 Google의 직접 가져오기는 정상이며, 사이트맵 보고서의 최종 처리는 여전히 실패 상태다.**
Google 재처리 대기 가능성을 뒷받침하는 결과지만, Google 내부 원인이나 처리 지연을
확정한 것은 아니다.

- 목록 보고서: 유형 **알 수 없음**, 제출일 **10/12**, 마지막 읽은 날짜 **빈 값**,
  상태 **가져올 수 없음**, 발견된 페이지 **0**. 상세 화면은 마지막 읽은 날짜를
  `26. 10. 12.`로 표시하지만 **사이트맵을 읽을 수 없음** 외에 HTTP 오류 코드나
  파싱 오류를 제공하지 않는다. 두 화면의 날짜 표시 차이를 정상 처리 증거로 해석하지 않는다.
- 새 실시간 검사: 10/13 **08:12:36**, Google 검사 도구 스마트폰, 크롤링 허용 **예**,
  페이지 가져오기 **성공**, 색인 생성 허용 **예**. 테스트된 페이지 원문은 올바른
  `urlset` namespace의 XML **15개 URL**이며, Google 수신 헤더는
  `200 OK`, `application/xml; charset=utf-8`, `Content-Encoding: br`였다.
  압축 응답을 Google이 실제로 해제하여 XML 원문을 읽은 것을 확인했다.
- 같은 시각 Worker 기록: **08:12:35.192**의 `Google-InspectionTool/1.0`,
  Google LLC 네트워크의 `66.249.66.7`, HTTP **200**, `outcome: ok`, wall time **109ms**,
  CPU **5ms**. Ray ID `a499ca4a89404319`, 운영 버전
  `b6142795-503d-491e-8ca4-8d06092f68ee`. 스마트폰 검사 요청도 **08:12:36.042**에
  같은 Google 네트워크에서 200으로 처리됐다.
- Worker의 24시간 `sitemap.xml` 조회는 처음 불완전 경고가 있었으나 **더 로드** 후
  경고가 사라졌고 33 Success·0 Errors를 표시했다. 이 수치는 Worker 실행 결과이며
  모든 HTTP 응답이 200이라는 뜻으로 해석하지 않는다. 재등록 뒤 조회된 요청의 출처를
  대조했으며, 새 Google 요청은 이번 실시간 검사였다. Bingbot, 일반 외부 클라이언트와
  로컬 점검 요청을 정기 Googlebot 수집으로 혼동하지 않았다. 보관·샘플링된 로그만으로
  Google의 전체 수집 시도 부재나 Cloudflare 외부의 실패까지 보증할 수는 없다.
- 최신 Cloudflare 차단 이벤트는 기존 AI 봇 규칙에 의한 ClaudeBot, PetalBot, GPTBot
  요청이었다. 새로운 Google 사이트맵 차단 근거는 확인되지 않았다.
- DNS에는 Cloudflare IPv4·IPv6 주소가 있으며 `robots.txt`는 200, `Allow: /`, 정식
  사이트맵 URL을 제공한다. 새로운 접근 제한이나 XML 오류는 재현되지 않았다.
- [Google Search Status Dashboard](https://status.search.google.com/)에는 확인 당시
  공지된 크롤링·색인 장애가 없었다. 이는 개별 속성의 지연이나 Search Console 내부
  처리 문제까지 없다는 보증은 아니다.

[Google 공식 안내](https://support.google.com/webmasters/answer/7451001?hl=ko)는
`알 수 없음`에 아직 처리되지 않은 사이트맵을 포함하고, 가져오기 실패 원인으로
일시적 서버 오류와 낮은 크롤링 수요 등을 설명한다. 사이트맵 자체의 가져오기와
그 안의 페이지 색인 생성은 별개이므로, 이 상태를 일반적인 페이지 색인 지연으로
단정하지 않는다. 현재 근거만으로 변경할 코드나 보안 규칙은 확인되지 않았다.

당시 정상 처리 기준은 **실제 사이트맵 보고서 성공·발견 15개**였으며 자동 점검은
ACTIVE였다. 변화가 없으면 알리지 않고, 재등록 뒤 48시간인 **10/14 10:11 KST 이후
첫 점검**에도 변화가 없으면 일시 중지하도록 설정했다. 이후 사용자의 10/13 삭제
요청으로 자동 점검은 종료됐으며 이 예정 조치는 더 이상 실행하지 않는다.
10/13 추가 조사에서는 같은 URL 재제출, 우회 사이트맵 생성, 코드·보안 설정
변경을 하지 않았다. 10/12에 수행한 같은 URL 재등록은 위 조치 이력에 기록했다.

화면 증거: `sitemap-google-live-test-20261013-0812.png`,
`sitemap-google-source-20261013-0812.png`, `sitemap-overview-20261013-0812.png`,
`sitemap-details-20261013-0812.png`.

### 정기 Googlebot 로그 부재의 추가 확인

사이트맵 재수집이 보이지 않는 이유를 조사하면서 로그 설정과 Google의 기존
크롤링·robots 상태를 확인했다. 새로운 사이트맵 오류나 정상 처리 상태는 발견되지
않았으므로 반복 상태 알림은 보내지 않는다.

- Cloudflare **운영 설정**의 Workers 로그는 활성화, 호출 로그 포함·대시보드 유지가
  켜져 있고 샘플링은 **100%**였다. 로컬 `wrangler.jsonc`도 관찰 가능성을 켜며
  `/sitemap.xml`을 Worker 우선 경로로 지정한다. 사이트맵의 성공 응답은 `no-store`다.
  설정에 의한 낮은 샘플링이나 정적 자산 직접 응답을 로그 부재의 원인으로 확인하지 못했다.
- [Cloudflare 문서](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)에서
  미지정 로그 샘플링의 기본값은 100%이며, 현 시점 Free 플랜의 로그 보존은 **3일**,
  포함량은 하루 200,000건이다. 따라서 기존 7일 조회만으로 8월 최초 실패까지
  소급할 수 없다. 실제 보존 범위·플랜 제한과 Worker 도달 전 실패는 별도 한계다.
- Google이 보관한 HTTPS `robots.txt` 원문은 9/16 08:00 확인본이며,
  `User-agent: *`, `Allow: /`, `Sitemap: https://otw-schedule.info/sitemap.xml`이다.
  현재 직접 응답뿐 아니라 **Google의 기존 robots 규칙에도 사이트맵 차단이 없다**.
  robots 확인일이 오래됐다는 사실만으로 그 뒤 모든 크롤링이 멈췄다고 판단하지 않는다.
- 10/11까지 갱신된 본 호스트 크롤링 통계는 90일간 **1,917건**, 평균 **141ms**,
  HTTP 200 **96%**이며 최근 날짜에도 크롤링 요청이 표시됐다. 호스트 진단은
  robots 가져오기·DNS 확인·서버 연결 모두 수용 가능한 실패율을 표시한다.
  도메인 전체 크롤링 중단을 뒷받침하는 증거는 없다. 이 집계는 사이트맵 개별
  수집 성공이나 10/12 재등록 뒤의 수집 시도를 증명하지 않는다.
- [Google 크롤러 문서](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers)에
  따르면 `Google-InspectionTool`은 검사 도구용이며 정기 검색 크롤러와 구분된다.
  Google ASN이나 `Googlebot` 문자열 하나만으로 정기 사이트맵 재수집을 판정하지 않는다.
  이미 확인한 로컬 가짜 UA와 검사 도구 요청을 제외한 실제 정기 수집 증거는 아직 없다.

낮은 사이트맵 크롤링 수요, 과거 실패 뒤 재시도 일정, Google 내부 처리는 여전히
가능한 설명이며 확정 원인은 아니다. 확인된 설정 오류 없이 새 수집 시스템을
추가하거나 보안을 바꾸지 않았다. 당시 성공·15개 확인 시 자동 점검 삭제와 상태가 같을
때 무알림 원칙을 유지했다. 증거 화면은 `robots-google-cached-20261013.png`,
`host-status-20261013.png`로 보관했다.

## 후속 자동 점검

10/12에 **OTW 사이트맵 정상 처리 확인** 자동 점검(`otw`)을 매시간 실행하도록 설정했다.
실제 사이트맵 성공·15개 확인 또는 새 오류만 알리고, 변화가 없으면 기존 기록을
유지하는 방식이었다. 반복 제출·보안 일괄 해제 없이 Google 요청 증거를 대조했다.

**10/13 사용자 요청으로 삭제 완료.** 앱 삭제 도구는 `automationId: otw`,
`mode: delete`, `deleteStatus: deleted`를 반환했다. 그 뒤
`C:\Users\rlatm\.codex\automations\otw\automation.toml`과 해당 디렉터리 모두
존재하지 않는 것을 확인했다. 자동 점검과 48시간 중지 예정은 종료했다.
사이트맵 실패는 여전히 미해결이며, 정상 처리 때문에 삭제한 것으로 기록하지 않는다.

## 후속 점검 기록

| 확인 시각 (KST) | 유형 | 마지막 읽은 날짜 | 상태 | 발견된 페이지 | 판단 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-12 11:20~11:22 | 알 수 없음 | 빈 값 | 가져올 수 없음 | 0 | 성공 조건 미충족. 다음 정기 점검 유지 |

첫 자동 점검에서 운영 XML은 200, `application/xml; charset=utf-8`, URL 15개를
유지했다. Cloudflare 최근 24시간 보안 이벤트는 이전과 같은 17건이며 새 차단은
없었다. Worker 최근 한 시간의 사이트맵 이벤트는 11:20:54의 로컬 점검 요청
1건뿐이었다(통신사 네트워크, 검증된 봇 아님, 200, `outcome: ok`, 99ms).
확인 범위에서 새 Google 사이트맵 가져오기 요청은 없었고, 반복 제출·코드 수정·
보안 설정 변경은 하지 않았다. 화면은 `sitemap-1122-pending.png`로 보관했다.

## 남은 확인

Google 처리 후 사이트맵 상태 **성공**·발견된 페이지 수, `/feed`의 실제 색인 여부,
Clerk 주소의 검색 제외와 두 검증의 최종 결과를 확인한다. 접수만으로 오류 해소나
검색 노출을 보장하지 않는다. 같은 요청을 반복 제출하지 않는다.

추가 조사 후 readback에서도 사이트맵 제출일은 10/12였으나 보고서 상태는 아직
**알 수 없음·가져올 수 없음·발견 0개**였다. Google 실시간 가져오기 성공과
사이트맵 보고서의 최종 처리 성공을 동일하게 보고하지 않는다.

## 근거

- [페이지 색인 보고서](https://search.google.com/search-console/index?resource_id=sc-domain%3Aotw-schedule.info&hl=ko)
- [사이트맵 보고서](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aotw-schedule.info)
- [Google: 페이지 색인 사유](https://support.google.com/webmasters/answer/7440203?hl=ko)
- [Google: 사이트맵 관리·재제출](https://support.google.com/webmasters/answer/7451001?hl=ko)
- [Google: noindex 응답 헤더](https://developers.google.com/search/docs/crawling-indexing/block-indexing?hl=ko)

로컬 화면 증거는 `.tmp/search-console-2026-10-12/`에 보관한다. 임시 증거 파일은 커밋하지 않는다.
