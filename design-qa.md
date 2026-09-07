# OTW Play 3색 글래스 UI 검토

검토일: 2026-09-07. 로컬 검토 범위의 시각적 P0/P1/P2 결함은 수정했다.
운영 배포와 회원 제안의 신규 제출·검수는 수행하지 않았다.

## 기준과 구현

- 기준: 사용자가 승인한 3색 글래스 UI 계획, `otw-play-v2` (`16f97a7560a49121b64276a2a3cadc7f07da5c36`).
- 구현 브랜치: `codex/otw-play-glass-refresh`.
- 실제 진입점: `http://localhost:5173/play`, `/play/songs`, 곡 상세, `/play/submit`, `/play/submissions`.
- 관리자 로그인 상태의 기존 로컬 카탈로그 8곡으로 확인했다. 공개 비활성·관리자 미리보기 권한 모델은 유지했다.
- 첨부 이미지는 전체 화면 목업이 아닌 브랜드 장식의 원본이다. 레이아웃은 승인 계획과 V2의 기존 이용 흐름을 기준으로 비교했다.
- `public/images/otw-play/glass-note.png`: 원본 1024×1536 RGBA, 사용자 첨부 파일과 SHA-256 동일
  (`35A74CD6170B53CBE89DA8EBD1681E7AB2A6FC9C1107F1CC4396D7CEF2B0D60D`).
- 증거 폴더: `.tmp/otw-play-glass-review/`. 이미지 편집·데이터 조작 없이 Chrome 브라우저에서 캡처했다.
- 전후 비교: [comparison.html](.tmp/otw-play-glass-review/comparison.html).

## 전체 화면과 세부 비교

V2와 새 버전의 발견·곡 검색 이미지를 같은 비교 입력으로 열어 대조했다.
모두 1920×1080 픽셀 / 같은 CSS viewport, 같은 다크 테마, 검색 조건 없음, 큐 0곡,
동일한 첫 곡 팬서비스와 동일한 카탈로그 정렬이다. 축척 보정·크롭·리샘플링은 하지 않았다.
공용 사이드바의 마우스 hover 위치는 일부 다르며 제품 변경으로 판단하지 않았다.

| 화면 | V2 | 새 UI |
| --- | --- | --- |
| 발견 | `v2-discover-desktop.png` | `glass-discover-desktop.png` |
| 곡 검색 | `v2-catalog-desktop.png` | `glass-catalog-desktop.png` |

세부 영역은 원본 해상도의 같은 이미지에서 별도로 확인했다.
발견의 x=280–1500, y=88–574 영역에서 음표·타이포·썸네일·조작부를,
검색의 x=280–1516, y=353–790 영역에서 첫 두 카드의 순서·이미지 비율·버튼 대비를 비교했다.
모바일 390×844 원본은 정보가 충분히 크게 보여 별도 이미지 크롭 없이 초점·줄바꿈·탭을 확인했다.

| 검토 항목 | 판단 |
| --- | --- |
| 글꼴·타이포그래피 | 기존 Inter/시스템 fallback 유지, 제목 700. 발견 40/28px, 섹션 22px, 카드 곡명 18px. 긴 한·일 곡명은 카드 안에서 줄바꿈하며 모바일 발견 제목은 단어를 보존한다. |
| 간격·구조 | 발견의 이미지 위 글씨를 옆 정보 패널로 분리했다. 실제 콘텐츠 720px 미만에서 세로 배치, 패널 24px/카드 18px 모서리. 사이트 내비게이션과 우측 380px 영역 유지. |
| 색·재질 | 코랄 주요 재생, 틸 선택과 포커스, 앰버 장식. 목록은 중립 표면. 반투명 조작부는 16px blur와 불투명 fallback을 사용한다. |
| 이미지 | 첨부 음표의 원본 비율·투명도·색을 유지한다. 실측 높이 144/88px. 실제 곡 이미지는 별도 표시하며 `object-fit: contain`을 확인했다. |
| 문구·정보 | 첫 페이지 8곡을 탐색하는 기존 추천 배너이며 개인화·에디터 큐레이션을 표방하지 않는다. 곡명→아티스트·참여자→분류·공개일→작업 순서. 공식 버전 개수 칩 없음. |

## 반응형·상태 증거

| viewport | 실제 확인과 증거 |
| --- | --- |
| 390×844 | 발견·검색·긴 제목·다수 참여자 상세·빈 결과·펼친 필터·전체 플레이어·내 제안. `glass-discover-mobile.png`, `glass-catalog-mobile.png`, `glass-long-title-mobile.png`, `glass-detail-mobile.png`, `glass-empty-mobile.png`, `glass-filters-mobile.png`, `glass-player-mobile.png`, `glass-submissions-mobile-light.png`. |
| 768×1024 | 실제 콘텐츠 너비 703px의 세로 추천 패널, 전체/미니 플레이어. `glass-discover-tablet.png`, `glass-player-tablet.png`, `glass-mini-player-tablet.png`. |
| 1366×768 | 실제 추천 콘텐츠 너비 665px의 세로 패널, 380px 우측 플레이어, 가로 넘침 없음. `glass-discover-1366.png`. |
| 1920×1080 | 가로 추천 패널, 검색 카드, 다크/라이트 표면, 제안 폼. `glass-discover-desktop.png`, `glass-catalog-desktop.png`, `glass-catalog-light.png`, `glass-submit-light.png`. |
| 1366×600 | 단일 iframe 높이 200px 유지, 현재 재생/큐 전환, 8곡 큐 내부 스크롤 후 마지막 항목 도달. `glass-player-short.png`, `glass-queue-scroll-short.png`. |

전체 문서 가로 넘침은 위 주요 viewport에서 없었다. 멤버 목록은 기존 의도대로 내부 가로 스크롤을 사용한다.
플레이어·큐의 구간별 배경과 문구를 확인했으며 재생 버튼 아래 구분선을 되살리지 않았다.

## 실제 이용 흐름

- 발견 다음/이전 추천곡 전환, 긴 제목과 참여자 표시, 멤버 빙하유 진입으로 `member=3`, `participantRole=vocal` 조건과 2곡 결과를 확인했다.
- 멤버 조건 개별 해제, 모두 초기화, 검색어 입력 후 0곡 안내와 필터 초기화로 원래 8곡 복귀를 확인했다.
- QWER 상세에서 두 보컬과 공식 버전·source 목록을 확인했다. 상세의 대기열 추가 후 `추가됨`과 큐 항목을 확인했다.
- 팬서비스 재생 버튼으로 실제 YouTube 영상·자막, 진행 시간 0:11→0:43 갱신과 `일시정지`/`재생 중` 상태를 확인했다.
- 반복은 꺼짐→전체→한 곡→꺼짐 순환을 실제 버튼으로 확인했다.
- 태블릿 전체→미니 전환과 곡 상세 이동, source 선택, 낮은 화면 큐 전환에서 YouTube iframe은 계속 1개, id `widget2`를 유지했다.
- QWER의 `이 source 재생`으로 영상과 큐 현재 항목이 QWER로 바뀌었고, 추가 작업 후 큐 8곡을 확인했다.
- 640px 미만 카탈로그 복귀 시 일시정지·launcher, 태블릿 미니 화면의 재생/확장 조작을 확인했다. 기존 복귀 시 일시정지 동작은 변경하지 않았다.
- 곡 제안 첫 입력 화면, 입력 후 이탈 보호, 내 제안의 기존 항목·검수 상태를 확인했다. 검증 입력은 저장·제출하지 않았다.
- 다크/라이트 전환 후 원래 다크로 복원했다. 임시 viewport 지정도 해제했다.
- 최종 검토 탭의 브라우저 console error 조회 결과는 빈 배열이었다. 전체 YouTube 내부 네트워크 로그 감사는 수행하지 않았다.

## 접근성·모션

- 버튼 150ms, 탭·필터 200ms, 추천 내용 240ms. 썸네일 확대나 iframe 변형 없음.
- 모바일 주요 재생·큐 버튼은 실제 높이 44px. 선택·반복 상태는 문구와 아이콘을 함께 사용한다.
- 검색 포커스와 추천 조작부의 키보드 포커스를 확인했다. 바깥 frame을 `overflow: clip`으로 바꾸어 초점 이동이 헤더를 끌어올리지 않게 했다.
- `prefers-reduced-motion: reduce`의 애니메이션·전환 해제 규칙이 브라우저 CSSOM에 로드됐음을 확인했다.
  도구가 미디어 선호 에뮬레이션을 제공하지 않아 OS의 동작 줄이기를 켠 실제 렌더링은 별도 확인하지 못했다.
  [MDN 지침](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)에 맞춰 이동 효과를 제거한다.
- 중립 카드 기준 WCAG 상대 휘도 계산: 라이트 기본 글씨 15.71:1, 보조 6.10:1, 틸 글씨 6.09:1;
  다크 기본 15.32:1, 보조 8.13:1, 틸 글씨 9.85:1; 코랄 버튼 글씨 5.80:1.
  이 수치는 지정 토큰 쌍의 계산이며 모든 투명 표면·외부 iframe 텍스트를 자동 감사한 수치는 아니다.
- 이미지 실패는 기존 고해상도→카탈로그 이미지 fallback 테스트와, 두 후보가 모두 실패했을 때 `썸네일 없음`이 남는 추가 회귀 테스트로 확인했다.
  실제 카탈로그에 잘못된 이미지 URL을 주입하지 않았다.

## 발견한 문제와 수정 이력

1. **P1 / 모바일 목록이 배경에 덮임:** 우측 rail 장식 배경을 모바일의 전체 화면 위치 지정용 aside에도 적용했다.
   배경을 데스크톱 rail과 실제 표시되는 모바일 플레이어 표면으로 한정했다.
   이후 `glass-catalog-mobile.png`, `glass-discover-mobile.png`, `glass-player-mobile.png`에서 목록·전체 플레이어를 다시 확인했다.
2. **P2 / 좁은 콘텐츠의 가로 패널:** viewport 기준 컨테이너가 내부 패딩을 포함해 전환 경계가 어긋났다.
   page의 실제 콘텐츠 컨테이너를 기준으로 720px에서 전환하도록 수정했다. 1366/768px 캡처와 665/703px 실측으로 세로 배치를 확인했다.
3. **P2 / 포커스 이동 시 헤더가 32px 올라감:** `overflow: hidden`인 frame도 브라우저의 자동 초점 스크롤 대상이 됐다.
   `overflow: clip`으로 수정 후 같은 추천 버튼 동작에서 frame scrollTop=0, header y=56..120,
   main만 스크롤됨을 확인했다. `glass-mobile-focus-fixed.png`, 최종 `glass-long-title-mobile.png`에 근거를 남겼다.
   태블릿 미니 캡처는 이 수정 전 증거이며 미니 동작·단일 iframe 확인에만 사용했다.
4. **P3 / 한국어 제목 단어 중간 줄바꿈:** `word-break: keep-all` 적용 후 최종 모바일 발견 캡처에서 두 줄 단어 보존을 확인했다.
5. 테스트의 예전 분류칩 우선 배치 기대는 승인된 곡명 우선 순서로 수정했다. CSS 모서리 클래스 검증은 실제 정보 순서 검증으로 대체했다.
   frame의 `overflow-hidden` 기대는 실제 초점 스크롤 수정에 맞게 `overflow-clip`으로 갱신했다. 권한·데이터·재생 상태 기대는 완화하지 않았다.

## 코드 검증

- `pnpm architecture:check`, `pnpm lint`, `pnpm typecheck:test`, `pnpm build`: 통과.
- `pnpm test`: 단위 232파일/1,589개, Worker 23파일/220개 통과.
- `pnpm test:coverage`: 255파일/1,809개 통과. Statements 80.01%, Branches 66.95%, Functions 83.46%, Lines 81.54%.
- 이후 썸네일 후보 전체 실패 테스트 1개 추가 및 상세·frame 최종 수정에 대해 OTW Play UI 17파일/153개 전체 통과.
  예전 overflow 클래스 기대를 실제 초점 스크롤 수정에 맞게 갱신한 뒤 전체 UI 검증과 lint를 다시 통과했다.
  마지막 제품 코드로 production build도 다시 통과했다.
- `pnpm sync:agent-cursor:check`: 16개 파일, drift 0.
- API·DTO·DB·player model·공용 sidebar·관리자·package.json·lockfile 변경 없음. 신규 패키지 없음.

## 검증 한계

OS 동작 줄이기 활성화 상태, blur 미지원 실제 브라우저, 모든 이미지 실패의 실제 화면 캡처는 미확인이다.
각각 로드된 CSS 규칙·불투명 기본값·컴포넌트 회귀 테스트로 확인 범위를 제한했다.
현재 카탈로그는 8곡이므로 실제 두 번째 페이지 로딩은 이번 로컬 데이터로 재현되지 않았다. 기존 페이지네이션 회귀 검증은 통과했다.
회원 제출·관리자 검수·운영 배포는 이번 스타일 변경의 실제 쓰기 검증 범위에 포함하지 않았다.

final result: passed
