# 관리자 UI/UX 1차 패치 보고서

작성일: 2026-02-13  
대상 범위: `src/features/admin/*`, `src/routes/admin.tsx`, `src/main.tsx`

## 1. 1차 패치 목표
- 관리자 화면의 입력/작업 밀집도 개선
- 파괴 액션의 UX 일관성 확보
- 실패 시 사용자 피드백 강화
- 모바일 가독성/테이블 사용성 보완

## 2. 완료 항목

### 2.1 공통 피드백(토스트) 도입
- 전역 `ToastProvider` 추가 및 앱 루트 적용
- 관리자 주요 작업(CRUD, 로드 실패, 일괄 처리)에 성공/실패 토스트 연결

적용 파일:
- `src/components/ui/toast.tsx` (신규)
- `src/main.tsx`
- `src/features/admin/auto-update-settings.tsx`
- `src/features/admin/auto-update-logs.tsx`
- `src/features/admin/notice-manager.tsx`
- `src/features/admin/dday-manager.tsx`
- `src/features/admin/kirinuki-channel-manager.tsx`

### 2.2 공통 확인 다이얼로그 도입
- `window.confirm` 제거
- 공통 `ConfirmActionDialog` 컴포넌트로 통일

적용 파일:
- `src/features/admin/components/confirm-action-dialog.tsx` (신규)
- `src/features/admin/auto-update-settings.tsx` (전체 승인/거부)
- `src/features/admin/notice-manager.tsx` (삭제)
- `src/features/admin/dday-manager.tsx` (삭제)
- `src/features/admin/kirinuki-channel-manager.tsx` (삭제)

### 2.3 모바일 폼 가독성 개선 + 날짜 검증
- 공지 폼의 강제 2열(`grid-cols-2`)을 반응형 1열/2열로 변경
- 공지 시작일/종료일 역전 입력 방지 검증 추가

적용 파일:
- `src/features/admin/notice-form-dialog.tsx`

### 2.4 로그/대기 테이블 모바일 대응 개선
- 테이블 최소 너비 지정으로 컬럼 붕괴 방지
- 좁은 화면에서 수평 스크롤 기반으로 정보 보존

적용 파일:
- `src/features/admin/auto-update-logs.tsx`
- `src/features/admin/auto-update-settings.tsx`

### 2.5 관리자 레이아웃 밀집도 조정
- 메인/사이드바 패딩 축소
- 내비게이션 행 높이 컴팩트화
- `h-screen` 기반 뷰포트 의존 축소(`min-h-[100dvh]`)

적용 파일:
- `src/features/admin/admin-layout.tsx`
- `src/routes/admin.tsx`

## 3. 검증 결과
- `pnpm exec eslint` (변경 파일 대상) 통과
- `pnpm exec tsc -b --pretty false` 통과

## 4. 다음 패치 예정(2차)

### P0 (즉시 체감)
1. 관리자 리스트 공통 `DataTable` 패턴 도입 (공지/DDay/키리누키)
2. 상단 툴바 통합 (타이틀 + 카운트 + 필터 + 1차 액션)
3. 로그 필터 즉시 적용(디바운스) + 기간 유효성 UX 강화

### P1 (운영 효율)
1. 자동 업데이트 “승인 대기” 선택 기반 부분 일괄 처리
2. 로그 상세/행 액션의 모바일 전용 인터랙션 최적화
3. 공지/키리누키 폼 입력 보조 자동화(URL 유효성/ID 추출)

### P2 (품질/측정)
1. 관리자 화면 UX 회귀 방지 테스트(폼 검증/다이얼로그 동작)
2. 작업 성공률/실패율 측정 포인트 추가(운영 로그)
3. 스타일 토큰 정리(간격/타이포/컨트롤 높이 일관화)

## 5. 비고
- 이번 1차 패치는 “행동 피드백/오류 복구/모바일 붕괴” 방어에 집중.
- 2차는 정보 구조 자체를 테이블 중심으로 재편해 밀집도를 본격적으로 끌어올릴 예정.
