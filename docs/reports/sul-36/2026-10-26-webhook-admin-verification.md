# 웹훅 수집·관리자 오류 표시 검증 — 2026-10-26

## 판정

현재 구독·갱신·공통 예산의 운영 상태는 정상이다. 다만 관리자 수집 화면은 REST 중심 표시와 웹훅 상태의 갱신 경로가 분리돼 있어 두 곳의 보완이 필요하다.
실제 신규 수신은0건이므로 실게시물·사진·영상의 수신/저장 성공을 확정하지 않는다. 검증 요청 범위에서 구현·설정 변경·배포는 하지 않았다.

## 확인된 보완점

### P2. 수집 주 화면에서 현재 웹훅 상태와 이전 REST 실패를 구분하기 어렵다

실제 OTW `/admin/collection?source=x#x-monitoring`의 상단은 ‘게시물 수집 / 실패 포함 / 조회 오류(shared_budget_unavailable)’를 표시했다.
이는 웹훅 활성화 전13:53의 REST 정기 작업 결과다. 같은 화면에서 설정을 열고 `X 신규 피드 구독`을 펼치면 현재 상태는 ‘정상’, OTW5/5·LuvDia3/3·등록 실패0이었다.

`XCollectionOverview`는 `latestRun.xCollection`만으로 상단 상태·저장 수·오류를 계산하고 `XActivityManager`는 설정 내부에 있다.
웹훅 주 수집의 성공/실패가 상단과 정기·수동 작업 이력에 반영되지 않으므로 운영자가 웹훅 장애로 오해하거나 실제 웹훅 오류를 주 화면에서 놓칠 수 있다.
현재 과거 실패 기록 자체는 사실이며 성공으로 정규화하거나 삭제하면 안 된다.

필요 변경은 상단에 웹훅 구독·최근 수신/저장·처리 오류를 표시하고, 기존 카드를 ‘24시간 REST 누락 복구’와 그 실행 이력으로 명확히 구분하는 것이다.
근거: `src/features/member-posts/ui/admin/x-collection-monitoring.tsx:55`, `src/features/member-posts/ui/admin/member-post-settings.tsx:936`.

### P2. 상단 새로고침으로는 웹훅 패널이 갱신되지 않는다

`MemberPostFeedMonitor.reloadMonitor`와 상위 `loadSettings`는 피드·설정·작업·참조 보강 상태를 갱신하지만 `xActivityQueryKey`는 갱신하지 않는다.
웹훅 패널은 펼쳤을 때 조회하며 자체 새로고침만 있고 주기 갱신은 없다. `staleTime=30_000`은30초 주기 조회를 의미하지 않는다.
따라서 패널을 열어 둔 상태에서 상단 ‘상태 새로고침’을 눌러도 구독 만료/예산 중지/최근 수신이 이전 값으로 남을 수 있다.

필요 변경은 주 화면 새로고침이 활성 웹훅 상태 조회도 포함하도록 연결하고, 그 조회 실패 시 마지막 값임을 명시하는 것이다.
근거: `src/features/member-posts/ui/admin/member-post-feed-monitor.tsx:255`, `src/features/member-posts/ui/admin/member-post-settings.tsx:187`, `src/features/member-posts/ui/admin/x-activity-manager.tsx:33`.
이 항목은 조회 호출 경로의 코드 추적으로 확인했으며 운영 장애나 구독 상태 변이를 강제로 만들어 재현하지 않았다.

## 실제 운영 대조

- 검토 소스 HEAD는 `bdf90a04cb8d7b4a45c80dd96472454467e80cce`다. 현재 OTW 활성 `96a521e3-9309-4405-9cc6-3a9a2790ae00`, LuvDia 활성 `c45d4c01-2c39-4bfd-9ed3-9002a953271d`를 읽었다.
- 15:20 KST 공급자와 DB에서 유효 웹훅1개·고유 구독8개·양 사이트 수집 허용·등록 오류 없음이 일치했다.
- 같은8개 구독 ID가 유지된 채 최초 만료15:26에서15:53으로 늘어났으므로 기존 cron의 실제 만료 갱신도 확인됐다. 이를 신규 게시물 전달 성공으로 간주하지 않는다.
- 15:27:30 KST 중앙 dispatch·양 사이트 inbox·신규 저장·중복·보강 시도·공통 유료 요청·전환 후 사이트 과금 이벤트는 모두0이었다. 미수신과 미발행은 추가 발행 목록 조회 없이 구분할 수 없다.
- 공통 UTC장부 사용60,000·예약0·목표1,000,000micros와 양 사이트24시간 복구·100센트 조회 보호를 읽었다. 수집 화면의6%도 장부와 일치했다.
- 같은 검증에서 OTW 카페 화면도 새로 읽어 활성5/5·주의/오류/지연0·정상, 이관된 세 멤버 제외를 확인했다.
- 관측 SQL 전 계정 D1 읽기1,638,764(<배경4M/계정5M)을 확인했고 관측 SQL 쓰기는0이었다. 추가 유료 X 조회·강제 수집·재생·오류 유발·구독 재적용·예산/자동충전 변경은 없었다.

## 오류 회귀 검사와 한계

기존 테스트5개 파일을 선택 실행해32건 PASS를 확인했다.

```text
pnpm exec vitest run src/features/member-posts/ui/admin/x-activity-manager.test.tsx src/features/member-posts/ui/admin/x-collection-monitoring.test.tsx src/features/member-posts/ui/admin/member-post-settings.test.ts src/features/operations/ui/admin/operations-dashboard.test.tsx worker/features/x-posts/http/x-activity.test.ts
```

검사에는 관리자 권한·임의 계정/콜백 입력 차단·CRC/서명·본문 크기·Queue 실패 응답, 예산 중지·부분 등록·보강 대기,
API 조회 실패와 이전 값 구분, 실제 partial/재시도/전체 완료의 구분이 포함된다. 의도한 Queue 실패 fixture의 오류 로그와 전체 테스트 PASS를 구분했다.
서명·중복·공통 예산·미디어 보강·REST 커서 관련 기존 Worker 통합 검사는 동일 코드의 직전 자동 CI399파일·3300 PASS를 재사용했고 전체를 재실행하지 않았다.

XAA 패널 자체의 UI 테스트는 전체 제어와 예산/부분 실패2개다. 상태 조회 실패·캐시된 정상 응답의 명시적 이전 값 표시·제어 mutation 실패·주 화면과의 통합 새로고침 회귀는 부족하다.
`query.isError` 경고와 기존 `data.mode`를 동시에 그리는 코드는 남아 있으므로 위 보완 시 이 오류 경계를 추가 검증해야 한다.
운영에서 장애를 인위적으로 만들거나 유료 이벤트를 발생시키지 않았으며 자연 사진/영상·새 UTC 예산 재개·장기 장애 복구의 실운영 결과는 미확정이다.

## 현재 ‘X 게시글 수집 실패’ 표시의 적합성 재확인 — 15:34 KST

**과거 REST 실행의 실패 이력으로는 맞지만, 현재 X 신규 수집 전체의 위험/실패 경고로는 부적합하다.**

원격 최신 실행2852/2853은 각각13:53:39·13:53:51에 시작한 정기 REST 실행이다. 모두 `failed / shared_budget_unavailable`, API호출0·저장0·비용0이다.
웹훅 전환 준비 중 공통 장부가 준비되지 않아 유료 호출 전에 차단된 실제 기록이며 성공으로 변경하거나 삭제할 대상은 아니다.
현재는 coordinator.ready1·last_error없음, 구독8개 active·오류없음·최소 만료16:23:36, 당일 공유 장부60,000/예약0/한도1,000,000이다.
수신 inbox는 여전히0이어서 실수신 성공/실패의 새 증거는 없다.

동일 시점의 실제 관리자 대시보드는 ‘X 신규 게시물: 위험’, ‘최근 X 게시글 수집이 실패했습니다’, ‘X 신규 게시물의 피드 반영이 늦어질 수 있습니다’를 표시했다.
원인은 `operations-application.ts:795`가 웹훅 상태·장부 준비 이후 회복 여부와 무관하게 최신 REST 실행의 failed만으로 `x_collection_latest_failed`를 critical로 추가하기 때문이다.

적절한 현재 표시는 ‘웹훅 구독 정상 · 신규 수신 대기/미검증’과 ‘최근 REST 실행13:53 · 장부 준비 전 차단’을 분리하는 것이다.
기존 경고를 현재 웹훅 장애로 확정하거나 전체 수집 정상으로 바꾸는 둘 다 근거가 부족하다.
계정 D1 읽기1,744,076(<배경4M)을 먼저 확인한 좁은 SELECT의 읽기23·쓰기0으로 대조했다. 강제 수집·구독 재개·유료 테스트·설정/코드 변경은 하지 않았다.
