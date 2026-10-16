# OTW 스키마 호환·공개 운영 반영 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` inline; one independent whole-release review before merge. Preserve the original mixed worktree.

**Goal:** 2026-10-19 00:00 KST LuvDia 공개와 OTW 세 멤버의 일반 노출·신규 수집 종료를 검증된 PR로 운영 반영한다.

**Architecture:** 기존 서버 시간 정책과 owning read/write·보관 권한을 유지한다. 스키마 호환 확장과 readback 뒤 master 자동 배포를 진행하고 LuvDia에 동일 검토 소스를 반영한다.

**Tech Stack:** Node 24.20+, pnpm 11.7, TypeScript, React, Workers Builds, Wrangler, Drizzle/D1.

**Spec:** [확정 공개 계약](2026-10-15-site-publication-cutover.md), [작업 목록](../../reports/sul-36/2026-10-16-work-register.md).

## Global Constraints

- 시각 `2026-10-18T15:00:00Z`; OTW 대상 `bing_hayu`, `u_lili`, `yang_mei`.
- 기존 미커밋 전체를 리뷰하되 공개 필수 의존성부터 단일 PR. unrelated WIP·원본·개인 playlist·Queue 메시지 보존.
- 관리자 정상 인증·보관 접근, 다른 멤버 운영, 의도적으로 중지한 AI 설정 유지.
- 0137/0138은 OTW에 이미 적용됨. 파일명·내용·이력 수정/중복 적용 금지.
- 원격 전수 검사·재귀 음악 검사·이관·백필·강제 수집·유료 AI 실행 보류.
- OTW는 기존 master 자동 배포를 사용. 새 배포 주체나 중복 수동 배포를 만들지 않음.

## Review Focus

- 기존 Worker와 확장 스키마: 제안·자식 관계, X pending/lease, 일반 read/write 보존.
- 익명/회원/관리자·직접 파일/HEAD/인코딩·캐시: 공개 전 우회 없음.
- T 이전 접수/T 이후 저장: 숨김 대상 신규 반영·가짜 완료 없음.
- 사이트별 source/artifact/Clerk/resources: 잘못된 산출물·사이트 혼합 거부.
- D1 빈 작업/예산과 scheduled retry/unknown evidence: 반복 스캔·증거 유실 없음.

## Tasks

- [ ] 1. 격리된 D1에서 OTW 0101+0137/0138 → 0102~0136/0139~0140, LuvDia 0136 → 0137~0140 순서를 재현. FK·원본·제안 자식·현행 Worker 호환 및 reads/writes 비용 확인. 0140은 발행 응답 보존의 JSON 검증 view만 갱신하며 기존 SQL은 보존한다.
- [ ] 2. 전체 변경 리뷰·필수 정리. schema-only 원격 doctor와 사이트 artifact 검증을 회귀 테스트로 연결. 실제 계약과 불일치한 maintenance fixture를 정상 finalization 경로로 수정.
- [ ] 3. 검토한 source/schema/meta/test/docs만 커밋·단일 PR. 독립 리뷰와 최종 preflight·양 사이트 build 완료. 현재 계정 예산·복구 지점 확보 후 호환 migration/readback → merge → OTW 자동 배포 → 동일 소스 LuvDia 배포.
- [ ] 4. 정상 도메인·관리자·카운트다운·OTW 사전 정상·자연 실행 readback. 19일 관측 예약을 중복 없이 설정. 병합 증명된 branch만 정리하고 통합 목록을 갱신.

## Verification

실제 Workerd/D1 migration/권한/동시성·비용 회귀와 정상 URL/로그인 흐름을 함께 확인한다. 로컬 fake clock과 API mock을 실제 19일 관측·운영 관리자 인증 증거로 대신하지 않는다. 원격 검사에는 schema-only를 사용하며 local full doctor/preflight는 유지한다. 미검증·실패·운영 미반영은 분리해 기록한다.
