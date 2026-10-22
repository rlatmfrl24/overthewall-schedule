# LuvDia 비로그인 일정 수정 복구 — 2026-10-22

## 판정과 원인

일반 일정은 로그인 없이 수정할 수 있어야 한다는 사용자 지시에 맞춰 로컬 소스를 수정했다.
사용자는 정책 정리·PR 검토 후 병합·양 사이트 운영 반영까지 승인했다. 이 문서는 PR 게시 전
소스와 로컬 검증 기록이며, 최종 preflight·병합·운영 반영 판정은 이번 PR의 검증 댓글을 따른다.

10/22 삼성 모바일 브라우저의 저장 요청 13건은 Authorization 없이 서버까지 도착했으며
모두 403이었다. 사용자가 제보자의 비로그인 상태를 확인했다. 관리자 수정 후 운영 유리리
일정 id=3158은 18:00이었다. 이 운영 관측은 수정 전의 Worker 버전
`06c4000a-014f-4a53-a1d2-9a933be49dae`에 대한 기록이다.

로그인 제한은 사이트 전환 커밋 `68fdf4f75b8da3afe98aa2e1d0c7ed9ca671f62b`
(2026-10-16)의 공통 일정 핸들러에 추가됐다. 초기 장애 점검이 과거 이관 계획의 로그인
문구를 정당한 정책으로 간주한 것은 **AUTHORITY INVERSION**이었다. 로그인 안내를
추가하라는 권고를 철회하고, 현재 사용자 지시에 따라 서버의 일괄 로그인 제한을 제거했다.

## 최종 변경과 보호 경계

- `resolveAuthorizedActor`에서 LuvDia 전체에 적용한 로그인 필수 조건 한 줄을 제거했다.
- 일간·주간 화면은 기존 공통 일정 API와 권한 정책을 그대로 사용한다. 응답·입력 계약,
  충돌 처리, 변경 기록과 토큰이 있는 사용자의 actor 식별은 유지한다.
- 익명 actor는 null로 기록한다. 관리자 여부는 검증된 인증 결과로만 결정한다.
- 빙하유의 2026-11-16 이후 일정과 해당 원본을 다른 날짜·멤버로 옮기는 우회는
  익명·일반 회원 모두 거절한다. 관리자 예외, 쓰기 경합 시 전체 롤백과 보관 조회 보호는 유지한다.
- `PRODUCT.md`와 `docs/current-work.md`에 현재 일정 정책을 명시했다. Play 요구사항의 과거
  대체 표와 제품 요약도 양 사이트 공식 곡·기본 목록의 익명 열람 정책에 맞췄다. 개인 목록·제안은
  회원, 클립·preview는 관리자이며 익명 열람을 자동 SEO 허용으로 해석하지 않는다.
  과거 이관 문서는 당시 기록으로 보존한다.

## 검증

검토 기준은 master `f9281dce5f45547130ec971a816ea33d864e958d` 위의 이번 변경이다.

| 검증 | 실제 결과 |
| --- | --- |
| 수정 전 회귀 재현 | 새 테스트에서 익명 생성 403/기대201, 정상 날짜 저장 403/기대200으로 2건 FAIL |
| 실제 Worker·D1 통합 | 일정 정책 8개 사례 PASS: 유리리 익명 생성→11:00→18:00 저장→공개 board·D1 조회→PUT→삭제, 익명 변경 기록, 익명·회원의 관리자 전용 날짜 보호와 기존 경합 롤백 포함 |
| 관련 단위 테스트 | 핸들러·권한·폼·저장 피드백 5개 파일, 28개 사례 PASS |
| 정적 검증 | 테스트 타입·Worker 타입·변경 코드 ESLint·구조 검사·diff 공백 검사 PASS |
| 실제 로컬 일간 UI | 정상 로컬 로그아웃으로 게스트 상태 확인. 390×844 화면→일정 추가→수정창→11:00 저장→18:00 수정 저장→API·D1 동일 id=13, 18:00 확인 |
| 실제 로컬 주간 UI | 모바일 주 메뉴→주간표→같은 일정 제목 수정→저장→새로고침→제목·18:00 유지. 변경 기록의 actor_id·actor_name=null 확인 |

실제 화면은 기존 로컬 개발 DB의 일반 멤버 Local Noa로 확인했고, 통합 테스트는 실제
유리리 code=`u_lili`를 사용했다. 멤버별 전용 우회 경로를 추가하지 않았다.
브라우저 자동화의 `fill()`만으로 네이티브 시간 필드를 바꾸면 표시 값과 React 입력 상태가
일치하지 않아 첫 저장은 00:00이었다. 이후 브라우저 기본 키보드 입력으로 11:00과 18:00을
각각 설정·저장하고 authoritative readback을 확인했다. 초기 자동화 입력을 성공으로 집계하지 않는다.

로컬 화면·API·D1 증거는 Git 제외 경로 `.tmp/luvdia-incident-20261022/`에 보관했다.
로컬 테스트 일정만 정리하며 기존 일정·환경파일·DB와 운영 데이터는 보존한다.

실행 명령:

```text
.tmp/node24/node.exe node_modules/vitest/vitest.mjs run --config vitest.schema.config.ts worker/app/schedule-member-policy.integration.test.ts
.tmp/node24/node.exe node_modules/vitest/vitest.mjs run worker/features/schedules/http/schedule-handler.test.ts worker/features/schedules/application/authorize-schedule-write.test.ts worker/features/schedules/infrastructure/public-schedule-write-policy.test.ts src/features/schedules/ui/schedule-dialog.test.ts src/features/schedule-board/queries/use-schedule-save-feedback.test.tsx
.tmp/node24/node.exe node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit
.tmp/node24/node.exe node_modules/typescript/bin/tsc -p tsconfig.worker.json --noEmit
.tmp/node24/node.exe node_modules/eslint/bin/eslint.js worker/features/schedules/http/schedule-handler.ts worker/app/schedule-member-policy.integration.test.ts
.tmp/node24/node.exe scripts/architecture-check.mjs
git diff --check
```

## 릴리스 검증과 한계

PR 게시 후 최종 소스의 공식 preflight·GitHub 상태와 리뷰를 확인한다. 병합 뒤 OTW 자동 배포와
동일 병합 소스의 LuvDia 정상 배포를 추적하고, 양 사이트의 실제 익명 일정 저장과 authoritative
readback을 PR 댓글에 기록한다. 이 문서의 로컬 검증만으로 운영 복구를 판정하지 않는다.
삼성 실기기는 직접 확인하지 못했다. 다른 콘텐츠 권한, 양 사이트 Play 자동화 중지·LuvDia
AI=false와 유료 AI·대량 작업 보류는 유지한다.
