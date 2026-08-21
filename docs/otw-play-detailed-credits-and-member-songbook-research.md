# OTW Play 상세 크레딧·멤버별 노래책 조사 및 확장 요구사항

상태: 2026-08-21 멤버 중심 범위 채택, 구현 전

조사일: 2026-08-20

결정일: 2026-08-21

상위 문서: `otw-play-product-requirements.md`

연계 문서:

- `otw-play-catalog-bulk-ingestion-and-proposal-lifecycle-research.md`
- `otw-play-system-design.md`
- `otw-play-ui-ux-design.md`

## 1. 결론

유사 서비스 조사에서는 작품·녹음·영상·발매 전체 credit graph를 확인했지만 OTW Play의
채택 범위는 더 작다. 제품은 OTW 멤버가 어떤 곡을 부르고, 만들고, 편곡·제작에
참여했는지를 보여주는 멤버 노래책에 집중한다.

- 기존 가창 participant를 멤버 노래책의 기본 권위로 사용한다.
- 추가 정보는 OTW 멤버의 작사·작곡·편곡·연주·제작 참여만 다룬다.
- 기존 원곡 가수와 외부 가창 참여자 표시는 유지하지만 새 상세 credit 대상이나
  contributor profile로 확장하지 않는다.
- 외부 작곡가·작사가·producer·engineer·영상 제작자, album/release credit graph는
  현재 제품 범위에서 제외한다.
- 같은 song의 여러 performance를 곡 수로 중복 계산하지 않고 `곡 수`와 `가창 버전
  수`를 별도 표시한다.
- 직접 URL은 published song 1곡부터 제공하고, current member의 published distinct
  song이 3곡 이상이며 Play navigation이 공개된 경우에만 navigation·SEO·sitemap에
  포함한다.

아래 유사 서비스 조사는 범위를 넓힐 때 참고할 근거로 보존한다. 조사에서 도출한 전체
credit model은 채택 계약이 아니며, 3절 이후의 `현재 비채택` 표시를 따른다.

## 2. 유사 서비스 조사

### 2.1 Spotify

Spotify는 2025년 확장 Song Credits에서 songwriter, featured artist뿐 아니라 producer,
engineer와 전체 contributor를 표시한다. credit은 label/distributor가 전달한 metadata를
권위로 사용한다. Songwriter Page는 이름을 클릭 가능한 discovery entry로 만들고,
해당 작가의 모든 작품과 frequent collaborators, `Written By` playlist를 제공한다.
SongDNA는 collaborator, sample, cover 관계를 하나의 연결형 탐색으로 확장한다.

OTW Play 적용점:

- credit 이름은 단순 텍스트 종착점이 아니라 contributor page 진입점이어야 한다.
- `작사/작곡한 곡` 자체가 자동 생성된 노래책/playlist가 될 수 있다.
- source authority와 정정 흐름이 필요하며 자동 추론값을 확정 credit으로 보여주면 안 된다.
- cover 관계는 현재 song–performance relation을 활용하고 sample 관계는 장기 범위로 둔다.

근거: [Spotify expanded Song Credits and SongDNA](https://artists.spotify.com/en/blog/spotlighting-the-people-connections-and-stories-behind-your-music),
[Songwriter Pages](https://support.spotify.com/ws/artists/article/songwriter-pages/),
[clickable song credits](https://support.spotify.com/sm-en/artists/article/song-credits/).

### 2.2 Apple Music

Apple Music은 track-level credit을 `Performers`, `Composition and Lyrics`, `Production
and Engineering`으로 묶고 vocals·instrument 같은 구체 역할, composer·lyrics,
producer·recording/mixing/mastering engineer를 권장한다. contributor는 Apple Artist
ID나 ISNI 같은 식별자와 연결할 수 있다.

OTW Play 적용점:

- 공개 UI는 수십 개 역할을 한 목록으로 펼치지 않고 3~4개의 의미 그룹으로 묶는다.
- generic `other`보다 구체 역할을 우선하되 원문에 없는 구체성을 추측하지 않는다.
- contributor identity와 `credit_name_snapshot`을 함께 보존해 활동명 변경에도 당시
  표기를 유지한다.

근거: [Deliver credits to Apple Music](https://itunespartner.apple.com/music/support/5542-deliver-credits),
[View song credits](https://support.apple.com/en-gb/guide/music-web/apdm3b93fb16/web).

### 2.3 MusicBrainz

MusicBrainz는 composition인 `Work`와 실제 audio인 `Recording`, release를 분리한다.
composer·lyricist·translator는 work에, vocal/instrument·producer·engineer·mix·master는
recording에 둔다. relationship에는 role, attribute, date와 실제 credited name을
보존할 수 있다. 관계 editor는 여러 recording/work에 동일 credit을 batch 적용한다.

OTW Play 적용점:

- 현재 `music_songs`는 work, `music_performances`는 recording/performance에 해당한다.
- 작사·작곡을 performance participant에 넣으면 cover마다 중복되고 의미가 틀어진다.
- arranger는 원곡 arrangement인지 특정 cover arrangement인지 근거에 따라 song 또는
  performance에 둔다.
- 관리자 UI에는 여러 selected item에 credit을 batch 적용하는 도구가 필요하다.

근거: [MusicBrainz Work](https://musicbrainz.org/doc/Work),
[Artist Relationship Guide](https://musicbrainz.org/doc/Artist_Relationship_Guide_for_Artists),
[relationship editor](https://musicbrainz.org/doc/How_to_Use_the_Relationship_Editor),
[relationship specificity guideline](https://musicbrainz.org/doc/Style/Relationships).

### 2.4 Discogs

Discogs는 release-wide credit과 track-specific credit을 분리하고 표준 role을 사용한다.
외부 출처 credit은 출처를 submission note에 남기며, release에 명시되지 않은 credit은
`Uncredited`처럼 provenance를 드러낸다. 당시 표기가 canonical artist name과 다르면
표기 변형도 보존한다.

OTW Play 적용점:

- 출처 없는 credit을 confirmed로 만들지 않는다.
- 전체 release credit을 무조건 모든 track에 복사하지 않는다.
- linked entity가 없어도 `credited_name`으로 보존하되 contributor page 집계에서는
  unresolved 상태를 명확히 한다.

근거: [Discogs Database Guidelines: Credits](https://support.discogs.com/hc/en-us/articles/360005006834-Database-Guidelines-10-Credits).

### 2.5 VocaDB/UtaiteDB

VocaDB는 song, artist, album을 구조화하고 song에 artist role, duration, language,
BPM, album, tags, official/unofficial media, original/alternate version과 변경 이력을
제공한다. artist page에는 recent/popular songs, albums, collaborations, all songs와
songs-per-month 통계가 있다. 항목 수정 이력, revert, 오류 신고와 출처 규칙도 갖는다.
ordered song list에는 설명·이미지·곡별 note를 둘 수 있고 개인 list와 trusted-user
featured list를 구분한다.

OTW Play 적용점:

- 멤버 page에 최근 곡, 전체 곡, collaboration과 original/cover filter를 제공한다.
- 객관 field와 discovery tag를 중복 저장하지 않고 derived facet을 우선한다.
- credit 수정 이력과 사용자 오류 신고를 연결한다.
- 운영자 큐레이션 노래책과 멤버 catalog-derived 노래책은 서로 다른 개념으로 둔다.

근거: [VocaDB artist page](https://wiki.vocadb.net/docs/artist-entry-page),
[song entry page](https://wiki.vocadb.net/docs/song-entry-page),
[song lists](https://wiki.vocadb.net/docs/song-lists),
[tags](https://wiki.vocadb.net/docs/tags).

### 2.6 Holodex Musicdex

Holodex는 VTuber 영상·협업·karaoke stream 속 노래를 talent 중심으로 catalog하고
favorites 같은 개인화 기능을 제공한다. Musicdex는 VTuber, song, original artist를
검색하고 queue로 재생하는 특화 사례다.

OTW Play 적용점:

- 멤버가 곡 탐색의 강한 진입점이며 member→song→performance→video가 자연스럽게
  이어져야 한다.
- official song/cover와 장기 범위인 방송 karaoke를 같은 화면에서 섞을 때 source와
  검수 수준을 명확히 구분해야 한다.
- OTW Play는 초기에는 official catalog만 제공하고 Holodex 규모의 방송 구간 catalog를
  권리·source policy 확정 전에 흡수하지 않는다.

근거: [Holodex About](https://next.holodex.net/about/general),
[Musicdex](https://music.holodex.net/).

### 2.7 DDEX RIN과 creator identifier

DDEX Recording Information Notification(RIN)은 녹음 제작 과정에서 contributor·role,
instrument, recording component, engineer와 display credit을 기계 간 교환하기 위한
표준이다. work, sound recording과 party를 분리하며 ISRC, ISWC, ISNI 같은 외부
identifier를 지원한다. CISAC IPI도 composer, arranger, publisher 등 저작물 권리
관계자의 전역 식별을 목적으로 한다.

OTW Play 적용점:

- 내부 role vocabulary는 DDEX를 그대로 구현하지 않더라도 향후 mapping 가능한 code를
  사용한다.
- contributor에 provider별 identifier namespace/value를 복수 보존할 수 있어야 한다.
- 식별자는 identity 보조 수단이지 공개 실명이나 권리 지분을 추론하는 근거가 아니다.
- OTW Play는 royalty accounting system이 아니며 지분율·계약·정산 정보는 범위에서
  제외한다.

근거: [DDEX RIN introduction](https://rin.ddex.net/recording-information-notification/1-introduction/),
[RIN identifiers](https://rin.ddex.net/recording-information-notification/6-syntax-and-semantics-of-rin-messages/6.6-proprietary-identifiers),
[CISAC IPI](https://www.cisac.org/services/information-services/ipi).

### 2.8 setlist.fm

setlist.fm은 공연별 순서가 있는 setlist, cover 원곡 artist 표시와 artist song statistics를
제공한다. 이는 장기 범위인 방송 가창·날짜별 반복 performance·setlist에 유용하지만,
현재 official songbook에 공연 횟수나 방송 기록을 미리 섞어서는 안 된다.

OTW Play 적용점:

- future broadcast 확장에서는 `song`과 날짜·순서를 가진 `performance occurrence`를
  분리한다.
- cover 원곡과 실제 가창자를 모두 연결하고 setlist order를 보존한다.
- 현재 member songbook의 가창 version 수를 방송 횟수처럼 표현하지 않는다.

근거: [setlist.fm editing guidelines](https://www.setlist.fm/guidelines),
[setlist.fm FAQ](https://www.setlist.fm/faq).

## 3. 전체 크레딧 정보 모델 조사 결과(현재 비채택)

이 절은 유사 서비스가 사용하는 전체 liner-note 모델을 정리한 참고안이다. OTW Play는
이 전체 역할·entity 범위를 구현하지 않고 3.5절의 멤버 참여 subset만 채택한다.

### 3.1 scope 원칙

| scope | OTW Play 권위 entity | 대표 role | cover에서의 의미 |
| --- | --- | --- | --- |
| 작품 | song | songwriter, composer, lyricist, translator, original arranger, publisher | 같은 원곡의 모든 performance에 공유 |
| 가창·녹음 | performance | vocal, featured vocal, chorus, rap, instrument, arranger, producer, programming, recording/mix/master engineer | 해당 공식 영상·가창 버전에만 적용 |
| 영상 | media source | video director, illustrator, animator, cinematographer, video editor, choreographer | 해당 YouTube 영상에만 적용 |
| 앨범·발매 | future release | label, executive producer, art director, designer, photographer, release-wide producer | track별 근거가 없을 때 release 범위 |

기존 `music_performance_participants`는 보컬 참여자와 공개 필터의 핵심이므로 유지한다.
새 performance credit은 연주·제작·기술·영상 역할을 보완하고 vocal role을 이중 저장하지
않는다.

### 3.2 role vocabulary

#### 작품

- `songwriter`: 작사·작곡 구분 없이 원문이 포괄 표기일 때
- `composer`: 작곡
- `lyricist`: 작사
- `translator`: 번안·번역 가사
- `original_arranger`: 원 작품 또는 공식 원곡 arrangement
- `publisher`: 음악 출판

#### 가창·연주

- 기존 `vocal`, `featured_vocal`, `chorus`, `other_vocal`
- `rap`, `spoken_word`
- `instrument_performer` + instrument detail
- `conductor`, `choir_director`
- `performance_arranger`, `vocal_arranger`
- `programming`, `sound_programming`

#### production·engineering

- `producer`, `co_producer`, `executive_producer`
- `recording_engineer`, `mixing_engineer`, `mastering_engineer`
- `audio_engineer`, `sound_engineer`, `editor`

#### 영상·visual

- `video_director`, `cinematographer`, `video_editor`
- `illustrator`, `animator`, `motion_designer`
- `art_director`, `graphic_designer`
- `choreographer`

role은 contract enum/code table로 통제하고, 화면 label은 localization map으로 분리한다.
원문 role이 목록에 없으면 `other`로 뭉개기보다 `other` + `role_detail`을 보존하고 role
추가 검토 대상으로 올린다.

### 3.3 credit 필드

모든 credit은 다음 정보를 가진다.

- `role`, 선택적 `role_detail`/instrument
- `entity_id` nullable: 기존 person/group/organization 연결
- `credited_name`: 출처에 적힌 당시 표시명
- `credit_order`, 선택적 join phrase
- `verification_status`: `candidate|verified|disputed`
- `source_kind`: official description, official release page, label/distributor,
  liner note, rights database, trusted database, member/admin statement
- `source_url` 또는 내부 evidence reference
- `source_accessed_at`, `verified_by_user_id`, `verified_at`
- 외부 identifier: `namespace` + `value` (`ISNI`, `IPI`, `ISWC`, `ISRC`,
  `MusicBrainz`, provider artist ID 등)
- 선택적 `note`는 관리자 전용이며 공개 설명과 분리

공개 화면은 `verified` credit만 기본 노출한다. `candidate`는 관리자 검수에만 보이고,
`disputed`는 정정 이력과 함께 비공개 처리한다.

### 3.4 출처 우선순위

1. OTW/멤버/협업 프로젝트의 공식 영상 description·공식 release page·liner note
2. label/distributor가 전달한 공식 metadata
3. contributor 또는 권리자의 확인
4. MusicBrainz·Discogs 등 provenance가 있는 구조화 database
5. 회원·사용자 수정 제안

하위 출처가 상위 출처와 충돌하면 자동 덮어쓰지 않는다. source를 나란히 보존하고
관리자가 dispute를 해결한다. YouTube description parser나 LLM은 candidate 생성만
가능하며 verified credit을 직접 만들 수 없다.

### 3.5 채택된 멤버 참여 subset

추가로 저장하는 대상은 `members` 권위 identity와 연결되는 OTW 멤버뿐이다.

| scope | 채택 role | 비고 |
| --- | --- | --- |
| 가창 | 기존 `vocal`, `featured_vocal`, `chorus`, `other` | 기존 performance participant 재사용 |
| 작품 | `songwriter`, `composer`, `lyricist` | OTW 멤버가 실제로 참여한 경우만 |
| 편곡·연주 | `arranger`, `instrument_performer` + detail | song 또는 performance scope를 명시 |
| 제작 | `producer`, `recording_engineer`, `mixing_engineer`, `mastering_engineer` | OTW 멤버 참여만 |

모든 추가 member contribution은 `member_uid`, scope 대상, role, 선택적 role detail,
official source URL/reference, verified actor/time과 version을 가진다. 출처가 없는 정보,
parser·LLM 결과와 일반 회원 제안은 candidate이며 공개하지 않는다. 역할 목록에 없는
멤버 참여는 `other + role_detail`로 보존하고 role 추가를 검토한다.

원곡 가수와 외부 가창자는 기존 entity/participant 계약으로 계속 표시한다. 이들은
새 member contribution table이나 외부 contributor page의 대상이 아니다.

## 4. 전체 크레딧 schema 확장안(현재 비채택)

다음 schema는 조사에서 도출한 범용 확장안이며 DEC-058에 따라 현재 구현하지 않는다.

### 4.1 1차

- `music_song_credits`: song FK, role, entity FK nullable, credited name, order,
  verification·provenance, version/time
- `music_performance_credits`: performance FK, role/detail, entity FK nullable,
  credited name, order, verification·provenance, version/time
- `music_credit_evidence`: credit scope/ID, source kind/URL, accessed/verified actor/time
  또는 scope별 evidence table

polymorphic `subject_type + subject_id` 한 table은 D1 foreign key로 대상 존재를 보장하기
어렵다. song/performance/source credit table을 분리하고 DTO/application에서 공통
projection으로 조합하는 편을 권장한다.

### 4.2 2차

- `music_source_credits`: video/visual 제작 credit
- `music_contributor_aliases`: credited name과 canonical entity alias
- `music_credit_corrections`: 사용자 정정 제안과 검수 상태

### 4.3 3차

- `music_releases`, `music_release_tracks`, `music_release_credits`
- catalog number, release date/precision, release type, label, artwork, official links
- song/performance와 track mapping

album UI가 필요하기 전부터 release column을 song에 임시 추가하지 않는다. album은 여러
track, version과 release-wide credit을 가지므로 독립 aggregate가 필요하다.

### 4.4 채택된 최소 schema

- 기존 `music_performance_participants`를 가창 역할의 권위로 재사용한다.
- `music_song_member_contributions`: song FK, member UID, role, order, official source
  reference, verification actor/time, version
- `music_performance_member_contributions`: performance FK, member UID, role/detail,
  order, official source reference, verification actor/time, version

두 table은 각각 정확한 FK로 scope를 보장한다. 범용 nullable entity, unresolved name,
source/video/release credit table은 만들지 않는다. 같은 member·scope·role·detail 중복을
막고 공개 영향 변경은 event와 catalog/read-model revision을 같은 D1 batch에서
증가시킨다.

## 5. 멤버 참여 관리자 기능

- 곡 편집에는 `멤버 작품 참여`, performance 편집에는 `멤버 편곡·연주·제작 참여`를
  둔다. 가창은 기존 participant 편집을 사용한다.
- `members` 권위 autocomplete만 제공하고 외부 contributor 생성·unresolved name 입력은
  제공하지 않는다.
- official source URL 또는 내부 evidence reference를 필수로 한다.
- 같은 member·scope·role·detail duplicate를 막는다.
- scope 이동은 기존 row를 덮어쓰지 않고 delete+create를 하나의 감사 batch로 처리한다.
- version CAS, before/after event와 public-impact revision을 적용한다.
- 공개 중인 멤버 참여 변경은 노래책·곡 상세 영향 preview와 confirm을 요구한다.

## 6. 공개 곡 상세의 멤버 참여 UI

### 6.1 기본 계층

1. 기존 곡명, 원곡 가수, tag와 재생 가능한 performance
2. 기존 가창 참여자
3. verified row가 있을 때만 `멤버 참여` section
4. 작품: 작사·작곡
5. 선택한 performance: 편곡·연주·제작·engineering
6. 출처·마지막 확인은 compact disclosure로 제공

역할 group은 비어 있으면 숨긴다. 긴 목록은 첫 항목 일부와 `모두 보기`를 제공하며
desktop/mobile 모두 한 기여자 이름과 역할을 읽을 수 있어야 한다.

### 6.2 member link

member 이름은 `/play/members/{code}`로 연결한다. 원곡 가수·외부 가창 참여자는 기존
표시만 유지하며 이 section에서 contributor link를 만들지 않는다.

### 6.3 정정 제안

공개 멤버 참여 정보에는 `정보 수정 제안` 진입점을 둔다.

- 로그인 회원이 대상 member contribution, 제안 role/source URL과 설명을 제출
- KST 일 5회와 기존 edge abuse limit 적용
- public에는 pending correction을 노출하지 않음
- 관리자가 accept/reject하고 accepted change를 catalog event와 함께 반영
- credit 정정은 기존 공식 커버 신규 등록 proposal과 별도 aggregate 사용

## 7. 멤버별 노래책 제품 정의

멤버별 노래책은 OTW 멤버가 OTW Play catalog에서 어떤 곡을 부르고 만들고 협업했는지
탐색·재생하는 public member-centric catalog다. 사용자가 직접 편집하는 playlist가
아니며 published catalog에서 생성되는 권위 projection이다.

### 7.1 route

- `/play/members/{memberCode}`: 멤버 노래책
- `/play/members`: navigation이 필요할 때 추가하는 전체 멤버 index

published distinct song이 1곡 이상이면 직접 URL을 제공한다. 1~2곡은 `noindex`와
sitemap 제외를 유지하며, 3곡 이상이고 `navigation_visible=1`이며 revision이 일치할
때만 navigation·index·sitemap에 포함한다. 곡이 없는 current member는 direct `200`
empty/noindex를 제공하되 공개 navigation에서 숨긴다.

### 7.2 상단 summary

- 권위 profile image, 이름, 오시마크, unit
- published `곡 수`, `가창 버전 수`, `오리지널곡`, `공식 커버`, `협업곡`
- verified member contribution이 있을 때 `작사·작곡 참여`, `편곡·제작 참여`
- 최신 공개일과 마지막 catalog 갱신 시각
- `전체 재생`은 playable 대표 performance만 session queue에 넣음

숫자 의미:

- 곡 수: distinct song
- 가창 버전 수: distinct published performance
- 협업곡: 같은 performance에 다른 main/featured vocalist가 있는 distinct song
- 만든 곡: verified song member contribution이 연결된 distinct song

### 7.3 탐색 tab과 filter

권장 tab:

- `부른 곡`: vocal/featured/chorus 등 가창 참여
- `오리지널`: 멤버 참여 + `is_otw_original=1`
- `커버`: relation `cover`
- `협업`: duet/unit/group/external collaboration
- `만든 곡`: songwriter/composer/lyricist member contribution
- `전체 참여`: 멤버의 편곡·연주·제작 contribution까지 포함

filter:

- 참여 역할, solo/duet/unit/group/external collaboration
- 음악 tag, 원곡 가수, 공개 연도
- playable only/all published
- 정렬: 최신 공개, 곡명, original/cover, credit role

한 tab에서 filter query를 URL에 보존하되 canonical은 query를 제거한다. player는 기존
Play-scoped single iframe과 session queue를 재사용한다.

### 7.4 list 표현

기본 행/card:

- thumbnail, 곡명, 원곡 가수
- original/cover와 participation type
- 해당 멤버의 역할
- 다른 main collaborator 최대 2명 + 나머지 수
- 대표 performance 공개일·재생 상태
- 재생, 다음에 재생, 곡 상세

같은 song의 여러 performance가 있으면 기본은 song 한 행이며 `N개 버전`에서 펼친다.
사용자가 performance 역할·날짜를 기준으로 탐색하면 version row를 표시한다.

### 7.5 discovery section

- 최근 공개곡
- 대표 오리지널곡: 관리자가 최대 5곡 pin하고 부족분은 최신 published original로 채움
- 자주 협업한 멤버/외부 가창 참여자
- 작사·작곡 참여곡
- tag별 곡 수
- 장기적으로 연도별 공개 추이와 방송 setlist 연결

`인기`는 신뢰할 수 있는 내부 재생 지표가 없으므로 초기에는 만들지 않는다. YouTube
view count를 OTW 인기 순위처럼 사용하지 않는다.

## 8. 외부 contributor page(현재 제외)

유사 서비스 조사에서는 external person/group/organization에도 같은 projection을
재사용할 수 있음을 확인했다.

- 이름·alias와 verified external links
- 역할별 참여곡: 원곡 가수, 작사, 작곡, 편곡, producer, engineer, 영상 제작
- 자주 협업한 OTW 멤버
- 관련 original/cover 관계
- credit source coverage와 correction 진입점

DEC-058에 따라 이 범위는 현재 채택하지 않는다. 외부 음악 관계자 profile, 협업 graph,
alias merge와 상세 제작 credit API·UI는 만들지 않는다. 기존 원곡 가수와 외부 가창
참여자는 현재 song/performance 화면에서만 계속 표시한다.

## 9. API projection

권장 public API:

- `GET /api/play/members`
- `GET /api/play/members/:code/songbook`
- 기존 `GET /api/play/songs/:slug`에 additive verified member contributions

songbook query는 기존 catalog query primitive를 재사용하되 `member`와
`contributionScope`, `contributionRole`을 명시적으로 분리한다. keyset pagination과
revision cache를 사용하며 published song/performance와 verified member contribution만
반환한다.

권장 DTO 핵심:

- `member`, `counts`, `items`, `facets`, `nextCursor`, `catalogRevision`
- 각 item에 `matchedRoles`, `song`, `representativePerformance`, `performanceCount`
- member contributions에 `scope`, `role`, `roleLabel`, `member`, `evidenceSummary`

public DTO에는 관리자 note, candidate contribution, reviewer identity와 외부 음악 관계자
상세 정보를 포함하지 않는다.

## 10. 검색·SEO·접근성

- 곡 검색은 verified member contribution의 기존 member 이름·alias를 search term에
  추가할 수 있다.
- role filter는 같은 member contribution row의 member와 role을 함께 만족해야 한다.
- member songbook title은 `{멤버명} 노래책 | OTW Play`, description은 오리지널·공식
  커버와 verified 주요 역할을 조합한다.
- current member page는 published song 1곡부터 direct `200`을 제공하지만 1~2곡은
  `noindex`다. 3곡 이상, navigation 공개와 revision 일치에서만 index·sitemap에 넣는다.
- former member는 historical catalog에서 external chip으로 보존하고 최초 member index와
  sitemap에서는 제외한다.
- role group은 heading/list semantics, 이름 link는 명확한 accessible name을 사용한다.
- 색만으로 verified/candidate나 member/external 상태를 전달하지 않는다.
- member contribution evidence disclosure는 keyboard로 열고 닫을 수 있고 focus를
  보존한다.

## 11. 품질·운영 원칙

- 누락된 멤버 참여 정보는 `없음`이 아니라 `정보 미확인`으로 표현한다.
- 자동 parsing 결과와 verified member contribution을 시각적으로 구분한다.
- 출처 URL이 사라져도 검수 시점·member·role snapshot과 event는 보존한다.
- 현재/전 소속 멤버 표시는 기존 member authority를 사용하며 credit에서 추론하지 않는다.
- 공개 source가 unavailable이어도 song/member contribution을 삭제하지 않는다.
- source metadata와 member contribution evidence의 refresh 책임을 분리한다.
- coverage 지표는 current member별 published 곡 수, 가창 participant 확인율, verified
  작품·제작 참여율과 evidence 보유율만 제공한다.

## 12. 단계별 범위

| slice | 기능 | 결과 |
| --- | --- | --- |
| P1A | 기존 participant 기반 `/play/members/{code}` 노래책과 queue | 부른 곡·오리지널·커버·협업 탐색·재생 |
| P1B | 최소 song/performance member contribution schema·관리자 편집·곡 상세 | 멤버의 작사·작곡·편곡·연주·제작 참여 표시 |
| P1C | member contribution 정정 제안, navigation·SEO·sitemap | 근거 기반 정정과 3곡 이상 current member 검색 노출 |

P1A는 새 범용 credit schema 없이 기존 participant로 시작한다. `만든 곡`과
`전체 참여`는 P1B verified member contribution projection 뒤 활성화한다. 외부
contributor page, album/release와 source/video production credit slice는 계획하지 않는다.

## 13. 수용 기준

- song member contribution이 여러 cover performance에서 중복 입력되지 않는다.
- song과 performance contribution scope가 서로 잘못 전파되지 않는다.
- `members`에 없는 외부 음악 관계자를 새 contribution identity로 만들지 않는다.
- verified/candidate와 evidence source가 관리자에게 구분된다.
- public에는 verified member contribution만 역할별로 노출된다.
- member songbook 곡 수와 performance 수가 정확히 구분된다.
- 한 멤버가 여러 역할을 가진 같은 곡은 한 song row와 여러 matched role로 표현된다.
- original/cover/협업/만든 곡 filter가 같은 관계 row 의미를 보존한다.
- playable 전체 재생은 중복 performance를 만들지 않고 unavailable 곡을 건너뛴다.
- current/external/group 표시가 기존 member authority와 일치한다.
- member contribution correction은 승인 전 public에 노출되지 않고 audit·revision과
  원자 반영된다.
- 1~2곡 page는 noindex, 3곡 이상 current member page만 navigation 공개 시 sitemap에
  포함된다.
- desktop/mobile/keyboard에서 멤버 참여 정보와 긴 노래책을 탐색할 수 있다.

## 14. 채택 결과

| ID | 상태 | 확정값 |
| --- | --- | --- |
| GATE-CREDIT-01 | 해결 | 공식 영상·공식 release·label·멤버/권리자 확인을 우선하며 관리자 verified만 공개 |
| GATE-CREDIT-02 | 해결 | OTW 멤버의 가창·작사·작곡·편곡·연주·제작 subset만 지원 |
| GATE-CREDIT-03 | 해결 | 외부 음악 관계자 상세 credit와 contributor entity/page를 만들지 않음 |
| GATE-CREDIT-04 | 해결 | 로그인 회원에게 근거 필수 정정 제안을 열고 일 5회·관리자 승인 적용 |
| GATE-SONGBOOK-01 | 해결 | 1곡부터 direct, 3곡부터 navigation·SEO·sitemap |
| GATE-SONGBOOK-02 | 해결 | current member 우선, former는 historical external 표시만 유지 |
| GATE-SONGBOOK-03 | 해결 | 관리자 최대 5곡 pin + 최신 published original fallback |

이 결정은 전체 liner-note database를 만드는 범위 확장을 명시적으로 거절한다. SEO는
멤버 노래책과 verified member contribution의 정확한 title·description·canonical에만
적용하며 빈 page나 외부 contributor page를 색인하지 않는다.
