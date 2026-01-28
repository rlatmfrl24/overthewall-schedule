# OverTheWall Schedule (OTW Schedule)

**OverTheWall Schedule**은 크리에이터 그룹 "Over The Wall"의 방송 일정을 효율적으로 관리하고 시각화하기 위한 웹 애플리케이션입니다.
직관적인 **Bento Grid** 레이아웃과 **Material Design 3** 원칙을 적용하여, 멤버들의 일정을 한눈에 파악할 수 있는 사용자 경험을 제공합니다.

## ✨ 주요 기능

### 1. 오늘의 스케쥴 (Daily Schedule)

- **Bento Grid 레이아웃**: 각 멤버의 일정을 카드 형태로 시각화하여, 데스크탑과 모바일 환경 모두에서 최적화된 뷰를 제공합니다.
- **실시간 상태 표시**: 방송 중(ON), 휴방, 게릴라, 미정 등 다양한 일정 상태를 색상과 아이콘으로 구분하여 직관적으로 보여줍니다.
- **반응형 디자인**: 화면 크기에 따라 그리드 컬럼 수가 자동으로 조절되어 다양한 디바이스에서 쾌적하게 이용할 수 있습니다.

### 2. 주간 통합 일정표 (Weekly Schedule)

- **통합 뷰**: 모든 멤버의 일주일 치 일정을 한 화면에서 확인할 수 있습니다.
- **스마트 네비게이션**: 이전/다음 주 이동 및 '오늘' 버튼을 통해 날짜를 쉽게 탐색할 수 있습니다.
- **Sticky Header & Column**: 스크롤 시에도 날짜와 멤버 정보가 고정되어, 많은 일정 속에서도 위치를 잃지 않습니다.
- **직관적인 타임라인**: 시간 순으로 정렬된 일정을 통해 방송 흐름을 쉽게 파악할 수 있습니다.

### 3. 일정 관리 시스템

- **통합 다이얼로그**: 일정 추가, 수정, 삭제를 하나의 통일된 인터페이스에서 처리합니다.
- **자동 충돌 해결**:
  - '휴방'이나 '미정' 설정 시, 해당 날짜의 기존 일정을 자동으로 정리합니다.
  - '방송' 일정 등록 시, 충돌되는 상태(휴방 등)를 자동으로 처리하여 데이터 무결성을 유지합니다.
- **다양한 상태 지원**:
  - **방송 (ON)**: 시작 시간과 방송 제목을 포함한 상세 일정.
  - **휴방**: 해당 날짜에 방송이 없음을 명시.
  - **게릴라**: 예고 없는 깜짝 방송 일정.
  - **미정**: 일정이 확정되지 않은 상태.

### 4. 멤버 관리

- **개별 아이덴티티**: 각 멤버별 고유 테마 색상(Main/Sub Color)과 프로필 이미지를 적용하여 시각적 구분을 명확히 했습니다.
- **동적 데이터**: Cloudflare D1 데이터베이스와 연동하여 멤버 정보를 실시간으로 관리합니다.

## 🎨 UI/UX 디자인

### Bento Style & Material Design 3

- **Modern Aesthetics**: 둥근 모서리(Rounded Corners), 부드러운 그림자(Elevation), 파스텔 톤의 배경색을 사용하여 현대적이고 깔끔한 느낌을 줍니다.
- **Micro-Interactions**: 호버 효과, 클릭 애니메이션 등 미세한 상호작용을 통해 살아있는 듯한 사용자 경험을 제공합니다.
- **Accessibility**: 명도 대비를 고려한 텍스트 색상과 직관적인 아이콘 사용으로 가독성을 높였습니다.

## 🛠️ 기술 스택

- **Frontend**: React, TypeScript, Vite
- **Styling**: TailwindCSS, Radix UI
- **Backend / Infra**: Cloudflare Workers, Cloudflare D1
- **State Management**: React Hooks
- **Routing**: TanStack Router

## ⚙️ Cloudflare D1 & Drizzle 설정

1. `.env.local` 또는 `.env` 파일에 아래 환경 변수를 정의합니다. (CLI 실행 시 `DRIZZLE_ENV_FILE`를 지정하면 해당 파일이 우선 로드됩니다.)

```
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
CLOUDFLARE_DATABASE_ID=<your-d1-database-id>
CLOUDFLARE_D1_TOKEN=<api-token-with-d1-access>
```

2. 최신 DB 스키마를 가져오거나 배포 환경에 반영하려면 아래 명령을 사용하세요.

```
# 원격 D1 스키마를 기반으로 현재 모델을 업데이트
pnpm drizzle-kit introspect

# Drizzle 스키마 변경사항을 Cloudflare D1에 적용
pnpm drizzle-kit push
```

3. Cloudflare에 배포하거나 로컬에서 Worker를 실행할 땐 Wrangler가 `drizzle.config.ts`에서 정의한 경로(`./src/db/schema.ts`)와 마이그레이션 디렉터리(`./drizzle`)를 그대로 활용합니다. `wrangler d1 migrations apply <database>` 명령으로도 동일한 마이그레이션을 적용할 수 있습니다.

### 5. 추가 예정 콘텐츠

- **멤버별 컨텐츠 정보 표시**: 각 멤버의 정기 컨텐츠나 유튜브 업로드 소식 제공.
- **유닛별 필터링 (Unit Filtering)**: 특정 유닛(Unit) 멤버들의 일정만 모아보는 필터 기능.
- **소셜 미디어 피드 (Social Media Feed)**: 트위터, 유튜브 등 최신 소식 연동.
