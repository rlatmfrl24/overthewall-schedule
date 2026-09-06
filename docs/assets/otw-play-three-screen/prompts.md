# OTW Play 3개 화면 — 현재 기능 중심 수정 시안 프롬프트

2026-09-05 · 내장 ImageGen 사용 · 세 화면은 상호 보완적인 한 세트

사용자 피드백에 따라 에디터·노래책·저장 기능을 제외한 최종 수정 세트다. 이미지는 앱 구현이 아닌 래스터 시안이다. 아래 경로는 이 세션의 생성·참조 이력을 남기기 위한 로컬 원본 위치이며 운영 에셋 경로가 아니다. 저장소의 최종 결과는 discover.png, catalog.png, members.png다.

## 발견

참조: 이전 발견 시안 C:/Users/rlatm/.codex/generated_images/01a0716d-0187-7c43-8f4e-6bef59edd79b/exec-4c47b3dd-2987-4909-826a-cbf2665e05d7.png; 현재 화면 C:/Users/rlatm/.codex/visualizations/2026/09/05/01a0716d-0187-7c43-8f4e-6bef59edd79b/otw-play-design/current-discover-1440.png

```text
Create a polished, restrained Korean desktop OTW Play UI mockup. Target 1440x1024. This belongs to THREE COMPLEMENTARY SCREENS: 발견, 곡 탐색, 멤버. SAME product shell and SAME player state on all screens. Date anchor 2026-09-05; use verified historic dates, never call them this-week releases. Use the attached OTW screen as visual reference, but remove scope-heavy editorial features as requested by user.
Style: sophisticated light near-white surface, generous alignment/spacing, hairline gray row separators, no nested card stacks, no heavy shadows. Readable Korean typography14-16px body,32px headings, restrained teal #31A4A9 for active tab and coral #F66479 play. Real vivid music thumbnail artwork. No arbitrary new gradients/brands. SINGLE global OTW sidebar at left around230px, top header72px, center about800px, right player380px. Existing OTW global sidebar with logo and schedule/content links, OTW Play dark active. Header OTW Play, ONE search field '곡, 원곡 가수, 참여자 검색', EXACTLY3 primary tabs 발견/곡 탐색/멤버, overflow secondary. No second music sidebar, no bottom audio-only player.
IDENTICAL right player: '지금 재생 중' with no new desktop expand button, real-style Hane Fanservice blue-haired video 16:9 visible at least200px high. Show video controls hidden (they appear only on hover in real iframe) to prevent competing play/pause icons; DO NOT render fabricated control overlays. Below: '팬서비스 (ファンサ)', '하네', '공식 커버 · 2026.06.26', progress1:37/4:13, repeat/previous/coral pause/next/shuffle/volume icons, source link '공식 영상 · 하네 Hane ↗'. Next heading '다음 재생', two rows with16:9thumbs: BAD HABIT /쿠레나이 나츠키 · 온하루; 모시모시 키코에테루 /빙하유. Queued examples notsaved. No headphones-only art substitute. Same source iframe stateandcontent acrossnavigation.
Use actual metadata:
팬서비스 (ファンサ),원곡 mona · HoneyWorks,하네2026.06.26 and유리리2023.11.13,total2가창;
내가 죽으려고 생각한 것은,테리 눈나,원곡 나카시마 미카,2026.06.17;
BAD HABIT,쿠레나이 나츠키 · 온하루,원곡 QWER,2026.06.02;
모시모시 키코에테루,빙하유,원곡 sasane,2026.05.31;
변하지 않는 것,온하루,원곡 오쿠 하나코,2026.04.21;
바움쿠헨 엔드롤,빙하유 · 양메이 · 유리리,omitdate;
Happy birthday to you,빙하유,omitdate.
Never invent playback durations (exceptknownFanservice4:13),personalizedscores,likes,counts,originalsongsnotinrefs,editorialcopyorcontent. No 에디터/큐레이션 모음/테마 플레이리스트/모음 상세/보관함/좋아요/팔로우/만든 곡/노래책/독립 프로필/알림/라디오/공유 새 기능/가사/인기차트. Data is current catalog, facets, filters, song detail and sessionqueue ONLY. Underlying interactions will have short subtle transitions but do not put animation specifications or technical notes in the mock.
Preserve reference member-name pairing and original16:9 thumbnail shape. Correct all potentially wrong priorimage labels using these instructions. Flat single screen, no bezel, no collage.
Screen: DISCOVER with 발견 active. This uses existing recent catalog and first8 hero candidates automatically; NO operator curation subsystem or curatedcollection.
Main heading '발견', subtitle '최근 공개된 음악에서, 새로운 목소리를 만나보세요'.
Spacious split feature image+text. Left16:9 Hane Fanservice large image. Right small teal '최근 공개', large '팬서비스\n(ファンサ)', performer '하네', '공식 커버 · 2026.06.26', compact originalcredit '원곡 mona · HoneyWorks', coral '이 버전 재생', secondary '곡 상세 →'. Small manual previous/next controls and '1 / 8' below hero. No automaticcarousel label. No marketing story paragraph or sharebutton.
Next heading '이어서 찾아볼 음악', small '곡 탐색 →'. Four airy rows:
내가 죽으려고 생각한 것은 /테리 눈나 /2026.06.17
BAD HABIT /쿠레나이 나츠키 · 온하루 /2026.06.02
모시모시 키코에테루 /빙하유 /2026.05.31
변하지 않는 것 /온하루 /2026.04.21.
96x54 landscape thumbnails, title15-16px andperformer13-14px, datesquiet, play+queuecontrols. No big card perrow.
Bottom single quiet rule andtwo simple navigation links '오리지널 둘러보기 →' '공식 커버 둘러보기 →' that useexistingfilters. This frame should feel editorially composed but be entirely automatic from metadata, not an editorial publishing system. Do not put the removed '에디터가 고른 모음' orportraitmosaic at bottom.
```

## 곡 탐색

참조: 수정 발견 C:/Users/rlatm/.codex/generated_images/01a0716d-0187-7c43-8f4e-6bef59edd79b/exec-eff85116-643c-46b6-8477-931023cad81f.png; 이전 곡 탐색 C:/Users/rlatm/.codex/generated_images/01a0716d-0187-7c43-8f4e-6bef59edd79b/exec-b72e19fb-52d9-49fa-ae2a-45d5346ac9e8.png

```text
Create a polished, restrained Korean desktop OTW Play UI mockup. Target 1440x1024. This belongs to THREE COMPLEMENTARY SCREENS: 발견, 곡 탐색, 멤버. SAME product shell and SAME player state on all screens. Date anchor 2026-09-05; use verified historic dates, never call them this-week releases. Use the attached OTW screen as visual reference, but remove scope-heavy editorial features as requested by user.
Style: sophisticated light near-white surface, generous alignment/spacing, hairline gray row separators, no nested card stacks, no heavy shadows. Readable Korean typography14-16px body,32px headings, restrained teal #31A4A9 for active tab and coral #F66479 play. Real vivid music thumbnail artwork. No arbitrary new gradients/brands. SINGLE global OTW sidebar at left around230px, top header72px, center about800px, right player380px. Existing OTW global sidebar with logo and schedule/content links, OTW Play dark active. Header OTW Play, ONE search field '곡, 원곡 가수, 참여자 검색', EXACTLY3 primary tabs 발견/곡 탐색/멤버, overflow secondary. No second music sidebar, no bottom audio-only player.
IDENTICAL right player: '지금 재생 중' with no new desktop expand button, real-style Hane Fanservice blue-haired video 16:9 visible at least200px high. Show video controls hidden (they appear only on hover in real iframe) to prevent competing play/pause icons; DO NOT render fabricated control overlays. Below: '팬서비스 (ファンサ)', '하네', '공식 커버 · 2026.06.26', progress1:37/4:13, repeat/previous/coral pause/next/shuffle/volume icons, source link '공식 영상 · 하네 Hane ↗'. Next heading '다음 재생', two rows with16:9thumbs: BAD HABIT /쿠레나이 나츠키 · 온하루; 모시모시 키코에테루 /빙하유. Queued examples notsaved. No headphones-only art substitute. Same source iframe stateandcontent acrossnavigation.
Use actual metadata:
팬서비스 (ファンサ),원곡 mona · HoneyWorks,하네2026.06.26 and유리리2023.11.13,total2가창;
내가 죽으려고 생각한 것은,테리 눈나,원곡 나카시마 미카,2026.06.17;
BAD HABIT,쿠레나이 나츠키 · 온하루,원곡 QWER,2026.06.02;
모시모시 키코에테루,빙하유,원곡 sasane,2026.05.31;
변하지 않는 것,온하루,원곡 오쿠 하나코,2026.04.21;
바움쿠헨 엔드롤,빙하유 · 양메이 · 유리리,omitdate;
Happy birthday to you,빙하유,omitdate.
Never invent playback durations (exceptknownFanservice4:13),personalizedscores,likes,counts,originalsongsnotinrefs,editorialcopyorcontent. No 에디터/큐레이션 모음/테마 플레이리스트/모음 상세/보관함/좋아요/팔로우/만든 곡/노래책/독립 프로필/알림/라디오/공유 새 기능/가사/인기차트. Data is current catalog, facets, filters, song detail and sessionqueue ONLY. Underlying interactions will have short subtle transitions but do not put animation specifications or technical notes in the mock.
Preserve reference member-name pairing and original16:9 thumbnail shape. Correct all potentially wrong priorimage labels using these instructions. Flat single screen, no bezel, no collage.
SCREEN 곡 탐색 active. Match first reference NEW reduced-scope Discover's shared shell andrightplayer. Ref2oldcatalogdataandthumbs. In center show heading '곡 탐색',subtitle '곡을 찾고, 원하는 목소리로 들어보세요'. No second search field.
Filters one calmrow: '전체' active teal, '오리지널', '공식 커버', '멤버 선택', '상세 필터'; right '최근 공개순'. Small '불러온 곡 24개'. Reading grid headings 곡 정보 / 가창자 / 공개일.
First song 팬서비스 (ファンサ) /원곡 mona · HoneyWorks /하네 /2026.06.26. Small '가창 버전 2개⌃' expanded inline under this row. IMPORTANT: just one pale teal group with hairline separators, NOT cardinsidecard or framed nestedrow. Two version subrows 하네2026.06.26 '지금 재생 중'; 유리리2023.11.13 '이 버전 재생' andqueueadd. No new collectionorplaylist.
Next four tidy rows of verified songs withproper96x54landscapethumbnails: 내가 죽으려고 생각한 것은 (two-linesallowed)/테리 눈나/2026.06.17/original나카시마미카; BAD HABIT/쿠레나이 나츠키 · 온하루/2026.06.02/originalQWER; 모시모시 키코에테루/빙하유/2026.05.31/originalsasane; 변하지 않는 것/온하루/2026.04.21/original오쿠하나코. Use pink-haired actual Ontoharu music thumbnail from oldcatalog forlast NOT blueportrait from firstreference. Play andqueuecontrols consistentrightaligned. Final '더 불러오기'. Typographyandspacingextremelylegible, no clippedcharacters, understatedprofessional layout. Headeractiveunderline indicates selectednav. No new features beyond existing search/filter/detailversion/queue. Focus sameplayingHane evenwhileother versionsavailable.
```

## 멤버

참조: 수정 발견 C:/Users/rlatm/.codex/generated_images/01a0716d-0187-7c43-8f4e-6bef59edd79b/exec-eff85116-643c-46b6-8477-931023cad81f.png; 현재 전체 화면 C:/Users/rlatm/.codex/visualizations/2026/09/05/01a0716d-0187-7c43-8f4e-6bef59edd79b/otw-play-design/current-discover.png; 수정 곡 탐색 C:/Users/rlatm/.codex/generated_images/01a0716d-0187-7c43-8f4e-6bef59edd79b/exec-2075816d-b1b4-4d95-a940-ecb0a59ccb25.png

```text
Create a polished, restrained Korean desktop OTW Play UI mockup. Target 1440x1024. This belongs to THREE COMPLEMENTARY SCREENS: 발견, 곡 탐색, 멤버. SAME product shell and SAME player state on all screens. Date anchor 2026-09-05; use verified historic dates, never call them this-week releases. Use the attached OTW screen as visual reference, but remove scope-heavy editorial features as requested by user.
Style: sophisticated light near-white surface, generous alignment/spacing, hairline gray row separators, no nested card stacks, no heavy shadows. Readable Korean typography14-16px body,32px headings, restrained teal #31A4A9 for active tab and coral #F66479 play. Real vivid music thumbnail artwork. No arbitrary new gradients/brands. SINGLE global OTW sidebar at left around230px, top header72px, center about800px, right player380px. Existing OTW global sidebar with logo and schedule/content links, OTW Play dark active. Header OTW Play, ONE search field '곡, 원곡 가수, 참여자 검색', EXACTLY3 primary tabs 발견/곡 탐색/멤버, overflow secondary. No second music sidebar, no bottom audio-only player.
IDENTICAL right player: '지금 재생 중' with no new desktop expand button, real-style Hane Fanservice blue-haired video 16:9 visible at least200px high. Show video controls hidden (they appear only on hover in real iframe) to prevent competing play/pause icons; DO NOT render fabricated control overlays. Below: '팬서비스 (ファンサ)', '하네', '공식 커버 · 2026.06.26', progress1:37/4:13, repeat/previous/coral pause/next/shuffle/volume icons, source link '공식 영상 · 하네 Hane ↗'. Next heading '다음 재생', two rows with16:9thumbs: BAD HABIT /쿠레나이 나츠키 · 온하루; 모시모시 키코에테루 /빙하유. Queued examples notsaved. No headphones-only art substitute. Same source iframe stateandcontent acrossnavigation.
Use actual metadata:
팬서비스 (ファンサ),원곡 mona · HoneyWorks,하네2026.06.26 and유리리2023.11.13,total2가창;
내가 죽으려고 생각한 것은,테리 눈나,원곡 나카시마 미카,2026.06.17;
BAD HABIT,쿠레나이 나츠키 · 온하루,원곡 QWER,2026.06.02;
모시모시 키코에테루,빙하유,원곡 sasane,2026.05.31;
변하지 않는 것,온하루,원곡 오쿠 하나코,2026.04.21;
바움쿠헨 엔드롤,빙하유 · 양메이 · 유리리,omitdate;
Happy birthday to you,빙하유,omitdate.
Never invent playback durations (exceptknownFanservice4:13),personalizedscores,likes,counts,originalsongsnotinrefs,editorialcopyorcontent. No 에디터/큐레이션 모음/테마 플레이리스트/모음 상세/보관함/좋아요/팔로우/만든 곡/노래책/독립 프로필/알림/라디오/공유 새 기능/가사/인기차트. Data is current catalog, facets, filters, song detail and sessionqueue ONLY. Underlying interactions will have short subtle transitions but do not put animation specifications or technical notes in the mock.
Preserve reference member-name pairing and original16:9 thumbnail shape. Correct all potentially wrong priorimage labels using these instructions. Flat single screen, no bezel, no collage.
SCREEN 멤버 active. This is a beautifully composed MEMBER FILTER BROWSING SCREEN using existing catalog/facets; it is NOT a new artist profile or songbook feature. Use reference1 newest reduced-scopeDiscover forsharedshell/rightplayer, ref2 realfull OTW screenshot for memberavatars and3songs, ref3 newcatalogforrow styles.
Main heading '멤버', subtitle '좋아하는 목소리로 음악을 찾아보세요'. Eight 60px circular avatars fromsource withnames below, full names exactly 김아테, 빙하유 selectedtealring, 양메이, 온하루, 유리리, 쿠레나이 나츠키 twolines, 테리 눈나, 하네. Blue/pink-haired빙하유 active. Modest row at y185..280.
Below divider at y325, heading '빙하유가 부른 곡'. Small descriptor '메인 보컬로 참여한 공개 음악' and quiet link '곡 탐색에서 더 찾기 →'. NO large memberportrait, NO biography, NO member profilehero, NO대표곡, NO노래책, NO만든곡,NO협업categorytabs,NOtotals. This is simply a curated-looking view of existing filters.
At y420 tabs '전체' active, '오리지널', '공식 커버' and right '최근 공개순⌄'. No new filtertypes.
At y490 main list first row slightly more spacious but notfeaturebanner: 144x81 actualMOSHIMOSHIthumbnail, songtitle '모시모시 키코에테루', subtitle '빙하유', '원곡 sasane', date2026.05.31, playbuttonandqueueadd. Row2 '바움쿠헨 엔드롤', subtitle '빙하유 · 양메이 · 유리리', exactbright green landscapealbumvideoartfromsource, no inventeddateororiginalartist. Row3 'Happy birthday to you', subtitle '빙하유', pinkactualvideothumbnail. Allrows fullwidth with light hairlineseparators, clear existingplayandqueueactions. A small link atbottom '공식 커버 더 찾아보기 →' usescurrentmemberpluscoverfilter. Preserve enoughquietwhitespace, notgiantemptycard. No moresectionsforfakecatalogfiller. Memberselectorcan smoothlychangeactiveoutlinebutdo notdrawmotion arrows.
Rightplayer remains Haneplaying NOT빙하유. Exactsameprogressandqueue asother2screens. Strong designthrough typography/spacing/imagery rather thannewfunctionality.
```
