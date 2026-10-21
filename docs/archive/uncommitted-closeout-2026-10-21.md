# 보존 미커밋 545개 최종 판정 — 2026-10-21

기준은 PR #181 병합 master `254edb1d3f70f03ca31bc722842a3b5c86ed3177`이다.
원본 작업 트리 529개와 X 작업 트리 16개를 합한 545개 관측이며, 고유 상대 경로는 535개다.
이전 재분류 이후 원본의 상태·크기·SHA-256이 모두 같음을 확인하고 기존 검토 결과를 재사용했다.
사용자가 이번에 전체 잔여 정리를 승인했으므로 과거의 삭제·커밋 보류는 이번 정리 범위를 제한하지 않는다.

## 반영과 현행 유지

- 테스트·실행 설정 보완은 PR #178, migration CLI bad port는 PR #179에 반영됐다.
- 문서·아카이브 선별 보완은 PR #180, agent CRLF 검사는 PR #181에 반영됐다.
- 구형 실행부·설정 40개를 현행 기능 소유 코드와 대조했다. 29개는 현행 반영/대체 확인,
  9개는 퇴역 실행 구조 제외, 1개는 migration 이력 유지, 1개는 채널 승인 경합 보완이다.
- 채널 승인 경합은 [PR #182](https://github.com/rlatmfrl24/overthewall-schedule/pull/182)의
  구현·D1 회귀 테스트 2개 파일로 분리했다. 승인 요청 당시 후보 버전을 유지하며,
  동시 수정 시 새 후보 상태를 덮어쓰지 않고 `stale_message`로 거절한다.
- `D1TransitionRepository`·peer relay·퇴역 Queue 이관·AI unknown 재개 경로를 복원하지 않는다.
  이미 적용된 migration과 최신 journal도 과거 사본으로 덮어쓰지 않는다.

## 마지막 테스트 9개 판단

| 파일 | 최종 판단 |
| --- | --- |
| `scripts/local-dev-config.test.ts` | 공유 설정을 쓰는 소비자 3곳의 연결 검사 유지. 문자열 검사만으로 실제 서버 기동 성공을 주장하지 않는다. |
| `src/app/layout/app-shell.test.ts` | footer 높이와 사용자 메뉴 조작 보호 유지. |
| `src/app/layout/footer.test.tsx` | 실제 사이트 권리 안내 문구와 `/rights` 링크 보호 유지. |
| `src/features/member-posts/ui/member-posts-overview.test.ts` | 카드 표면·게시 순서·외부 원문 링크의 현행 계약 유지. |
| `src/features/otw-play/ui/public/play-shell.test.tsx` | 모달 위 제안 메뉴의 쌓임 순서와 메뉴 조작 보호 유지. |
| `src/shared/api/feature-contracts.test.ts` | 프로필 no-store는 이미 반영. 활성 D1 retention status/prune API 검사 유지. |
| `worker/app/routes.test.ts` | publication-status는 이미 반영. ID·method/path 유일성과 권한 정책 유지. 퇴역 endpoint를 추가하지 않는다. |
| `worker/features/ddays/infrastructure/d1-dday-repository.test.ts` | 실제 adapter 명령 실행 3회를 검증하는 현행 단위 테스트 유지. 전체 삭제 제안 기각. |
| `worker/features/x-posts/x-posts.test.ts` | 빈 since_id 응답 테스트 본문 1,392자가 두 곳에서 동일함을 확인했다. 한 사본만 제거하고 같은 보호·현행 fixture·no-store 정책을 유지한다. |

중복 제거 후 X 파일의 64개 테스트와 해당 파일 ESLint가 통과했다.
CSS 단언은 일부 표시 계약만 확인하며 실제 브라우저 렌더링 검증을 대신하지 않는다.

## 주간 UI 4개 판단

day-cell/member-cell/schedule-item/weekly-schedule의 오래된 시안은 재적용하지 않는다.
사용자가 확정한 PR #174의 이전 레이아웃 복원·헤더 6rem과 관리자/종료 멤버 제한을 유지한다.
현재 `AuthenticatedImage`의 placeholder를 중복 구현하지 않으며,
부모 table/row 역할 없이 cell/rowheader만 이식하지 않는다.
취소한 폰트·카드·스크롤 구성을 새로운 필수 잔여 작업으로 만들지 않는다.

## 원본 보관과 복구

545개 모두 파일별 판단을 마쳤고 미분류 항목은 없다. 변경을 일괄 반영하는 대신,
현행에 필요한 수정만 위 PR에 반영하고 나머지 원본은 저장소 밖 복구 자료로 보관했다.
원본 519개 파일의 바이트 해시와 삭제 상태 26개, staged/unstaged 패치·인덱스·HEAD,
로컬 브랜치 Git bundle을 함께 보관했다. Git bundle 검증과 661개 보관 파일 해시 검증을 통과했다.
이는 보관 시점의 수치이며 이후 추가된 마감 기록을 포함한 총 파일 수와 구분한다.

로컬 보관소는 사용자 문서 폴더의
`Codex/archives/overthewall-schedule/2026-10-21-final-uncommitted-closeout`이다.
`manifest.json`이 작업 트리·상대 경로·원본 SHA-256·삭제 상태를,
`checksums.json`이 보관 파일 무결성을 소유한다. `local-branches.bundle`과 `head.txt`,
`tracked.patch`, `staged.patch`, `files/`로 당시 HEAD와 원바이트 변경을 별도 복구할 수 있다.
보관 원본을 현재 master에 일괄 재적용하지 않는다.
환경파일·로컬 DB·실행 중 서버와 기존 보관 자료는 제자리에 보존한다.

최종 병합 HEAD·검증 결과·전체 작업 트리의 Git 상태와 실제 정리 결과는 이 문서를 반영하는
PR의 검증 댓글을 따른다. 단순히 미커밋 수가 0이라는 이유로 코드 완성이나 운영 성공을 추론하지 않는다.
이번 작업은 운영 승인 경합 재현·원격 D1 변경·수동 배포를 수행하지 않는다.
양 사이트 Play 자동화 중지·LuvDia AI=false·유료 AI·대량 작업 보류를 유지한다.
