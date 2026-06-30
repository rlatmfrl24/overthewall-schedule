# OTW Schedule Design Guide

이 문서는 현재 구현된 OTW Schedule의 화면, 컴포넌트, 색상, 접근성 기준을
정리한 디자인 가이드입니다. 새 화면을 만들거나 기존 화면을 개선할 때는 이
문서를 먼저 확인하고, 변경 후 문서도 함께 갱신합니다.

## 기준 파일

| 영역 | 파일 |
| --- | --- |
| 전역 토큰 | `src/index.css` |
| 공개 앱 프레임 | `src/components/app-shell.tsx` |
| 공개 내비게이션 | `src/components/app-navigation.ts` |
| 콘텐츠 페이지 헤더 | `src/components/content-page-shell.tsx` |
| 사이트 푸터 | `src/components/footer.tsx` |
| UI primitive | `src/components/ui/*` |
| 일정 입력 | `src/shared/schedule/schedule-dialog.tsx` |
| 공지 배너 | `src/shared/notice/notice-banner.tsx` |
| 관리자 레이아웃 | `src/features/admin/admin-layout.tsx` |

## 제품 톤

- 공개 화면은 팬 사이트다운 친근함과 빠른 스캔성을 함께 가져간다.
- 관리자 화면은 장식보다 밀도, 정렬, 상태 확인을 우선한다.
- 멤버 색상은 감성 요소가 아니라 정보 accent로 쓴다.
- 플랫폼 고유색은 아이콘, 작은 배지, 상태 강조에만 제한한다.
- 다크모드에서는 강한 블루 선택색을 쓰지 않는다. 사이드바 활성 항목은 흰색
  배경과 어두운 텍스트를 사용한다.

## 앱 프레임

- 일반 공개 화면은 `PublicAppShell`을 사용한다.
- `lg`에서는 접힌 64px 사이드바, `xl`에서는 256px 사이드바를 사용한다.
- 모바일은 56px 상단 헤더와 `Sheet` 메뉴를 사용한다.
- 사이드바 상단 brand 영역과 콘텐츠 헤더는 데스크톱에서 64px 높이로 라인을
  맞춘다.
- 사이드바 푸터는 펼친 상태 56px, 접힌 상태 64px를 기준으로 한다.
- 사이트 푸터는 56px 기준의 보조 정보 영역이다. `/multiview`처럼 화면 높이가
  중요한 작업형 화면에서는 푸터를 숨긴다.

## 콘텐츠 페이지

공지사항, VOD & 클립, 멤버 게시글처럼 콘텐츠를 탐색하는 화면은
`ContentPageShell`을 사용한다.

- 헤더 divider는 좌우 여백 없이 전체 폭을 채운다.
- 헤더는 스크롤 컨테이너 밖에 고정되어 스크롤 위치에 흔들리지 않는다.
- 헤더 내부 콘텐츠는 `max-w-screen-2xl`과 동일한 좌우 패딩 체계를 따른다.
- 페이지 본문은 `px-3 sm:px-5 lg:px-7 xl:px-8`, `gap-5`, `pb-10` 흐름을
  기본으로 한다.

## 화면별 패턴

### 오늘의 스케쥴

- 멤버 카드가 홈 화면의 핵심이다. 아바타, 멤버명, 그룹칩, 라이브 상태가 먼저
  읽혀야 한다.
- 그룹명 칩은 카드 우측 상단에 배치해 카드 높이를 절약한다.
- 라이브 표시는 아바타와 통합하고, hover 시 시청자 수를 보여준다.
- schedule card는 좌측 flag divider 없이 상태칩, 시간, 제목만으로 읽히게 한다.
- 카드 텍스트는 WCAG 대비와 모바일 줄바꿈을 기준으로 조정한다.

### 주간 스케쥴표

- 주간 화면은 테이블형 정보 탐색이 우선이다.
- sticky 요일 헤더와 멤버 열을 유지한다.
- schedule item은 시간, 상태, 제목 순서로 읽히게 하고 과한 장식은 피한다.
- 다크모드에서는 미묘한 실선이나 겹친 배경이 보이지 않도록 투명도 중첩을
  줄인다.

### VOD & 클립

- 플랫폼별 콘텐츠는 같은 섹션 헤더, 날짜 그룹, 카드 밀도를 공유한다.
- 미디어 카드는 썸네일 비중을 크게 두고 제목은 2줄 안에서 끊는다.
- 더보기/접기 버튼은 outline surface, 충분한 높이, 명확한 텍스트 대비를
  유지한다.

### 멤버 게시글

- VOD와 같은 콘텐츠 페이지 간격과 헤더 체계를 사용한다.
- 게시글 카드는 읽기 중심의 넓은 리스트로 유지한다.
- X와 Naver Cafe는 같은 골격을 쓰고 플랫폼 차이는 아이콘/작은 상태 요소에만
  드러낸다.

### 멀티뷰

- `/multiview`는 작업형 화면이다. 가능한 많은 높이를 플레이어와 컨트롤에
  할당한다.
- 로그인 게이트, 확장 연결 상태, 플레이어 옵션은 명확한 카드/패널 구조를 쓴다.
- OTW Schedule + 확장 기능은 보조 기능으로 표시하고, 웹 기본 기능을 가리지
  않는다.

### 프로필과 스냅샷

- 프로필과 스냅샷은 앱 크롬을 숨기는 특수 화면이다.
- 프로필은 이미지와 멤버 accent를 적극적으로 사용한다.
- 스냅샷은 공유 이미지 생성용이므로 고정 폭, 안정적 렌더링, 큰 텍스트 대비를
  우선한다.

### 관리자

- 관리자 화면은 `AdminLayout`과 `AdminSectionHeader`를 기준으로 한다.
- 필터는 form grid, 결과는 table/card 조합, 수정은 dialog를 사용한다.
- 위험 액션은 confirm dialog와 toast를 함께 사용한다.

## 색상과 토큰

- 배경/전경/카드/경계는 `src/index.css` semantic token을 우선한다.
- OTW brand accents는 `--otw-1`, `--otw-2`, `--otw-3`를 사용한다.
- 사이드바 활성 상태:
  - light: `--sidebar-primary` 기반의 어두운 선택면.
  - dark: 흰색 선택면과 어두운 텍스트.
- 멤버 `main_color`는 카드 헤더, 아바타 border, 작은 상태 accent에 사용한다.
- 멤버 `sub_color`는 낮은 opacity 배경 tint에만 사용한다.
- 멤버 색상 위 텍스트는 반드시 대비 계산을 거친다.

상태 색상 기준:

- LIVE: red 계열, 흰 텍스트, 작은 pulse dot.
- 방송: 멤버색 또는 teal 계열.
- 휴방: rose/zinc 계열.
- 게릴라: amber 계열.
- 미정: slate/zinc 계열.
- 공지: neutral surface + 아이콘/배지 강조.
- 이벤트: purple 계열은 작은 배지에만 제한.
- YouTube: red 계열.
- CHZZK: emerald/cyan 계열.

## 타이포그래피

- 기본 폰트는 `Inter`.
- 페이지 제목: `text-xl`-`text-2xl`, `font-semibold` 또는 `font-bold`.
- 카드 제목: `text-sm`-`text-base`, 중요 멤버명은 더 크게 허용.
- 메타 텍스트: `text-xs`-`text-sm text-muted-foreground`.
- 시간/숫자는 `tabular-nums`를 사용한다.
- display급 큰 글자는 프로필, 스냅샷, 홈 멤버명처럼 명확한 이유가 있을 때만
  쓴다.

## 컴포넌트 규칙

- 버튼은 `src/components/ui/button.tsx` variant를 우선한다.
- 아이콘 버튼에는 `aria-label`을 반드시 둔다.
- 일반 카드는 `rounded-lg`/`rounded-xl`, `border`, `shadow-sm`를 기본으로 한다.
- 카드 안에 카드 중첩은 피하고, repeated item 또는 modal처럼 실제로 필요한
  경우에만 card surface를 쓴다.
- Hover는 색상, border, 작은 shadow 정도로 제한한다.
- 필터 chip은 짧은 라벨과 명확한 selected state를 유지한다.
- Empty/Loading/Error 상태는 모든 데이터 화면에 준비한다.

## 접근성

- 일반 텍스트 대비는 WCAG AA 4.5:1 이상을 목표로 한다.
- 큰 텍스트와 아이콘+텍스트 chip도 배경 대비를 확인한다.
- focus-visible ring은 제거하지 않는다.
- `aria-current`, `aria-expanded`, `aria-controls`, `aria-pressed`를 상태에 맞게
  사용한다.
- 클릭 가능한 `div` 대신 `button` 또는 `a`를 우선한다.
- 모바일 버튼과 chip은 터치하기 쉬운 높이를 유지하고 텍스트가 겹치지 않게 한다.

## 구현 체크리스트

- 기존 feature에 같은 패턴이 있는가?
- `PublicAppShell` 또는 `ContentPageShell`을 재사용할 수 있는가?
- 새 색상은 semantic token, 상태색, 멤버색, 플랫폼색 중 하나인가?
- light/dark mode에서 선택 상태와 focus 상태가 명확한가?
- 모바일에서 긴 문구가 버튼이나 카드 밖으로 넘치지 않는가?
- 로딩, 빈 상태, 에러 상태가 있는가?
- 접근성 label과 keyboard 동작이 있는가?
- 변경된 UI 규칙을 이 문서에 반영했는가?
