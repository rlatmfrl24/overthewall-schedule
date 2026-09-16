# Playlist card design QA

Reference: user-supplied codex-clipboard-e3fd8105-2bf7-436f-9942-ad8a206c5e8f.png, after panel.
Implementation: http://localhost:5173/play/playlists (existing production app, local preview).
Scope: adapt the full-bleed imagery and bold overlaid typography, retaining OTW content and navigation. The reference is a style board, not an exact viewport or content specification.

- Typography: existing Korean font, weight 900, responsive title sizes, readable member names and separate small metadata.
- Layout: edge-to-edge imagery, large collection cards, portrait member cards, bottom metadata; desktop four columns and mobile one column.
- Colors: white text over a 55% black scrim, preserving recognizable images and contrast. Existing app shell retained.
- Image quality: real member profiles and catalog thumbnails; existing OTW graphic for absent imagery. Initial P2: embedded black bars in YouTube thumbnails broke the full-bleed treatment. Fixed centered crop and scale; subsequent mobile screenshot confirms removal.
- Content: actual titles, counts and private status retained. Redundant member description replaced by concise category label.
- Interaction: cover card opens /play/playlists/defaults/cover, heading readback confirms the intended detail; back link returns to playlists.
- Responsive: 390px viewport has 390px document width; card client/scroll widths both 348px. Desktop and mobile screenshots visually inspected. Viewport reset after verification.
- Validation: changed TSX ESLint and TypeScript project check passed. No API or persistence changes.

final result: passed

---

# 편성표 포스터 디자인 QA — 2026-09-16

이 문서의 최신 검토 대상은 아래 편성표 포스터다. 위 Playlist card 기록은 별도 대상의 이전 검토 결과이며, 이번 판정에 포함하지 않는다.

## 판정과 범위

**디자인 품질 미통과: P1 1건, P2 1건.** 기술적 출력 성공과 디자인 품질을 구분한다. 이번 작업은 생성된 정적 포스터의 검토이며 제품 코드는 수정하지 않았다.

사용자 목적: 공유용 이미지에서 날짜, 방송 시간, 멤버, 방송 내용을 빠르게 읽고, OTW 3색과 멤버 색상이 조화롭게 드러나야 한다. 버튼, 터치 영역, 키보드 탐색, hover, 애니메이션은 평가 대상이 아니다.

요청된 design-qa는 독립적인 원본 시안과 구현을 대조하는 도구다. 원본 시안이 없으므로 원본 충실도는 판정할 수 없다. 스킬의 audit 라우팅에 따라 사용자가 이번 요청에서 지목한 생성 PNG를 직접 열어 정적 포스터 품질을 검토했다. 같은 구현을 원본으로 복제하여 충실도 통과를 만들지 않았다.

## 증거와 상태

- Source visual truth: 없음. 승인된 독립 시안/Figma/목업이 존재하지 않는다.
- Implementation light: `.tmp/snapshot-poster/light.png`
- Implementation dark: `.tmp/snapshot-poster/dark.png`
- Full-view comparison: `.tmp/snapshot-poster-qa/390px-editions.png` — 왼쪽 라이트, 오른쪽 다크. 원본/구현 대조가 아닌 동일 출력물의 테마 비교다.
- 상태: 2026-09-14, 시간 확정 2건, 게릴라 2건, 미정 1건, 휴방 2건, 일정 없음 1명.
- 원본 PNG: 각각 1440 × 2350px. CSS 지면: 720 × 1175px. 출력 밀도: 2x.
- 정규화: 각 PNG를 가로 390px, 세로 637px로 동일 비율 축소하여 24px 간격으로 배치. 실제 기기 스크린샷이 아니라 이미지 표시 폭을 가정한 비교다. 게시 플랫폼과 최종 표시 폭은 미지정이다.
- 이번 검토에서 두 PNG 원본을 열어 전체 구성과 글자/이미지를 확인한 뒤, 같은 입력에 라이트/다크 축소본을 함께 놓고 재검토했다. 원본에서 멤버 영역과 글자가 판독되어 별도 확대 크롭은 불필요했다.
- 브라우저 재캡처 및 다운로드 재실행: 이번 검토에서는 수행하지 않음. 대상은 사용자가 명시한 생성 파일 자체다. 새 상태, 콘솔 오류, 다량 방송, 긴 보조 제목은 이번 증거에 포함되지 않는다.
- 코드 근거: `src/features/schedule-board/ui/daily/snapshot/snapshot-timeline.css`.
- Git base: `4255461` + 현재 미커밋 변경. 출력물은 해당 브랜치 작업 중 생성한 결과다.
- Light SHA256: `29297248FC4E5A3FF896DFF1A8733DAB6400DF9E8EF2A1F75F266C436F0B4F85`
- Dark SHA256: `391D18630CC809A2F3E76E56F17C3E86A899B3F45F2B37A6EF80C8F65E4E0D15`

![390px 공유 크기 비교](.tmp/snapshot-poster-qa/390px-editions.png)

## Findings

### [P1] 공유 크기에서 멤버 명단과 상태가 너무 작다

- 위치: `.snapshot-compact-name`, `.snapshot-secondary-heading h2`, `.snapshot-compact-title`, `.snapshot-programme-title` (CSS 36, 42, 48–49행).
- 증거: 720px 지면을 390px로 표시하면 하단 이름 18px → 약 9.8px, 상태 16px → 약 8.7px, 보조 제목 13px → 약 7.0px, 주 방송 제목 22px → 약 11.9px가 된다. 같은 비교에서 날짜는 약 60.7px로 읽힌다. 전체 8명 중 하단 6명의 정보가 본방송 2명보다 지나치게 작다.
- 영향: 확대하지 않고 멤버의 게릴라/미정/휴방 여부를 확인하기 어렵다. 원본 해상도를 높여도 상대적 글자 크기는 변하지 않는다. 가로 390px 정도로 공유되는 경우 발생 가능성이 높고, 핵심 정보 탐색에 직접 영향을 준다.
- 수정: 하단 이름 26–28px, 상태명 24px, 보조 제목 22–24px, 주 제목 28px부터 재조정한다. 긴 이름에서 2열 유지가 어려우면 명단을 1열로 배치한다. 날짜를 84–92px로 낮추고 상단 여백을 줄여 정보 영역에 공간을 돌린다. 사진의 하단 멤버색 표식도 축소본에서 식별 가능하게 함께 확대한다.
- 통과 조건: 390px 표시에서 확대 없이 이름·상태·방송 제목을 읽을 수 있고 긴 이름이 충돌하지 않아야 한다. 390px은 검토 가정이며 확정 플랫폼 규격이 아니다.

### [P2] 라이트 포스터의 코랄 날짜 대비가 낮다

- 위치: `.snapshot-date-day`, `--poster-paper` (CSS 3, 21행).
- 증거: 코랄 `#F66479` / 종이 `#FFFAF0`의 sRGB 상대 휘도 대비는 약 **2.88:1**. 같은 코랄 / 다크 `#142D30`는 약 **4.85:1**이다. 라이트 원본과 축소본에서 날짜 가장자리의 구분이 다크보다 약하다.
- 영향: 날짜 자체는 큰 크기로 보이지만, 밝은 환경·추가 축소에서 가시성 여유가 적다. 전체 접근성 준수 판정은 아니며 큰 글자 3:1을 최소 참고 목표로 삼은 색상 검사다.
- 수정: 코랄 원색은 장식용 면에 유지하고 날짜 글자는 더 짙은 코랄 파생색을 사용하거나, 원색 코랄 면 위에 짙은 날짜를 배치한다. 라이트 텍스트 대비는 최소 3:1, 여유를 위해 3.5:1 이상을 목표로 한다.
- 통과 조건: 실제 출력 PNG의 색상 확인과 같은 390px 비교에서 개선이 확인되어야 한다.

## 필수 5개 검토 영역

| 영역 | 확인 결과 | 판정 |
|---|---|---|
| 글꼴·타이포그래피 | Pretendard, 이름/시간의 두꺼운 활자, 제목 전체 표시는 확인. 축소 시 명단/설명이 작고 정보 간 크기 차이가 과도함. 실제 폰트 로드 상태는 이번 PNG만으로 확정하지 않음. | P1 |
| 여백·편집 리듬 | 카드 없이 색면과 괘선으로 구분하며 겹침/잘림은 표본에서 없음. 방송 시작 전 약 348/1175px, 전체 높이의 약 30%를 사용함. 핵심 정보 확대를 위한 상단 압축 권장. | P1 개선과 연계 |
| 색상·토큰 | OTW 3색 및 멤버 주/보조색이 보임. 주 방송의 검정 글자는 읽히며 라이트 날짜 대비는 부족. 전체 색면 균형은 아래 주관적 제안으로 분리. | P2 |
| 이미지·에셋 | 실제 OTW 로고와 멤버 프로필 사용, 가짜 그림/아이콘 없음. 원본에서 두 주 방송 인물은 식별 가능. 흰 사각 사진 바탕의 통합감과 하단 사진의 축소 가시성은 개선 여지. | P1 연계 / P3 |
| 문구·내용 | 날짜·요일·시간·멤버·제목·상태·최종 편집 시각이 표본에 유지됨. '2개의 방송'은 시간 확정 항목만 세므로 표현을 명확히 할 여지. | P3 |

## Follow-up Polish — 주관적 편집 제안

- **[P3] 넓은 원색 면 사이의 경쟁:** 청록 상하단과 보라/연두 방송 면의 면적이 모두 커서 날짜, 브랜드, 멤버를 동시에 강하게 강조한다. 멤버 주색을 반드시 유지하되 상하단 청록 면적을 줄여 방송 영역을 중심으로 보이게 하는 안을 비교한다. 색이 많다는 이유만으로 오류로 판정하지 않는다.
- **[P3] 사진의 흰 직사각형이 색면과 분리됨:** 기존 원본의 배경을 억지로 제거하거나 가짜 에셋으로 바꾸지 말고, 사진 높이·여백·배경 처리를 통일해 색면과의 경계를 의도적으로 정리한다.
- **[P3] 중복 표기:** `2026년 9월`과 `09.14`, 상단 KST와 하단 KST가 반복된다. 연도만 남기고 시간대 안내를 한 곳에 모으면 시선이 덜 분산된다. 방송 수는 `시간 확정 2건`으로 명시하는 편이 분명하다.

## 검토 단계

1. 라이트 원본 — 출력 깨짐 없음. 날짜 대비 개선 필요.
2. 다크 원본 — 출력 깨짐 없음. 날짜 대비는 라이트보다 충분함.
3. 390px 라이트/다크 동시 비교 — 하단 명단과 상태 가독성 미달.

## Implementation Checklist

1. 공유 표시 폭 기준으로 이름·상태·제목 크기를 먼저 조정한다.
2. 늘어난 정보 크기에 맞춰 날짜/상단 여백과 명단 열 수를 재배분한다.
3. 라이트 날짜의 글자색/바탕 조합을 수정한다.
4. 색면 비중·사진 처리·중복 문구를 정리한다.
5. 수정한 PNG를 같은 날짜·상태·밀도에서 다시 출력하고 390px 비교를 반복한다. 긴 이름/긴 보조 제목/많은 방송이 있는 날도 추가한다.

## 비교 이력과 한계

- Iteration 1: 사용자가 지목한 생성 출력물 검토. P1/P2 위 2건 발견. 이번 요청은 QA이므로 디자인 수정 및 수정 후 비교는 수행하지 않았다.
- 승인된 독립 원본이 없어 원본 충실도 비교는 불가능하다. 사용자 요구사항과 현재 출력물의 품질만 평가했다.
- 테스트/린트/빌드 통과를 시각 품질 근거로 사용하지 않았다.
- 기존 제품 코드 및 이전 Playlist QA 기록은 보존했다.

final result: blocked

## Iteration 2 — QA 수정 및 아바타/로고 정리

사용자가 위 QA의 수정을 명시적으로 요청했으며, 아바타와 사각 로고 배경의 개선을 추가했다. 이번 수정 비교의 시각적 기준은 **Iteration 1 출력물 + 승인된 변경사항**이다. 독립적인 최초 목업과의 픽셀 일치를 주장하지 않는다.

### 적용한 수정

- P1: 주 제목 22→28px, 하단 이름 18→26px, 상태 제목 16→24px, 보조 제목 13→22px. 상태 제목을 명단 위로 이동하여 이름의 사용 폭을 확보했다.
- P2: 라이트 날짜를 `#C93655`로 변경했다. `#FFFAF0` 배경 대비 **4.87:1**로 확인했다. 다크 날짜의 기존 코랄은 유지했다.
- 아바타: 원본 이미지를 유지하면서 원형으로 통일했다. 방송 96px, 명단 56px, 멤버 주/보조색 테두리. 얼굴 식별과 머리 주변 크롭을 실제 출력에서 확인했다.
- 로고: 원본 투명 SVG의 사각 배경과 패딩을 제거했다. 배경색을 담은 배지 대신 종이 위에 직접 배치했다.
- 편집: 날짜 112→88px, 상하단 넓은 청록 면을 가는 선으로 변경, 앰버 요일 박스를 밑줄로 변경했다. 중복 월/KST 문구를 제거하고 `시간 확정 2건`으로 범위를 명확히 했다.

### 실제 출력 및 재비교 증거

- 경로: 홈 → 시간순 보기 → 2026-09-14 → 스케쥴 복사 옵션 → 이미지 다운로드. 라이트/다크 각각 다운로드 완료 알림과 저장 파일을 확인했다. 검증 후 사용자 테마는 원래 `시스템`으로 복원했다.
- 수정 후 라이트: `.tmp/snapshot-revision/light.png`
- 수정 후 다크: `.tmp/snapshot-revision/dark.png`
- 동시 비교: `.tmp/snapshot-revision/comparison-390.png` — 왼쪽 수정 전 라이트, 가운데 수정 후 라이트, 오른쪽 수정 후 다크.
- 동일 날짜/데이터/출력 밀도. 수정 후 각 PNG는 1440×2930px, CSS 지면 720×1465px, 2x. 비교에서는 가로 390px에 맞춰 새 출력물을 390×794px로 정규화했다. 이미지의 위를 맞추고 원래 비율을 유지했으며, 높이를 같게 늘리거나 자르지 않았다.
- 표시 폭 390px에서 하단 이름 약 14.1px, 상태명 13px, 주 제목 약 15.2px. 날짜 축소 및 정보 확대에 따른 전체 높이 증가는 의도된 변경이다.
- 브라우저 읽기 확인: `data-snapshot-ready=true`, Pretendard 적용, 프로필 8개 모두 로드, 제목/멤버명 scroll 크기 초과 없음, 아바타 곡률 모두 50%.
- 추가 상태: 2026-09-16 빈 일정에서 8명 모두 표시, 가장 긴 멤버명 포함 잘림 없음. 실제 화면을 열어 확인했다. 이 상태의 별도 PNG 저장은 하지 않았다.

![수정 전후 390px 비교](.tmp/snapshot-revision/comparison-390.png)

### 후속 검토

| 영역 | 수정 후 확인 |
|---|---|
| 글꼴/타이포그래피 | 실제 웹폰트 확인. 축소 비교에서 이름/상태/제목이 읽히며 기존 전체 제목 유지. P1 해결. |
| 여백/편집 | 상단이 줄고, 상태 제목 아래 넓은 명단으로 재배치됨. 표본에서 겹침/잘림 없음. |
| 색상 | 라이트 날짜 4.87:1. 멤버 색면 유지, 청록/앰버 면적 조절. P2 해결. |
| 이미지 | 원본 로고/프로필 유지. 사각 로고 배경 제거. 원형 아바타 크기 확대와 테두리 처리 확인. |
| 문구 | 연도/날짜, 시간대 안내의 중복 제거. 확정 방송 수 의미 명확화. 데이터 내용 유지. |

**요청 범위 재검토: 통과.** 위 P1/P2와 추가 아바타/로고 요청에서 남은 조치 항목은 없다. 전체 원본 목업 충실도 인증은 이번 결과에 포함하지 않는다. 방송이 매우 많은 날과 임의의 긴 보조 제목의 시각 검토는 별도 표본이 필요하다. 기존 긴 제목/보조 정보 보존 테스트는 유지한다.

final result: passed

## 2026-09-16 기존 편성표 병행 제공 QA

### 결과

확정 포스터를 기본으로 유지하고 별도 레거시 다운로드·복사 및 관리자 디자인 선택을 연결했다. 실제 홈의 시간순 보기 → 다운로드 메뉴에서 네 동작을 실행했다. 다운로드 두 디자인의 라이트/다크 PNG를 저장하고 복사 두 동작의 성공 알림도 확인했다. 생성 중 출력 버튼 비활성화를 확인했다. 브라우저 도구의 클립보드 조회는 빈 목록을 반환하여 클립보드 바이트의 별도 재조회는 하지 못했다. 복사 성공은 실제 `navigator.clipboard.write` 완료 후 표시된 알림 기준이다.

### 실제 산출물과 비교

- 실행 데이터: 로컬 서버의 2026-09-14 일정. 방송 2건, 게릴라 2건, 미정 1건, 휴방 2건, 일정 없음 1명. 실제 제목·시간·최종 편집(2026.09.14 16:56)과 아바타를 확인했다.
- 기존 편성표: `.tmp/snapshot-legacy/dark.png`, `light.png` — 각각 1088×2210 PNG, CSS 출력 544×1105(콘텐츠 520+좌우 12), 2x. 파일명 `오버더월 스케쥴-기존편성표-2026-09-14.png` 확인. 두 출력 모두 Pretendard이며 어두운/밝은 테마가 반영됐다.
- 참고 이미지 대조: `.tmp/snapshot-legacy/comparison-544.png` — 왼쪽 첨부 참고 이미지, 가운데 실제 다크, 오른쪽 실제 라이트. 각 폭 544px, 원래 비율 및 상단 정렬 유지. 참고 이미지는 9월16일의 다른 데이터이므로 행 수·높이가 다르다. 둥근 패널, 민트 상단선/시간, 80px 시간 열, 원형 아바타, 소속 칩, 하단 상태 패널의 구성을 비교했다. 손글씨에서 Pretendard로 바뀐 글자 형태·줄바꿈은 의도된 차이다. 복숭아색 스타일은 사용하지 않았다.
- 확정 포스터 재출력: `.tmp/snapshot-legacy/poster-dark.png`, `poster-light.png`, 각각 1440×2930. 기존 `.tmp/snapshot-revision` 산출물과 비교했다. 다크는 SHA256까지 동일(`793AAE9AF065AC23E0B5CC2C089150872FA0173BD725FD73739EE35536F75757`), 라이트는 동일 크기에서 숫자 날짜 영역의 안티앨리어싱 픽셀 4개만 달랐다(x151–286, y331–370). 레이아웃/색상/내용 회귀 없음.
- 그리드의 기존 카드 배치·색상·폰트를 실제 화면에서 확인했고 기존 편성표 메뉴가 없는 것을 확인했다. `mode=grid&design=legacy`에서도 그리드가 표시됐다.

![참고 이미지와 기존 편성표 비교](.tmp/snapshot-legacy/comparison-544.png)

### 경로와 상태 확인

- 이전 `/admin/snapshot?...&design=legacy`가 `/admin/content?...&design=legacy&tab=snapshot`으로 이동하고 544px 미리보기를 표시했다.
- 관리자에서 테마 변경·오늘 날짜 변경·그리드 왕복 후 legacy 선택이 유지됐다. 새 탭을 실제 열어 `date=2026-09-16&mode=timeline&theme=light&design=legacy`와 8명의 일정 없음 패널을 확인했다.
- 잘못된 design URL은 포스터로 정규화됐다. 생략/잘못된 값, 그리드 조합, 파일명, 관리자 검색 상태 및 미리보기 선택은 단위 테스트로도 확인했다.
- 실제 레거시 루트의 준비 상태 true, 폰트 모드 web, `OTW Snapshot Pretendard`, 폭 544를 확인했다. 공통 폰트 대체 테스트와 제목/실제 사유/보조 시간/동시 방송/시간 정렬/빈 일정 테스트가 통과했다. 극단적으로 긴 데이터의 보존은 컴포넌트 테스트이며 실제 서버에 임의의 검증 일정을 추가하지 않았다.
- 사용자 화면 테마는 검증 후 원래 시스템으로 복원했다. 디자인 선택의 영구 저장은 추가하지 않았다.

### 자동 검증

`pnpm preflight`: PASS. 아키텍처, 테스트 타입 검사, 린트, 301개 파일/2,270개 테스트, 프로덕션 빌드, 로컬 D1 doctor, agent mirror 검사를 통과했다. 로그: `.tmp-legacy-preflight.log`. 기능 테스트는 실제 다운로드 검증을 보조하며 서버 데이터나 기본 출력 경로를 대체하지 않았다. 새 API/DB/마이그레이션 없음. 커밋·푸시·배포는 수행하지 않았다.

final result: passed (클립보드 독립 바이트 재조회와 극단 데이터의 실제 화면 검증 제한은 위에 명시)

### 최종 코드 검토 후속 조치 (2026-09-16)

포스터 집계 문구 제거에 따라 사용되지 않는 `.snapshot-section-heading > span`, `.snapshot-secondary-heading > span` CSS 2줄을 삭제했다. 최신 메인 버튼/메뉴 Beta 문구 및 포스터 건수 제거를 포함한 관련 테스트 9개 파일/34개가 통과했다. 코드 검토에서 중대한 기능 오류는 발견하지 않았다. 전체 preflight 2,270개 통과는 위 병행 제공 구현 시점의 결과이며 이후 문구 및 미사용 CSS 수정에는 관련 테스트를 재실행했다. 코드 검토에서 실제 최신 포스터의 건수 제거와 레이아웃을 확인했다.

### PR #142 미리보기 높이 회귀 수정 (2026-09-16)

디자인 전환 후 이전 iframe 높이가 body/document의 h-screen 높이를 통해 다시 최솟값으로 반영되는 문제를 수정했다. 최종 높이는 스냅샷 루트의 scrollHeight와 기존 최소 높이 640px만으로 계산한다. 회귀 테스트에서 수정 전 1465px → 1105px 전환 실패를 재현했고 수정 후 통과했다. 실제 관리자 화면에서 포스터(720×1465) → 기존 편성표(544×1105) → 포스터(720×1465) 왕복을 확인했다. 관리자 미리보기 테스트 2개, 해당 파일 ESLint, `pnpm run typecheck:test` 통과.
