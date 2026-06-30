# OTW Schedule + 배포 가이드

Chrome 공식 문서 기준 확인일: 2026-06-25.

이 문서는 OTW Schedule +를 Chrome Web Store에 배포하고, 승인 이후
production OTW 화면의 설치 CTA를 활성화하기 위한 운영 런북입니다. 현재
릴리즈의 실제 기능 범위는 `/multiview` 보조 기능이며, 향후 방송 알림이나
스케줄 편의 기능을 추가할 때는 manifest 권한, 개인정보 문구, Store 설명을
같이 갱신해야 합니다.

관련 문서:

- 사용자 도움말: `docs/otw-schedule-plus-extension.md`
- 개인정보 처리방침 초안: `docs/privacy.md`
- Chrome Web Store 등록 폼: `docs/otw-schedule-plus-chrome-store-form.md`
- 이전 배포 계획/문구 초안: `docs/archive/`

공식 참고 문서:

- Chrome Web Store 게시 절차:
  https://developer.chrome.com/docs/webstore/publish
- Chrome permissions API:
  https://developer.chrome.com/docs/extensions/reference/api/permissions
- Chrome Web Store Limited Use 정책:
  https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Chrome Web Store 사용자 데이터 FAQ:
  https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

## 배포 대상

배포 산출물은 두 가지입니다.

1. Chrome 확장 프로그램 Store 패키지:
   `extensions/otw-schedule-plus/artifacts/otw-schedule-plus-<version>.zip`
2. OTW 웹앱 배포:
   Store 등록 URL이 생긴 뒤 `VITE_OTW_SCHEDULE_PLUS_STORE_URL`을 설정한
   production 앱 빌드.

공개 사용자에게 개발용 `Load unpacked` 설치를 기본 경로로 안내하지 않습니다.
Store 승인 전에는 `/multiview`에서 Chrome Web Store 배포 준비 중이라고
표시합니다. Store 승인 후 Store URL을 설정하고 웹앱을 다시 배포하면 CTA가
Chrome Web Store로 연결됩니다.

## 담당자

릴리즈 freeze 전에 아래 역할을 지정합니다.

- 코드 담당자: 확장 프로그램과 `/multiview` 동작을 검증합니다.
- Store 담당자: 패키지를 업로드하고 Developer Dashboard 항목을 작성합니다.
- 개인정보/제품 담당자: 개인정보 문구, 스크린샷, 사용자 안내 문구를 승인합니다.
- 릴리즈 담당자: 최종 게이트를 실행하고 웹앱을 배포하며 릴리즈 기록을 남깁니다.

## 사전 준비

- Chrome Developer Dashboard publisher 계정 접근 권한.
- 안정적인 HTTPS support URL.
- 안정적인 HTTPS 개인정보 처리방침 URL. Limited Use 문구와 로컬 쿠키 처리 설명이
  포함되어야 합니다.
- Store Listing에 사용할 최종 스크린샷.
- 최종 카테고리, 언어, 배포 국가, 공개 범위.
- 같은 릴리즈에 schema/API 변경이 포함되어 있다면 관련 프로젝트 workflow에서 먼저
  검증이 끝나 있어야 합니다.

## 버전 관리

Chrome에 업로드하는 모든 패키지는 아래 파일의 확장 프로그램 버전을 올립니다.

1. 버전 수정 대상:
   - `extensions/otw-schedule-plus/manifests/dev.json`
   - `extensions/otw-schedule-plus/manifests/store.json`
   - `extensions/otw-schedule-plus/package.json`
2. 웹앱 package version은 앱 자체 릴리즈 버전 bump가 필요한 경우가 아니라면 별도로
   관리합니다.
3. 릴리즈 노트에는 아래 내용을 짧게 남깁니다.
   - 화면 자동 정리 변경
   - 채팅 로그인 브릿지 변경
   - 권한 변경
   - 알려진 CHZZK 호환성 위험

Chrome Store에 업로드한 패키지는 수정할 수 없습니다. manifest metadata나 코드가
잘못되었다면 버전을 올린 새 패키지를 다시 업로드해야 합니다.

## 사전 검증

repository root에서 실행합니다.

```bash
pnpm install
pnpm extension:typecheck
pnpm extension:build:dev
pnpm extension:zip
pnpm lint
pnpm test
pnpm build
```

업로드 또는 배포 전 모든 게이트가 통과해야 합니다.

같은 릴리즈에 database schema 또는 migration 파일 변경이 있다면 웹앱 배포 전에
database release workflow를 완료합니다. 이 확장 프로그램 릴리즈는 일반적으로
code-only 릴리즈이며 D1 migration을 필요로 하지 않아야 합니다.

## Store 패키지 검증

Store zip 명령은 Store manifest를 빌드하고 검증합니다.

```bash
pnpm extension:zip
```

예상 산출물:

```text
extensions/otw-schedule-plus/artifacts/otw-schedule-plus-<version>.zip
```

수동 패키지 확인:

```bash
tar -tf extensions/otw-schedule-plus/artifacts/otw-schedule-plus-<version>.zip
```

확인 항목:

- `manifest.json`이 zip root에 있습니다.
- `.map` 파일이 포함되어 있지 않습니다.
- 원격 실행 코드가 참조되지 않습니다.
- Store manifest의 필수 권한은 `storage`만 포함합니다.
- Store manifest의 선택 권한은 `cookies`를 포함합니다.
- Store manifest의 필수 host:
  - `https://chzzk.naver.com/*`
  - `https://otw-schedule.info/*`
- Store manifest의 선택 host:
  - `https://nid.naver.com/*`
- Store manifest에 아래 항목이 없어야 합니다.
  - `localhost`
  - `127.0.0.1`
  - `https://*.naver.com/*`
  - `externally_connectable`
  - `declarativeNetRequestWithHostAccess`

## 업로드 전 수동 QA

Chrome Stable의 깨끗한 프로필을 사용합니다. Store build를 아래 경로에서 unpacked로
로드합니다.

```text
extensions/otw-schedule-plus/dist
```

검증 흐름:

- 확장 프로그램이 설치되지 않아도 `/multiview`가 동작합니다.
- 확장 프로그램 설치 상태에서 좌측 패널에 연결됨 상태가 표시됩니다.
- CHZZK 채널 1개, 4개, 6개를 각각 추가합니다.
- 화면 자동 정리 on:
  - CHZZK 넓은 화면/극장 모드 전환을 시도합니다.
  - CHZZK 플레이어 내부 채팅 영역을 숨깁니다.
  - 가능한 경우 CHZZK 좌측 내비게이션을 접습니다.
  - selector를 찾지 못해도 페이지가 깨지지 않고 타일 단위 실패 상태를 보여줍니다.
- 화면 자동 정리 off:
  - 새로운 자동 정리 시도를 멈춥니다.
  - 기존 iframe은 계속 사용할 수 있습니다.
- 채팅 로그인 off:
  - `/multiview` 채팅 iframe은 guest/credentialless 상태입니다.
  - 직접 연 CHZZK 탭의 로그인은 유지됩니다.
- 채팅 로그인 on:
  - 최초 사용 안내 팝업이 표시됩니다.
  - 사용자 동작에서 선택 cookie 권한 요청이 발생합니다.
  - 웹앱 흐름에서 권한 프롬프트가 열리지 않는 경우 toolbar popup에서 권한을 허용할 수
    있습니다.
  - 쿠키 값이 웹 페이지 메시지, 로그, UI에 노출되지 않습니다.
- 권한 거부:
  - 채팅 로그인은 권한 필요 상태를 표시합니다.
  - 화면 자동 정리는 계속 동작합니다.
  - CHZZK 직접 열기와 Mul.Live fallback은 유지됩니다.
- Chrome 재시작:
  - `/multiview`에서 extension service worker가 다시 깨어납니다.
  - 저장된 도우미 설정이 복원됩니다.

## Chrome Web Store 제출

최초 릴리즈:

1. Chrome Developer Dashboard를 엽니다.
2. 새 item을 추가합니다.
3. `extensions/otw-schedule-plus/artifacts/`의 zip을 업로드합니다.
4. Store Listing을 작성합니다.
   - 이름
   - 짧은 설명
   - 긴 설명
   - 스크린샷
   - 카테고리
   - support URL
5. Privacy 항목을 작성합니다.
   - single purpose
   - data handling disclosure
   - Limited Use certification
   - privacy policy URL
6. Distribution 항목을 작성합니다.
   - 공개 범위
   - 국가
   - 필요한 경우 가격 정책
7. `docs/otw-schedule-plus-chrome-store-form.md`의 reviewer instructions를 추가합니다.
8. 가능한 경우 deferred publishing을 켠 상태로 review를 제출합니다.

업데이트 릴리즈:

1. 확장 프로그램 버전을 올립니다.
2. 새 zip을 빌드합니다.
3. 기존 Store item에 새 패키지를 업로드합니다.
4. 동작, 권한, 사용자 안내 문구가 바뀐 경우에만 listing 또는 privacy 항목을 수정합니다.
5. review를 제출합니다.

## 리뷰어 안내 템플릿

Developer Dashboard test instructions에 아래 내용을 사용합니다.

```text
1. Install the extension.
2. Open https://otw-schedule.info/multiview.
3. Add a CHZZK channel from the left panel.
4. Confirm the extension status shows connected.
5. Turn on "화면 자동 정리" and verify the extension attempts to optimize only the embedded CHZZK live frame.
6. Optional chat login test:
   - Sign in to https://chzzk.naver.com directly.
   - Return to OTW Multiview.
   - Turn on "채팅 로그인".
   - Accept the in-product disclosure.
   - Grant the optional Chrome cookie permission if prompted.
   - Confirm no Naver/CHZZK cookie values are shown in the web page or sent to OTW.
```

## 승인 후 절차

공개 전:

- deferred publishing을 사용할 수 있다면 승인된 Store item 페이지를 확인합니다.
- listing 문구, 스크린샷, privacy 정보, 권한 구성을 확인합니다.
- 공개 전 설치 경로가 제공된다면 승인된 item으로 마지막 smoke test를 수행합니다.

공개 후:

1. Chrome Web Store item URL을 복사합니다.
2. production build env를 설정합니다.

   ```text
   VITE_OTW_SCHEDULE_PLUS_STORE_URL=<chrome-web-store-url>
   ```

3. 앱 사전 검증을 실행합니다.

   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```

4. OTW 웹앱을 배포합니다.

   ```bash
   pnpm deploy
   ```

5. production smoke test:
   - `/`
   - `/weekly`
   - `/multiview`
   - `/api/members`
   - `/api/schedules?date=YYYY-MM-DD`
   - `/api/settings`
   - `/admin/settings`
   - `/admin/logs`

6. `/multiview`에서 확인합니다.
   - 확장 프로그램 미설치 상태가 Chrome Web Store로 연결됩니다.
   - 확장 프로그램 설치 상태가 연결됨으로 표시됩니다.
   - 채팅 로그인 opt-in이 계속 동작합니다.
   - Store URL 경로로 인해 새 console error가 발생하지 않습니다.

## 롤백 및 장애 대응

웹앱 CTA 문제:

- `VITE_OTW_SCHEDULE_PLUS_STORE_URL`을 제거하거나 비웁니다.
- 웹앱을 다시 배포합니다.
- `/multiview`는 공개 전 도움말 상태로 돌아갑니다.

확장 프로그램 selector 깨짐:

- 문제가 best-effort 화면 자동 정리에만 있고 fallback 재생이 유지된다면 Store item은
  유지할 수 있습니다.
- selector 수정 patch version을 배포합니다.
- 릴리즈 노트에 CHZZK UI 호환성 이슈를 남깁니다.

개인정보 또는 cookie bridge 문제:

- Store URL을 제거해 `/multiview`의 공개 설치 권장을 끕니다.
- 필요한 경우 Developer Dashboard에서 Store item을 unpublish 또는 pause합니다.
- 채팅 로그인은 `permission_missing`, `unsupported`, `error` 중 하나로 안전하게 실패하도록
  패치합니다. Naver/CHZZK 쿠키를 삭제하면 안 됩니다.
- 수정 버전을 명확한 릴리즈 노트와 함께 배포합니다.

중대한 확장 프로그램 crash:

- 웹앱에서 Store URL을 제거합니다.
- patch version을 준비합니다.
- 수정 내용을 설명하는 reviewer note와 함께 제출합니다.

## 릴리즈 기록 템플릿

각 릴리즈마다 아래 내용을 기록합니다.

```text
Extension version:
Web app deploy commit:
Chrome Web Store item URL:
Store package:
Preflight:
- extension:typecheck:
- extension:zip:
- lint:
- test:
- build:
Manual QA:
- Missing extension:
- Connected extension:
- Player optimization:
- Chat login off:
- Chat login on:
- Permission denied:
- Chrome restart:
Dashboard fields reviewed:
- Store Listing:
- Privacy:
- Distribution:
Residual risks:
Follow-up owner:
```
