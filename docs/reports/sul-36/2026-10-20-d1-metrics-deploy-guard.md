# D1 계측 설정 보존과 배포 전 점검

후속 승인: 사용자가 PR 게시·검토 후 문제없을 때 병합·양 사이트 반영·실제 사용량 표시 확인을 요청했다. 기존 작업·자동화 중지·LuvDia AI=false와 유료 AI 중지를 유지하며 Node 24.20.0의 최종 preflight 및 운영 readback을 진행한다. 아래는 15:24 KST 최초 로컬 검증 기록이며 이후 최종 판정은 이 변경의 PR 검증 ledger가 소유한다.

2026-10-20 검증 결과: **양 사이트 계측 설정이 다음 정상 배포에서 유지되는 구성을 확인했고, 누락 시 중단하는 배포 전 검사를 구현했다.** 운영 배포·migration·D1 SQL·자동화/유료 AI 실행은 수행하지 않았다. 변경은 별도 작업 트리에 있으며 아직 master에 병합하지 않았다.

## 확인한 실제 배포 경로

| 사이트 | 실제 설정 / 진입점 | 계측 설정 보존 |
| --- | --- | --- |
| OTW | Cloudflare 설정 화면에서 master 연결, 빌드 `pnpm run build`, 배포 `node scripts/deploy-workers.mjs --site=otw` 확인 | canonical·생성 config 모두 `keep_vars: true`; 계정·DB ID는 정상 config vars, 토큰은 원격 Secret |
| LuvDia | Cloudflare 설정 화면에서 Git 연결 없음. 기존 `pnpm deploy:luvdia` → 동일 배포 스크립트의 `--site=luvdia` | canonical·생성 config 모두 `keep_vars: true`; 계정 ID·DB ID·토큰 모두 원격 Secret |

원격 점검 명령 `pnpm deploy:check:d1-metrics`를 실제 인증으로 실행해 두 Worker 모두 통과했다. 현재 활성 버전과 최신 업로드 버전이 일치하며 다음과 같다.

- OTW: `d25beeb9-2acc-495c-81fb-b96dc5297e85`
- LuvDia: `a4f2ad1f-7c83-405e-91e0-77cda0443abc`

Cloudflare는 [keep-vars가 대시보드 변수를 보존하며 배포가 Secrets를 삭제하지 않는다고 명시한다](https://developers.cloudflare.com/workers/wrangler/commands/workers/). 설치된 Wrangler 4.129.1의 업로드 구현도 일반 변수의 `plain_text/json`과 Secret의 `secret_text/secret_key` 보존을 사용한다. 실제 생성 산출물과 양 사이트 dry-run에서 변수 보존 설정·사이트별 D1·기존 AI flag를 확인했다.

Workers Builds API 조회는 현재 토큰 권한에서 401이어서 설정을 추정하지 않고 인증된 Cloudflare 화면의 실제 명령으로 확인했다. 설정 저장이나 빌드 시작은 하지 않았다.

## 추가한 동작

`scripts/d1-metrics-deploy-guard.mjs`를 기존 배포 스크립트에 연결했다. 산출물·클라이언트 인증 설정 검증 이후, 원격 D1 doctor 및 Worker 업로드 이전에 실행한다.

1. 실제 배포 config의 `keep_vars: true`를 요구한다.
2. 계측 토큰·계정 ID·DB ID가 모든 활성 버전 및 최신 업로드 버전에 존재하는지 확인한다. ID의 정상 암호화 저장도 허용한다.
3. 토큰은 `secret_text`만 허용한다. 빈 config 값·평문 토큰·잘못된 binding 타입·중복 이름·다른 D1 binding을 차단한다.
4. 읽을 수 있는 계정·DB ID 및 config의 ID가 실제 배포 계정·DB와 일치하는지 확인한다.
5. 인증·응답 파싱 오류도 배포를 중단한다. Wrangler 원문 응답이나 토큰 값을 로그에 내보내지 않는다.

CI의 명시적 계정 ID를 사용하므로 계정 목록 권한을 새로 요구하지 않는다. 계정이 지정되지 않은 대화형 환경에서만 Wrangler의 단일 계정을 확인한다. 기존 배포 인증·migration용 D1 토큰을 교체하거나 읽기 전용 계측 토큰으로 대체하지 않는다.

점검 전용 명령은 두 사이트의 Cloudflare 메타데이터만 읽는다. `--dry-run`은 로컬 보존 설정을 검증하고 원격 계측 검사는 실행하지 않으므로, 원격 확인에는 점검 전용 명령을 사용한다. 직접 `wrangler deploy`를 실행하면 저장소 검사를 우회하므로 정상 배포 진입점을 유지한다.

## 검증과 보존

- 관련 4개 테스트 파일 **30개 PASS**: 세 필수 binding 각각의 누락·빈 값, 계정/DB 불일치, 암호화 ID, 보존 설정, 인증/파싱 실패, 실제 배포 모듈의 실패 시 외부 실행 0회와 성공 시 기존 순서 유지.
- `pnpm typecheck:test`, 변경 테스트 ESLint, `pnpm architecture:check`, 두 배포 스크립트의 Node 문법 검사, `git diff --check` PASS.
- 양 사이트 정상 build 및 최종 `node scripts/deploy-workers.mjs --site=<site> --dry-run` PASS. 컴파일 이후 배포 스크립트·테스트만 수정한 최종 소스로 manifest를 갱신하고 dry-run을 재확인했다. 앱 산출물은 그대로다.
- 최종 양 사이트 source hash: `f1d7785347d1183d7ba7a804978cd134fb98a7021552bcfa5792ba842dd35458`, 기준 HEAD `15ecef036809df743844a42e9f9d05962c3a7723`, migration head `0147_young_night_nurse`.
- 원본 프로젝트의 기존 구조도 source manifest **1,119파일 변경 0건**. 기존 미커밋과 타 작업 트리는 보존했다.
- 운영 SQL·업무 API·작업 요청·Secret 변경·버전 업로드·배포·Cron/Queue/설정 변경 **0회**. Play 중지와 LuvDia AI=false를 재개하지 않았다.

## 적용과 남은 한계

변경은 `d1-metrics-deploy-guard` 작업 트리에 구현되어 있으며 병합·게시 전이다. master에 반영한 뒤 기존 정상 배포부터 자동 차단 검사가 적용된다. 다음 실제 운영 배포를 실행하거나 그 이후 관리자 화면을 확인한 결과로 확대하지 않는다.

암호화된 ID의 내용과 토큰 유효기간·권한은 메타데이터에서 읽을 수 없다. 실제 계측 화면 정상 표시는 직전 운영 검증에서 확인했으며 다음 승인된 배포 후 양 사이트 `/admin/resources`에서 다시 확인해야 한다. 이번에는 관련 범위만 검증했으며 전체 release preflight는 실행하지 않았다. 로컬 검증은 Node 25.2.1에서 통과했으나 프로젝트가 지정한 Node 24.20.x의 CI 실행은 미확인이다. 기존 큰 청크 경고는 유지된다.

사용 명령과 운영 절차는 [D1 metrics deployment checks](../../operations/d1-metrics-deployment.md)를 따른다. 로컬 상세 증거는 원본 작업 공간의 `graphify-out/production-verification/deployment-guard/`에 보존했다.
