# OTW Schedule + Chrome Web Store 등록 폼 입력값

이 문서는 `OTW Schedule +` 확장 프로그램을 Chrome Web Store에 등록할 때 각 탭/폼에 입력할 값을 정리한 등록 시트입니다.

## 1. Package

### 업로드 파일

- ZIP 파일: `extensions/otw-schedule-plus/artifacts/otw-schedule-plus-0.2.1.zip`
- Manifest 버전: `3`
- 확장 이름: `OTW Schedule +`
- 버전: `0.2.1`

### Manifest 설명

```text
오버더월 스케줄표의 멀티뷰 기능을 보조하고 향후 방송 알림 등 편의 기능을 제공할 전용 확장입니다.
```

## 2. Store Listing

### 기본 정보

- 기본 언어: `한국어`
- 확장 프로그램 이름: `OTW Schedule +`
- 카테고리: `생산성`
- 세부 카테고리 선택지가 있을 경우: `도구`
- 성인용 콘텐츠 포함 여부: `아니요`

### 한 줄 설명

```text
오버더월 멀티뷰의 CHZZK 화면 자동 정리와 선택적 채팅 로그인을 돕는 스케줄표 전용 확장입니다.
```

### 자세한 설명

```text
OTW Schedule +는 오버더월 스케줄표를 더 편하게 사용할 수 있도록 만든 전용 Chrome 확장 프로그램입니다.

현재 버전은 오버더월 멀티뷰 화면에서 선택한 CHZZK 방송을 보기 좋게 정리하는 기능에 집중합니다. 멀티뷰에 추가된 CHZZK 플레이어에서 넓은 화면 전환과 플레이어 내부 채팅 영역 숨김을 자동으로 시도해, 여러 방송을 한 화면에서 볼 때 생기는 불편함을 줄입니다.

또한 사용자가 직접 켠 경우에만 멀티뷰 채팅창의 CHZZK 로그인 연동을 도와줍니다. 이 기능은 사용자의 브라우저 안에서만 동작하며, 로그인 쿠키 값이나 인증 정보는 OTW 서버로 전송되지 않습니다. 채팅 로그인 연동은 기본적으로 꺼져 있고, 사용자가 명시적으로 활성화해야만 관련 권한을 요청합니다.

주요 기능:
- 오버더월 멀티뷰에 추가된 CHZZK 화면 자동 정리
- 선택한 CHZZK 플레이어의 넓은 화면 전환 보조
- CHZZK 플레이어 내부 채팅 영역 숨김 보조
- 선택적 멀티뷰 채팅 로그인 연동
- 향후 오버더월 스케줄표 기반 방송 알림과 편의 기능 확장 예정

주의:
- 이 확장은 오버더월 스케줄표와 함께 사용하는 보조 도구입니다.
- CHZZK 화면 구조가 변경되면 일부 자동화 기능이 일시적으로 동작하지 않을 수 있습니다.
- 네이버 또는 CHZZK와 공식 제휴된 확장 프로그램이 아닙니다.
```

### 그래픽 에셋

- 스토어 아이콘: `extensions/otw-schedule-plus/store-assets/icons/icon-128.png`
- 스크린샷 1: `extensions/otw-schedule-plus/store-assets/screenshots/multiview-connected-1280x800.png`
  - 권장 내용: 오버더월 멀티뷰에서 확장이 연결된 상태
- 스크린샷 2: `extensions/otw-schedule-plus/store-assets/screenshots/popup-controls-1280x800.png`
  - 권장 내용: 확장 팝업의 화면 자동 정리 / 채팅 로그인 토글
- 스크린샷 3: `extensions/otw-schedule-plus/store-assets/screenshots/chat-login-opt-in-1280x800.png`
  - 권장 내용: 채팅 로그인 연동이 선택 기능임을 보여주는 화면
- 작은 프로모션 타일: `extensions/otw-schedule-plus/store-assets/promo/small-promo-440x280.png`
- 대형 프로모션 타일: 선택 사항
- YouTube 동영상: 비워둠

스크린샷은 실제 확장 동작 화면을 사용하고, 개인 계정 정보나 비공개 채팅 내용이 보이지 않도록 캡처합니다.

### 추가 URL

- 공식 URL: `https://otw-schedule.info`
- 홈페이지 URL: `https://otw-schedule.info`
- 지원 URL: `https://github.com/rlatmfrl24/overthewall-schedule/issues`
- 개인정보처리방침 URL: `https://otw-schedule.info/rights`

공식 URL을 입력하려면 Chrome Web Store 개발자 계정에서 해당 도메인 소유권 확인이 필요할 수 있습니다.

## 3. Privacy Practices

### 단일 목적 설명

```text
OTW Schedule +는 오버더월 스케줄표의 멀티뷰 화면에서 CHZZK 방송 시청을 보조하기 위한 확장 프로그램입니다. 현재 버전은 선택한 CHZZK 플레이어의 넓은 화면 전환, 플레이어 내부 채팅 영역 숨김, 사용자가 명시적으로 켠 경우의 멀티뷰 채팅 로그인 연동만 제공합니다.
```

### 권한 사용 사유

#### `storage`

```text
확장 프로그램의 사용자 설정을 브라우저에 저장하기 위해 사용합니다. 예를 들어 화면 자동 정리 사용 여부, 채팅 로그인 연동 사용 여부 같은 로컬 설정을 저장합니다. 민감한 인증 정보는 storage에 저장하지 않습니다.
```

#### `cookies` 선택 권한

```text
사용자가 채팅 로그인 연동을 직접 켠 경우에만 요청합니다. CHZZK에 직접 로그인된 브라우저 상태를 멀티뷰 채팅 iframe에서 인식할 수 있도록 Chrome cookies API를 사용합니다. 쿠키 값은 사용자의 브라우저 안에서만 처리되며 OTW 서버, 웹앱, 로그, 외부 분석 도구로 전송되지 않습니다.
```

#### `https://chzzk.naver.com/*`

```text
오버더월 멀티뷰 안에 포함된 CHZZK 플레이어와 채팅 iframe에서 화면 자동 정리 기능을 수행하기 위해 사용합니다. 선택된 CHZZK 화면에서 넓은 화면 버튼과 채팅 숨김 버튼을 찾아 자동으로 적용하고, CHZZK live/chat frame을 식별합니다.
```

#### `https://otw-schedule.info/*`

```text
오버더월 멀티뷰 페이지와 확장 프로그램이 안전하게 통신하기 위해 사용합니다. 웹앱은 확장 설치 여부와 기능 상태만 확인하며, 인증 정보나 쿠키 값은 전달받지 않습니다.
```

#### `https://nid.naver.com/*` 선택 호스트 권한

```text
사용자가 채팅 로그인 연동을 직접 켠 경우에만 Naver 로그인 쿠키 상태를 확인하기 위해 사용합니다. 이 권한은 멀티뷰 채팅 로그인 연동을 위한 선택 기능이며, 기본적으로 요청되지 않습니다.
```

### 원격 코드 사용 여부

선택값: `아니요`

```text
확장 프로그램의 JavaScript, CSS, 이미지 에셋은 모두 패키지에 포함되어 있습니다. 원격 서버에서 실행 코드를 내려받아 실행하지 않으며, eval 또는 동적 원격 코드 로딩을 사용하지 않습니다.
```

### 사용자 데이터 항목

Chrome Web Store 개인정보 폼에서 다음처럼 입력합니다.

- 개인 식별 정보: `수집하지 않음`
- 건강 정보: `수집하지 않음`
- 금융 및 결제 정보: `수집하지 않음`
- 인증 정보: `사용함`
- 개인 커뮤니케이션: `수집하지 않음`
- 위치 정보: `수집하지 않음`
- 웹 기록: `수집하지 않음`
- 사용자 활동: `수집하지 않음`
- 웹사이트 콘텐츠: `사용함`

#### 인증 정보 설명

```text
사용자가 채팅 로그인 연동을 직접 켠 경우에만 Chrome cookies API를 통해 Naver 로그인 쿠키 상태를 로컬 브라우저 안에서 처리합니다. 쿠키 값은 OTW 서버, 웹앱, 로그, 외부 서비스로 전송되지 않으며 광고, 추적, 분석, 판매 목적으로 사용하지 않습니다.
```

#### 웹사이트 콘텐츠 설명

```text
확장 프로그램은 선택된 CHZZK 플레이어 iframe 안에서 넓은 화면 전환과 채팅 숨김 버튼을 찾기 위해 CHZZK 페이지의 일부 DOM 상태와 URL/channel ID를 확인합니다. 이 정보는 기능 수행에만 사용되며 서버로 전송되지 않습니다.
```

### 데이터 사용 인증

다음 항목은 모두 동의/체크합니다.

- 사용자 데이터를 제3자에게 판매하지 않음
- 사용자 데이터를 광고 목적 또는 개인화 광고에 사용하지 않음
- 사용자 데이터를 확장 프로그램의 단일 목적과 무관한 용도로 사용하지 않음
- 사용자 데이터를 신용 평가, 대출, 보험 등 민감한 판단 목적으로 사용하지 않음
- 사용자의 인증 정보와 웹사이트 콘텐츠는 기능 제공에 필요한 범위에서만 처리함

### 개인정보처리방침

```text
https://otw-schedule.info/rights
```

## 4. Distribution

### 배포 설정

- 공개 범위: `공개`
- 배포 지역: `모든 지역`
- 가격: `무료`
- 인앱 결제: `없음`

초기 검수 후 링크로 먼저 배포하고 싶다면 공개 범위를 `비공개 링크 배포(Unlisted)`로 시작할 수 있습니다. 정식 공개 출시가 목표라면 `공개`를 선택합니다.

### 테스트 계정/검수 안내

```text
이 확장은 OTW Schedule의 멀티뷰 페이지와 함께 동작합니다.

검수 방법:
1. 확장 프로그램을 설치합니다.
2. https://otw-schedule.info/multiview 페이지를 엽니다.
3. CHZZK 채널을 멀티뷰에 추가합니다.
4. 페이지에서 OTW Schedule + 연결 상태가 표시되는지 확인합니다.
5. 확장 팝업을 열고 "화면 자동 정리"를 켭니다.
6. 선택된 CHZZK 플레이어에서 넓은 화면 전환과 플레이어 내부 채팅 숨김이 시도되는지 확인합니다.
7. 채팅 로그인 연동은 선택 기능입니다. CHZZK에 직접 로그인한 상태에서 확장 팝업의 "채팅 로그인"을 켜면 optional cookies 권한을 요청합니다.
8. 채팅 로그인 연동을 끄면 멀티뷰 채팅 iframe만 비로그인 상태로 되돌리며, 실제 CHZZK 사이트의 로그인 상태는 해제하지 않습니다.

참고:
- CHZZK 페이지 구조가 변경되면 화면 자동화가 실패할 수 있습니다.
- 실패하더라도 OTW 멀티뷰 기본 iframe과 CHZZK 직접 열기 링크는 계속 사용할 수 있습니다.
- 쿠키 값이나 인증 토큰은 OTW 서버로 전송되지 않습니다.
```

## 5. Developer Account 입력값

개발자 계정 영역은 Chrome Web Store 계정 설정에 맞춰 입력합니다.

- 게시자 표시 이름 권장값: `OTW Schedule`
- 개발자 웹사이트: `https://otw-schedule.info`
- 지원 URL: `https://github.com/rlatmfrl24/overthewall-schedule/issues`
- 연락 이메일: Chrome Web Store 개발자 계정에서 사용하는 공식 이메일

## 6. 제출 전 체크리스트

- `extensions/otw-schedule-plus/artifacts/otw-schedule-plus-0.2.1.zip`가 최신 빌드인지 확인
- `manifest.json`의 `name`, `description`, `version` 확인
- 스토어 아이콘 128x128 확인
- 실제 화면 기반 스크린샷 1장 이상 준비
- 개인정보처리방침 URL이 공개 접근 가능한지 확인
- `https://otw-schedule.info` 도메인 소유권 확인
- optional permission이 실제 사용자 동작 이후에만 요청되는지 확인
- 채팅 로그인 해제 시 CHZZK 본 사이트 로그인이 해제되지 않는지 확인
- 원격 코드 로딩이 없는지 확인

## 7. 공식 문서 참고

- Chrome Web Store - Store Listing: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome Web Store - Privacy: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store - Distribution: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Chrome Web Store - Creating a great listing page: https://developer.chrome.com/docs/webstore/create-a-great-listing-page
