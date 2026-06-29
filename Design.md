# OTW Schedule Design Guide

이 문서는 현재 구현된 OTW Schedule 화면과 컴포넌트의 디자인 언어를 기준으로, 향후 화면 개발 및 개선 시 일관된 톤앤매너를 유지하기 위한 가이드입니다.

## 목적

- 새 화면은 기존 `src/routes`, `src/features`, `src/components/ui`, `src/shared`의 패턴을 먼저 따른다.
- 디자인 변경은 전역 토큰, shadcn/ui primitive, 멤버별 색상 체계 위에서 확장한다.
- 사용자 공개 화면은 팬 사이트다운 친근함과 시각적 즐거움을 유지하고, 관리자 화면은 조용하고 밀도 높은 운영 도구처럼 만든다.
- 같은 기능군 안에서는 레이아웃, 상태 표현, 문구, 인터랙션을 반복 사용한다.

## 기준 파일

- 전역 토큰: `src/index.css`
- 앱 프레임: `src/routes/__root.tsx`, `src/components/header.tsx`, `src/components/footer.tsx`
- UI primitive: `src/components/ui/*`
- 공통 일정 입력: `src/shared/schedule/schedule-dialog.tsx`
- 공통 공지 배너: `src/shared/notice/notice-banner.tsx`
- 사용자 화면: `src/features/daily`, `src/features/weekly`, `src/features/vods`, `src/features/clips`, `src/features/youtube`, `src/features/member-posts`, `src/features/x`, `src/features/naver-cafe`
- 프로필/이미지 출력 화면: `src/routes/profile/$code.tsx`, `src/features/daily/snapshot`
- 관리자 화면: `src/features/admin`

## 화면 카탈로그

### 공통 앱 프레임

- 일반 화면은 상단 `Header`, 본문 `Outlet`, 하단 `Footer`가 있는 `100dvh` 플렉스 레이아웃을 쓴다.
- `Header`는 sticky, 반투명 배경, blur, 얇은 border를 사용한다.
- 데스크톱 내비게이션은 ghost button 기반이며 active 링크는 font weight로만 강조한다.
- 긴 메뉴와 외부 링크는 넓은 화면에서만 직접 노출하고, 작은 화면에서는 `더보기` 메뉴로 묶는다.
- `Footer`는 muted 배경, 작은 텍스트, 아이콘 링크를 사용해 보조 정보로 유지한다.

### 오늘의 스케쥴

- 메인 홈 화면은 팬 사이트의 핵심 경험이다. 멤버 프로필 이미지, 멤버별 `main_color`, `sub_color`, 라이브 상태를 적극적으로 사용한다.
- 데스크톱은 멤버 카드 그리드, 모바일은 compact 카드, 대체 보기로 시간순 편성표를 제공한다.
- 상단 헤더는 아이콘 박스, 날짜, 주요 액션, 날짜 이동 컨트롤을 한 줄 또는 래핑 가능한 그룹으로 구성한다.
- D-Day와 공지 배너는 일정 그리드 위에 짧고 강하게 노출한다.

### 주간 통합 일정표

- 주간 화면은 테이블형 정보 탐색이 우선이다.
- sticky 요일 헤더와 sticky 멤버 열을 유지한다.
- 셀은 너무 장식적으로 만들지 않고, 멤버 색상은 왼쪽 border, 작은 상태칩, schedule item accent에 제한한다.
- 좁은 화면에서는 `min-w-[800px]` 수준의 가로 스크롤을 허용한다.

### VOD & 클립

- 상단 탭은 rounded segmented control처럼 보이게 한다.
- 공식 유튜브, 키리누키, 치지직 클립, 치지직 다시보기는 같은 탭 구조를 공유하되 각 플랫폼 아이콘과 색상만 다르게 쓴다.
- 미디어 카드는 썸네일 중심이다. `aspect-video` 또는 Shorts의 `aspect-9/16`을 지키고, hover 시 이미지 scale과 재생 오버레이를 사용한다.
- VOD/클립 날짜 그룹은 border-bottom 헤더, 접기/펼치기 아이콘, 항목 수/조회수 메타를 반복한다.

### 멤버 게시글

- 게시글 피드는 읽기 중심의 넓은 카드 리스트로 유지한다.
- 데스크톱은 좌측 sticky 필터 사이드바, 모바일은 상단 sticky 필터 바를 사용한다.
- X와 네이버 카페 게시글은 같은 카드 골격을 사용한다: 왼쪽 멤버 accent bar, 아바타, 작성자 메타, 원문 열기 버튼, 본문, 미디어/링크, metric footer.
- 외부 플랫폼 고유색은 아이콘과 작은 상태 요소에만 쓴다.

### 공지사항 및 권리 고지

- 공지사항 목록은 일반 피드보다 약간 더 홍보성 있는 카드와 badge gradient를 허용한다.
- 권리 고지는 차분한 문서형 화면이다. 카드 반경은 작게, border와 divide를 중심으로 구성한다.
- 뒤로가기 버튼은 좌상단에 `Button variant="ghost" size="icon"` 계열로 제공한다.

### 프로필

- 프로필 화면은 앱 크롬을 숨기는 풀스크린 프로모션형 화면이다.
- 배경 이미지, 어두운 오버레이, 멤버 accent CSS variable, 유닛 로고, 서명 이미지를 사용한다.
- 텍스트는 흰색 계열과 그림자로 배경 위 가독성을 확보한다.
- 모바일은 배경 이미지 대신 카드형 프로필 이미지를 보여주고, 정보 블록과 링크 버튼이 세로로 쌓이게 한다.
- 이 수준의 큰 이미지, 강한 모션, 드라마틱한 배경은 프로필처럼 인물 중심 화면에서만 사용한다.

### 스냅샷

- 스냅샷은 공유 이미지 생성용 화면이므로 일반 앱 컨테이너 규칙보다 고정 폭과 안정적 렌더링을 우선한다.
- grid 모드는 1280px, timeline 모드는 520px 기준을 유지한다.
- 글자 자동 맞춤, 큰 시간 표시, 고대비 카드, 명확한 테두리로 캡처 후에도 읽히게 만든다.
- 스냅샷에 불필요한 앱 액션 UI는 포함하지 않는다.

### 관리자

- 관리자 화면은 `AdminLayout`의 좌측 사이드바와 메인 스크롤 영역을 기준으로 한다.
- 각 페이지는 `AdminSectionHeader`로 제목, 설명, 개수, 액션을 통일한다.
- 관리 목록은 card/table 조합, 필터는 card 내부 form grid, 상세/수정은 dialog를 사용한다.
- 아이콘은 lucide를 사용하되 장식이 아니라 빠른 식별용으로만 쓴다.
- 상태 변경, 삭제, 승인/거부처럼 결과가 큰 액션은 confirm dialog와 toast를 함께 사용한다.

## 디자인 원칙

### 1. 정보가 먼저, 팬 감성은 맥락에 맞게

- 일정, 미디어, 게시글은 빠른 스캔이 가능해야 한다.
- 멤버 카드, 프로필, D-Day처럼 팬 경험이 강한 영역에서는 컬러와 이미지 사용을 늘린다.
- 관리자, 권리 고지, 로그 화면에서는 장식을 줄이고 표/필터/상태가 먼저 보이게 한다.

### 2. 멤버 색상은 accent로 사용

- 멤버별 `main_color`는 프로필 이미지 border, 카드 헤더, 작은 bar, selected chip, schedule badge에 사용한다.
- `sub_color`는 배경 tint에만 낮은 opacity로 사용한다.
- 멤버 색상 위 텍스트는 반드시 `getContrastColor` 또는 동등한 대비 계산을 사용한다.
- 멤버 색상이 없는 경우 기본값은 neutral 또는 teal 계열로 처리한다.

### 3. 전역 토큰을 우선

- 배경, 전경, border, card, muted, destructive는 `src/index.css`의 semantic token을 사용한다.
- 임의 색상은 플랫폼 색상, 상태 색상, 멤버 색상처럼 의미가 분명할 때만 추가한다.
- dark mode에서는 `dark:` class 또는 CSS variable을 함께 고려한다.

### 4. 작은 인터랙션을 반복

- hover는 `shadow`, `border`, `translate-y`, `scale` 중 한두 가지를 작게 쓴다.
- 일반 카드 hover는 `-translate-y-0.5` 또는 `-translate-y-1` 정도로 제한한다.
- 주요 모션 duration은 200-300ms, 프로필 배경 전환처럼 특별한 경우만 450ms 이상을 사용한다.

### 5. 화면별 밀도를 유지

- 공개 피드/미디어 화면은 여백이 조금 더 넓어도 된다.
- 관리자 화면과 주간표는 더 촘촘하고 예측 가능한 레이아웃을 쓴다.
- 모바일에서는 라벨을 숨기거나 줄이고, 아이콘과 짧은 텍스트를 우선한다.

## 토큰 및 스타일

### Typography

- 기본 폰트는 `Inter`.
- 페이지 제목: `text-xl`-`text-2xl`, `font-semibold` 또는 `font-bold`, `tracking-tight`.
- 주요 공개 화면 제목: `text-2xl font-bold`.
- 카드 제목: `text-sm`-`text-base`, `font-semibold` 또는 `font-bold`.
- 메타 텍스트: `text-xs`-`text-sm text-muted-foreground`.
- 시간/숫자: `tabular-nums` 또는 `font-mono`를 사용해 정렬감을 유지한다.
- profile/snapshot처럼 이미지 출력성이 강한 화면만 `font-black`, 큰 display text를 허용한다.

### Color

- 기본 바탕: `bg-background`
- 카드: `bg-card`, `text-card-foreground`
- 보조면: `bg-muted/20`-`bg-muted/40`
- 경계: `border-border`, 강조 경계는 `border-border/70`
- Primary action: `bg-primary text-primary-foreground`
- Destructive action: `bg-destructive text-white`
- OTW brand accents: `--otw-1`, `--otw-2`, `--otw-3`

상태 색상은 아래 의미로 맞춘다.

- LIVE: red 계열, `bg-red-600`, `text-white`, pulse dot.
- 방송: 멤버 `main_color` 또는 teal 계열.
- 휴방: rose 또는 zinc 계열. 사용자 카드에서는 rose, 편성표/관리 보조 상태는 zinc를 쓴다.
- 게릴라: amber 계열.
- 미정: slate 계열.
- 공지: blue 계열.
- 이벤트: purple 계열.
- 네이버 카페: emerald 계열.
- YouTube: red 계열.
- 치지직: emerald/cyan 계열.
- 경고/주의: amber 계열.
- 성공: emerald 계열.

### Radius

- primitive 기본: `rounded-md`.
- 일반 카드/미디어 카드: `rounded-lg` 또는 `rounded-xl`.
- 공지 배너, 필터 칩, 상태 pill: `rounded-full` 또는 `rounded-xl`.
- 멤버 카드와 snapshot 멤버 카드는 `rounded-[24px]` 허용.
- 관리자 표 wrapper는 `rounded-xl`, 표 내부 행/셀은 과도하게 둥글리지 않는다.

### Shadow, Border, Surface

- 기본 카드는 `border` + `shadow-sm`.
- hover 카드는 `shadow-md` 또는 `shadow-lg`까지만 쓴다.
- floating menu, profile overlay, notice page hero-like card처럼 레이어가 분명할 때만 큰 shadow를 쓴다.
- 투명/blur 표면은 header, mobile menu, notice banner, profile overlay처럼 겹침이 있는 곳에서만 사용한다.

## 레이아웃 규칙

### 컨테이너

- 일반 화면은 `container mx-auto px-4`를 기본으로 한다.
- 일정 화면은 모바일 `px-3`, 태블릿 이상 `sm:px-6 lg:px-8` 흐름을 따른다.
- 관리자 메인 영역은 `p-3 md:p-5`를 유지한다.
- 피드형 화면은 `max-w`를 지정해 너무 넓게 퍼지지 않게 한다.

### 스크롤

- 루트는 `overflow-hidden`, 각 화면 본문이 필요한 축으로 스크롤한다.
- 일반 페이지: `overflow-y-auto`.
- 주간표: 본문 내부 표 컨테이너가 `overflow-auto`.
- 관리자: `AdminLayout`의 메인 영역이 `overflow-y-auto`.
- 프로필: 별도 `h-dvh overflow-y-auto` 풀스크린 흐름.

### 반응형

- 모바일은 카드 한 열 또는 compact card를 우선한다.
- sm 이상에서 멤버 카드, 미디어 카드, 필터 그룹의 가로 배치를 늘린다.
- lg 이상에서 사이드 rail, 관리자 사이드바, 피드 필터 사이드바를 노출한다.
- 매우 넓은 화면에서만 부가 링크와 관리자 링크를 상단 내비게이션에 직접 노출한다.

## 컴포넌트 패턴

### Button

- 기본은 `src/components/ui/button.tsx`의 variants를 사용한다.
- 주요 생성/저장 액션은 `default`, 보조 액션은 `outline` 또는 `ghost`.
- 파괴적 액션은 `destructive` 또는 `text-destructive` ghost icon button.
- pill형 액션은 사용자 공개 화면의 필터, 날짜 이동, 로그인, 새로고침 등 짧은 액션에 사용한다.
- 아이콘만 있는 버튼은 `size="icon"` 또는 `size="icon-sm"`와 `aria-label`을 반드시 제공한다.

### Page Header

- 공개 화면 헤더는 아이콘 박스 + 제목 + 날짜/설명 + 우측 액션 그룹을 기본 구조로 한다.
- 관리자 화면 헤더는 `AdminSectionHeader`를 사용한다.
- 문서형 화면은 뒤로가기 버튼과 제목 블록을 좌측 정렬한다.

### Card

- 일반 정보 카드: `rounded-lg border bg-card p-4/5 shadow-sm`.
- 멤버 카드: 상단에 멤버 `main_color`, 겹치는 프로필 이미지, 하단에 `sub_color` tint.
- 미디어 카드: 썸네일 비중을 크게, 본문은 제목 2줄 + 메타 1-2줄.
- 게시글 카드: 왼쪽 accent bar + 아바타 + 본문 + metric footer.
- 관리자 카드: form/filter group 또는 결과 요약에 사용하고, 카드 안에 과한 중첩 카드는 피한다.

### Badge, Pill, Chip

- `Badge`는 상태, 유형, 카운트에 사용한다.
- 필터 chip은 멤버 색상을 border/selected fill로 사용한다.
- pill 텍스트는 짧게 유지한다: `전체`, `LIVE`, `방송 중`, `게시중`, `비활성`.
- count badge는 작게 `h-5 px-2 text-xs` 수준으로 유지한다.

### Schedule Item

- 방송 일정은 시간과 제목이 가장 먼저 보이게 한다.
- 시간은 `Clock` 아이콘과 `tabular-nums`를 사용한다.
- 휴방, 게릴라, 미정은 각각 icon + label 조합으로 명확히 구분한다.
- schedule card는 클릭 가능하면 hover/active feedback과 cursor를 제공한다.

### Filter

- 공개 화면 필터는 chip 기반이다.
- 관리자 필터는 `Label`, `Input`, `Select`, `Button`으로 구성된 form grid를 사용한다.
- 모바일 피드 필터는 sticky top bar로 유지하고, 데스크톱은 좌측 sidebar로 전환한다.

### Table

- 관리자 목록과 로그는 `Table` primitive를 사용한다.
- 표 wrapper는 `overflow-hidden rounded-xl border bg-card`.
- 많은 컬럼은 `min-w`를 지정해 가로 스크롤을 허용한다.
- row hover는 `hover:bg-muted/40` 수준으로 차분하게 쓴다.

### Dialog

- 일정 입력, 관리자 생성/수정, 안내, 확인은 Dialog/AlertDialog를 사용한다.
- 긴 form은 `max-h-[90vh] overflow-y-auto`를 유지한다.
- 위험한 결과가 있는 액션은 확인 Dialog를 먼저 띄운다.

### Empty, Loading, Error

- 로딩은 skeleton 또는 `Loader2 animate-spin`을 사용한다.
- 빈 상태는 dashed border, muted background, 작은 icon, 짧은 설명을 사용한다.
- 에러는 destructive 또는 amber warning surface를 사용하고, 가능하면 다시 시도 버튼을 제공한다.

## 문구 톤

- 전체 톤은 짧고 친근하되, 과장된 마케팅 문구는 피한다.
- 일정 사용자 화면은 현재 UI 관습에 맞춰 `스케쥴` 표기를 유지한다.
- 관리자/로그/백오피스 문맥에서는 주변 화면이 쓰는 `스케줄` 표기를 따른다.
- 같은 화면 안에서는 `스케쥴`과 `스케줄`을 혼용하지 않는다.
- 빈 상태 문구는 `등록된 ... 없습니다.`, `표시할 ... 없습니다.`처럼 간결하게 쓴다.
- 로딩 문구는 `불러오는 중입니다...`, 버튼 진행 상태는 `저장 중...`, `이미지 생성 중...`처럼 동작을 직접 말한다.
- 외부 링크 버튼은 `...에서 보기`, `... 열기`, `전체 ... 보러가기` 패턴을 사용한다.

## 접근성

- 클릭 가능한 non-button 요소는 가능하면 `button` 또는 `a`로 구현한다.
- `div role="button"`을 쓸 경우 `tabIndex`, `Enter`/`Space` key handling, `aria-label`을 제공한다.
- 아이콘 버튼에는 `aria-label`을 넣는다.
- 이미지 alt는 콘텐츠 이미지에는 의미를 제공하고, 장식/중복 이미지는 빈 alt 또는 `aria-hidden`을 사용한다.
- active/pressed 상태는 `aria-pressed`, 접기/펼치기는 `aria-expanded`와 `aria-controls`를 사용한다.
- focus ring은 primitive의 `focus-visible` 스타일을 제거하지 않는다.

## 구현 체크리스트

새 화면 또는 컴포넌트를 만들 때 아래를 확인한다.

- 기존 feature 폴더에 같은 패턴이 있는가?
- shadcn/ui primitive로 해결 가능한가?
- 색상은 semantic token 또는 의미 있는 상태/멤버/플랫폼 색상인가?
- mobile, tablet, desktop에서 텍스트가 넘치지 않는가?
- dark mode에서 배경, border, 텍스트 대비가 충분한가?
- 로딩, 빈 상태, 에러 상태가 있는가?
- 외부 링크, 아이콘 버튼, 클릭 카드의 접근성 label이 있는가?
- 관리자 화면이면 `AdminSectionHeader`, table/card/filter/dialog 패턴을 따르는가?
- 일정 관련 화면이면 멤버 색상과 schedule status 표현이 기존 카드와 맞는가?
- snapshot/profile처럼 특수 화면이 아니라면 앱 `Header`/`Footer` 프레임을 유지하는가?

## 지양할 것

- 새 색상 팔레트를 화면마다 따로 만드는 것.
- 모든 카드에 큰 shadow, 큰 radius, 강한 gradient를 반복하는 것.
- 관리자 화면에서 팬시한 히어로, 큰 배경 이미지, 장식적 애니메이션을 넣는 것.
- 멤버 색상 위에 대비 계산 없이 텍스트를 올리는 것.
- 모바일에서 긴 버튼 라벨을 그대로 노출해 줄바꿈/겹침을 만드는 것.
- `.cursor` mirror 파일을 직접 수정하는 것.

