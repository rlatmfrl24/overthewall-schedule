# 전체 UI 통합 검증 기록

2026-09-08 · 로컬 `http://localhost:5173` · 기준 master `f20a497ccab6da52932fd086448c09cf6aaa4dee` · 작업 브랜치 `codex/ui-system-integration`.

공개·회원·관리자 화면의 공통 표시·상호작용 통합을 구현했다. 라우트 정의 38개, 제품 TSX 172개를 조사했고, 44개 화면·주요 상태 묶음에서 390px/1440px × 라이트/다크 화면을 기록했다. 이는 모든 권한·외부 장애·업무 mutation 조합의 전수 실행을 의미하지 않는다. 실행하지 못한 범위는 아래에 명시한다.

## 구현 결과

- `QueryState`로 로딩·최초 오류·정상 빈 결과를 구별했다. Shorts 최초 실패와 빈 결과의 동시 표시는 제거했고, 일반 영상·Shorts는 서로의 조회를 막지 않는다. Shorts 갱신 실패는 기존 결과를 유지하며 안내·재시도를 표시한다.
- VOD·치지직 클립·게시글은 members의 `MemberFilter`를 사용한다. Play 다중 선택은 같은 `FilterChip`을 사용하면서 기존 배열·URL 의미를 유지한다. 선택 상태는 `aria-pressed`로 전달한다.
- `LabeledField`, `ChoiceGroup`, 기존 Input/Textarea/Select/Button으로 일반 입력·그룹·오류 연결을 통합했다. 공지·일정 입력 오류와 여러 선택 메뉴의 접근성 이름을 보완했다.
- URL 업무 메뉴는 `SectionNavigation` + Link, 내부 전환은 제어형 `TabsList`로 분리했다. 숨겨진 탭을 가리키던 패널은 이름 있는 region으로 변경했다.
- 루트 `InteractionProvider`에서 확인·dirty 등록·라우트 이동 보호를 처리한다. 공개 일정 편집과 회원 제안에도 공통 확인을 적용했다. beforeunload를 유지하고, 중복 확인은 중복 작업을 승인하지 않는다.
- 포털에 public/admin/play 범위를 전달해 테마·모바일 조작부·대화상자 높이와 모션 규칙을 적용한다. 프로필·스냅샷·Mul.Live·Play 플레이어와 관리자 밀도는 유지했다.
- 중첩된 잘못된 URL에서 기본 영문 Not Found가 나오던 문제를 실제로 확인하고, 기존 공통 404 안내와 홈 복귀로 연결했다.
- 직접 브라우저 confirm과 폐기 모듈 재사용을 아키텍처 검사에 추가했다. API/DTO/Worker/DB/마이그레이션 변경은 없다.

컴포넌트별 판정·실제 참조: [전체 인벤토리](ui-component-inventory.md). 개발 선택 기준과 예제: [Design.md](../Design.md).

## 화면 검증 목록

각 셀은 실제 로컬 화면 PNG다. 같은 파일명의 `.txt`에는 접근성 DOM 스냅샷이 있다. 화면 파일은 로컬 `.tmp/ui-system-audit/`에 보관하며 Git에는 포함하지 않는다. 아래 PASS는 해당 상태의 진입·렌더링·레이아웃 확인 결과다. 화면 전체 업무의 저장·승인·외부 실행까지 PASS라는 뜻은 아니다. 관리자와 회원 화면은 현재 인증된 로컬 관리자 계정으로 확인했다.

| 화면 / 실제 확인 범위 | 390 라이트 | 390 다크 | 1440 라이트 | 1440 다크 | 판정 |
| --- | --- | --- | --- | --- | --- |
| 오늘 일정<br>메뉴 진입, 기본 카드·날짜 이동 조작부 | [화면](../.tmp/ui-system-audit/daily-390-light.png) | [화면](../.tmp/ui-system-audit/daily-390-dark.png) | [화면](../.tmp/ui-system-audit/daily-1440-light.png) | [화면](../.tmp/ui-system-audit/daily-1440-dark.png) | PASS |
| 오늘 일정 시간순<br>보기 전환 버튼의 Enter 동작, 시간순 표시 | [화면](../.tmp/ui-system-audit/daily-timeline-390-light.png) | [화면](../.tmp/ui-system-audit/daily-timeline-390-dark.png) | [화면](../.tmp/ui-system-audit/daily-timeline-1440-light.png) | [화면](../.tmp/ui-system-audit/daily-timeline-1440-dark.png) | PASS |
| 주간 일정<br>메뉴 진입, 주간 그리드와 공통 날짜 이동 | [화면](../.tmp/ui-system-audit/weekly-390-light.png) | [화면](../.tmp/ui-system-audit/weekly-390-dark.png) | [화면](../.tmp/ui-system-audit/weekly-1440-light.png) | [화면](../.tmp/ui-system-audit/weekly-1440-dark.png) | PASS |
| 공개 공지<br>메뉴 진입, 대표 안내·목록·긴 제목·링크 | [화면](../.tmp/ui-system-audit/notices-390-light.png) | [화면](../.tmp/ui-system-audit/notices-390-dark.png) | [화면](../.tmp/ui-system-audit/notices-1440-light.png) | [화면](../.tmp/ui-system-audit/notices-1440-dark.png) | PASS |
| 공식 YouTube / Shorts<br>콘텐츠 메뉴, 멤버 필터, 독립 조회 상태 | [화면](../.tmp/ui-system-audit/vods-390-light.png) | [화면](../.tmp/ui-system-audit/vods-390-dark.png) | [화면](../.tmp/ui-system-audit/vods-1440-light.png) | [화면](../.tmp/ui-system-audit/vods-1440-dark.png) | PASS |
| 키리누키<br>VOD 콘텐츠 전환, 채널 영상 목록 | [화면](../.tmp/ui-system-audit/kirinuki-390-light.png) | [화면](../.tmp/ui-system-audit/kirinuki-390-dark.png) | [화면](../.tmp/ui-system-audit/kirinuki-1440-light.png) | [화면](../.tmp/ui-system-audit/kirinuki-1440-dark.png) | PASS |
| 치지직 클립<br>콘텐츠 전환, 하네 선택·해제, 펼침·접기 | [화면](../.tmp/ui-system-audit/chzzk-clips-390-light.png) | [화면](../.tmp/ui-system-audit/chzzk-clips-390-dark.png) | [화면](../.tmp/ui-system-audit/chzzk-clips-1440-light.png) | [화면](../.tmp/ui-system-audit/chzzk-clips-1440-dark.png) | PASS |
| 치지직 다시보기<br>콘텐츠 전환, 영상 목록 | [화면](../.tmp/ui-system-audit/chzzk-vods-390-light.png) | [화면](../.tmp/ui-system-audit/chzzk-vods-390-dark.png) | [화면](../.tmp/ui-system-audit/chzzk-vods-1440-light.png) | [화면](../.tmp/ui-system-audit/chzzk-vods-1440-dark.png) | PASS |
| 멤버 게시글<br>메뉴 진입, 플랫폼·멤버 필터와 피드 | [화면](../.tmp/ui-system-audit/feed-390-light.png) | [화면](../.tmp/ui-system-audit/feed-390-dark.png) | [화면](../.tmp/ui-system-audit/feed-1440-light.png) | [화면](../.tmp/ui-system-audit/feed-1440-dark.png) | PASS |
| 멀티뷰<br>메뉴 진입, 멤버 2명 선택, URL·Mul.Live iframe 연결 | [화면](../.tmp/ui-system-audit/multiview-390-light.png) | [화면](../.tmp/ui-system-audit/multiview-390-dark.png) | [화면](../.tmp/ui-system-audit/multiview-1440-light.png) | [화면](../.tmp/ui-system-audit/multiview-1440-dark.png) | PASS |
| 권리 안내<br>푸터 링크 진입, 안내·문의 링크 | [화면](../.tmp/ui-system-audit/rights-390-light.png) | [화면](../.tmp/ui-system-audit/rights-390-dark.png) | [화면](../.tmp/ui-system-audit/rights-1440-light.png) | [화면](../.tmp/ui-system-audit/rights-1440-dark.png) | PASS |
| Play 발견<br>메뉴 진입, 곡 재생·상세·검색 이동 | [화면](../.tmp/ui-system-audit/play-discover-390-light.png) | [화면](../.tmp/ui-system-audit/play-discover-390-dark.png) | [화면](../.tmp/ui-system-audit/play-discover-1440-light.png) | [화면](../.tmp/ui-system-audit/play-discover-1440-dark.png) | PASS |
| Play 검색 목록<br>목록, 긴 곡명, 가창 정보·상세 링크 | [화면](../.tmp/ui-system-audit/play-search-390-light.png) | [화면](../.tmp/ui-system-audit/play-search-390-dark.png) | [화면](../.tmp/ui-system-audit/play-search-1440-light.png) | [화면](../.tmp/ui-system-audit/play-search-1440-dark.png) | PASS |
| Play 검색 상단<br>이름 있는 검색·필터·공통 내비게이션 | [화면](../.tmp/ui-system-audit/play-search-top-390-light.png) | [화면](../.tmp/ui-system-audit/play-search-top-390-dark.png) | [화면](../.tmp/ui-system-audit/play-search-top-1440-light.png) | [화면](../.tmp/ui-system-audit/play-search-top-1440-dark.png) | PASS |
| Play 검색 필터<br>필터 펼침, 빙하유·온하루 다중 선택과 URL 반영 | [화면](../.tmp/ui-system-audit/play-filters-390-light.png) | [화면](../.tmp/ui-system-audit/play-filters-390-dark.png) | [화면](../.tmp/ui-system-audit/play-filters-1440-light.png) | [화면](../.tmp/ui-system-audit/play-filters-1440-dark.png) | PASS |
| Play 곡 상세<br>카드에서 상세 진입, 공식 버전·재생 UI | [화면](../.tmp/ui-system-audit/play-detail-390-light.png) | [화면](../.tmp/ui-system-audit/play-detail-390-dark.png) | [화면](../.tmp/ui-system-audit/play-detail-1440-light.png) | [화면](../.tmp/ui-system-audit/play-detail-1440-dark.png) | PASS |
| 회원 제안 1단계<br>영상 URL 입력, 실제 확인 API, 중복 영상 오류 | [화면](../.tmp/ui-system-audit/play-submit-390-light.png) | [화면](../.tmp/ui-system-audit/play-submit-390-dark.png) | [화면](../.tmp/ui-system-audit/play-submit-1440-light.png) | [화면](../.tmp/ui-system-audit/play-submit-1440-dark.png) | PASS |
| 회원 제안 2단계<br>실제 영상 확인 후 곡명·가수 입력, 참여 멤버 Enter 선택 | [화면](../.tmp/ui-system-audit/play-submit-details-390-light.png) | [화면](../.tmp/ui-system-audit/play-submit-details-390-dark.png) | [화면](../.tmp/ui-system-audit/play-submit-details-1440-light.png) | [화면](../.tmp/ui-system-audit/play-submit-details-1440-dark.png) | PASS |
| 회원 제안 3단계<br>검토 단계 진입, 이전 단계 복귀 시 곡명·참여자 유지; 최종 제출 미실행 | [화면](../.tmp/ui-system-audit/play-submit-review-390-light.png) | [화면](../.tmp/ui-system-audit/play-submit-review-390-dark.png) | [화면](../.tmp/ui-system-audit/play-submit-review-1440-light.png) | [화면](../.tmp/ui-system-audit/play-submit-review-1440-dark.png) | PASS |
| 회원 제안 내역<br>메뉴 진입, 기존 제안과 상태 표시 | [화면](../.tmp/ui-system-audit/play-submissions-390-light.png) | [화면](../.tmp/ui-system-audit/play-submissions-390-dark.png) | [화면](../.tmp/ui-system-audit/play-submissions-1440-light.png) | [화면](../.tmp/ui-system-audit/play-submissions-1440-dark.png) | PASS |
| 관리자 대시보드<br>메뉴 진입, 상태·주의 항목·작업 큐 | [화면](../.tmp/ui-system-audit/admin-dashboard-390-light.png) | [화면](../.tmp/ui-system-audit/admin-dashboard-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-dashboard-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-dashboard-1440-dark.png) | PASS |
| 일정 승인<br>업무 링크 진입, 승인 후보의 정상 빈 결과 | [화면](../.tmp/ui-system-audit/admin-review-390-light.png) | [화면](../.tmp/ui-system-audit/admin-review-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-review-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-review-1440-dark.png) | PASS |
| 거부 제외<br>업무 링크 진입, 기존 제외 기록·검색 조작부 | [화면](../.tmp/ui-system-audit/admin-rejections-390-light.png) | [화면](../.tmp/ui-system-audit/admin-rejections-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-rejections-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-rejections-1440-dark.png) | PASS |
| X 수집<br>업무 링크 진입, 기존 실행 상태·예산·설정 조합 | [화면](../.tmp/ui-system-audit/admin-x-390-light.png) | [화면](../.tmp/ui-system-audit/admin-x-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-x-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-x-1440-dark.png) | PASS |
| 네이버 카페 수집<br>업무 링크 진입, 기존 실행·보강 상태 | [화면](../.tmp/ui-system-audit/admin-naver-390-light.png) | [화면](../.tmp/ui-system-audit/admin-naver-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-naver-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-naver-1440-dark.png) | PASS |
| 일정 자동 수집<br>업무 링크 진입, 주기·수집 범위 입력 | [화면](../.tmp/ui-system-audit/admin-schedule-settings-390-light.png) | [화면](../.tmp/ui-system-audit/admin-schedule-settings-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-schedule-settings-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-schedule-settings-1440-dark.png) | PASS |
| YouTube 캐시<br>업무 링크 진입, 캐시·쿼터·최신성 상태 | [화면](../.tmp/ui-system-audit/admin-youtube-390-light.png) | [화면](../.tmp/ui-system-audit/admin-youtube-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-youtube-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-youtube-1440-dark.png) | PASS |
| 키리누키 채널<br>업무 링크 진입, 채널 목록·정렬·검색 | [화면](../.tmp/ui-system-audit/admin-kirinuki-390-light.png) | [화면](../.tmp/ui-system-audit/admin-kirinuki-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-kirinuki-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-kirinuki-1440-dark.png) | PASS |
| 공지 관리<br>업무 링크, 편집·취소·저장, 정상 API 재조회·복원 | [화면](../.tmp/ui-system-audit/admin-notices-390-light.png) | [화면](../.tmp/ui-system-audit/admin-notices-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-notices-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-notices-1440-dark.png) | PASS |
| D-Day 관리<br>업무 링크 진입, 기존 목록·정렬·입력 컴포넌트 연결 | [화면](../.tmp/ui-system-audit/admin-ddays-390-light.png) | [화면](../.tmp/ui-system-audit/admin-ddays-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-ddays-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-ddays-1440-dark.png) | PASS |
| 스냅샷 미리보기<br>업무 링크, grid/timeline·테마 변경, iframe 반영 | [화면](../.tmp/ui-system-audit/admin-snapshot-390-light.png) | [화면](../.tmp/ui-system-audit/admin-snapshot-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-snapshot-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-snapshot-1440-dark.png) | PASS |
| Play 카탈로그 관리<br>업무 링크 진입, 곡·가창 목록과 편집 진입 조작부 | [화면](../.tmp/ui-system-audit/admin-play-catalog-390-light.png) | [화면](../.tmp/ui-system-audit/admin-play-catalog-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-play-catalog-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-play-catalog-1440-dark.png) | PASS |
| Play 영상 검토<br>업무 링크 진입, 자동 수집·회원 제안의 빈 상태 | [화면](../.tmp/ui-system-audit/admin-play-review-390-light.png) | [화면](../.tmp/ui-system-audit/admin-play-review-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-play-review-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-play-review-1440-dark.png) | PASS |
| Play 가져오기<br>기존 이력 선택, 후보 행별 보완 대화상자 열기·닫기 | [화면](../.tmp/ui-system-audit/admin-play-import-390-light.png) | [화면](../.tmp/ui-system-audit/admin-play-import-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-play-import-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-play-import-1440-dark.png) | PASS |
| Play 채널 관리<br>업무 링크 진입, 감시·승인 채널 목록 | [화면](../.tmp/ui-system-audit/admin-play-channels-390-light.png) | [화면](../.tmp/ui-system-audit/admin-play-channels-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-play-channels-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-play-channels-1440-dark.png) | PASS |
| Play 재생·공개 관리<br>업무 링크 진입, 공개·소스 상태 읽기 | [화면](../.tmp/ui-system-audit/admin-play-operations-390-light.png) | [화면](../.tmp/ui-system-audit/admin-play-operations-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-play-operations-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-play-operations-1440-dark.png) | PASS |
| 사용량·한도<br>업무 링크 진입, 예산·사용량 읽기 | [화면](../.tmp/ui-system-audit/admin-resources-390-light.png) | [화면](../.tmp/ui-system-audit/admin-resources-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-resources-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-resources-1440-dark.png) | PASS |
| 이미지 정리<br>업무 링크 진입, R2 상태·사용/미사용 목록 읽기; 정리 미실행 | [화면](../.tmp/ui-system-audit/admin-images-390-light.png) | [화면](../.tmp/ui-system-audit/admin-images-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-images-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-images-1440-dark.png) | PASS |
| 작업 실행 이력<br>업무 링크, 내부 탭 Home·End 선택·포커스·패널 연결 | [화면](../.tmp/ui-system-audit/admin-history-390-light.png) | [화면](../.tmp/ui-system-audit/admin-history-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-history-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-history-1440-dark.png) | PASS |
| 일정 변경 기록<br>업무 링크, 필터·표·뒤로 가기 도착 화면 | [화면](../.tmp/ui-system-audit/admin-schedule-history-390-light.png) | [화면](../.tmp/ui-system-audit/admin-schedule-history-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-schedule-history-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-schedule-history-1440-dark.png) | PASS |
| 관리자 감사 기록<br>업무 링크, 필터·반응형 목록 | [화면](../.tmp/ui-system-audit/admin-audit-history-390-light.png) | [화면](../.tmp/ui-system-audit/admin-audit-history-390-dark.png) | [화면](../.tmp/ui-system-audit/admin-audit-history-1440-light.png) | [화면](../.tmp/ui-system-audit/admin-audit-history-1440-dark.png) | PASS |
| 멤버 프로필<br>오늘 일정 카드 프로필 버튼으로 진입, 배경 전환·복귀 | [화면](../.tmp/ui-system-audit/profile-390-light.png) | [화면](../.tmp/ui-system-audit/profile-390-dark.png) | [화면](../.tmp/ui-system-audit/profile-1440-light.png) | [화면](../.tmp/ui-system-audit/profile-1440-dark.png) | PASS |
| 스냅샷 grid<br>독립 URL과 관리자 iframe, 내보내기 전용 고정 폭 | [화면](../.tmp/ui-system-audit/snapshot-390-light.png) | [화면](../.tmp/ui-system-audit/snapshot-390-dark.png) | [화면](../.tmp/ui-system-audit/snapshot-1440-light.png) | [화면](../.tmp/ui-system-audit/snapshot-1440-dark.png) | PASS |
| 스냅샷 timeline<br>독립 URL과 관리자 iframe, 시간순 전용 프레임 | [화면](../.tmp/ui-system-audit/snapshot-timeline-390-light.png) | [화면](../.tmp/ui-system-audit/snapshot-timeline-390-dark.png) | [화면](../.tmp/ui-system-audit/snapshot-timeline-1440-light.png) | [화면](../.tmp/ui-system-audit/snapshot-timeline-1440-dark.png) | PASS |

## 핵심 동작과 근거

| 확인 항목 | 결과 / 근거 |
| --- | --- |
| 공지 저장·권위 있는 재조회 | 실제 관리자 편집 UI에서 공지 id 24 내용에 `[UI audit local]`을 붙여 저장했다. 정상 공개 `GET /api/notices`에서 변경을 확인한 뒤 같은 UI로 원래 내용에 복원하고 재조회했다. 변경 전과 복원 후 응답의 해당 레코드는 필드 전체가 일치했다. 이미지 배열은 변경하지 않았다. [변경 전](../.tmp/ui-system-audit/notices-before.json), [저장 후](../.tmp/ui-system-audit/notices-saved.json), [복원 후](../.tmp/ui-system-audit/notices-restored.json) |
| 미저장 보호 | 공지·회원 제안·일정 편집에서 취소 시 입력 유지, 원래 버튼 포커스 복귀, 확인창 1개를 확인했다. 일정 제목을 원래 값으로 되돌리면 확인 없이 닫힌다. [공지](../.tmp/ui-system-audit/admin-notice-unsaved.png), [회원](../.tmp/ui-system-audit/play-unsaved-confirm.png), [일정](../.tmp/ui-system-audit/schedule-unsaved-1440-low-height.png) |
| 입력 오류·긴 내용 | 빈 공지 등록은 제출을 막고 내용 입력에 `aria-invalid=true`, 오류 ID와 `aria-describedby`를 연결했다. 320px에서 긴 내용과 대화상자 스크롤·취소를 확인했다. [필수 입력 오류](../.tmp/ui-system-audit/notice-validation-error-390-dark.png), [긴 입력](../.tmp/ui-system-audit/notice-dialog-long-320-dark.png) |
| 내부 탭 키보드 | 관리자 작업 이력에서 Home·End로 선택과 포커스 이동, tabIndex 0/-1, tabpanel 레이블을 확인했다. 방향키 순환·disabled 건너뛰기는 회귀 테스트로 확인했다. [키보드 화면](../.tmp/ui-system-audit/admin-history-keyboard-summary.png) |
| URL 뒤로 가기 | 업무 링크로 일정 변경 → 관리자 감사 이동 후 브라우저 뒤로 가기에서 `?tab=schedule`과 일정 변경 기록 화면을 확인했다. [도착 화면](../.tmp/ui-system-audit/admin-url-back.png) |
| 필터 | 치지직 클립의 멤버 선택·전체 해제와 접기, Play의 두 멤버 다중 선택·URL `member=3,6`를 확인했다. 같은 멤버 재선택 의미는 VOD/클립 해제, 게시글 유지로 테스트했다. [클립](../.tmp/ui-system-audit/chzzk-clips-collapsed.png), [Play](../.tmp/ui-system-audit/play-filters-390-dark.png) |
| Play 검색·빈 결과 | 검색어 입력, 존재하지 않는 검색의 정상 빈 결과, 검색 초기화를 확인했다. [검색 빈 결과](../.tmp/ui-system-audit/play-search-empty.png) |
| Play 플레이어 유지 | 실제 YouTube 재생을 시작한 뒤 발견 → 검색 → 상세의 앱 내 이동에서 같은 iframe 식별자와 재생 시간·대기열 1개 유지 상태를 확인했다. 전체 문서 새로고침·회원 영역 이탈 시까지 iframe 유지라는 뜻은 아니다. [실제 플레이어](../.tmp/ui-system-audit/play-player-390-dark.png) |
| 회원 제안 단계 | 실제 영상 확인 API를 거쳐 `KPtxe05V6w4`의 곡 정보 입력·참여자 선택·검토 단계에 도달했다. 이전 단계에서 입력이 보존된다. 기존 등록 영상의 중복 오류도 확인했다. 최종 제출·승인은 실행하지 않았다. [중복 오류](../.tmp/ui-system-audit/play-submission-duplicate.png) |
| Shorts 최초 실패·갱신 실패 | 로컬 실제 화면에서 일반 영상과 Shorts 조회 실패가 함께 표시되며 정상 빈 문구는 없는 것을 확인했다. [Shorts 실제 오류](../.tmp/ui-system-audit/vod-boundary-1024x768.png). 재시도 콜백, 기존 Shorts 유지·갱신 오류·성공 회복은 조회 훅 및 화면 회귀 테스트로 검증했다. 후반 브라우저 연결 중단으로 재시도 성공까지의 실제 외부 응답은 재확인하지 못했다. |
| 멀티뷰 | 빙하유·유리리 선택을 URL과 실제 Mul.Live iframe 주소에서 확인했다. 해당 시각 라이브 채널은 없어 동시 실방송 재생은 미검증이다. [선택 화면](../.tmp/ui-system-audit/multiview-selected.png) |
| 스냅샷 | 관리자 grid/timeline·테마 컨트롤이 실제 iframe 쿼리에 반영된다. 직접 스냅샷은 출력용 고정 폭이라 모바일에서 내부 가로 스크롤하며, 관리자 미리보기는 축소한다. [관리자 시간순 미리보기](../.tmp/ui-system-audit/snapshot-timeline-dark.png) |
| 공통 404 복귀 | 실제 중첩 404 화면의 공통 홈 링크로 오늘 일정에 도달했다. 실제 메모리 라우터 회귀 테스트도 추가했다. [404 화면](../.tmp/ui-system-audit/nested-not-found.png) |

## 반응형·접근성 검토

공개 콘텐츠(VOD), Play 필터, 관리자 이력, 프로필에서 320×568, 768×720, 1024×768, 1280×800, 1440×500의 경계를 추가 확인했다. 공통 대화상자는 320px 및 낮은 높이를 확인했다. 캡처 시 document 가로 overflow와 존재하지 않는 aria-labelledby 참조는 없었다. 스냅샷·가로 업무 메뉴·표의 의도된 내부 스크롤은 유지한다.

| 대상 | 320 | 768 | 1024 | 1280 | 낮은 높이 |
| --- | --- | --- | --- | --- | --- |
| 공개 콘텐츠 | [화면](../.tmp/ui-system-audit/vod-boundary-320x568.png) | [화면](../.tmp/ui-system-audit/vod-boundary-768x720.png) | [화면](../.tmp/ui-system-audit/vod-boundary-1024x768.png) | [화면](../.tmp/ui-system-audit/vod-boundary-1280x800.png) | [화면](../.tmp/ui-system-audit/vod-boundary-1440x500.png) |
| Play | [화면](../.tmp/ui-system-audit/play-boundary-320x568.png) | [화면](../.tmp/ui-system-audit/play-boundary-768x720.png) | [화면](../.tmp/ui-system-audit/play-boundary-1024x768.png) | [화면](../.tmp/ui-system-audit/play-boundary-1280x800.png) | [화면](../.tmp/ui-system-audit/play-boundary-1440x500.png) |
| 관리자 | [화면](../.tmp/ui-system-audit/admin-boundary-320x568.png) | [화면](../.tmp/ui-system-audit/admin-boundary-768x720.png) | [화면](../.tmp/ui-system-audit/admin-boundary-1024x768.png) | [화면](../.tmp/ui-system-audit/admin-boundary-1280x800.png) | [화면](../.tmp/ui-system-audit/admin-boundary-1440x500.png) |
| 프로필 | [화면](../.tmp/ui-system-audit/profile-boundary-320x568.png) | [화면](../.tmp/ui-system-audit/profile-boundary-768x720.png) | [화면](../.tmp/ui-system-audit/profile-boundary-1024x768.png) | [화면](../.tmp/ui-system-audit/profile-boundary-1280x800.png) | [화면](../.tmp/ui-system-audit/profile-boundary-1440x500.png) |

필터의 44px 모바일 영역, 표시 선택 상태·포커스, 대화상자 포커스 복귀, 긴 한국어·곡명과 버튼 줄바꿈을 검토했다. 회원·관리자 포털은 해당 테마로 열렸다. 동작 줄이기는 공통 UI CSS와 기존 플레이어 코드의 설정 대응을 정적으로 확인했으며, 브라우저/OS의 reduced-motion 설정 전환은 실행하지 못했다. 스크린리더 음성 출력 자체는 검증하지 않았다.

## 기존 URL 리다이렉트

실제 브라우저에서 다음 20건의 URL과 도착 화면 렌더링을 확인했다. 같은 분기의 나머지 별칭 값은 기존 라우터 테스트로 검증했다.

| 이전 URL | 실제 도착 URL | 결과 |
| --- | --- | --- |
| `/play/discover` | `/play` | PASS |
| `/cafe` | `/feed` | PASS |
| `/admin/` | `/admin/operations` | PASS |
| `/admin/notices` | `/admin/content?tab=notices` | PASS |
| `/admin/ddays` | `/admin/content?tab=ddays` | PASS |
| `/admin/youtube-cache` | `/admin/collection?source=youtube` | PASS |
| `/admin/kirinuki` | `/admin/collection?source=kirinuki` | PASS |
| `/admin/member-posts?source=naver-cafe` | `/admin/collection?source=naver-cafe` | PASS |
| `/admin/member-posts` | `/admin/collection?source=x` | PASS |
| `/admin/settings?tab=settings` | `/admin/collection?source=schedule` | PASS |
| `/admin/settings?tab=runs` | `/admin/history?tab=runs&source=schedule_auto_update` | PASS |
| `/admin/settings?tab=rejections` | `/admin/review?tab=rejections` | PASS |
| `/admin/settings` | `/admin/review?tab=schedule` | PASS |
| `/admin/logs` | `/admin/history?tab=schedule` | PASS |
| `/admin/snapshot?date=2026-09-08&mode=grid&theme=light` | `/admin/content?date=2026-09-08&mode=grid&theme=light&tab=snapshot` | PASS |
| `/admin/review?tab=review` | `/admin/otw-play?tab=review` | PASS |
| `/admin/content?tab=catalog` | `/admin/otw-play?tab=catalog` | PASS |
| `/admin/collection?source=channels` | `/admin/otw-play?tab=channels` | PASS |
| `/admin/operations#d1-write-guard` | `/admin/resources#d1-write-guard` | PASS |
| `/admin/operations#job-history-panel` | `/admin/history?tab=runs#job-history-panel` | PASS |

## 검사 결과

| 검사 | 결과 |
| --- | --- |
| 아키텍처 | PASS · [로그](../.tmp/ui-final-architecture.log) |
| 정책 미러 동기화 | PASS · 16개 파일, drift 0 · [로그](../.tmp/ui-final-sync.log) |
| 테스트/Worker 타입 | PASS · [로그](../.tmp/ui-final-typecheck.log) |
| lint | PASS · [로그](../.tmp/ui-final-lint.log) |
| 전체 테스트 + Worker 통합 + coverage | PASS · 259 파일 / 1,831 테스트 · [로그](../.tmp/ui-final-coverage.log) |
| coverage | statements 80.02%, branches 66.97%, functions 83.46%, lines 81.54%; 설정된 모든 임계값 통과 |
| production build | PASS · [로그](../.tmp/ui-final-build.log) |

커버리지 집계 대상은 기존 설정의 API·model·use-case 및 Worker application/domain/infrastructure다. TSX 화면의 시각적 커버리지 80%라는 의미가 아니다. 전체 테스트는 단위와 로컬 D1 Worker 통합 프로젝트를 함께 실행했다. 테스트의 모의 응답은 오류 분기 회귀에 사용했으며 실제 화면·저장 확인을 대체하지 않았다.

## 남은 검증 한계와 미실행 범위

- 현재 로컬 관리자 계정에서 도달하는 회원·관리자 화면을 확인했다. 비로그인·비관리자·다른 소유자의 접근 제한 화면은 실제 계정 전환을 하지 않았으며 기존 권한 테스트로만 확인했다.
- 외부 API 장애의 모든 조합, 실제 라이브 동시 재생, Shorts 재시도 성공 응답은 보장하지 않는다. 실제 Shorts 실패 화면은 확인했으나 이후 브라우저 도구 연결이 두 차례 시간 초과되어 추가 상호작용 재확인을 중단했다.
- 새로고침·탭 닫기의 native beforeunload 확인창, OS reduced-motion 전환, 스크린리더 출력은 미검증이다. 해당 코드/이벤트 계약은 유지했다.
- 실제 쓰기 검증은 로컬 공지 편집·복원으로 수행했다. 다른 관리 업무의 승인·삭제·수집 실행·공개 전환, 회원 최종 제출, 이미지 업로드·정리, 스냅샷 파일 다운로드는 실행하지 않았다. 이들 화면을 보았다는 이유로 업무 mutation 성공으로 판정하지 않는다.
- D1은 로컬 바인딩을 사용했으나 R2는 remote 바인딩이므로 이미지 변경·삭제를 피했다. 운영 데이터 변경·배포·commit·push는 수행하지 않았다. 로컬 공지 저장에 따른 로컬 감사 이력은 남는다.
- 브라우저 연결 종료 시 Play 화면에 검증용 멤버 필터(빙하유·온하루)와 다크 테마, 낮은 높이 검증 viewport가 남아 있을 수 있다. URL 필터·테마는 UI에서 되돌릴 수 있으며 데이터 변경은 아니다.

통합 구현과 위에 기재한 접근 가능한 주요 흐름은 검증했다. 위 미검증 항목을 포함한 모든 외부 상태·업무 실행의 전수 검증 완료로 선언하지 않는다. 권위 역전이나 API/DB 계약 변경은 도입하지 않았다.
