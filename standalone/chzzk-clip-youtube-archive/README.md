# Chzzk Clip YouTube Archive

독립 프로젝트로 분리하기 위한 치지직 클립 아카이브/YouTube 업로드 자동화 설계 문서 모음이다.

## 목적

- 치지직 클립 원본을 보존한다.
- 보존본을 특정 YouTube 계정에 private 업로드한다.
- 이후 자동 자막, 자막 검수, 편집, 렌더링, 공개 발행으로 확장할 수 있게 한다.

## 현재 범위

이 폴더는 OTW Schedule의 기능 문서가 아니다. 현재 저장소 안에 임시로 보관하지만, 런타임 코드나 배포 흐름과 연결하지 않는다.

## 파일 구조

```text
standalone/chzzk-clip-youtube-archive/
  README.md
  docs/
    implementation-plan.md
```

## 분리 방법

별도 저장소로 옮길 때는 이 폴더 전체를 새 repo 루트로 복사하면 된다. 이후 실제 스택을 정하면서 `package.json`, 앱 코드, worker/media worker, migration, 배포 설정을 추가한다.

## 설계 문서

- [Implementation Plan](docs/implementation-plan.md)
