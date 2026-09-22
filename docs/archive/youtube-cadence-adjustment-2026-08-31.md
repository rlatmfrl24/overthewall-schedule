# 2026-08-31 YouTube 운영 조정 기록

현행 기준은 [예약 작업](../operations/scheduled-jobs-v2.md)과 [채널 polling](../operations/channel-upload-polling.md)이다. 아래 WebSub·6시간 대조는 종료된 과거 방식이다.

## 과거 기록 — 2026-08-31 저빈도 YouTube 운영 조정 (종료)

아래 6시간 대조와 고정 item 수는 당시 기준이다. 2026-09-09부터 시간당 채널 조회와 실제 대상이 있는 phase만 생성하는 현행 계약을 따른다.

2026-08-31 운영 공개 API에서 공식 8개·키리누키 6개 채널의 최근 업로드 373건을 확인했다. 가장 바쁜 채널은 주 9.11건, 중앙 업로드 간격 19.49시간, 4시간 내 최대 3건이었다. WebSub가 신규 업로드 알림을 우선 처리하므로 채널별 reconcile 6시간을 유지하고, 빈 due/recovery 확인만 시간당 1회로 줄인다. 재현 가능한 계산과 한계는 [분석 노트북](youtube-upload-cadence-analysis.ipynb)에 기록한다.

- 전체 Workflow 예약 시작: 하루 398회 → 158회(약 60% 감소)
- ingestion/WebSub 고정 recovery item: 하루 672개 → 168개(75% 감소)
- 고정 recovery item의 D1 write 예약 추정: 하루 38,400 rows → 9,600 rows(75% 감소)

위 수치는 실제 due 채널·source와 X/Naver/auto-update 실행량을 제외한 예약 시작 및 고정 recovery item 기준이다.


[당시 보고서 데이터](youtube-upload-cadence-report.artifact.json)
