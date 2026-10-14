# SUL-36: 로컬 테스트 중 운영 R2 업로드 사고

상태: 실행 중단과 현재 원격 파일 7개 확인. 사고 전 상태·이용자 영향은 미확인. 2026-10-14.

허용된 범위는 코드 구현과 로컬 검증이었다. 기존 업로드 CLI를 테스트에서 import했을 때 최상위 실행 코드가 작동하여 운영 `otw-schedule` bucket에 업로드했다. 허용 범위를 넘긴 실행이며 로컬 검사 성공으로 상쇄하지 않는다.

## 현재 확인한 사실

- 구현 담당자가 테스트 session `99620`에 Ctrl-C를 보내 exit1로 중단했다.
- 실행 명령은 pinned Node24.20.0 환경의 `pnpm.cmd exec vitest run scripts/upload-profile-backgrounds.test.ts`였다. 보존된 로컬 기록의 실행 구간은 18:55:10–18:55:26 KST이며 개별 원격 자식 OS PID는 당시 기록하지 않아 미상이다. 이 회차는 테스트 assertion 결과에 도달하지 않았으므로 유효한 RED 테스트로 세지 않는다.
- controller가 `.tmp/sul36-4-3-cli-red.log`를 직접 읽어 `Resource location: remote`, 아래 6개 `Upload complete`, 마지막 1개 `Creating object`만 있는 로그를 확인했다.
- 구현 담당자의 중단 뒤 프로세스 검사에 해당 upload/Vitest/Wrangler put 프로세스가 없었다. controller의 별도 CIM 조회에도 해당 실행 자식은 없었고 조회 명령을 포함한 자신의 PowerShell 프로세스만 일치했다.
- 업로드 입력 7개 파일의 크기·SHA-256을 `.tmp/sul36-4-3-incident-local-inputs.json`에 보존했고 controller가 읽었다. 이 값은 로컬 입력의 증거이며 기존 운영 파일의 값이 아니다.
- controller가 기존 CLI 전체를 읽어 `otw-schedule` 기본 bucket, `r2 object put --remote --force`, `image/webp`와 `public,max-age=31536000,immutable` cache-control 인자를 확인했다. 이 시점에는 실제 운영 metadata·cache 상태를 조회하지 않았으며 이후 허용된 현재 metadata 조회 결과는 아래에 구분한다.
- 중단 직후 원격 조회·복구·삭제도 보류했고 사용자에게 7개 파일의 읽기 전용 영향 확인을 별도로 요청했다. 명시적 허용 답변 뒤 아래 7개 GET만 수행했다. 추가 업로드·복구·삭제는 실행하지 않았다.

## 경로와 완료 상태

bucket: `otw-schedule`. 모든 key는 `members/`로 시작한다.

| object key | 로컬 입력 bytes | 로그 상태 |
| --- | ---: | --- |
| `members/bing_hayu/backgrounds/luvtab/original.webp` | 1,893,851 | Upload complete |
| `members/bing_hayu/backgrounds/wedding/original.webp` | 2,129,299 | Upload complete |
| `members/bing_hayu/backgrounds/default/original.webp` | 2,231,963 | Upload complete |
| `members/hane/backgrounds/casual/original.webp` | 1,604,875 | Upload complete |
| `members/hane/backgrounds/default/original.webp` | 2,252,894 | Upload complete |
| `members/kim_ate/backgrounds/casual/original.webp` | 1,958,662 | Upload complete |
| `members/kim_ate/backgrounds/default/original.webp` | 2,144,018 | Creating object만 확인, 완료 여부 unknown |

LuvDia 대상 밖의 `hane`·`kim_ate` 경로도 포함됐다. 로그에 시작되지 않은 후속 경로는 실행됐다고 표시하지 않는다. 최초 로그만으로는 마지막 경로의 실패·완료를 단정할 수 없었으며 이후 현재 값 조회 결과는 아래에 구분한다.

## 허용된 현재 상태 읽기 결과

사용자가 7개 경로의 현재 크기·hash·version 읽기 전용 확인을 명시적으로 허용했다. controller가 19:21:31–19:22:45 KST에 기존 credential로 정확히 해당 object 경로 7개만 GET했다. 계정 목록 조회·로그인·새 Worker 생성·배포·복구·삭제·추가 업로드는 하지 않았다.

7개 모두 HTTP200이며 총 14,215,562 bytes를 읽었다. 각 크기·SHA-256은 위 로컬 입력과 일치한다. 원본 응답 metadata·파일 body와 비교 결과는 `.tmp/sul36-incident-readback-20261014/object-{0..6}.{json,bin}` 및 `readback-summary.json`에 보존했다.

| object key의 `members/` 이후 경로 | 현재 ETag | 현재 Last-Modified, KST |
| --- | --- | --- |
| `bing_hayu/backgrounds/luvtab/original.webp` | `a9d202f7c8ca842992c652626516188a` | 18:55:13 |
| `bing_hayu/backgrounds/wedding/original.webp` | `c578be9ec9e54af1fad4c6d8cde250b0` | 18:55:15 |
| `bing_hayu/backgrounds/default/original.webp` | `5b3140493999a2536e85ed3ea53ace38` | 18:55:19 |
| `hane/backgrounds/casual/original.webp` | `debb8a54e77718e84e171493fcea809a` | 18:55:21 |
| `hane/backgrounds/default/original.webp` | `afa53d1fc630da5fc4826737c24260db` | 18:55:22 |
| `kim_ate/backgrounds/casual/original.webp` | `5a504935cb38bf2e2f77a4fcf25ff1e7` | 18:55:25 |
| `kim_ate/backgrounds/default/original.webp` | `91cc47c17959f934ef80079c2a85eb53` | 18:55:28 |

마지막 파일도 현재 값이 업로드 입력과 일치하고 수정 시각은 중단 기록 뒤인18:55:28이다. 프로세스 중단이 이미 진행 중인 서버 저장을 되돌리지 않았음을 보여 준다. 최초 로그에 완료 응답이 없었다는 사실은 그대로 보존한다.

응답의 `Content-Type`은 모두 `image/webp`, `Cache-Control`은 모두 `public, max-age=31536000, immutable`이었다. 사용한 GET 응답에는 실제 R2 upload-version이 없으며 **ETag를 업로드 version으로 취급하지 않는다**. 이 조회는 CDN/public 화면의 실제 cache·이용자 동선을 확인한 결과가 아니다.

## 보존한 로컬 입력 SHA-256

```text
bing_hayu--luvtab.webp  7BF58294854AAB2B4B21BA152825BB3FA3C5482B8AF6F5E209EE7B082CDEF6E7
bing_hayu--wedding.webp 858D530BD12ABCEE77EC758741CA1E6705AC1883B36B4C1D8329D6C484685A0D
bing_hayu.webp          44A7EB48A6E455E168481072A7432CFA596494CE088208B4BD05D5C9DA606F3F
hane--casual.webp       B89A8EC089695E7D9DF80D50B22B4CBCA1E9238A42C6BFF26B2D2DF674425E0D
hane.webp               17E25B30DD5AAECA107F0F761CD4EF7B2B726549D971EF05491D7A7A0EC9DDE3
kim_ate--casual.webp    7E4D4B62F7E2755D8C164B0451AC0AF2995FC9795CC2A0F30EFD2BCB2F08654F
kim_ate.webp            F3043C994F886AA64B6E7EB9119E1D9E12C9E65012F3CC0C29445C7AEC83AC64
```

입력 디렉터리는 `r2/profile-background/`다. 기존 source·legacy DB 보존 검사는 이 R2 사고의 영향 검사를 대신하지 않는다.

## 원인 수정과 미확인 사항

구현 담당자가 두 executable entry에 direct-entry guard를 추가하고 site·config·bucket·scope·persistence 검증 뒤에만 runtime을 읽도록 수정했다. 실제 subprocess·Wrangler runtime을 호출할 수 없도록 주입한 초기 import·invalid-target 검사7개, 최종 CLI 안전 회귀9개를 확인했다. controller가 실제 두 entry를 읽어 local 실행의 명시적 `remoteBindings:false`를 확인한 뒤 작은 격리 fixture의 정상 local CLI 검증만 재개하도록 했다. 양 사이트의 명시적 local 업로드·같은 operation retry·실제 D1/R2 body/hash/own version 보존을 확인했고 2026-10-15 Task4.3 코드의 독립 검토도 마쳤다. 이 재발 방지 검증은 사고 영향의 종결이 아니다. 원격 경로의 실제 실행은 계속 금지한다. 해당 회귀의 최초 회차는 runner 미구현1개만 유효한 실패였고 함수 부재로 끝난 나머지는 정상 거부 증거로 세지 않는다.

현재 bytes·크기·ETag·수정 시각·cache-control은 위 실제 읽기로 확인했다. 실제 R2 upload-version, 사고 전 값과 실제 cache·이용자 영향은 미확인이다. 로컬 입력과 현재 값이 일치하더라도 사고 전 상태가 유지됐다는 증거는 아니다. 기존 파일이 같은 내용이었다고 주장하지 않으며 로컬 입력을 다시 보내 복구 처리하지 않는다.

추가 운영 조사·복구·삭제·업로드는 아직 허용되지 않았다. 이번 읽기 허가를 그 권한으로 확대하지 않는다. 필요 조치는 사고 전 자료와 실제 영향이 확인된 뒤 검토해야 한다.
