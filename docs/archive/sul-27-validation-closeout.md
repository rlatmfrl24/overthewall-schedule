# SUL-27 임시 검증 자료 정리

2026-09-22에 `.tmp/sul-27`과 루트의 SUL-27 검사 로그를 검토했다.
현행 구현은 PR #144 (`ac23a5b7`)의 Ready 등록 시 검색 projection 갱신과 관련 migration을 따른다.

- 루트 focused test 로그: 2개 파일, 35개 테스트 통과.
- 임시 migration chain 로그: 당시 95건 검증, 기존 로컬 D1 변경 없음.
- 임시 preflight 로그: 모든 검사 통과.
- 당시 배포 로그의 Worker version: `5c734455-6906-4c85-af8e-6bf0ab224a47`.
- 전후 JSON 4개, 로그 3개, 편집 스크립트 3개, 진단 SQL 1개를 저장소 밖
  `C:/Users/rlatm/.codex/worktree-backups/otw-cleanup-20260922/sul-27`에 복사하고
  원본과 SHA-256 일치를 확인한 뒤 임시 디렉터리를 제거했다.

이 기록은 과거 자료의 요약이며 현재 운영을 재검증한 결과가 아니다.
