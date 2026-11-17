# 일정 추가 UI 피드백 검증 (2026-11-17)

final result: passed

## 비교 기준과 증거

사용자 피드백과 사용자가 확정한 ‘휴방·게릴라도 방송 시간 단계를 유지하고 해당 없음 표시’를 요구 기준으로 삼았다. 시각 기준은 **실행 중인 기존 일정표 카드와 수정 전 입력 화면**이다. 별도 승인된 Figma/이미지 시안과의 픽셀 복제를 주장하지 않는다. 기존 화면에서 요청한 변경은 의도한 차이로 구분한다.

증거 폴더: `C:/Develop/overthewall-schedule/.git/codex-evidence/schedule-entry-feedback-20261117/`

- source visual truth: `source-weekly-desktop.jpg`, `before-basic-desktop.jpg`, `before-summary-desktop.jpg`, `before-summary-mobile.jpg`
- 구현: `after-basic-desktop.jpg`, `after-summary-desktop.jpg`, `after-summary-mobile.jpg`, `after-summary-390css.jpg`, `after-summary-light.jpg`, `off-time-desktop.jpg`
- 전체 화면 비교(좌 수정 전 / 우 구현): `compare-basic-qa1.jpg`, `compare-desktop-final.jpg`, `compare-mobile-final.jpg`
- 집중 비교: `compare-card-focus-final.jpg` (양쪽 중앙800×540 영역을 함께 배치해 제목·시간·정보 위계·여백을 확인)
- 측정: `measurements.json`, `motion-final.json`, `mobile-390-fit.json`, `contrast.json`, `console-errors.json`

같은 `/weekly`, 게스트, 김아테, 2026-11-17, 방송19:00, `문 스위퍼즈\n오버더월 멤버들과 합방` 상태를 비교했다. 전체 이미지와 집중 비교 이미지를 각각 한 입력에 좌우로 합쳐 확인했다. 기존 일정표 캡처는 카드의 상태칩·색·아이콘·정보 위계에 대한 문맥 기준이며, 좁은 주간 셀과 넓은 확인 카드의 크기·행 수를 동일하게 맞추지는 않았다.

| 구분 | 실제 CSS 뷰포트 | 원본/구현 이미지 픽셀 | 밀도 처리 |
|---|---|---|---|
| 데스크톱 비교 | 1422×1000 | 양쪽1580×1111 | 같은 브라우저·배율, 개별 이미지 확대/축소 없음 |
| 모바일 비교 | 433×937 | 양쪽481×1042 | 같은 브라우저·배율, 개별 이미지 확대/축소 없음 |
| 좁은 모바일 추가 검사 | 390×844 | 433×938 | 별도 반응형 검사로 구분, 위 비교의 픽셀 일치 근거로 사용하지 않음 |

브라우저가 보고한 devicePixelRatio는0.9였고 저장 이미지의 실제 캡처 밀도는 CSS 크기 대비 약1.111이었다. 요청한 캡처 설정1280×900/390×844를 실제 CSS 크기와 혼동하지 않았다. 비교 쌍의 픽셀·CSS 크기가 모두 같아 별도 밀도 정규화는 하지 않았다. 검증 후 원래 다크 테마와 뷰포트를 복원하고 임시 초안은 저장하지 않고 닫았다.

## 비교 이력과 수정

1. **1차: blocked.** 정적 데스크톱·모바일 배치와 정보 분리는 요구를 충족했지만, [P2] 새 화면 포커스가 `overflow: hidden` 영역을 가로로 스크롤해 방향 전환을 상쇄했다. 실제 다음 화면 진입 중 translateX239.318px에 scrollLeft240px이 관찰됐다. 정적 캡처만으로 이 전환 결함을 통과 처리하지 않았다.
2. **일괄 보완:** 공용 Stepper 영역을 `overflow: clip`으로 바꿔 세 소비자(직접 추가·이미지 추가·Play 제안)의 포커스 가로 스크롤을 막았다. 휴방 칩의 밝은 전경색이 대비를 유지하도록 두 테마 모두 rose600을 사용했다. 사전 기계 검사에서 지적한 게릴라 칩의 중성 회색은 같은 색 계열의 amber950으로 보완했다.
3. **2차: passed.** 같은 상태·크기의 구현을 다시 비교했다. 다음 진입 translateX149.621px/이전 진입-155.403px에서 전환 영역과 대화상자의 scrollLeft는 모두0이었다. 기존 정적 기본 정보 캡처는 시각 결과가 바뀌지 않아 재사용했다. 미해결 P0/P1/P2는 없다.

## 필수 표면 점검

- **글꼴·타이포그래피:** 기존 `Poppins, Pretendard Variable, system-ui, sans-serif` 스택을 유지했다. 제목18px/600, 시간24px/600과 tabular 숫자로 위계를 만들고 여러 줄 제목을 보존했다. 본문의 중복 제목은 제거했지만 접근성 그룹 이름은 남겼다. FontFaceSet은 별도 얼굴을 열거하지 않아 웹폰트 다운로드 성공을 독립적으로 증명하지는 못했으며, 기존 브라우저의 같은 폴백 환경에서 비교했다.
- **간격·배치:** 멤버·날짜는 카드 밖 두 열, 상태·시간·제목은 카드 안에 묶었다. 입력 아래24px, 카드의12px 간격과 기존 radius/토큰을 사용했다. 390×844에서 대화상자 clientWidth/scrollWidth356/356, 단계선332/332이고 다음 버튼 하단615.25px로 잘림이 없다.
- **색·토큰:** 앱의 라이트/다크·멤버색·상태 의미를 유지했다. 계산된 토큰의 근사 sRGB 대비는 다크 카드17.16:1, 라이트 카드19.79:1, 방송 칩16.33:1, 휴방4.51:1, 게릴라6.99:1이었다. OKLCH는 sRGB 선형 변환 후 범위를 clamp한 근사치이며 exact raster 색 분석으로 주장하지 않는다.
- **이미지·아이콘:** 새 장식 이미지나 대체 에셋을 만들지 않았다. 기존 Lucide 상태·시간 아이콘과 멤버색을 사용한다. 배경의 로컬 가상 멤버 이미지 폴백은 수정 전부터 같고 이번 범위 밖이다.
- **문구·내용:** 본문 단계 제목과 멤버 선택 안내를 제거하고 필드 라벨·필수 오류·진행 상태·미저장 변경 확인·저장 실패 복구는 유지했다. 휴방/게릴라는3번째 화면에 ‘해당 없음’을 표시하고 확인 카드에 가짜 방송 시간을 표시하지 않는다.

## 실제 상호작용과 한계

- 주간 메뉴 → 직접 입력 → 기본 정보/일정 내용/방송 시간/확인의 네 화면과 이전 단계 왕복을 확인했다.
- 모바일 네이티브 시간 입력의 실제 키 조정12:00이 확인 카드에 반영되는 것을 확인했고, 비교용19:00은 기존 빠른 시간 선택으로 맞췄다. 자동화 도구의 단순 time-input fill은 DOM 값만 바꿔 실제 입력 검증 근거로 쓰지 않았다.
- 휴방·게릴라의 단계 유지와 해당 없음, 라이트/다크, 미저장 변경 확인을 실제로 확인했다. 이 세션의 수집된 console error는0건이다.
- 관련4파일99건(기존 수정·삭제·충돌·실패/재시도와 이미지 복구, Play 소비자 포함), 앱/테스트/Worker/Node 타입, 변경 lint, 구조 검사와 최종 OTW/LuvDia 빌드·manifest가 통과했다. 전체 preflight는 재실행하지 않았다.
- 추가 AI 인식이나 실제 저장/삭제는 실행하지 않았다. 이미지 입력의 편집/확인·복구와 Play 제안의 기능 회귀는 자동 테스트로 확인했으며 이 브라우저에서 인증 후 재인식/저장이나 통신 장애를 강제하지 않았다.

## 구현 체크리스트

- [x] 다음/이전 방향과 포커스 가로 스크롤 수정
- [x] 본문 중복 제목·멤버 안내 제거, 하단 여백 적용
- [x] 네 단계와 휴방/게릴라 해당 없음 유지
- [x] 메타데이터/일정 카드 분리, 제목·시간 강조
- [x] 양 테마·모바일·실제 흐름·영향 소비자 검증

후속 P3: 기존 웹폰트의 독립적인 로딩 계측은 이번 폴백 비교 범위 밖이다. 디자인·기능 변경이 없는 추가 폴리시는 수행하지 않았다.

## 후속 버튼·전환·PR 리뷰 (2026-11-17)

이후 사용자 피드백으로 추가 버튼을 직접 입력과 드롭다운으로 분리했다. 경계는2px 틈·안쪽4px 곡률이며, 큰 `rounded-full` 값이 안쪽 곡률까지 축소하던 문제는 바깥 반지름20px로 보완했다. 오른쪽 너비는640px 이상·정밀 포인터에서32px, 작은 화면/터치 중심 환경에서40px이며 높이는40px이다. 일간·주간의 기본/390px 화면과 메뉴·키보드 조작을 실제로 확인했다. 본문/높이 전환240ms와 단계 표시200ms는 `cubic-bezier(0.23, 1, 0.32, 1)`을 사용한다. Play는 기존 로그인된 브라우저에서 실제 커버 영상 확인→새 곡 정보→가창자→확인→수정 왕복을 검증했고 해당 공용 Stepper 파일의 해시를 최종 리뷰 시 대조해 같은 코드임을 확인했다.

| Before | After | Why |
|---|---|---|
| 직접 추가 마지막 화면의 포커스 대상에 접근성 이름 없음 | `role="group"`, `aria-label="저장 확인"` | 본문 제목을 제거해도 화면 읽기 도구에 단계 맥락을 전달 |

위 P2는 기존 단계 흐름 검사에 포커스/접근성 그룹 검증을 추가해 수정 전 실패를 확인하고 보완했다. 수정 후 관련6파일115건과 실제 앱 내 브라우저의 마지막 그룹 포커스·19:00/제목 보존·scrollLeft0을 확인했다. 최종 preflight와 원격 준비 판정은 PR #222의 현재 HEAD 근거 댓글을 따른다. 이 리뷰에서 추가 AI 호출·새 일정 저장·운영 DB/설정/비용 한도 변경은 수행하지 않았다. 실제 터치 하드웨어·로그아웃/재로그인·네트워크 장애 강제는 이 후속 브라우저 검증 범위 밖이다.

추가 로컬 증거: Git 공통 디렉터리의 `codex-evidence/stepper-motion-20261117/`, `schedule-split-button-20261117/`, `schedule-inner-corners-20261117/`, `schedule-dropdown-width-20261117/`, `pr-222-ready-20261117/`.

---

# SUL-47 implementation design QA — 2026-11-17

**Findings**

- [P2, resolved] Expanded LIVE viewer badge clipped at the left of a mobile card. At390×844, the badge started at x9.45 while the card started at x12. `translateX(max(-50%, -44px))` keeps it inside the card; post-fix x17. Evidence: `output/sul-47/qa/compare-mobile-badge-fix.png`, assembled from the actual before/after captures. Keyboard focus on a real LIVE member expanded the count. The initial result was blocked until this capture confirmed the fix.
- [P2, resolved] The image placeholder frame's inline baseline increased the desktop header from the approved120px to127px. Made the avatar frame block-level. The revised real-app capture measures both headers120px and both name rows y162.75. Final combined full/card comparisons were opened after the fix: `compare-final-full.png` and `compare-final-card.png`.
- No unresolved P0/P1/P2 differences within the checked scope.

**Comparison target and normalization**

- Approved source: `C:/Develop/overthewall-schedule/output/sul-47/.superpowers/brainstorm/1656-1794888830/content/two-member-spacing-v6.html`; original approval capture `C:/Develop/overthewall-schedule/output/sul-47/layout-spacing-v6.jpg`.
- Implementation: ordinary `/` at `http://localhost:5184/`, local Worker and isolated D1. No alternative demo route, network interception or mocked response. Public member metadata and12 representative local schedules were seeded before running the app. These schedules are examples; LIVE comes from the existing real CHZZK query.
- Recaptured source and final app at1440×900,1 CSS px per image pixel. Same2026-11-17 date, light theme, one LIVE/one offline member, same schedule text. Both grids are1120px with548px columns and24px gap. Source capture `source-v6-wide.jpg`; implementation `actual-wide-final.jpg`.
- Full comparison removes only the source's46px preview toolbar. It pads the shorter source frame and never stretches either artifact. Focused comparison aligns the actual first-card regions at native resolution. `compare-implementation.py` records exact crops and asserts equal source sizes. Both combined images were visually inspected together; separate original images were also opened.
- Prototype has no Clerk session. Actual app is a guest. LIVE count/time and pet animation naturally vary. No pixel-perfect assertion is made for these differences.

**Required fidelity surfaces**

| Surface | Result and evidence |
| --- | --- |
| Fonts and typography | Existing Poppins / Pretendard Variable / system stack retained. Header28px at full width,24px in narrow/mobile cards; schedule title20px/18px mobile, line-height1.45. Both names share a reserved row. Focused comparison shows the intended hierarchy and full wrapping. Existing contrast helper uses black text where the mock used dark gray; accepted for consistency/contrast. |
| Spacing and layout rhythm | Final full and focused comparisons retain equal columns,24px radii,120px full-width header,20px body inset,12px schedule gap and16px action gap. Fixed inline baseline drift. Existing shell controls and narrower940px content boundary remain authoritative; the prototype's simplified header does not replace the current app header. |
| Colors and tokens | Exact public signature colors `#bee155` / `#98ccf4`; sub colors mix with semantic card tokens. Light and768px dark captures show readable schedules and distinct LIVE/휴방/게릴라 states. Existing semantic backgrounds and schedule shadows retained. No new global theme styles. |
| Image quality and assets | Same actual member WebP portraits and app logo, correct round crop, sharp native rendering. Existing YouTube/X/CHZZK assets and Lucide controls reused. No generated substitute art or handcrafted logo. |
| Copy/content | No added promotional copy or repeated unit badge. Names, links, full schedule titles, truthful live/unknown state, and existing functional labels remain. Long third schedule wraps without truncation; 휴방 differs from an empty day. |

**Intentional differences**

- Existing split schedule-add control, live-help label, current app shell/footer and Bing Hayu pet remain, as explicitly requested. Source simplified or omitted these. Their presence is expected, not layout drift.
- A44px member-specific add button remains beside CHZZK so the old mobile member-add flow is preserved. The mock omitted that existing capability.
- Existing `CardSchedule` status semantics, focus ring and subtle shadow are reused. Snapshot export intentionally retains its existing layout and omits live-only controls/pet.
- Viewer count appears on hover/focus and in the accessible name; the source only showed a static LIVE badge.

**Runtime evidence and review dispositions**

-1440×900: two548px columns, matching name alignment;940×998: two compact cards;390×844 and320×844: one column, document width equals viewport width. Mobile links have44px targets. `actual-desktop-v1.jpg`, `actual-mobile-live-fixed.jpg`, `actual-mobile-long.jpg`, `actual-tablet-dark.jpg`, `actual-wide-final.jpg`.
- Dates11/16 and11/18 show no current LIVE; 휴방 and게릴라 remain distinct.11/15 displays Bing Hayu, Yang Mei and U-Lili with no roster truncation (`actual-historical.jpg`).11/18 shows all three Yang Mei schedules and a long title.
- LIVE schedule click opens the ordinary edit dialog with U-Lili/title/11:00; it does not open a broadcast. Same-content save closes the dialog and refreshes the board's edit time. Authoritative local readback confirms schedule #3 member5/date11-17/time11:00/title/status and one `update_logs` entry at05:55:34 UTC;12 schedules remain. `local-readback.json` / `local-save-readback.json`. Existing manual-edit authorization was preserved, with no bypass or alternate mutation endpoint.
- Member add preselects Yang Mei in the existing wizard; closed without saving a new schedule. Image-add menu shows its existing guest login requirement; cancelled. Timeline shows all three broadcasts in time order; toggled back.
- Profile link reaches `/profile/yang_mei` and returns via the normal link. YouTube/X hrefs match public member data. CHZZK CTA actually opens the mapped U-Lili `/live/29a1ed5c0829fa620fab900dba7e011b` page with the correct live title/member. Playback itself remains behind CHZZK's login/age verification; did not log in or bypass it.
- Existing image menu downloads `LuvDia Schedule-일정표-2026-11-18.png`; image opened and checked for all schedules and correct date. Snapshot design remains unchanged.
- Real app console: no errors observed; only existing Clerk development-key warning. Responsive/theme testing used the app's own controls and temporary viewport capability; reset called afterward.
- Independent reviewer found no concrete code defect. Parent checked their declined real-flow judgments above and confirmed/fixed their possible mobile badge concern. Final avatar-only CSS refinement was checked again in the real desktop app.

**Code identity and checks**

Initial implementation before the follow-up below: branch `codex/sul-47-luvdia-daily-layout`; base `d7a15a089034933f3036cb4a7093b2bc950eebb9`; uncommitted local implementation.

- `luvdia-member-card.tsx` SHA256 `8d13849e8a5de19eb842a1db50b47a3619348435da6edf6365ee669bf13c28ed`.
- `luvdia-member-card.css` SHA256 `27ea5f9b3b74b91bc43bd4af4d399779027532f9bd749827cd6c6ee654419495`.
- `daily-schedule.tsx` SHA256 `54615e68a7653e6b9bd67d685b5b8731bc6ea465ef57876c35d57fc4cc263ac5`.
- Node24.20.0. Functional RED: three new owning-route regressions failed before connection. GREEN: nine affected files/78 tests. These tests enforce the accepted behavior rather than redefine it. Only CSS refinements followed, leaving the functional result reusable.
- App typecheck, `pnpm typecheck:test` (tests/Worker/Node), changed-code ESLint, architecture check and final `pnpm build:luvdia` / `pnpm build` with artifact manifests passed. No full preflight claim. Runtime dependency install used the existing frozen lockfile, no dependency/config changes.
- Canonical fresh local D1 bootstrap applied171 migrations before seeding; no migration/source changes. Production state and the original dirty checkout were untouched.

**Open Questions / remaining verification limits**

None blocking the local implementation. OTW is covered by owning tests and its build, not a new OTW browser session. Loading/error/absent-channel states are covered by focused component/route tests; no live outage was induced. Physical touch devices, authenticated/admin paths, deletion and actual clipboard copy were not exercised. Mobile/dark captures precede only the final block-display fix; the mobile128px min-height and target dimensions did not change. No remote deployment or production schedule verification was performed. No authority drift found.

**Implementation Checklist**

- [x] Apply approved header-name cards only to LuvDia daily grid.
- [x] Retain current shell, complete schedules, historical roster and existing controls.
- [x] Fix visual findings and inspect combined post-fix source/rendered evidence.
- [x] Verify intended local entry point, live destination, existing save and download flows.
- [x] Record focused checks, identity and limits; leave changes local for review.

## Follow-up: hover animation, dialog exit, offline copy

The user's later feedback is the current contract for these three details. The approved layout is retained, with the offline text intentionally removed. No authority drift or new design approval is required.

- [P2, resolved] Viewer text had width/opacity changes without any CSS transition. Restored200ms max-width/opacity/translateX transitions for hover and keyboard focus. Existing user-disabled animations still override them, and OS reduced motion gets no transition. Real browser measured collapsed opacity0/max-width0, expanded hover opacity1/max-width100, and intermediate opacity0.849091 during keyboard focus. The accessible LIVE count and mapped channel remain intact.
- [P2, resolved] Real daily edit close changed the title to `스케쥴 추가` during `data-state=closed`, shrinking the visible height about644→366px. Parents clear `schedule` while Radix retains the exit content. The shared dialog now freezes only its presentation mode while closed, updating synchronously at the next open. Tests retain real Radix exit presence via animation-name CSS and prove both stable closing content and fresh subsequent add/edit modes. This is supporting verification; the actual app's normal controls were checked separately.
- Post-fix real daily Escape and weekly Cancel keep title `스케쥴 수정`, offsetWidth576 and offsetHeight606 in open/closed states, with no add wizard. The ordinary next member-add correctly selects Yang Mei. No save/delete was executed in this follow-up.
- CLOSE has no visible status label; pending/unknown labels and offline CHZZK channel links remain. Both member name rows stay aligned (y162.847 CSS px in the final wide capture).
- New captures: `output/sul-47/qa/feedback-mobile.jpg` and `feedback-final.jpg`; open/closed measurements: `feedback-daily-close.json` / `feedback-weekly-close.json`; steady real hover samples: `feedback-chip-animation.json`. Browser zoom changed to0.9 in this turn: requested390×844 gives433×937 CSS px and a481×1042 image; requested1440×900 gives1600×1000 CSS px and a1778×1111 image. Saved image dimensions were read directly. These are runtime checks, not new1:1 source-image comparisons. Do not attribute zoom differences to design drift. Temporary viewport override was reset and initial collapsed pet state restored.
- Verification:48 card/daily/dialog tests plus21 weekly/save-feedback/snapshot tests passed (8 files/69 tests); app and test/Worker/Node types, changed-file ESLint and both site builds/manifests passed. New closing/copy checks failed first. No full preflight, live save/delete, physical touch or actual OS preference toggle was required or performed. Console errors: none observed.
- Current SHA256: `schedule-dialog.tsx` `d82abce9a157498a7756186542d5e4984a07b7707a74c4001d9b18812dfc6320`; `luvdia-member-card.tsx` `16d940cf65adb390329767cdcdeb5c7e406e88ba719103fff0c239d45f9d717f`; CSS `853e53927c162bc3ef3c7625934bf8e83f99f0fa63259843404b87950b97455c`. Earlier identities above are historical.

final result: passed
