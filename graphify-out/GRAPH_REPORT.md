## 해석 및 검증 범위

- 저장소 전체에서 감지한 1,335개 파일을 대상으로 분석했습니다. 코드 분류 1,185개 중 데이터 JSON 98개는 Graphify AST 정책상 노드를 생성하지 않았습니다.
- 문서 109개는 핵심 개념과 근거 구간을 중심으로 요약 추출했습니다. 문장 전체를 빠짐없이 구조화한 결과는 아닙니다.
- 이미지 41개는 시각 검토했습니다. SVG 6개도 원문 확인 후 렌더링해 검토했으며, 얼굴로 인물을 식별하지 않고 자산 파일명의 라벨을 사용했습니다.
- 과거 문서와 연구 제안은 현재 구현 또는 배포 증거가 아닙니다. 문서의 날짜와 상태를 함께 확인해야 합니다.
- 전체 범위에는 테스트와 자동 생성 타입이 포함됩니다. worker-configuration.d.ts가 1,785개 노드를 차지하며 vitest 같은 범용 라이브러리의 연결 순위가 높습니다. 중심성이나 낮은 응집도만으로 제품 핵심도 또는 리팩터링 필요성을 판단하지 마세요.
- Graphify 파서가 src/app/errors/root-route-error.test.ts:10 및 src/features/youtube/ui/youtube-playlist.tsx:100에서 복구 경고를 냈습니다. 해당 파일의 관계는 일부 누락될 수 있으며 애플리케이션 오류 판정이 아닙니다.
- 그래프 진단: 연결 대상 없는 관계 221개, 자체 연결 23개, 무방향 단일 그래프에서 합쳐지는 동일 끝점 관계 1473개. raw-extraction.json에 추출 원본을 보존했습니다.
- 토큰 비용: AST 추출에는 LLM 호출이 없습니다. 의미 분석에는 Codex 에이전트를 사용했으나 도구가 실제 토큰 사용량을 노출하지 않아 측정할 수 없습니다. 원본 추출 JSON의 토큰 0은 스키마 플레이스홀더이며 무료 또는 미사용을 의미하지 않습니다.
- 정적 지식 그래프이며 프로덕션 동작, 배포 상태, 테스트 통과 또는 코드 품질을 인증하지 않습니다.
- benchmark.json의 15.5배 수치는 노드 수로 추정한 원문 크기와 샘플 질의의 토큰 추정치를 비교한 휴리스틱입니다. 실제 과금 절감이나 답변 정확도 측정값이 아닙니다.

# Graph Report - overthewall-schedule  (2026-09-17)

## Corpus Check
- Large corpus: 1335 files · ~2,436,227 words. Full-corpus extraction explicitly authorized by the user.

## Summary
- 10246 nodes · 25182 edges · 493 communities (268 shown, 225 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 875 edges (avg confidence: 0.84)
- Token cost: unavailable (host agent usage not exposed; AST uses no LLM)

## Graph Freshness
- Built from commit: `58cb3f7e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes; changed documents may require semantic extraction.

## Community Hubs (Navigation)
- Cloudflare Runtime Type Definitions
- Canonical Database Schema
- React Administrative Forms
- Application Route Tree
- Frontend Query Testing
- Shared UI Composition
- Scheduled Queue Execution
- X API Collection Client
- Query Keys and Routes
- Play Catalog Administration
- Member Contracts and Fixtures
- Administrative Workflow Screens
- Site SEO Resolution
- Schedule Cards and Timelines
- Operational Status Aggregation
- Play Playlist Application
- Play Catalog Command Services
- Public Catalog Database Queries
- Worker Runtime Composition
- Automatic Schedule Updates
- Schedule Configuration Interface
- Play Source Health
- Play Shared Contract Types
- Member Submission Persistence
- YouTube Application Contracts
- Worker Authorization Boundaries
- Catalog Transaction Persistence
- X Posts Application
- Playlist Editing Interface
- Public Catalog Search Semantics
- Naver Cafe Application
- Play Release Publication
- Member Post Feed Reading
- Public Music Catalog Views
- Notice Management Interface
- Scheduled Workflow Coordination
- Naver Cafe Collection
- Notice Storage Gateway
- Public Catalog Queries
- Operations Dashboard Interface
- Member Profile Interface
- CHZZK Media Queries
- Administrative Console Navigation
- Pending Schedule Review Queries
- Public Catalog Application
- YouTube Channel Metadata
- D1 Diagnostic Tooling
- Playback Queue State
- Runtime Events and Audit
- CHZZK Cached API Client
- YouTube Feed API
- Ingestion Processing Services
- Ingestion Catalog Materialization
- Schedule Command Application
- Clerk Request Authentication
- Configuration Validation Contracts
- Catalog Review Interface Tests
- Project Toolchain Configuration
- YouTube Feed Collection
- Pending Schedule Approval
- X Post Frontend Queries
- Video Archive Presentation
- X Reference Hydration
- Music Identity Schema
- Admin Catalog Request Validation
- YouTube API Client
- X Collection and History
- Channel Monitor Persistence
- Play Release Telemetry
- Public Catalog HTTP Responses
- YouTube Cache Warmup
- Music Performance Schema
- YouTube Embedded Player
- Play Product and Operations
- Ingestion Contracts and Cursors
- Public Multiview Interface
- YouTube Stale Cache Refresh
- Cover Proposal Event Schema
- Anniversary Backend API
- Anniversary Schedule Interface
- Schedule Board Snapshots
- Channel Monitor Lifecycle
- YouTube Cache Telemetry
- X Collection Monitoring Interface
- Runtime Event Targets
- External Link Previews
- Public Navigation and Authentication
- CHZZK Clip Presentation
- Notice Publication Visibility
- X Post Card Rendering
- Local Development Server
- Catalog Hydration Diagnostics
- R2 Asset Access
- Application Runtime Dependencies
- Snapshot Fonts and Layout
- Player Queue Controls
- YouTube Archive Interface
- Operational Data Retention
- Broadcast Schedule Matching
- Pending Schedule Command Validation
- Ingestion HTTP Validation
- Submission HTTP Validation
- Catalog Integrity Migration
- Package Task Commands
- Safe Local Database Reset
- Public Catalog Edge Cache
- Catalog Pagination Cursors
- Manual Schedule Auto Update
- Worker Fetch Orchestration
- AI Review Execution
- Schedule Board Read Model
- Schedule Write Persistence
- Playlist Ingestion Schema
- D1 Usage Observability
- CHZZK HTTP Routing
- CHZZK Application Authorization
- AI Review Admin Interface
- AI Review Application Boundaries
- YouTube Quota Admission
- Operations Frontend Contracts
- AI Review Result Normalization
- Schedule Database Migrations
- Development Tool Dependencies
- Drizzle Member and Audit Access
- Architecture Dependency Enforcement
- Frontend TypeScript Configuration
- CHZZK Infrastructure Composition
- Admin Audit Log Reading
- YouTube Cache Analytics
- Channel Monitoring Schema
- Application Theme and Feedback
- Playlist HTTP Validation
- Pending Approval Database Transactions
- Audit Query Contracts
- Settings Persistence and Auditing
- Member Submission Interface
- Member Directory Backend
- Notice HTTP Validation
- Operations Wire Contracts
- AI Review Database Persistence
- Play Operational Observability
- Stored X Feed Tests
- UI Component Configuration
- Catalog Authority Retention Schema
- Runtime Stream Transformations
- Runtime Console Logging
- Runtime URL Handling
- Settings Application Ports
- Safe Local Fixture Seeding
- Rights and Footer Content
- Node TypeScript Configuration
- Proposal Schema Integrity Tests
- Schedule Update Audit Logs
- Canonical Migration Guidance
- Notice Backend Regression Tests
- YouTube Cache Usage Schema
- Scheduled Job Queue Schema
- Broadcast Video Metadata
- Safe Branch Maintenance
- Naver Cafe Visibility Indexes
- Deployment Environment Guards
- Exact Worker Route Registry
- Source Health Database Tests
- Runtime URL Search Parameters
- CHZZK Live Status Tests
- Agent Authority and Standards
- Animated Stepper Interface
- Cloudflare Container Runtime
- Durable Object Storage
- Canonical Release Verification
- YouTube Feed Storage Schema
- Test TypeScript Configuration
- Member Profile Background Images
- Channel Monitor Interface Tests
- HTML Element Rewriting
- Runtime HTTP Headers
- Web Cryptography Operations
- X Post Application Ports
- Collection Run Audit Schema
- X History and Compliance Schema
- Member Submission Form Tests
- Vitest Project Configuration
- Operations Dashboard Tests
- Snapshot Route Configuration
- Runtime File and Blob
- Runtime Form Data
- Runtime URL Pattern Matching
- Canonical Code Review Guidance
- Notice Wire Contracts
- Runtime HTTP Body Types
- Durable Object Execution State
- YouTube Shorts Pagination
- Settings Request Validation
- Gemini Review Schema
- Product Experience Decisions
- Member Profile Asset Schema
- Worker TypeScript Configuration
- Agent Configuration Synchronization
- Profile Background R2 Upload
- Featured Notice Banner
- Cloudflare Stream Error Types
- Music Catalog Constraint Tests
- Cloudflare Worker Entrypoints
- Pending Schedule Query Validation
- Project Capability Context
- Generated Release Guidance
- Music Search Read Models
- X Reference Usage Schema
- Architecture Guard Regression Tests
- Public Catalog Interface Tests
- Runtime Feature Flag Evaluation
- R2 Object Body Access
- Catalog Write Integration Tests
- Canonical API Change Guidance
- Generated Migration Guidance
- Root TypeScript Configuration
- Agent Memory Profiles
- Runtime Stream Queue Strategies
- Writable Stream Operations
- Durable Object Lifecycle
- Durable Object Transactions
- Server Sent Event Sources
- Readable Stream Operations
- Runtime TCP Sockets
- Naver Cafe Source Schema
- X Collection Usage Schema
- AI Review Execution Schema
- AI Search Instance Operations
- Durable Object Namespaces
- R2 Bucket Operations
- SQL Storage Cursor
- Vector Search Operations
- Workflow Instance Lifecycle
- Pending Approval Rollback Tests
- Clean Architecture Boundaries
- Member Post Retention Policy
- Admin Audit Index Schema
- Music Layout Regression Tests
- Cloudflare AI Runtime
- AI Search Namespace
- Readable Stream BYOB Reader
- Vector Index Operations
- API Delivery Touchpoints
- Settings Contract Regression Tests
- Documented System Architecture
- Music Catalog Screen Concept
- Music Discovery Screen Concept
- Member Music Screen Concept
- X Post Storage Schema
- Schedule Rejection History Schema
- User Playlist Storage Schema
- Bing Hayu Profile Identity
- Hane Profile Identity
- Kim Ate Profile Identity
- Kurenai Natsuki Profile Identity
- On Haru Profile Identity
- Terri Nunna Profile Identity
- U Lili Profile Identity
- Yang Mei Profile Identity
- Profile Background Image Optimization
- Play Button Animation Feedback
- AI Search Item Operations
- AI Search Item Collections
- Runtime Artifact Operations
- Runtime Artifact Repositories
- D1 Database Operations
- Hosted Image Handle
- Key Value Namespace Operations
- Readable Byte Stream Controller
- Readable Stream Default Reader
- Runtime Trace Spans
- Runtime Text Decoding
- Anniversary Type Schema Migration
- Shared UI Ownership Audit
- YouTube Warmup Audit Schema
- AI Gateway Operations
- HTML Comment Rewriting
- Runtime Disposable Connection Handles
- Durable Object Facets
- Email Forwarding and Replies
- Hosted Image Collections
- HTML Rewriter Runtime
- HTML Document Content Handlers
- Readable Stream BYOB Requests
- Readable Stream Default Controller
- Stream Video Captions
- Stream Video Handles
- Stream Video Watermarks
- Synchronous Key Value Storage
- WebAssembly Table Operations
- HTML Text Rewriting
- Runtime Text Encoding
- Runtime Distributed Tracing
- Transform Stream Default Controller
- Workflow Collection Operations
- Catalog Architecture Constraint Tests
- Contract Focused Testing Guidance
- X API Cache Schema
- Broadcast Observation Storage Schema
- Release Preflight Script
- Notice Resize Observer Fixture
- Runtime Abort Controller
- AI Search Job Control
- AI Search Job Collections
- Automatic Retrieval Search
- Runtime Cache Operations
- Runtime Cryptographic Primitives
- D1 Database Sessions
- HTML End Tag Rewriting
- Container Process Control
- Worker Execution Context
- HTML Element Content Handlers
- Image Transformation Bindings
- Image Transformation Results
- Image Transformation Pipeline
- Media Transformation Results
- WebAssembly Module Introspection
- Runtime Performance Timing
- Cloudflare Queue Messaging
- R2 Multipart Uploads
- Stream Video Downloads
- WebSocket Automatic Response Pairs
- Workflow Runtime Entrypoints
- Generated API Touchpoint Guidance
- Repository Agent Configuration
- Playlist and Schedule Design QA
- Layered Response Cache Policy
- Bundled Font Consistency
- Backend Cost Observation Report
- Scheduled Jobs Operations
- Catalog Ingestion Lifecycle Research
- Play Release Review Evidence
- Anniversary Initial Schema
- Anniversary Schema Reset
- Member and Notice Table Rebuild
- Play Wall Logo Concept
- Play Heart Logo Concept
- Play Record Logo Concept
- Play Lightstick Logo Concept
- Play Listening Logo Concept
- Play Cassette Logo Concept
- Play Eighth Note Logo
- Play Beamed Notes Logo
- Play Note Button Logo
- Refined Play Note Logo
- Workspace Dependency Security Policy
- Play Glass Note Illustration
- OTW Vector Wordmark
- Otono Sori Profile Identity
- CHZZK Platform Icon
- Naver Cafe Platform Icon
- TwitCasting Platform Icon
- X Platform Icon
- YouTube Platform Icon
- YouTube Shorts Platform Icon
- Hi Blueming Group Wordmark
- Luvdia Group Wordmark
- Stardays Group Wordmark
- Agent Memory Namespaces
- Runtime Image Transform Options
- Cloudflare Browser Execution
- Colocation Actor Namespaces
- Runtime DOM Exceptions
- Durable Object Identifiers
- WebAssembly Global Values
- Example Runtime Binding
- Dynamic Hyperdrive Connections
- Media Transformation Pipeline
- WebAssembly Memory Operations
- Queue Batch Acknowledgment
- Node Compatible Server
- Pipeline Transformation Entrypoints
- Request Cache Variation Headers
- Durable SQL Storage
- Markdown Conversion Service
- Dynamic Worker Loading
- Worker Service Stubs
- Workflow Step Execution
- Writable Stream Default Controller
- Architecture Refactor Verification
- Archived Architecture Refactor Plan
- Historical Member Player Review
- Retired X Compliance Incident
- Music Screen Design Prompts
- Schedule Auto Update Guidance
- Schedule Matching Heuristic Review
- Production Cloudflare Account Migration
- Drizzle Workflow Reference
- External Share Banner Proposal
- Backend Cost Optimization
- Historical Channel Automation Research
- Documentation Authority Index
- Integrated Session Review
- Schedule Snapshot Design QA
- VOD AI Highlights Proposal
- YouTube Cache Optimization
- Notice Schema Creation
- Notice Table Rebuild
- Application Settings Schema
- Auto Update Log Schema
- Kirinuki Channel Schema
- CHZZK API Cache Schema
- Default Playlist Settings Schema
- Public Schedule SEO Metadata
- Initial Logo Comparison Page
- Initial Logo Generation Prompts
- Initial Play Logo Concepts
- Second Logo Comparison Page
- Second Logo Concept Notes
- Music Note Logo Comparison
- Music Note Logo Concepts
- Logo Refinement Comparison Page
- Selected Logo Refinement Notes
- Inter Font License
- Bundled Variable Font Assets
- Crawler Sitemap Discovery
- Clerk Environment Type Contract
- Analytics Engine Data Writes
- Worker Environment Bindings
- Runtime Cache Purge Context
- Runtime Cache Storage
- Cloudflare Access Identity
- WebAssembly Compilation Errors
- Worker Dispatch Namespaces
- HTML Document End Rewriting
- Runtime Event Listener Objects
- Hyperdrive Database Connections
- Incoming Bot Management Properties
- WebAssembly Instance Construction
- JSON Web Key Types
- Media Processing Bindings
- Media Transformation Generation
- Runtime Message Channels
- Runtime Beacon Transmission
- Workflow Nonretryable Errors
- Pipeline Data Transmission
- R2 Object Checksums
- Function Tool Call Responses
- Runtime RPC Targets
- WebAssembly Runtime Errors
- Scheduled Execution Retry Control
- Runtime Scheduler Waiting
- Secret Store Access
- Outbound Email Binding
- Stream Video Collection
- Unredacted Request Trace Access
- Runtime Trace Metric Extraction
- Runtime Web Search
- Clerk Environment Target Constants
- Default Development Port
- Local Development Host
- Durable Object Type Branding
- Worker Request Callback
- RPC Stub Type Branding
- RPC Target Type Branding
- Worker Entrypoint Type Branding
- Workflow Entrypoint Type Branding

## God Nodes (most connected - your core abstractions)
1. `vitest` - 302 edges
2. `react` - 236 edges
3. `cn()` - 221 edges
4. `Env` - 135 edges
5. `apiFetch()` - 114 edges
6. `lucide-react` - 92 edges
7. `@testing-library/react` - 91 edges
8. `Button()` - 84 edges
9. `@tanstack/react-router` - 81 edges
10. `@tanstack/react-query` - 79 edges

## Surprising Connections (you probably didn't know these)
- `DB migration skill generated mirror` --semantically_similar_to--> `Canonical DB migration skill`  [INFERRED] [semantically similar]
  .cursor/skills/db-migration/SKILL.md → .agent/skills/db-migration/SKILL.md
- `DB migration checklist generated mirror` --semantically_similar_to--> `DB migration checklist`  [INFERRED] [semantically similar]
  .cursor/skills/db-migration/references/checklist.md → .agent/skills/db-migration/references/checklist.md
- `release operations skill generated mirror` --semantically_similar_to--> `Canonical release operations skill`  [INFERRED] [semantically similar]
  .cursor/skills/release-ops/SKILL.md → .agent/skills/release-ops/SKILL.md
- `Release preflight checklist generated mirror` --semantically_similar_to--> `Release preflight checklist`  [INFERRED] [semantically similar]
  .cursor/skills/release-ops/references/preflight-checklist.md → .agent/skills/release-ops/references/preflight-checklist.md
- `Worker API change skill generated mirror` --semantically_similar_to--> `Canonical Worker API change skill`  [INFERRED] [semantically similar]
  .cursor/skills/worker-api-change/SKILL.md → .agent/skills/worker-api-change/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **End-to-end capability delivery** — _agent_rules_project_context_react_and_tanstack_frontend, _agent_rules_project_context_cloudflare_worker_and_d1_backend, _agent_rules_project_context_end_to_end_api_flow [EXTRACTED 1.00]

## Communities (493 total, 225 thin omitted)

### Community 0 - "Cloudflare Runtime Type Definitions"
Cohesion: 0.00
Nodes (885): RFC-2253, RFC-3339, RFC-5246, RFC-9440, AgentMemoryGetSummaryOptions, AgentMemoryGetSummaryResponse, AgentMemoryIncomingMemory, AgentMemoryIngestOptions (+877 more)

### Community 1 - "Canonical Database Schema"
Cohesion: 0.01
Nodes (184): AdminAuditLog, AutoUpdateRun, ChzzkApiCache, DDay, KirinukiChannel, Member, MemberLink, MemberProfileImage (+176 more)

### Community 2 - "React Administrative Forms"
Cohesion: 0.04
Nodes (124): AiReviewFields, OtwPlayAdminCatalogDto, OtwPlayBroadcastMetadata, OtwPlayChannelMonitorCandidateDto, OtwPlayParticipantRole, OtwPlayParticipationType, OtwPlayRelationType, KirinukiChannelDto (+116 more)

### Community 3 - "Application Route Tree"
Cohesion: 0.02
Nodes (108): OperationsHome(), VodsOverview(), OtwPlaySubmissionPage(), Route, Route, Route, Route, Route (+100 more)

### Community 4 - "Frontend Query Testing"
Cohesion: 0.02
Nodes (105): @testing-library/react, vitest, refetchMock, useAdminStatusMock, useUserMock, clerkState, fetchAdminAuditLogsMock, fetchUpdateLogsMock (+97 more)

### Community 5 - "Shared UI Composition"
Cohesion: 0.04
Nodes (91): OtwPlaySubmissionKind, lucide-react, @radix-ui/react-dialog, AdminLayoutProps, SIDEBAR_SECTIONS, SidebarItem, SidebarSection, BrandLink() (+83 more)

### Community 6 - "Scheduled Queue Execution"
Cohesion: 0.03
Nodes (66): CreateOperationRunRequestDto, isScheduledControlQueueMessage(), isScheduledJobQueueMessage(), isScheduledJobType(), OperationJobHealth, OperationRunAcceptedDto, OperationRunFailureDto, OperationRunProgressDto (+58 more)

### Community 7 - "X API Collection Client"
Cohesion: 0.04
Nodes (124): assertXApiNotBackedOff(), buildResult(), buildXPostUrl(), CachedXPostsEntry, CachedXPostsWriteEntry, CachedXUser, collectLinkedXStatusIds(), collectXErrorMessages() (+116 more)

### Community 8 - "Query Keys and Routes"
Cohesion: 0.04
Nodes (75): apiRoutes, ExactRoutePath, ExactRoutePattern, MemberPostsAggregateResponseDto, MemberPostSourcePolicyDto, MemberPostSourcePolicyStatus, UnifiedMemberPostDto, NaverCafePostDto (+67 more)

### Community 9 - "Play Catalog Administration"
Cohesion: 0.06
Nodes (100): withRouteSearch(), OtwPlayReleaseType, AutoUpdateLogsManager(), adminRequest(), approveOtwPlayProposal(), backfillOtwPlayChannelMonitor(), convertOtwPlayImportCandidate(), convertOtwPlayImportCandidates() (+92 more)

### Community 10 - "Member Contracts and Fixtures"
Cohesion: 0.04
Nodes (75): MemberDto, YouTubeVideosResponseDto, apiFetchMock, makeMember(), apiFetchMock, channelId, makeMember(), apiFetchMock (+67 more)

### Community 11 - "Administrative Workflow Screens"
Cohesion: 0.05
Nodes (74): @clerk/clerk-react, AutoUpdateRunHistory(), formatDateTime(), fetchXHistoryPosts(), redactXHistoryPost(), formatDate(), getReferencedPost(), postKindLabel (+66 more)

### Community 12 - "Site SEO Resolution"
Cohesion: 0.05
Nodes (65): MemberProfileDto, buildFeedSiteSeo(), buildNotFoundSiteSeo(), buildPlayClipsSiteSeo(), buildPlayHomeSiteSeo(), buildPlayPrivateSiteSeo(), buildPlaySongPlaceholderSeo(), buildPlaySongSiteSeo() (+57 more)

### Community 13 - "Schedule Cards and Timelines"
Cohesion: 0.05
Nodes (71): ChzzkLiveStatusMap, buildChzzkLiveUrl(), convertChzzkToLiveUrl(), Member, NoticeFormDialogProps, CardMember(), CardMemberProps, CardMemberCompact() (+63 more)

### Community 14 - "Operational Status Aggregation"
Cohesion: 0.04
Nodes (71): normalizeAutoUpdateIntervalHours(), normalizeXCollectionIntervalHours(), parseAutoUpdateIntervalHours(), parseXCollectionIntervalHours(), AdminReviewSummaryDto, handleManualAutoUpdate, handleManualXCollection, OperationsActor (+63 more)

### Community 15 - "Play Playlist Application"
Cohesion: 0.05
Nodes (45): PlayDefaultPlaylistWrite, PlayPlaylist, PlayPlaylistWrite, handleOtwPlayPlaylists, readback(), matchesPlaylist(), playlistArtwork(), actor (+37 more)

### Community 16 - "Play Catalog Command Services"
Cohesion: 0.06
Nodes (41): OtwPlayAdminApproveProposalRequest, OtwPlayAdminCatalogEntryPreflightDto, OtwPlayAdminCatalogEntryPreflightRequest, OtwPlayAdminCatalogEntryResultDto, OtwPlayAdminChannelDto, OtwPlayAdminCommandResponse, OtwPlayAdminCreateCatalogEntryRequest, OtwPlayAdminCreateChannelRequest (+33 more)

### Community 17 - "Public Catalog Database Queries"
Cohesion: 0.04
Nodes (80): isOtwPlayMemberPageEligible(), OtwPlayMemberSongbookDto, OtwPlayMemberSongbookQuery, OtwPlayMemberSummary, OtwPlayPublicSongSummaryDto, OtwPlaySourceAvailabilityStatus, OtwPlaySourceRole, VerifiedYouTubeVideo (+72 more)

### Community 18 - "Worker Runtime Composition"
Cohesion: 0.05
Nodes (65): createOtwPlayAdminCatalogService(), createOtwPlayAiReviewService(), handleAiReviewQueue(), isAiReviewMessage(), createOtwPlayChannelMonitorService(), createOtwPlayIngestionService(), handleQueue(), message (+57 more)

### Community 19 - "Automatic Schedule Updates"
Cohesion: 0.04
Nodes (71): LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY, autoUpdateRuns, scheduleBroadcastObservations, scheduleCandidateRejections, schedules, buildBroadcastSessions(), schedule(), AutoUpdateMatchTarget (+63 more)

### Community 20 - "Schedule Configuration Interface"
Cohesion: 0.05
Nodes (73): AdminSettingsDto, AutoUpdateSettings, fetchSettings(), updateSettings(), REJECTION_REASON_OPTIONS, AUTO_UPDATE_TABS, AutoUpdateKpi(), AutoUpdateSettingsManager() (+65 more)

### Community 21 - "Play Source Health"
Cohesion: 0.05
Nodes (55): OTW_PLAY_AUTOMATION_PAUSED_SETTING_KEY, OTW_PLAY_SOURCE_HEALTH_RETRY_CODES, OtwPlayAdminRecheckSourceRequest, OtwPlayAdminSourceDto, OtwPlayAdminSourceHealthDto, OtwPlayAdminSourceHealthItemDto, OtwPlaySourceHealthEventType, OtwPlaySourceHealthRetryCode (+47 more)

### Community 22 - "Play Shared Contract Types"
Cohesion: 0.02
Nodes (83): OTW_PLAY_ADMIN_ERROR_CODES, OTW_PLAY_CATALOG_EVENT_ACTOR_KINDS, OTW_PLAY_CATALOG_SORTS, OTW_PLAY_CHANNEL_MONITOR_STATUSES, OTW_PLAY_CHANNEL_ROLES, OTW_PLAY_CHANNEL_VERIFICATION_STATUSES, OTW_PLAY_DATE_PRECISIONS, OTW_PLAY_ENTITY_KINDS (+75 more)

### Community 23 - "Member Submission Persistence"
Cohesion: 0.06
Nodes (43): OtwPlayCreateSubmissionRequest, OtwPlayMemberSubmissionDto, OtwPlayMemberSubmissionPageDto, OtwPlaySubmissionPreflightDto, OtwPlaySubmissionPreflightRequest, OtwPlaySubmissionSubjectInput, OtwPlayUpdateSubmissionRequest, OtwPlayWithdrawSubmissionRequest (+35 more)

### Community 24 - "YouTube Application Contracts"
Cohesion: 0.04
Nodes (51): CreateKirinukiChannelDto, KirinukiVideosResponseDto, UpdateKirinukiChannelDto, YouTubeCacheAnalyticsStatus, YouTubeCacheRefreshRunSummaryDto, YouTubeCacheStatus, YouTubeCacheStatusResponseDto, YouTubeCacheType (+43 more)

### Community 25 - "Worker Authorization Boundaries"
Cohesion: 0.04
Nodes (63): parseLogFilters(), isScheduledJobStatus(), adminAuditLogs, pendingSchedules, createOperationsHandler(), NO_STORE_HEADERS, OperationsHandlerDependencies, parseD1Window() (+55 more)

### Community 26 - "Catalog Transaction Persistence"
Cohesion: 0.08
Nodes (43): OtwPlayChannelVerificationStatus, AdminCatalogRepositoryError, readBroadcastMetadata(), compareStableIds(), createPerformanceDedupeKeyMaterial(), createSongDedupeKeyMaterial(), createVideoBackedSongDedupeKeyMaterial(), normalizeIds() (+35 more)

### Community 27 - "X Posts Application"
Cohesion: 0.04
Nodes (48): authorizeXHandleTargets(), XTargetAuthorizationResult, createXPostsApplication(), XActor, XAllowlistUnavailableError, XCollectionAuditInput, XHistoryReadOptions, XPostFeedError (+40 more)

### Community 28 - "Playlist Editing Interface"
Cohesion: 0.08
Nodes (55): OtwPlayPublicEnvelope, OtwPlayPublicPerformanceResponseDto, PLAY_PLAYLIST_MAX_ITEMS, PlayAdminDefaultPlaylist, PlayDefaultPlaylist, PlayPerformanceQuery, PlayPlaylistSummary, PlayResolvedPerformances (+47 more)

### Community 29 - "Public Catalog Search Semantics"
Cohesion: 0.06
Nodes (56): parse(), ChannelMonitorCandidateCursor, ChannelMonitorCursorError, decodeChannelMonitorCandidateCursor(), encodeChannelMonitorCandidateCursor(), allowed, parseMemberSongbookQuery(), ALLOWED_PARAMETERS (+48 more)

### Community 30 - "Naver Cafe Application"
Cohesion: 0.05
Nodes (41): NaverCafeActor, NaverCafeApplication, NaverCafePostsContent, NaverCafeSourcePayload, NaverCafeSourceRecord, NaverCafeVisibility, buildNaverCafeArticleUrl(), buildNaverCafeBoardUrl() (+33 more)

### Community 31 - "Play Release Publication"
Cohesion: 0.06
Nodes (46): OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS, OtwPlayAdminReleaseAuditDto, OtwPlayAdminReleaseCommandResponse, OtwPlayAdminReleaseConfirmation, OtwPlayAdminReleaseFlagsDto, OtwPlayAdminReleaseReadResponse, OtwPlayAdminReleaseRequest, OtwPlayAdminReleaseStateDto (+38 more)

### Community 32 - "Member Post Feed Reading"
Cohesion: 0.06
Nodes (38): naverCafeSources, handleMemberPosts, createNaverCafePolicy(), createXPolicy(), emptyNaverCafe(), emptyX(), getCacheControl(), GetMemberPosts (+30 more)

### Community 33 - "Public Music Catalog Views"
Cohesion: 0.06
Nodes (45): OtwPlayPublicParticipantDto, catalogResultDestination(), CatalogResultSong, useOtwPlayMemberColors(), getOtwPlayThumbnailCandidates(), OtwPlayThumbnail(), source, ThumbnailSource (+37 more)

### Community 34 - "Notice Management Interface"
Cohesion: 0.08
Nodes (55): cleanupUnusedNoticeThumbnails(), createNotice(), deleteNotice(), deleteNoticeThumbnail(), fetchNotices(), fetchNoticeThumbnailStatus(), normalizeActive(), setFeaturedNotice() (+47 more)

### Community 35 - "Scheduled Workflow Coordination"
Cohesion: 0.08
Nodes (32): isRetiredScheduledJob(), ScheduledOperationsWorkflowParams, filterRunnableScheduledWorkflowJobs(), handleScheduledWorkflowCron(), hasScheduledD1WriteCapacity(), event, scheduledTime, testEnv (+24 more)

### Community 36 - "Naver Cafe Collection"
Cohesion: 0.07
Nodes (54): NaverCafeSource, CachedSourcePosts, clampMaxResults(), clearNaverCafeServiceCachesForTests(), collectNaverCafePostsForSources(), collectNaverSourceNewFeed(), decodeHtmlEntities(), errorSourcesFromDiagnostics() (+46 more)

### Community 37 - "Notice Storage Gateway"
Cohesion: 0.07
Nodes (18): notices, handleNotices, buildNoticeThumbnailAssetUrl(), NoticeUseCases, NoticeGateway, NoticeMutationResult, NoticeThumbnailCleanupResult, NoticeThumbnailDeleteResult (+10 more)

### Community 38 - "Public Catalog Queries"
Cohesion: 0.09
Nodes (45): OTW_PLAY_ADMIN_PREVIEW_HEADER, OtwPlayPublicCatalogQuery, appendOptional(), compareMemberValues(), fetchOtwPlayCatalog(), fetchOtwPlayConfig(), fetchOtwPlayFacets(), fetchOtwPlayMembers() (+37 more)

### Community 39 - "Operations Dashboard Interface"
Cohesion: 0.09
Nodes (50): isXCollectionIntervalHours(), MemberPostSettingsManager(), createOperationRun(), fetchD1Observability(), fetchDataRetentionStatus(), fetchOperationJobSummaries(), fetchOperationRun(), fetchOperationRuns() (+42 more)

### Community 40 - "Member Profile Interface"
Cohesion: 0.06
Nodes (38): MemberProfileBackgroundImageDto, MemberProfileImageDto, MemberProfileLinkType, fetchActiveMembers(), fetchMemberProfile(), fetchMembers(), isActiveMember(), MemberProfile (+30 more)

### Community 41 - "CHZZK Media Queries"
Cohesion: 0.08
Nodes (44): ChzzkClipDto, ChzzkClipsBatchResponseDto, ChzzkClipsResponseDto, ChzzkLiveStatusDebugItemDto, ChzzkLiveStatusItemDto, ChzzkLiveStatusResponseDto, ChzzkVideoDto, ChzzkVideosBatchResponseDto (+36 more)

### Community 42 - "Administrative Console Navigation"
Cohesion: 0.07
Nodes (31): OtwPlayChannelRole, @tanstack/react-router, AdminGate(), AdminLayout(), ConsoleArea, ConsoleScreen(), tabs, dollars() (+23 more)

### Community 43 - "Pending Schedule Review Queries"
Cohesion: 0.08
Nodes (40): PendingApplyMode, PendingCandidateKind, PendingMatchConfidence, PendingMatchReason, PendingMissingField, PendingRankedScheduleDto, PendingRejectionReasonCode, PendingScheduleDto (+32 more)

### Community 44 - "Public Catalog Application"
Cohesion: 0.10
Nodes (24): OtwPlayPublicMemberDto, PublicCatalogCache, PublicCatalogCacheResource, PublicCatalogDocument, PublicCatalogMeta, PublicCatalogReader, PublicCatalogSongSummary, assertContentReadable() (+16 more)

### Community 45 - "YouTube Channel Metadata"
Cohesion: 0.06
Nodes (33): OtwPlayChannelMonitorStatus, PREAPPROVED_COLLECTION_AUTHORITY, monitor(), repository(), ChannelMonitorAutomationApprovalInput, EligibleChannelMonitorTarget, OtwPlayYouTubeBatchMetadataReader, OtwPlayYouTubeChannelMetadata (+25 more)

### Community 46 - "D1 Diagnostic Tooling"
Cohesion: 0.08
Nodes (44): args, baseUrl, checkCatalogMeta(), checkMigrations(), checkOtwPlaySubmissionDailyLimit(), checkPublicReadModelMeta(), checkPublicSortKeys(), checkSchema() (+36 more)

### Community 47 - "Playback Queue State"
Cohesion: 0.08
Nodes (41): OtwPlayPublicPerformanceDetailDto, OtwPlayPublicPerformanceSummaryDto, OtwPlayPublicSourceDto, clampCurrentIndex(), createEmptyOtwPlayQueue(), findMatchingPerformanceIndex(), findNextPlayableQueueIndex(), isQueueItem() (+33 more)

### Community 48 - "Runtime Events and Audit"
Cohesion: 0.04
Nodes (15): displayValue(), readRecordedChanges(), RecordedChange, CloseEvent, CustomEvent, EmailEvent, ErrorEvent, Event (+7 more)

### Community 49 - "CHZZK Cached API Client"
Cohesion: 0.07
Nodes (45): CacheCandidate, CachedBatchRequest, CacheWriteRow, CHZZK_CLIPS_CACHE, CHZZK_CLIPS_IN_FLIGHT, CHZZK_VIDEOS_CACHE, CHZZK_VIDEOS_IN_FLIGHT, ChzzkCacheDb (+37 more)

### Community 50 - "YouTube Feed API"
Cohesion: 0.07
Nodes (35): YouTubeAllowlistUnavailableError, YouTubeApplication, YouTubeTargetsNotAllowedError, KIRINUKI_MAX_RESULTS, parseKirinukiMaxResults(), parseMaxResults(), parseYouTubeChannelTargets(), parseYouTubeMaxResults() (+27 more)

### Community 51 - "Ingestion Processing Services"
Cohesion: 0.08
Nodes (9): OtwPlayConvertIngestionCandidatesRequest, OtwPlayIngestionConversionOutcome, OtwPlayIngestionJobDto, OtwPlayUpdateIngestionCandidateRequest, IngestionService, IngestionServiceError, IngestionRepository, env (+1 more)

### Community 52 - "Ingestion Catalog Materialization"
Cohesion: 0.08
Nodes (20): OtwPlayIngestionCandidateItemDto, IngestionMessageRecord, IngestionReviewCandidate, OtwPlayYouTubePlaylistPage, IngestionItemCursor, candidateId(), catalogSubjectKey(), catalogVersionGuard() (+12 more)

### Community 53 - "Schedule Command Application"
Cohesion: 0.09
Nodes (28): ScheduleDto, SchedulePayload, ScheduleStatus, UpsertSchedulePayload, handleScheduleRequest, authorizeScheduleWrite(), anonymousActor, ScheduleQuery (+20 more)

### Community 54 - "Clerk Request Authentication"
Cohesion: 0.08
Nodes (42): AdminStatusResponse, createAuthStatusHandler(), NO_STORE_HEADERS, authenticateOptionalRequestMock, env, handler, isAdminUserMock, authenticateOptionalRequest() (+34 more)

### Community 55 - "Configuration Validation Contracts"
Cohesion: 0.05
Nodes (46): AUTO_UPDATE_INTERVAL_HOURS, AUTO_UPDATE_RANGE_DAYS, AutoUpdateIntervalHours, AutoUpdateRangeDays, BooleanSettingValue, DEFAULT_AUTO_UPDATE_RANGE_DAYS, DEFAULT_OTW_PLAY_SUBMISSION_DAILY_LIMIT, DEFAULT_X_REFERENCE_PREVIEW_MODE (+38 more)

### Community 56 - "Catalog Review Interface Tests"
Cohesion: 0.05
Nodes (45): OtwPlayReviewItemDto, createAdminCatalogFixture(), createReviewItemFixture(), approveProposalMock, catalog, confirmationMock, createChannelMock, createEntryMock (+37 more)

### Community 57 - "Project Toolchain Configuration"
Cohesion: 0.05
Nodes (46): envFiles, missing, required, engines, node, name, packageManager, private (+38 more)

### Community 58 - "YouTube Feed Collection"
Cohesion: 0.09
Nodes (43): EXTENDED_SHORTS_START_AT, isYouTubeShort(), publishedAt, YouTubeShortClassificationInput, OFFICIAL_CHANNEL_TARGETS_SQL, acquireBackfillLease(), apiUrl(), buildShortsResponse() (+35 more)

### Community 59 - "Pending Schedule Approval"
Cohesion: 0.09
Nodes (24): PendingAction, PendingApprovalOptions, PendingRejectionOptions, PendingScheduleActionResult, PendingScheduleBatchResult, handlePendingScheduleCommand, AuditBatchInput, mapWithConcurrency() (+16 more)

### Community 60 - "X Post Frontend Queries"
Cohesion: 0.08
Nodes (38): XHistoryPostDto, XPostContextResponseDto, XPostLinkDto, XPostMediaDto, XPostsConfigResponseDto, XPostsResponseDto, XReferenceHydrationHealthDto, formatMonitorUpdatedAt() (+30 more)

### Community 61 - "Video Archive Presentation"
Cohesion: 0.06
Nodes (35): ChzzkVideo, compareVodsByDate(), dateLabelFormatter, formatVodDateLabel(), getDateKeyFromDate(), getVodDateKey(), getVodTimestamp(), groupVodsByDate() (+27 more)

### Community 62 - "X Reference Hydration"
Cohesion: 0.09
Nodes (40): XLinkedPostPreviewDto, XPostDto, invalidateXPostMemoryCache(), XApiUsageTracker, XApiUser, XTweetLookupResponse, DB, readXReferenceBudget() (+32 more)

### Community 63 - "Music Identity Schema"
Cohesion: 0.08
Nodes (43): `members`, idx_members_code, idx_music_channel_entities_entity_channel, idx_music_channels_verification_active_role, idx_music_entities_normalized_name_id, idx_music_entity_aliases_normalized_alias_entity, idx_music_media_source_relations_related_type, idx_music_media_sources_availability_checked (+35 more)

### Community 64 - "Admin Catalog Request Validation"
Cohesion: 0.18
Nodes (44): parseBroadcastMetadata(), adminActor(), createAdminCatalogHandler(), errorResponse(), NO_STORE_HEADERS, pathId(), readBody(), requestIdFor() (+36 more)

### Community 65 - "YouTube API Client"
Cohesion: 0.10
Nodes (45): CachedPlaylistValue, CachedVideosValue, CacheReadResult, fetchYouTubePlaylistItems(), fetchYouTubeUploadsPlaylistId(), fetchYouTubeVideoDetails(), fetchYouTubeVideosForChannel(), FetchYouTubeVideosOptions (+37 more)

### Community 66 - "X Collection and History"
Cohesion: 0.08
Nodes (40): XReferencePendingReasonDto, claimXSourceLeases(), getScheduledXCollectionDecision(), getXCollectionScheduleDecision(), getXUsageFallbackReason(), normalizeCollectionResult(), normalizeLastRun(), normalizeXCollectionHandles() (+32 more)

### Community 67 - "Channel Monitor Persistence"
Cohesion: 0.10
Nodes (14): OTW_PLAY_CHANNEL_POLL_CRON_MINUTE, OTW_PLAY_CHANNEL_POLL_INTERVAL_MINUTES, ChannelMonitorRepository, nextChannelPollAt(), row(), D1ChannelMonitorRepository, approval, NOW (+6 more)

### Community 68 - "Play Release Telemetry"
Cohesion: 0.08
Nodes (33): OtwPlayAdminErrorCode, OtwPlayAdminSourceRecheckResponse, resolvePlayTelemetry(), NoopPlayTelemetryWriter, PLAY_TELEMETRY_EVENTS, PlayTelemetryCacheStatus, PlayTelemetryEvent, PlayTelemetryEventName (+25 more)

### Community 69 - "Public Catalog HTTP Responses"
Cohesion: 0.10
Nodes (42): OtwPlayPublicCatalogDto, OtwPlayPublicConfigDto, OtwPlayPublicCreditDto, OtwPlayPublicErrorCode, OtwPlayPublicFacetsDto, OtwPlayPublicSongDetailDto, createPlayTelemetryEvent(), isValidPublicCatalogSlug() (+34 more)

### Community 70 - "YouTube Cache Warmup"
Cohesion: 0.11
Nodes (36): kirinukiChannels, YouTubeCacheRefreshInProgressError, createD1KirinukiRepository(), buildYouTubeApplication(), CloudflareYouTubeCacheAnalyticsReader, createYouTubeCacheTelemetryWriter(), areSameIds(), CacheState (+28 more)

### Community 71 - "Music Performance Schema"
Cohesion: 0.06
Nodes (37): idx_music_performances_song_id, `music_performances`, uidx_music_performances_dedupe_key, idx_music_performances_published_relation_released_id, idx_music_performances_published_released_id, idx_music_performances_published_song_released_id, idx_music_search_terms_normalized_kind_song, `music_catalog_meta` (+29 more)

### Community 72 - "YouTube Embedded Player"
Cohesion: 0.06
Nodes (11): createOtwPlayYouTubePlayer(), loadYouTubeIframeApi(), OtwPlayYouTubePlayer, playerStateFromCode(), Window, YouTubePlaybackRequest, YouTubePlayerEvents, YouTubePlayerInstance (+3 more)

### Community 73 - "Play Product and Operations"
Cohesion: 0.08
Nodes (41): Channel upload polling, Hourly uploads playlist polling, Polling watermark and resume integrity, Cost metric scope separation, 관측 유효성 재점검, Evidence-based Queue retirement, Canonical YouTube quota migration, 미사용 구현 정리 적용 계약 (+33 more)

### Community 74 - "Ingestion Contracts and Cursors"
Cohesion: 0.09
Nodes (28): OtwPlayConvertIngestionCandidateRequest, OtwPlayCreatePlaylistImportRequest, OtwPlayIgnoreIngestionCandidatesRequest, OtwPlayIngestionCandidatePageDto, OtwPlayIngestionCandidateStatus, OtwPlayIngestionItemFilters, OtwPlayIngestionReviewInput, OtwPlayPlaylistPreflightDto (+20 more)

### Community 75 - "Public Multiview Interface"
Cohesion: 0.13
Nodes (32): buildMulLiveUrl(), buildMultiviewSearchParams(), dedupeChannelIds(), dedupeMultiviewChannelIds(), extractMultiviewChannelId(), extractMultiviewChzzkChannelId(), isValidChzzkChannelId(), isValidMultiviewChannelId() (+24 more)

### Community 76 - "YouTube Stale Cache Refresh"
Cohesion: 0.08
Nodes (34): getYouTubeVideosCacheKey(), YouTubeRefreshFailure, applyRefreshBackoff(), CacheRow, ChannelContent, claimRefreshLease(), classify(), classifyRefreshChange() (+26 more)

### Community 77 - "Cover Proposal Event Schema"
Cohesion: 0.08
Nodes (35): idx_music_catalog_events_aggregate_created_id, idx_music_cover_proposal_original_artists_entity_proposal, idx_music_cover_proposal_participants_entity_proposal, idx_music_cover_proposals_reviewer_reviewed_id, idx_music_cover_proposals_status_created_id, idx_music_cover_proposals_submitter_created_id, idx_music_cover_proposals_suggested_song_id, `music_catalog_events` (+27 more)

### Community 78 - "Anniversary Backend API"
Cohesion: 0.11
Nodes (20): DDayDto, DDayType, handleDDays, createDDay(), deleteDDay(), listDDays(), updateDDay(), DDayRepository (+12 more)

### Community 79 - "Anniversary Schedule Interface"
Cohesion: 0.13
Nodes (25): DDayPayload, createDDay(), deleteDDay(), fetchDDays(), updateDDay(), getAdminDDayOccurrence(), DDayMatch, formatDDayLabel() (+17 more)

### Community 80 - "Schedule Board Snapshots"
Cohesion: 0.11
Nodes (27): date-fns, fetchScheduleBoard(), useScheduleBoard(), useWeeklySchedule(), SNAPSHOT_DESIGN_OPTIONS, SNAPSHOT_MODE_OPTIONS, SNAPSHOT_THEME_OPTIONS, SnapshotPreviewManager() (+19 more)

### Community 81 - "Channel Monitor Lifecycle"
Cohesion: 0.13
Nodes (6): OtwPlayChannelMonitorDto, OtwPlayChannelMonitorReconcileDto, ChannelMonitorService, IngestionRepositoryError, env, requireAdminUserMock

### Community 82 - "YouTube Cache Telemetry"
Cohesion: 0.06
Nodes (27): YouTubePublicCacheState, YouTubeUsageRequestOrigin, CloudflareYouTubeCacheTelemetryWriter, EVENT_NAMES, finiteNonNegative(), fixedSlot(), ORIGINS, OUTCOMES (+19 more)

### Community 83 - "X Collection Monitoring Interface"
Cohesion: 0.16
Nodes (27): OperationRunDto, XCollectionOperationItemDto, XHistoryHealthResponseDto, XHistoryPostStatus, fetchXHistoryHealth(), XHistoryQuery, formatXEligibility(), formatXTime() (+19 more)

### Community 84 - "Runtime Event Targets"
Cohesion: 0.06
Nodes (6): AbortSignal, EventTarget, MessagePort, ServiceWorkerGlobalScope, WebSocket, WorkerGlobalScope

### Community 85 - "External Link Previews"
Cohesion: 0.13
Nodes (32): CachedPreview, clampText(), decodeHtmlEntities(), enrichLink(), enrichLinksWithPreviews(), fallbackPreview(), fetchHtml(), getDomain() (+24 more)

### Community 86 - "Public Navigation and Authentication"
Cohesion: 0.12
Nodes (25): RootRouteError(), AppChromeMode, getAppChromeMode(), getPublicNavigationSections(), getPublicSidebarMode(), InternalNavTo, isNavItemActive(), MemberPostsNavState (+17 more)

### Community 87 - "CHZZK Clip Presentation"
Cohesion: 0.11
Nodes (28): ClipDateGroup, compareClipsByDateThenViews(), compareClipsByViews(), dateLabelFormatter, formatClipDateLabel(), getClipDateKey(), getClipTimestamp(), getDateKeyFromDate() (+20 more)

### Community 88 - "Notice Publication Visibility"
Cohesion: 0.08
Nodes (24): getNoticePublicationStatus(), getTodayKstDateString(), isNoticeVisibleOnDate(), normalizePeriodDate(), NoticePublicationStatus, NoticeVisibilityInput, selectFeaturedNotice(), configs (+16 more)

### Community 89 - "X Post Card Rendering"
Cohesion: 0.12
Nodes (28): extractXStatusId(), formatAbsoluteDate(), formatMetric(), formatRelativeDate(), getLinkDomain(), getLinkHref(), getPreviewLinks(), isLinkForPostId() (+20 more)

### Community 90 - "Local Development Server"
Cohesion: 0.10
Nodes (26): @cloudflare/vite-plugin, @tailwindcss/vite, vite, @vitejs/plugin-react, args, child, execFileAsync, host (+18 more)

### Community 91 - "Catalog Hydration Diagnostics"
Cohesion: 0.13
Nodes (6): handleOtwPlayPublicCatalog, PublicCatalogReadDiagnostics, PublicCatalogReaderQuery, PublicCatalogSearchPhase, D1PublicCatalogReader, performanceDate()

### Community 92 - "R2 Asset Access"
Cohesion: 0.13
Nodes (22): handleR2Asset, AssetObject, AssetReader, readAsset(), CONTENT_TYPE_BY_EXTENSION, EXTENSION_BY_TYPE, getAssetContentType(), getNoticeThumbnailContentTypeFromKey() (+14 more)

### Community 93 - "Application Runtime Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, @chakra-ui/react, class-variance-authority, @clerk/clerk-react, clsx, date-fns, dotenv, drizzle-orm (+25 more)

### Community 94 - "Snapshot Fonts and Layout"
Cohesion: 0.11
Nodes (24): html-to-image, DailySchedule(), fonts, forceSystemSnapshotFonts(), prepareSnapshotFonts(), readSnapshotFonts(), SNAPSHOT_FONT_READ_EVENT, SNAPSHOT_FONT_TIMEOUT (+16 more)

### Community 95 - "Player Queue Controls"
Cohesion: 0.08
Nodes (21): @radix-ui/react-tabs, formatPlaybackTime(), miniPlayerStatusLabel, MobilePlayerPresentation, OtwPlayPlayerContext, OtwPlayPlayerQueuePanel(), PlaybackProgress(), repeatLabel (+13 more)

### Community 96 - "YouTube Archive Interface"
Cohesion: 0.11
Nodes (26): CompositeTabIcon(), CompositeTabIconProps, MEDIA_TABS, MediaTab, MediaTabSwitcher(), MediaTabSwitcherProps, renderTabIcon(), createKirinukiChannel() (+18 more)

### Community 97 - "Operational Data Retention"
Cohesion: 0.13
Nodes (30): DATA_RETENTION_POLICIES, DataRetentionPolicyStatus, DataRetentionPruneResult, DataRetentionRunSummary, DataRetentionStatusResult, deletePrunableRows(), getDataRetentionStatus(), getPolicyBindValue() (+22 more)

### Community 98 - "Broadcast Schedule Matching"
Cohesion: 0.10
Nodes (31): AUTO_UPDATE_RESUME_GAP_MS, AUTO_UPDATE_SHORT_SESSION_SECONDS, AUTO_UPDATE_TIME_WINDOW_MINUTES, AUTO_UPDATE_TITLE_DICE_THRESHOLD, AutoUpdateCandidateKind, AutoUpdateMatchConfidence, AutoUpdateMatchReason, AutoUpdateMissingField (+23 more)

### Community 99 - "Pending Schedule Command Validation"
Cohesion: 0.12
Nodes (24): getPendingApprovalValues(), isPendingApplyMode(), isPendingRejectionReasonCode(), isPendingTargetMode(), isPendingTimeMode(), roundTimeToNearestScheduleHalfHour(), roundTimeToNearestScheduleHour(), pendingSchedule (+16 more)

### Community 100 - "Ingestion HTTP Validation"
Cohesion: 0.17
Nodes (28): OTW_PLAY_INGESTION_CANDIDATE_STATUSES, OTW_PLAY_INGESTION_CLASSIFICATIONS, OtwPlayIngestionClassification, OtwPlayPublicChannelRole, isOtwPlayIngestionOfficialChannelRole(), OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES, createIngestionHandler(), errorResponse() (+20 more)

### Community 101 - "Submission HTTP Validation"
Cohesion: 0.16
Nodes (28): OtwPlaySubmissionErrorCode, OtwPlaySubmissionParticipantInput, emptyBroadcastMetadata(), consumeEdgeLimit(), createMemberSubmissionHandler(), decodePathId(), decodeWithdrawPathId(), errorResponse() (+20 more)

### Community 102 - "Catalog Integrity Migration"
Cohesion: 0.09
Nodes (30): `__backup_music_channel_upload_candidate_origins`, `__backup_music_channel_websub_deliveries`, `__backup_music_channel_websub_subscriptions`, `__backup_music_cover_proposal_original_artists`, `__backup_music_cover_proposal_participants`, `__backup_music_ingestion_candidate_origins`, `__backup_music_ingestion_events`, idx_music_channel_upload_origins_monitor_discovered (+22 more)

### Community 103 - "Package Task Commands"
Cohesion: 0.06
Nodes (31): scripts, architecture:check, build, cf-typegen, d1:doctor, d1:reset:local, d1:seed:local, deploy (+23 more)

### Community 104 - "Safe Local Database Reset"
Cohesion: 0.09
Nodes (27): shouldBlockDestructiveLocalReset(), applyMigrations(), args, assertSuccess(), bootstrapMemberCodes, createBootstrapCleanupSql(), createBootstrapSql(), drizzleDir (+19 more)

### Community 105 - "Public Catalog Edge Cache"
Cohesion: 0.14
Nodes (21): PublicCatalogCacheDocument, PublicCatalogCacheEntry, PublicCatalogCacheKey, PublicCatalogFacets, MemoryCache, canonicalPathAndQuery(), CloudflarePublicCatalogCache, CloudflarePublicCatalogCacheError (+13 more)

### Community 106 - "Catalog Pagination Cursors"
Cohesion: 0.12
Nodes (25): EMPTY_FACETS, META_OFF, META_ON, PERFORMANCE_DETAIL, SONG_DETAIL, decodePublicCatalogCursor(), encodePublicCatalogCursor(), isRecord() (+17 more)

### Community 107 - "Manual Schedule Auto Update"
Cohesion: 0.11
Nodes (16): ManualAutoUpdateOutcome, ManualAutoUpdateService, ManualAutoUpdatePort, ManualAutoUpdateResult, AdminResult, enqueueMock, env, getDbMock (+8 more)

### Community 108 - "Worker Fetch Orchestration"
Cohesion: 0.09
Nodes (22): normalizeAdminSettings(), createSiteSeoService(), handleApiRouteError(), handleSiteSeo, handleWorkerFetch(), isLocalApiRequest(), SerializedError, serializeError() (+14 more)

### Community 109 - "AI Review Execution"
Cohesion: 0.14
Nodes (6): AiReviewRequest, AiReviewService, AiReviewAnalyzer, AiReviewBroadcastReader, AiReviewQueue, AiReviewRepository

### Community 110 - "Schedule Board Read Model"
Cohesion: 0.13
Nodes (17): ScheduleBoardResponse, ddays, handleScheduleBoard, ScheduleBoardReader, readScheduleBoard(), createHandleScheduleBoard(), ScheduleBoardReaderResolver, getScheduleBoardMock (+9 more)

### Community 111 - "Schedule Write Persistence"
Cohesion: 0.17
Nodes (12): SaveScheduleResult, ScheduleWriteRepository, saveSchedule(), isExclusiveScheduleStatus(), isScheduleStatus(), ScheduleActor, ScheduleWriteInput, actorBindings() (+4 more)

### Community 112 - "Playlist Ingestion Schema"
Cohesion: 0.11
Nodes (28): idx_music_ingestion_candidates_channel_status_id, idx_music_ingestion_candidates_refresh_id, idx_music_ingestion_candidates_retention_id, idx_music_ingestion_candidates_status_updated_id, idx_music_ingestion_jobs_source_updated_id, idx_music_ingestion_jobs_status_retry_id, idx_music_ingestion_messages_status_retry_key, idx_music_ingestion_origins_candidate_discovered_id (+20 more)

### Community 113 - "D1 Usage Observability"
Cohesion: 0.11
Nodes (23): D1ObservabilityResponseDto, CacheLike, classifyD1WriteQueryForTest, classifyWriteQuery(), CloudflareD1ObservabilityReader, D1_OBSERVABILITY_GRAPHQL, emptyResponse(), getWindowDays() (+15 more)

### Community 114 - "CHZZK HTTP Routing"
Cohesion: 0.17
Nodes (22): ChzzkAllowlistUnavailableError, ChzzkApplication, ChzzkTargetsNotAllowedError, CHZZK_MAX_CHANNEL_IDS, ChzzkChannelTargetParseResult, parseChzzkChannelTargetArray(), parseChzzkChannelTargets(), parseSingleChzzkChannelTarget() (+14 more)

### Community 115 - "CHZZK Application Authorization"
Cohesion: 0.10
Nodes (17): ChzzkLiveContentDto, ChzzkLiveStatusDebugDto, authorizeChzzkChannelTargets(), ChzzkTargetAuthorizationResult, ChzzkActor, ChzzkApplicationPorts, ChzzkAutoFillAuditInput, ChzzkClipCatalogItem (+9 more)

### Community 116 - "AI Review Admin Interface"
Cohesion: 0.15
Nodes (22): AI_REVIEW_FIELDS, AiReviewEvidence, AiReviewField, AiReviewPerson, AiReviewStatus, AiReviewSuggestion, AiReviewTarget, OtwPlayAdminCatalogSubjectInput (+14 more)

### Community 117 - "AI Review Application Boundaries"
Cohesion: 0.15
Nodes (15): AiReviewKind, AiReviewRange, isAiReviewPending(), AiReviewContext, AiReviewError, AiReviewInput, OtwPlayYouTubeVideoMetadata, AI_REVIEW_PROMPT_VERSION (+7 more)

### Community 118 - "YouTube Quota Admission"
Cohesion: 0.13
Nodes (17): isYouTubeApiDailyQuotaUnitsValue(), clearYouTubeServiceCachesForTests(), FakeCacheRecord, FakeUsageEvent, getPriorityLimitRatio(), getQuotaDateTimeParts(), getQuotaTimeZoneOffsetMs(), getYouTubeQuotaWindow() (+9 more)

### Community 119 - "Operations Frontend Contracts"
Cohesion: 0.15
Nodes (24): DataRetentionCategory, NaverCafeSourceCheckStatus, OperationsStatusLevel, OperationJobSummaryDto, OperationJobSummaryListDto, OperationRunListDto, AutoUpdateOperationRun, AutoUpdateRunDetail (+16 more)

### Community 120 - "AI Review Result Normalization"
Cohesion: 0.18
Nodes (20): canonicalTags, normalizeOtwPlaySongTags(), OTW_PLAY_RECOMMENDED_SONG_TAGS, tagKey(), aiSongTitleKeys(), aiSongTitlesMatch(), aiVideoTimecodeSeconds(), formatAiSongTitle() (+12 more)

### Community 121 - "Schedule Database Migrations"
Cohesion: 0.10
Nodes (19): idx_schedules_date, `schedules`, idx_schedules_date, `__new_members`, `__new_schedules`, `pending_schedules`, `update_logs`, idx_pending_schedules_created_at (+11 more)

### Community 122 - "Development Tool Dependencies"
Cohesion: 0.08
Nodes (26): devDependencies, baseline-browser-mapping, @cloudflare/vite-plugin, @cloudflare/vitest-pool-workers, drizzle-kit, eslint, @eslint/js, eslint-plugin-react-hooks (+18 more)

### Community 123 - "Drizzle Member and Audit Access"
Cohesion: 0.10
Nodes (14): MemberProfileLinkDto, memberLinks, memberProfileImages, members, settings, updateLogs, drizzle-orm, handleUpdateLogs (+6 more)

### Community 124 - "Architecture Dependency Enforcement"
Cohesion: 0.10
Nodes (21): typescript, active, addError(), dependencyGraph, errors, findCycles(), forbiddenLegacyDirectories, getFrontendCapability() (+13 more)

### Community 125 - "Frontend TypeScript Configuration"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 126 - "CHZZK Infrastructure Composition"
Cohesion: 0.12
Nodes (19): CHZZK_CHANNEL_ID_PATTERN, fetchChzzkClipsBatchMock, fetchChzzkVideosBatchMock, handleVods, registeredChannelId, unknownChannelId, buildChzzkApplication(), ChzzkExternalApplicationPorts (+11 more)

### Community 127 - "Admin Audit Log Reading"
Cohesion: 0.17
Nodes (16): AdminAuditLogPageResponseDto, LogFilters, AdminAuditLogReader, readAdminAuditLogs(), AdminAuditLogReaderResolver, createHandleAdminAuditLogs(), NO_STORE_HEADERS, parsePage() (+8 more)

### Community 128 - "YouTube Cache Analytics"
Cohesion: 0.12
Nodes (20): YouTubeCacheActiveOrigin, YouTubeCacheAnalyticsDto, YouTubeCacheAnalyticsSliceDto, addRow(), aggregate(), analyticsCache, AnalyticsEvent, AnalyticsOutcome (+12 more)

### Community 129 - "Channel Monitoring Schema"
Cohesion: 0.13
Nodes (21): idx_music_channel_upload_monitors_due, idx_music_channel_upload_origins_monitor_discovered, `music_channel_upload_candidate_origins`, `music_channel_upload_monitors`, uidx_music_channel_upload_monitors_channel, idx_music_channel_upload_origins_monitor_generation_discovered, uidx_music_channel_upload_monitors_channel, idx_music_channel_automation_approvals_status_channel (+13 more)

### Community 130 - "Application Theme and Feedback"
Cohesion: 0.10
Nodes (18): RootNotFound(), initialState, Theme, ThemeProvider(), ThemeProviderContext, ThemeProviderProps, ThemeProviderState, Register (+10 more)

### Community 131 - "Playlist HTTP Validation"
Cohesion: 0.16
Nodes (20): body(), createPlaylistHandler(), identifier(), ids(), invalid(), json(), parseDefaultPlaylistWrite(), parsePlaylistWrite() (+12 more)

### Community 132 - "Pending Approval Database Transactions"
Cohesion: 0.25
Nodes (8): PendingActionOutcome, PendingScheduleRow, actorBindings(), D1PendingScheduleRepository, EmptyTargetRow, IdRow, staleOutcome(), timeToMinutes()

### Community 133 - "Audit Query Contracts"
Cohesion: 0.20
Nodes (14): AdminAuditLogDto, UpdateLogDto, UpdateLogPageResponseDto, UpdateLogQuery, buildQueryString(), fetchAdminAuditLogs(), fetchUpdateLogs(), getAuditResultSummary() (+6 more)

### Community 134 - "Settings Persistence and Auditing"
Cohesion: 0.16
Nodes (15): RETIRED_SETTINGS_KEYS, handleAdminSettings, SettingsService, handle, testEnv, update(), FakeAuditRow, fakeDbContext (+7 more)

### Community 135 - "Member Submission Interface"
Cohesion: 0.18
Nodes (18): OtwPlayCreateSubmissionResponse, createOtwPlaySubmission(), fetchMyOtwPlaySubmission(), fetchMyOtwPlaySubmissions(), memberRequest(), preflightOtwPlaySubmission(), apiFetchMock, updateOtwPlaySubmission() (+10 more)

### Community 136 - "Member Directory Backend"
Cohesion: 0.15
Nodes (10): MemberReader, listActiveMembers(), readMemberProfile(), createHandleMembers(), decodeMemberCode(), memberNotFound(), MemberReaderResolver, getDbMock (+2 more)

### Community 137 - "Notice HTTP Validation"
Cohesion: 0.18
Nodes (21): MAX_NOTICE_IMAGES, MAX_NOTICE_LINKS, createHandleNotices(), getNoticeThumbnailUploadFile(), getTodayKstDateString(), NO_STORE_HEADERS, normalizeHttpUrl(), normalizeNoticeImageUrl() (+13 more)

### Community 138 - "Operations Wire Contracts"
Cohesion: 0.10
Nodes (21): AutoUpdateOperationRunDto, AutoUpdateRunDetailDto, AutoUpdateRunResultDto, D1ObservabilityCurrentDayDto, D1ObservabilityDailyMetricDto, D1ObservabilityReasonCode, D1ObservabilityStatus, D1ObservabilityWriteWorkloadDto (+13 more)

### Community 139 - "AI Review Database Persistence"
Cohesion: 0.17
Nodes (8): AiReviewDto, AiReviewResult, AiReviewRecord, D1AiReviewRepository, decode(), now, record(), Row

### Community 140 - "Play Operational Observability"
Cohesion: 0.16
Nodes (15): OtwPlayAdminObservabilityDto, OtwPlayAdminObservabilityRouteDto, OtwPlayAdminObservabilitySummaryDto, handleOtwPlayObservability, PlayObservabilityReader, AnalyticsRow, CloudflarePlayObservabilityReader, emptySummary() (+7 more)

### Community 141 - "Stored X Feed Tests"
Cohesion: 0.10
Nodes (14): clearLinkPreviewCacheForTests(), clearXServiceCachesForTests(), handles, post(), testEnv, FakeCacheRecord, FakeCollectionRunRecord, FakePostSourceRecord (+6 more)

### Community 142 - "UI Component Configuration"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 143 - "Catalog Authority Retention Schema"
Cohesion: 0.16
Nodes (19): `__backup_music_channel_websub_deliveries`, `__backup_music_ingestion_candidate_origins`, `__backup_music_ingestion_events`, idx_music_channel_websub_deliveries_monitor_received, idx_music_channel_websub_deliveries_status_received, idx_music_channel_websub_subscriptions_lease, idx_music_ingestion_events_candidate_created_id, idx_music_ingestion_events_job_created_id (+11 more)

### Community 144 - "Runtime Stream Transformations"
Cohesion: 0.10
Nodes (7): CompressionStream, DecompressionStream, FixedLengthStream, IdentityTransformStream, TextDecoderStream, TextEncoderStream, TransformStream

### Community 147 - "Settings Application Ports"
Cohesion: 0.19
Nodes (8): SETTINGS_KEYS, SettingsKey, SettingWrite, WritableSettingsKey, SettingsActor, SettingsAudit, SettingsChange, SettingsRepository

### Community 148 - "Safe Local Fixture Seeding"
Cohesion: 0.13
Nodes (15): buildDestructiveRowCountSql(), hasProtectedLocalSeedData(), LOCAL_SEED_PROTECTED_TABLES, MUSIC_DELETE_ORDER, args, destructiveRowCount, fixtureFile, fixtureMemberCount (+7 more)

### Community 149 - "Rights and Footer Content"
Cohesion: 0.19
Nodes (7): Footer(), RightsPage(), Route, Route, getSiteCopyrightNotice(), SITE_COPYRIGHT_OWNER, SITE_COPYRIGHT_START_YEAR

### Community 150 - "Node TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+10 more)

### Community 151 - "Proposal Schema Integrity Tests"
Cohesion: 0.11
Nodes (10): ALL_MUSIC_TABLES, expectedForeignKeys, NEW_TABLES, PendingProposalInput, PROPOSAL_SEARCH_MIGRATION_NAMES, ProposalSearchTestEnv, PUBLISHED_INDEX_DIRECTIONS, PUBLISHED_INDEXES (+2 more)

### Community 152 - "Schedule Update Audit Logs"
Cohesion: 0.16
Nodes (13): UpdateLogRepository, UpdateLogService, createUpdateLogHandler(), NO_STORE_HEADERS, parsePositiveInt(), parseSort(), ResolveUpdateLogService, AdminResult (+5 more)

### Community 153 - "Canonical Migration Guidance"
Cohesion: 0.13
Nodes (18): Authorized remote promotion, Canonical Drizzle schema, Drizzle and D1 migration policy, Explicit destructive fixture replacement, Migration chain validation, DB migration skill UI metadata, DB migration checklist, Isolated migration reset (+10 more)

### Community 154 - "Notice Backend Regression Tests"
Cohesion: 0.14
Nodes (8): put(), getDbMock, handleNotices, makeDeleteDb(), makeUpdateDb(), requireAdminUserMock, selectThumbnailQuery(), selectThumbnailReferencesQuery()

### Community 155 - "YouTube Cache Usage Schema"
Cohesion: 0.20
Nodes (15): idx_youtube_api_cache_expires_at, idx_youtube_api_cache_stale_until, idx_youtube_api_cache_type, idx_youtube_api_usage_events_cache_key, idx_youtube_api_usage_events_created_at, idx_youtube_api_usage_events_operation, idx_youtube_api_usage_events_status, `youtube_api_cache` (+7 more)

### Community 156 - "Scheduled Job Queue Schema"
Cohesion: 0.21
Nodes (16): idx_scheduled_job_items_lane_status_available, idx_scheduled_job_items_lease, idx_scheduled_job_runs_job_status_accepted, idx_scheduled_job_runs_status_updated, idx_scheduled_outbox_status_available, idx_scheduled_usage_daily_day_resource, `scheduled_job_items`, `scheduled_job_runs` (+8 more)

### Community 157 - "Broadcast Video Metadata"
Cohesion: 0.19
Nodes (11): OtwPlayYouTubeMetadataReader, extractYouTubeVideoId(), hasUnsafeRawUrlCharacter(), isSafeYouTubeUrl(), readPathVideoId(), readWatchVideoId(), YOUTU_BE_PATH_PATTERN, YOUTUBE_EMBED_PATH_PATTERN (+3 more)

### Community 158 - "Safe Branch Maintenance"
Cohesion: 0.12
Nodes (16): Branch maintenance skill UI metadata, Atomic branch deletion, Conservative default synchronization, Canonical branch maintenance skill, Exact merged-PR deletion proof, Merge ancestry deletion proof, Branch maintenance compatibility workflow, Branch maintenance skill UI metadata generated mirror (+8 more)

### Community 159 - "Naver Cafe Visibility Indexes"
Cohesion: 0.17
Nodes (14): idx_naver_cafe_posts_hidden_created, idx_naver_cafe_posts_member_hidden_created, idx_naver_cafe_posts_source_hidden_created, idx_naver_cafe_source_checks_checked_at, idx_naver_cafe_source_checks_source_checked, `naver_cafe_posts`, `__new_naver_cafe_source_checks`, idx_naver_cafe_posts_hidden_created (+6 more)

### Community 160 - "Deployment Environment Guards"
Cohesion: 0.19
Nodes (9): assertClerkPublishableKeyForTarget(), CLERK_ENVIRONMENT_TARGETS, getClerkPublishableKeyKind(), resolveClerkEnvironmentTarget(), temporaryDirectories, verifyClientBuildForDeploy(), configs, dryRun (+1 more)

### Community 161 - "Exact Worker Route Registry"
Cohesion: 0.17
Nodes (11): CompiledRoute, compilePath(), createRouteRegistry(), escapeRegExp(), env, WorkerHttpMethod, WorkerRouteAuth, WorkerRouteDefinition (+3 more)

### Community 162 - "Source Health Database Tests"
Cohesion: 0.13
Nodes (7): D1PreparedStatement, indexNames, insertPerformanceLink(), insertPublishedLink(), NOW, SourceHealthTestEnv, testEnv

### Community 164 - "CHZZK Live Status Tests"
Cohesion: 0.15
Nodes (14): auditValuesMock, autoFillUndecidedLiveSchedulesMock, buildTestChzzkApplication(), cacheStore, channelId, fakeDb, fetchChzzkLiveStatusMock, fetchChzzkLiveStatusWithDebugMock (+6 more)

### Community 165 - "Agent Authority and Standards"
Cohesion: 0.14
Nodes (15): Authority order, Canonical agent configuration, OTW assistant authority and outcome rules, PR evidence ledger, Primary-flow verification, Actor and audit header alignment, API contract propagation, Current UI design authority (+7 more)

### Community 166 - "Animated Stepper Interface"
Cohesion: 0.15
Nodes (4): Step(), Stepper(), stepVariants, contents

### Community 169 - "Canonical Release Verification"
Cohesion: 0.15
Nodes (14): Release operations skill UI metadata, Changed-flow release verification, Release preflight checklist, Generated agent surface integrity, Preflight quality sequence, Read-only operations verification, Artifact and production readback, Authorized deployment route (+6 more)

### Community 170 - "YouTube Feed Storage Schema"
Cohesion: 0.22
Nodes (12): idx_youtube_api_usage_contexts_origin, idx_youtube_api_usage_contexts_workload, idx_youtube_feed_sources_due, idx_youtube_feed_videos_fetched, idx_youtube_feed_videos_source_published, `naver_cafe_usage_daily`, `__new_scheduled_job_items`, uidx_youtube_feed_sources_channel_kind (+4 more)

### Community 171 - "Test TypeScript Configuration"
Cohesion: 0.14
Nodes (13): ./tsconfig.app.json, compilerOptions, allowJs, noUnusedLocals, noUnusedParameters, paths, tsBuildInfoFile, types (+5 more)

### Community 172 - "Member Profile Background Images"
Cohesion: 0.25
Nodes (12): appendVersion(), buildProfileBackgroundImageSources(), buildProfileBackgroundImageSourceSets(), DEFAULT_PROFILE_BACKGROUND_ID, encodePathSegment(), getProfileBackgroundBaseUrl(), getProfileBackgroundEntries(), getProfileBackgroundIds() (+4 more)

### Community 173 - "Channel Monitor Interface Tests"
Cohesion: 0.14
Nodes (13): backfillMock, candidatesQueryMock, createMonitorMock, deleteMonitorMock, monitor, monitorsQueryMock, previousCandidatesQueryMock, reconcileMock (+5 more)

### Community 178 - "Collection Run Audit Schema"
Cohesion: 0.23
Nodes (12): `auto_update_runs`, idx_auto_update_runs_source_started, idx_auto_update_runs_started_at, idx_auto_update_runs_status, idx_naver_cafe_source_checks_checked_at, idx_naver_cafe_source_checks_source_checked, idx_naver_cafe_source_checks_status, `naver_cafe_source_checks` (+4 more)

### Community 179 - "X History and Compliance Schema"
Cohesion: 0.26
Nodes (12): idx_x_compliance_jobs_created, idx_x_compliance_jobs_due, idx_x_member_daily_metrics_member_date, idx_x_post_facts_member_created, idx_x_post_facts_metrics_due, idx_x_post_facts_visible_created, idx_x_post_metric_snapshots_captured, `x_compliance_jobs` (+4 more)

### Community 180 - "Member Submission Form Tests"
Cohesion: 0.17
Nodes (6): completeDetails(), member, mocks, preflight, startNewSong(), submission

### Community 181 - "Vitest Project Configuration"
Cohesion: 0.26
Nodes (9): @cloudflare/vitest-pool-workers, testAliases, testCoverage, testMaxWorkers, OTW_PLAY_HARDENING_MIGRATION_NAMES, OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES, OTW_PLAY_PUBLIC_CATALOG_MIGRATION_NAMES, OTW_PLAY_PUBLIC_CATALOG_TEST_MIGRATION_NAMES (+1 more)

### Community 182 - "Operations Dashboard Tests"
Cohesion: 0.15
Nodes (11): DataRetentionStatusResponse, d1Observability, fetchD1ObservabilityMock, fetchDataRetentionStatusMock, fetchOperationJobSummariesMock, fetchOperationRunsMock, fetchOperationsStatusMock, jobSummaries (+3 more)

### Community 183 - "Snapshot Route Configuration"
Cohesion: 0.23
Nodes (10): normalizeSnapshotDesign(), getToday(), normalizeDate(), normalizeMode(), normalizeTheme(), Route, SnapshotMode, SnapshotTheme (+2 more)

### Community 187 - "Canonical Code Review Guidance"
Cohesion: 0.17
Nodes (12): OTW code review skill UI metadata, Contract-through-outcome review, Canonical OTW code review skill, Review authority and scope, OTW code review skill UI metadata generated mirror, Canonical skill delegation, OTW code review skill discovery entry, OTW code review skill UI metadata generated mirror (+4 more)

### Community 188 - "Notice Wire Contracts"
Cohesion: 0.32
Nodes (10): NoticeDto, NoticeLinkDto, NoticePayload, NoticePublisherType, NoticeThumbnailAssetStatus, NoticeThumbnailCleanupResponse, NoticeThumbnailDeleteResponse, NoticeThumbnailReferenceStatus (+2 more)

### Community 189 - "Runtime HTTP Body Types"
Cohesion: 0.17
Nodes (3): Body, Request, Response

### Community 191 - "YouTube Shorts Pagination"
Cohesion: 0.29
Nodes (9): decodeYouTubeShortsCursor(), encodeYouTubeShortsCursor(), fingerprintChannels(), fromBase64Url(), SerializedCursor, channels, toBase64Url(), YouTubeShortsCursor (+1 more)

### Community 192 - "Settings Request Validation"
Cohesion: 0.25
Nodes (8): isSettingsKey(), isWritableSettingsKey(), parseSettingsUpdatePayload(), createAdminSettingsHandler(), NO_STORE_HEADERS, ResolveSettingsService, JsonRequestResult, parseJsonRequest()

### Community 193 - "Gemini Review Schema"
Cohesion: 0.24
Nodes (10): OTW_PLAY_PARTICIPANT_ROLES, OTW_PLAY_PARTICIPATION_TYPES, AI_REVIEW_SCHEMA, array(), enumeration(), object(), person, string (+2 more)

### Community 194 - "Product Experience Decisions"
Cohesion: 0.18
Nodes (11): OTW Schedule Design Guide, Clear playback queue, Review segment playback preview, Singing clip direct registration, Separate song performance channel and broadcast facts, OTW Schedule Product, Member-only OTW Play, Schedule-first product priority (+3 more)

### Community 195 - "Member Profile Asset Schema"
Cohesion: 0.27
Nodes (9): idx_member_links_member_sort, idx_member_links_member_uid, idx_member_profile_images_member_sort, idx_member_profile_images_member_uid, `member_links`, `member_profile_images`, idx_member_links_member_sort, idx_member_links_member_uid (+1 more)

### Community 196 - "Worker TypeScript Configuration"
Cohesion: 0.18
Nodes (10): ./tsconfig.node.json, compilerOptions, baseUrl, paths, tsBuildInfoFile, types, extends, include (+2 more)

### Community 197 - "Agent Configuration Synchronization"
Cohesion: 0.29
Nodes (9): checkLinks(), filesUnder(), localLinks(), rules, skills, slash(), syncAgentFiles(), fixture() (+1 more)

### Community 198 - "Profile Background R2 Upload"
Cohesion: 0.18
Nodes (8): bucketArg, optimizedDir, optimizedFiles, originalFiles, projectRoot, sourceDir, uploads, wranglerEntry

### Community 199 - "Featured Notice Banner"
Cohesion: 0.25
Nodes (7): getNoticeSortTime(), NoticeBanner(), noticeTypeConfigs, NoticeTypeKey, resolveNoticeType(), sortNoticesByLatest(), navigateMock

### Community 200 - "Cloudflare Stream Error Types"
Cohesion: 0.18
Nodes (11): AlreadyUploadedError, BadRequestError, ForbiddenError, InternalError, InvalidURLError, MaxFileSizeError, NotFoundError, QuotaReachedError (+3 more)

### Community 201 - "Music Catalog Constraint Tests"
Cohesion: 0.18
Nodes (4): CatalogTestEnv, expectedForeignKeys, MUSIC_TABLES, testEnv

### Community 203 - "Pending Schedule Query Validation"
Cohesion: 0.24
Nodes (9): createPendingScheduleQueryHandler(), isDate(), parsePositiveInteger(), ResolvePendingScheduleQueryService, env, handler, readRejectionsMock, readReviewMock (+1 more)

### Community 204 - "Project Capability Context"
Cohesion: 0.20
Nodes (10): Cloudflare Worker and D1 backend, OTW Schedule project context, End-to-end API flow, OTW Play shared identities, Public Mul.Live multiview, React and TanStack frontend, Read-only cost observation, Retired WebSub implementation (+2 more)

### Community 205 - "Generated Release Guidance"
Cohesion: 0.20
Nodes (10): Release operations skill UI metadata generated mirror, Changed-flow release verification, Release preflight checklist generated mirror, Generated agent surface integrity, Preflight quality sequence, Read-only operations verification, Artifact and production readback, Authorized deployment route (+2 more)

### Community 206 - "Music Search Read Models"
Cohesion: 0.29
Nodes (9): idx_music_public_performance_sort_keys_entity_performance, idx_music_public_performance_sort_keys_missing_song_performance, idx_music_public_performance_sort_keys_participant_song_performance, idx_music_search_grams_size_normalized_song, `music_public_performance_sort_keys`, `music_public_read_model_meta`, `music_search_gram_stats`, `music_search_grams` (+1 more)

### Community 207 - "X Reference Usage Schema"
Cohesion: 0.29
Nodes (8): idx_x_api_resource_daily_seen, idx_x_api_usage_daily_day, idx_x_post_references_due, idx_x_post_references_target, `x_api_resource_daily`, `x_api_usage_daily`, `x_post_references`, idx_x_post_references_author_due

### Community 208 - "Architecture Guard Regression Tests"
Cohesion: 0.22
Nodes (8): ../../members/ui/member-page, ./a, architectureCheckPath, createFilesFixture(), createFixture(), fixtureRoots, ./b, @/features/members/ui/member-page

### Community 209 - "Public Catalog Interface Tests"
Cohesion: 0.20
Nodes (4): catalogResult, disconnect, member, mocks

### Community 212 - "Catalog Write Integration Tests"
Cohesion: 0.20
Nodes (5): StreamBinding, actor, createEntity(), NOW, TestEnv

### Community 213 - "Canonical API Change Guidance"
Cohesion: 0.22
Nodes (9): Asynchronous outcome review, Worker API change skill UI metadata, Canonical Worker API change skill, Exact route and DTO propagation, Natural-entry persisted reuse, Queued-work terminal verification, Worker API change skill UI metadata generated mirror, Canonical skill delegation (+1 more)

### Community 214 - "Generated Migration Guidance"
Cohesion: 0.22
Nodes (9): DB migration skill UI metadata generated mirror, DB migration checklist generated mirror, Isolated migration reset, Migration constraints and query fit, Schema SQL metadata commit set, DB migration skill generated mirror, Generated local migration validation, Production migration compatibility (+1 more)

### Community 215 - "Root TypeScript Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, paths, types, files, @contracts/*, @db/*, references

### Community 217 - "Runtime Stream Queue Strategies"
Cohesion: 0.22
Nodes (3): ByteLengthQueuingStrategy, CountQueuingStrategy, QueuingStrategy

### Community 224 - "Naver Cafe Source Schema"
Cohesion: 0.39
Nodes (7): idx_naver_cafe_sources_enabled, idx_naver_cafe_sources_member_uid, idx_naver_cafe_sources_sort_order, `naver_cafe_sources`, uidx_naver_cafe_sources_cafe_menu, `__new_naver_cafe_posts`, `__new_naver_cafe_source_checks`

### Community 225 - "X Collection Usage Schema"
Cohesion: 0.39
Nodes (7): idx_x_api_usage_events_created_at, idx_x_api_usage_events_operation, idx_x_collection_runs_started_at, idx_x_collection_runs_status, idx_x_posts_hidden_at, `x_api_usage_events`, `x_collection_runs`

### Community 226 - "AI Review Execution Schema"
Cohesion: 0.46
Nodes (7): idx_music_ai_review_attempts_started, idx_music_ai_reviews_recovery, idx_music_ai_reviews_target, `music_ai_review_attempts`, `music_ai_review_requests`, `music_ai_reviews`, uidx_music_ai_reviews_active

### Community 233 - "Pending Approval Rollback Tests"
Cohesion: 0.25
Nodes (3): actor, options, TEST_SCHEMA

### Community 234 - "Clean Architecture Boundaries"
Cohesion: 0.29
Nodes (7): Architecture verification, OTW clean architecture rules, Frontend capability boundary, Shared wire contracts, TanStack Query server state, Worker composition root, Worker dependency inversion

### Community 235 - "Member Post Retention Policy"
Cohesion: 0.33
Nodes (7): 멤버 게시물 저장·운영 이력 정책, Forward-only member post collection, Permanent member post storage, X API 최소화·조건부 30분 수집 설계 및 구현 Closeout, X API cost minimization contract, X 멤버 신규 피드·영구 아카이브 설계, X forward feed and permanent archive

### Community 236 - "Admin Audit Index Schema"
Cohesion: 0.52
Nodes (6): `admin_audit_logs`, idx_admin_audit_logs_actor_created_at, idx_admin_audit_logs_created_at, idx_admin_audit_logs_event_created_at, idx_admin_audit_logs_resource_created_at, idx_admin_audit_logs_status_created_at

### Community 237 - "Music Layout Regression Tests"
Cohesion: 0.29
Nodes (4): catalogResult, mocks, song, TestIntersectionObserver

### Community 242 - "API Delivery Touchpoints"
Cohesion: 0.33
Nodes (6): Worker API contract touchpoints, Exact route registry, Frontend consumer ownership, Platform authentication and audit, Local development compatibility workflow, Local D1 bootstrap

### Community 243 - "Settings Contract Regression Tests"
Cohesion: 0.40
Nodes (5): DEFAULT_AUTO_UPDATE_INTERVAL_HOURS, DEFAULT_X_COLLECTION_INTERVAL_HOURS, isAutoUpdateIntervalHours(), isOtwPlaySubmissionDailyLimitValue(), normalizeOtwPlaySubmissionDailyLimit()

### Community 244 - "Documented System Architecture"
Cohesion: 0.33
Nodes (6): OTW Schedule 아키텍처, Frontend capability boundaries, Hourly approved clip-channel polling, GET and command separation, Schedule and pending transaction integrity, Worker clean architecture

### Community 245 - "Music Catalog Screen Concept"
Cohesion: 0.33
Nodes (6): All, original, official cover, member and detailed filters, OTW Play catalog screen concept, Schedule sidebar and Discover, Catalog, Members navigation, Now-playing sidebar with seek, playback and queue controls, Search songs, original artists and participants, Song-level catalog with expandable vocal versions

### Community 246 - "Music Discovery Screen Concept"
Cohesion: 0.33
Nodes (6): OTW Play discover screen concept, More music list with individual play and queue actions, Schedule sidebar and Discover, Catalog, Members navigation, Now-playing sidebar with seek, playback and queue controls, Recent music release hero with version playback and song details, Search songs, original artists and participants

### Community 247 - "Member Music Screen Concept"
Cohesion: 0.33
Nodes (6): All, original and official cover filters, OTW Play members screen concept, Avatar strip selects a member, Selected member main-vocal song list, Now-playing sidebar with seek, playback and queue controls, Search songs, original artists and participants

### Community 248 - "X Post Storage Schema"
Cohesion: 0.47
Nodes (5): idx_x_posts_handle_created_at, idx_x_posts_user_id, `x_post_sources`, `x_posts`, idx_x_posts_handle_hidden_created

### Community 249 - "Schedule Rejection History Schema"
Cohesion: 0.60
Nodes (5): idx_schedule_candidate_rejections_member_date, idx_schedule_candidate_rejections_reason_rejected, idx_schedule_candidate_rejections_rejected_at, `schedule_candidate_rejections`, uidx_schedule_candidate_rejections_vod_id

### Community 250 - "User Playlist Storage Schema"
Cohesion: 0.60
Nodes (5): idx_music_playlists_owner_updated, `music_playlist_items`, `music_playlists`, uq_music_playlist_items_position, uq_music_playlists_owner_request

### Community 251 - "Bing Hayu Profile Identity"
Cohesion: 0.33
Nodes (6): bing_hayu filename label, bing_hayu profile illustration, Anime portrait with blue hair, pink streak and flower choker, bing_hayu filename label, bing_hayu signature graphic, White handwritten signature with large looping B

### Community 252 - "Hane Profile Identity"
Cohesion: 0.33
Nodes (6): hane filename label, hane profile illustration, Anime portrait with teal braids, rounded ear accessories and collared outfit, hane filename label, hane signature graphic, White handwritten Korean lettering with heart and sparkles

### Community 253 - "Kim Ate Profile Identity"
Cohesion: 0.33
Nodes (6): kim_ate filename label, kim_ate profile illustration, Anime portrait with blonde hair, yellow outfit and headset microphone, kim_ate filename label, kim_ate signature graphic, White looping handwritten mark with heart and radiating accents

### Community 254 - "Kurenai Natsuki Profile Identity"
Cohesion: 0.33
Nodes (6): kurenai_natsuki filename label, kurenai_natsuki profile illustration, Anime portrait with red hair, horn and pale blue flowers, kurenai_natsuki filename label, kurenai_natsuki signature graphic, White angular signature with crescent, stars and KURENAI NATSUKI lettering

### Community 255 - "On Haru Profile Identity"
Cohesion: 0.33
Nodes (6): on_haru filename label, on_haru profile illustration, Anime portrait with gray hair, magenta eyes and black tie, on_haru filename label, on_haru signature graphic, White sweeping cursive signature with heart accent

### Community 256 - "Terri Nunna Profile Identity"
Cohesion: 0.33
Nodes (6): terri_nunna filename label, terri_nunna signature graphic, White cursive signature with smiling face and heart, terri_nunna filename label, terri_nunna profile illustration, Anime portrait with white braided hair, blue eyes and floral accessories

### Community 257 - "U Lili Profile Identity"
Cohesion: 0.33
Nodes (6): u_lili filename label, u_lili signature graphic, White cursive signature with cat face and bow, u_lili filename label, u_lili profile illustration, Anime portrait with silver hair, cyan eyes and blue bows

### Community 258 - "Yang Mei Profile Identity"
Cohesion: 0.33
Nodes (6): yang_mei filename label, yang_mei signature graphic, White looping signature with leaf and hearts, yang_mei filename label, yang_mei profile illustration, Anime portrait with long lime-green hair, green eyes and white outfit

### Community 259 - "Profile Background Image Optimization"
Cohesion: 0.33
Nodes (5): files, outputDir, projectRoot, sourceDir, widths

### Community 260 - "Play Button Animation Feedback"
Cohesion: 0.47
Nodes (4): animate, cancel, Example(), useButtonFeedback()

### Community 272 - "Anniversary Type Schema Migration"
Cohesion: 0.50
Nodes (4): `ddays`, `ddays_new`, idx_ddays_date, idx_ddays_date_new

### Community 273 - "Shared UI Ownership Audit"
Cohesion: 0.40
Nodes (5): UI 컴포넌트 인벤토리, Static UI component ownership inventory, 전체 UI 통합 검증 기록, Shared interaction and dirty navigation guard, Shared QueryState semantics

### Community 274 - "YouTube Warmup Audit Schema"
Cohesion: 0.70
Nodes (4): idx_youtube_warmup_runs_source, idx_youtube_warmup_runs_started_at, idx_youtube_warmup_runs_status, `youtube_warmup_runs`

### Community 277 - "Runtime Disposable Connection Handles"
Cohesion: 0.40
Nodes (3): Disposable, HyperdriveDynamic, StubBase

### Community 296 - "Contract Focused Testing Guidance"
Cohesion: 0.50
Nodes (4): Contract-centered test audit, 요구사항 중심 테스트 검토 — 2026-09-15, 테스트 실행과 유지보수, Unit and isolated Worker integration tests

### Community 297 - "X API Cache Schema"
Cohesion: 0.83
Nodes (3): idx_x_api_cache_expires_at, idx_x_api_cache_type, `x_api_cache`

### Community 298 - "Broadcast Observation Storage Schema"
Cohesion: 0.83
Nodes (3): idx_schedule_broadcast_observations_last_seen, idx_schedule_broadcast_observations_member_started, `schedule_broadcast_observations`

### Community 323 - "Generated API Touchpoint Guidance"
Cohesion: 0.67
Nodes (3): API consumer contract, Worker API Change Touchpoints, Worker route manifest

### Community 324 - "Repository Agent Configuration"
Cohesion: 0.67
Nodes (3): Canonical .agent policy, Agent Configuration for OTW Schedule, Web app and Worker scope

### Community 325 - "Playlist and Schedule Design QA"
Cohesion: 0.67
Nodes (3): Playlist card design QA, Playlist card QA, Schedule poster QA

### Community 326 - "Layered Response Cache Policy"
Cohesion: 0.67
Nodes (3): Browser Worker D1 and HTTP caches, 프론트/Worker/D1 캐시 정책, Private response no-store

### Community 327 - "Bundled Font Consistency"
Cohesion: 0.67
Nodes (3): Inter and Pretendard bundled fonts, SUL-11: 폰트 일관성 개선 결과, Snapshot font readiness and fallback

### Community 328 - "Backend Cost Observation Report"
Cohesion: 0.67
Nodes (3): 백엔드 비용 최적화 7일 최종 관측 보고서, Seven-day Outbox cost observation, Read-only operational cost verification

### Community 329 - "Scheduled Jobs Operations"
Cohesion: 0.67
Nodes (3): Scheduled jobs v2 운영 전환, Lane rollout flags, Scheduled jobs v2

### Community 330 - "Catalog Ingestion Lifecycle Research"
Cohesion: 0.67
Nodes (3): Playlist bulk candidate ingestion, OTW Play 카탈로그 벌크 수집·제안 수정/철회 조사 보고서, Member proposal edit and withdrawal

### Community 331 - "Play Release Review Evidence"
Cohesion: 0.67
Nodes (3): OTW Play 구현 코드 검토 — 2026-09-15, Migration and AI Queue preparation readback, 2026-09-15 Play release review

### Community 335 - "Play Wall Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play wall logo exploration, Coral arc ending in a play triangle above a teal bar

### Community 336 - "Play Heart Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play heart logo exploration, Open coral heart with teal segment and central play-shaped negative space

### Community 337 - "Play Record Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play record logo exploration, Teal broken concentric record rings with coral center

### Community 338 - "Play Lightstick Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play lightstick logo exploration, Orange lightstick outline with coral heart and teal handle

### Community 339 - "Play Listening Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play listening logo exploration, Teal face profile wearing orange headphones with coral shoulder

### Community 340 - "Play Cassette Logo Concept"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play cassette logo exploration, Coral cassette outline with orange reels and teal bottom detail

### Community 341 - "Play Eighth Note Logo"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play eighth-note logo exploration, Eighth-note outline with teal head, coral stem and orange flag

### Community 342 - "Play Beamed Notes Logo"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play beamed-notes logo exploration, Paired notes with teal heads, coral stems and orange beam

### Community 343 - "Play Note Button Logo"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play note-play logo exploration, Teal note stem, coral circular play button and orange accent

### Community 344 - "Refined Play Note Logo"
Cohesion: 0.67
Nodes (3): OTW Play logo exploration, OTW Play refined note-play logo exploration, Thin teal note outline with coral ring and outlined play triangle

### Community 346 - "Play Glass Note Illustration"
Cohesion: 0.67
Nodes (3): OTW Play glass-note illustration, Music identity illustration, Glossy coral musical note with teal orbital ring and orange sphere

### Community 347 - "OTW Vector Wordmark"
Cohesion: 0.67
Nodes (3): OTW, OTW vector wordmark, Teal, coral and orange OTW lettering with star-shaped cutouts

### Community 348 - "Otono Sori Profile Identity"
Cohesion: 0.67
Nodes (3): otono_sori filename label, otono_sori profile illustration, Anime portrait with dark green braids, green eyes and green jacket

### Community 349 - "CHZZK Platform Icon"
Cohesion: 0.67
Nodes (3): CHZZK platform icon, CHZZK, Bright green angular lightning-like symbol

### Community 350 - "Naver Cafe Platform Icon"
Cohesion: 0.67
Nodes (3): Naver Cafe platform icon, Naver Cafe, Green cup with a leaf above it

### Community 351 - "TwitCasting Platform Icon"
Cohesion: 0.67
Nodes (3): TwitCasting platform icon, TwitCasting, White speech bubble and TC letters on cyan rounded square

### Community 352 - "X Platform Icon"
Cohesion: 0.67
Nodes (3): X platform icon, X, White X on black circle

### Community 353 - "YouTube Platform Icon"
Cohesion: 0.67
Nodes (3): YouTube platform icon, YouTube, White play triangle on red rounded rectangle

### Community 354 - "YouTube Shorts Platform Icon"
Cohesion: 0.67
Nodes (3): YouTube Shorts platform icon, YouTube Shorts, White play triangle on red stylized Shorts symbol

### Community 355 - "Hi Blueming Group Wordmark"
Cohesion: 0.67
Nodes (3): Hi-Blueming, Hi-Blueming group wordmark, Pastel blue, yellow and green lettering with pink Hi speech bubble

### Community 356 - "Luvdia Group Wordmark"
Cohesion: 0.67
Nodes (3): Luvdia, Luvdia group wordmark, White slanted Luvdia lettering inside a vivid pink heart with star

### Community 357 - "Stardays Group Wordmark"
Cohesion: 0.67
Nodes (3): Stardays, Stardays group wordmark, Purple Korean and English Stardays lettering with orbit and stars

### Community 359 - "Runtime Image Transform Options"
Cohesion: 0.67
Nodes (3): BasicImageTransformations, RequestInitCfPropertiesImage, RequestInitCfPropertiesImageDraw

### Community 372 - "Request Cache Variation Headers"
Cohesion: 0.67
Nodes (3): RequestInitCfPropertiesVaryAcceptHeader, RequestInitCfPropertiesVaryAcceptLanguageHeader, RequestInitCfPropertiesVaryHeader

## Knowledge Gaps
- **2989 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+2984 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 4371 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **225 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `Frontend Query Testing` to `React Administrative Forms`, `Application Route Tree`, `Shared UI Composition`, `Scheduled Queue Execution`, `X API Collection Client`, `Query Keys and Routes`, `Play Catalog Administration`, `Member Contracts and Fixtures`, `Administrative Workflow Screens`, `Site SEO Resolution`, `Schedule Cards and Timelines`, `Operational Status Aggregation`, `Play Playlist Application`, `Play Catalog Command Services`, `Public Catalog Database Queries`, `Worker Runtime Composition`, `Automatic Schedule Updates`, `Schedule Configuration Interface`, `Play Source Health`, `Member Submission Persistence`, `YouTube Application Contracts`, `Worker Authorization Boundaries`, `Catalog Transaction Persistence`, `X Posts Application`, `Playlist Editing Interface`, `Public Catalog Search Semantics`, `Naver Cafe Application`, `Play Release Publication`, `Member Post Feed Reading`, `Public Music Catalog Views`, `Notice Management Interface`, `Scheduled Workflow Coordination`, `Naver Cafe Collection`, `Public Catalog Queries`, `Operations Dashboard Interface`, `Member Profile Interface`, `CHZZK Media Queries`, `Administrative Console Navigation`, `Public Catalog Application`, `YouTube Channel Metadata`, `D1 Diagnostic Tooling`, `Playback Queue State`, `Runtime Events and Audit`, `CHZZK Cached API Client`, `YouTube Feed API`, `Ingestion Processing Services`, `Schedule Command Application`, `Clerk Request Authentication`, `Catalog Review Interface Tests`, `Project Toolchain Configuration`, `YouTube Feed Collection`, `Pending Schedule Approval`, `X Post Frontend Queries`, `Video Archive Presentation`, `X Reference Hydration`, `Admin Catalog Request Validation`, `X Collection and History`, `Channel Monitor Persistence`, `Play Release Telemetry`, `YouTube Embedded Player`, `Ingestion Contracts and Cursors`, `Public Multiview Interface`, `YouTube Stale Cache Refresh`, `Anniversary Backend API`, `Anniversary Schedule Interface`, `Schedule Board Snapshots`, `Channel Monitor Lifecycle`, `YouTube Cache Telemetry`, `X Collection Monitoring Interface`, `External Link Previews`, `Public Navigation and Authentication`, `CHZZK Clip Presentation`, `Notice Publication Visibility`, `X Post Card Rendering`, `Local Development Server`, `R2 Asset Access`, `Snapshot Fonts and Layout`, `Player Queue Controls`, `YouTube Archive Interface`, `Operational Data Retention`, `Broadcast Schedule Matching`, `Pending Schedule Command Validation`, `Ingestion HTTP Validation`, `Submission HTTP Validation`, `Safe Local Database Reset`, `Public Catalog Edge Cache`, `Catalog Pagination Cursors`, `Manual Schedule Auto Update`, `Worker Fetch Orchestration`, `Schedule Board Read Model`, `Schedule Write Persistence`, `D1 Usage Observability`, `CHZZK HTTP Routing`, `AI Review Admin Interface`, `AI Review Application Boundaries`, `YouTube Quota Admission`, `AI Review Result Normalization`, `Drizzle Member and Audit Access`, `CHZZK Infrastructure Composition`, `Admin Audit Log Reading`, `YouTube Cache Analytics`, `Application Theme and Feedback`, `Playlist HTTP Validation`, `Audit Query Contracts`, `Settings Persistence and Auditing`, `Member Submission Interface`, `Member Directory Backend`, `AI Review Database Persistence`, `Play Operational Observability`, `Stored X Feed Tests`, `Safe Local Fixture Seeding`, `Rights and Footer Content`, `Proposal Schema Integrity Tests`, `Schedule Update Audit Logs`, `Notice Backend Regression Tests`, `Broadcast Video Metadata`, `Deployment Environment Guards`, `Exact Worker Route Registry`, `Source Health Database Tests`, `CHZZK Live Status Tests`, `Animated Stepper Interface`, `Member Profile Background Images`, `Channel Monitor Interface Tests`, `Member Submission Form Tests`, `Operations Dashboard Tests`, `YouTube Shorts Pagination`, `Settings Request Validation`, `Featured Notice Banner`, `Music Catalog Constraint Tests`, `Pending Schedule Query Validation`, `Architecture Guard Regression Tests`, `Public Catalog Interface Tests`, `Catalog Write Integration Tests`, `Pending Approval Rollback Tests`, `Music Layout Regression Tests`, `Settings Contract Regression Tests`, `Play Button Animation Feedback`, `Catalog Architecture Constraint Tests`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **Why does `Env` connect `Scheduled Workflow Coordination` to `Playlist HTTP Validation`, `Scheduled Queue Execution`, `Settings Persistence and Auditing`, `Member Directory Backend`, `Notice HTTP Validation`, `Site SEO Resolution`, `Operational Status Aggregation`, `Play Catalog Command Services`, `Worker Runtime Composition`, `Automatic Schedule Updates`, `Member Submission Persistence`, `Schedule Update Audit Logs`, `Worker Authorization Boundaries`, `Notice Backend Regression Tests`, `X Posts Application`, `YouTube Application Contracts`, `Naver Cafe Application`, `Play Release Publication`, `Member Post Feed Reading`, `Exact Worker Route Registry`, `CHZZK Live Status Tests`, `Naver Cafe Collection`, `Public Catalog Application`, `YouTube Channel Metadata`, `YouTube Feed API`, `Ingestion Processing Services`, `Schedule Command Application`, `Clerk Request Authentication`, `YouTube Feed Collection`, `Settings Request Validation`, `Admin Catalog Request Validation`, `X Collection and History`, `Play Release Telemetry`, `Public Catalog HTTP Responses`, `YouTube Cache Warmup`, `Pending Schedule Query Validation`, `Anniversary Backend API`, `Channel Monitor Lifecycle`, `YouTube Cache Telemetry`, `R2 Asset Access`, `Operational Data Retention`, `Pending Schedule Command Validation`, `Ingestion HTTP Validation`, `Submission HTTP Validation`, `Manual Schedule Auto Update`, `Worker Fetch Orchestration`, `Schedule Board Read Model`, `CHZZK HTTP Routing`, `AI Review Application Boundaries`, `CHZZK Infrastructure Composition`, `Admin Audit Log Reading`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `react` connect `React Administrative Forms` to `Application Theme and Feedback`, `Application Route Tree`, `Frontend Query Testing`, `Shared UI Composition`, `Play Button Animation Feedback`, `Member Submission Interface`, `Query Keys and Routes`, `Play Catalog Administration`, `Member Contracts and Fixtures`, `Administrative Workflow Screens`, `Site SEO Resolution`, `Schedule Cards and Timelines`, `Schedule Configuration Interface`, `Rights and Footer Content`, `YouTube Application Contracts`, `Playlist Editing Interface`, `Public Music Catalog Views`, `Notice Management Interface`, `Public Catalog Queries`, `Operations Dashboard Interface`, `Member Profile Interface`, `CHZZK Media Queries`, `Administrative Console Navigation`, `Animated Stepper Interface`, `Channel Monitor Interface Tests`, `Playback Queue State`, `Member Submission Form Tests`, `Operations Dashboard Tests`, `Catalog Review Interface Tests`, `Project Toolchain Configuration`, `X Post Frontend Queries`, `Video Archive Presentation`, `Featured Notice Banner`, `Public Multiview Interface`, `Anniversary Schedule Interface`, `Schedule Board Snapshots`, `Public Catalog Interface Tests`, `X Collection Monitoring Interface`, `Public Navigation and Authentication`, `CHZZK Clip Presentation`, `Notice Publication Visibility`, `X Post Card Rendering`, `Snapshot Fonts and Layout`, `Player Queue Controls`, `YouTube Archive Interface`, `Music Layout Regression Tests`, `AI Review Admin Interface`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _2989 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cloudflare Runtime Type Definitions` be split into smaller, more focused modules?**
  _Cohesion score 0.0022497187851518562 - nodes in this community are weakly interconnected._
- **Should `Canonical Database Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.010810810810810811 - nodes in this community are weakly interconnected._
- **Should `React Administrative Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.04078613693998309 - nodes in this community are weakly interconnected._