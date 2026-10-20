# PR #176 반영 구조 분석

소스 기준 `b0818c0da5858b888aede8e3cbbf52ca488378f5`. 문서에는 이번 완료 정리의 미커밋 변경이 포함된다. 기존 `d27f26a4` 미커밋 트리 분석은 `archive/2026-10-20-before-pr176/`로 보관했다. 이관 실행부는 현재 구조에 포함하지 않는다.

[구조도](project-structure.html) · [최신 후보 검토](../../architecture-review.md) · [최종 운영 ledger](https://github.com/rlatmfrl24/overthewall-schedule/pull/176#issuecomment-6291519609). 운영 결과는 2026-10-20 22:03 KST 관측이며 새 운영 실행은 하지 않았다.

**비용:** 외부 AI 호출0. 호스트 의미 추출 토큰은 미측정이며 아래 도구 템플릿의0은 측정값이 아니다. **정적 분석 한계:** 그래프의 미해결 참조·자기 참조·병렬 관계 병합은 GRAPH_HEALTH.md를 따른다. 정적 관계는 HTTP/Queue 성공을 증명하지 않는다. 원본 방향 관계는 extraction-evidence.json.gz에 보존한다.

# Graph Report - overthewall-schedule  (2026-10-20)

## Corpus Check
- 1038 files · ~2,026,065 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 8373 nodes · 28655 edges · 272 communities (194 shown, 78 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 633 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b0818c0d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- SQL 변경 이력 · `content_transitions`
- D1 스키마 · index.ts
- SQL 변경 이력 · `music_channels`
- Play 화면·조회 · catalog-manager.tsx
- Play 화면·조회 · react
- 기능별 화면 · youtube-feed-manager.tsx
- Worker 조립·Queue · routes.ts
- 기능별 화면 · apiFetch()
- 플랫폼·내구 상태 · D1ScheduledJobRepository
- 기능별 화면 · utils.ts
- 기능별 업무·어댑터 · http-helpers.ts
- 기능별 업무·어댑터 · youtube.ts
- 기능별 업무·어댑터 · types.ts
- SQL 변경 이력 · `music_cover_proposals`
- 기능별 업무·어댑터 · x-api.ts
- 공유 계약 · otw-play.ts
- Play 화면·조회 · button.tsx
- Play 화면·조회 · member-profile-page.tsx
- Play 저장·조회 · admin-catalog-repository.ts
- 기능별 화면 · auto-update-settings.tsx
- 기능별 업무·어댑터 · publicationHiddenSql()
- 화면 라우팅 · react-router
- 기능별 업무·어댑터 · naver-cafe-collector.ts
- Play 저장·조회 · d1-admin-catalog-repository.ts
- 기능별 화면 · react-query
- 기능별 업무·어댑터 · site-seo.ts
- Play 저장·조회 · WorkQueueRepository
- 공통 UI·API · cn()
- Play 저장·조회 · d1-public-catalog-reader.ts
- Play 저장·조회 · d1-source-health-repository.ts
- Play 저장·조회 · ingestion-service.ts
- Play 저장·조회 · public-catalog-handler.ts
- 기능별 업무·어댑터 · operations-application.ts
- Play 저장·조회 · d1-member-submission-repository.ts
- Play 화면·조회 · index.ts
- Play 저장·조회 · IngestionRepositoryError
- 일정 업무 · index.ts
- 기능별 업무·어댑터 · d1-notice-gateway.ts
- 기능별 업무·어댑터 · x-collection.ts
- SQL 변경 이력 · 0102_content_transition_foundation.sql
- 일정 업무 · schedule-handler.ts
- Play 저장·조회 · D1AiBatchRepository
- Play 저장·조회 · admin-catalog-input.ts
- Play 저장·조회 · PlaylistService
- Play 저장·조회 · D1IngestionRepository
- 공유 계약 · configuration.ts
- 기능별 화면 · x-posts.ts
- 기능별 업무·어댑터 · youtube-feed.ts
- 플랫폼·내구 상태 · auth.ts
- Play 저장·조회 · public-catalog-service.ts
- 설정·빌드 경계 · package.json
- 기능별 업무·어댑터 · x-reference-hydration.ts
- 일정 업무 · commands.ts
- SQL 변경 이력 · `music_cover_proposal_participants`
- Play 저장·조회 · index.ts
- 기능별 업무·어댑터 · d1-member-posts-port.ts
- 개발·릴리스 도구 · d1-doctor.mjs
- Play 저장·조회 · youtube-metadata.ts
- Play 저장·조회 · d1-release-repository.ts
- 기능별 화면 · x-post-history-manager.tsx
- 일정 업무 · pending-command-handler.ts
- 일정 업무 · d1-pending-schedule-query.ts
- 설정·빌드 경계 · scripts
- Play 저장·조회 · AiReviewService
- Play 저장·조회 · commands.ts
- Play 저장·조회 · ai-review-result.ts
- Play 화면·조회 · playlist-editor-page.tsx
- 개발·릴리스 도구 · getSiteTarget()
- 기능별 화면 · dday-manager.tsx
- 설정·빌드 경계 · dependencies
- 개발·릴리스 도구 · site-target.mjs
- Play 저장·조회 · D1WorkQueueRepository
- Play 화면·조회 · play-player-context.tsx
- 일정 업무 · DbInstance
- SQL 변경 이력 · `music_performances`
- 기능별 업무·어댑터 · fetch.ts
- Play 저장·조회 · D1PublicCatalogReader
- 일정 업무 · ScheduleActor
- 기능별 업무·어댑터 · link-preview.ts
- Play 저장·조회 · release-handler.ts
- Play 저장·조회 · member-submission-handler.ts
- 기능별 업무·어댑터 · x-posts-service.ts
- 개발·릴리스 도구 · d1-reset-local.mjs
- 기능별 화면 · x-post-card.tsx
- Play 화면·조회 · OtwPlayYouTubePlayer
- Play 저장·조회 · ingestion-handler.ts
- Play 저장·조회 · d1-ingestion-repository.ts
- 기능별 화면 · multiview-page.tsx
- 일정 업무 · auto-update-matcher.ts
- SQL 변경 이력 · `naver_cafe_posts`
- 기능별 화면 · notice-page.tsx
- Play 화면·조회 · ai-review-panel.tsx
- Play 저장·조회 · playlists.ts
- 일정 업무 · pending-schedule-service.ts
- 기능별 업무·어댑터 · cloudflare-d1-observability-reader.ts
- 기능별 업무·어댑터 · d1-r2-file-store.ts
- 기능별 업무·어댑터 · file-retention.ts
- 제품·운영 문서 · architecture.md
- 기능별 화면 · types.ts
- 기능별 화면 · site-content-metadata.tsx
- 설정·빌드 경계 · devDependencies
- 개발·릴리스 도구 · architecture-check.mjs
- 설정·빌드 경계 · compilerOptions
- 일정 업무 · audit.ts
- 일정 업무 · live-schedule.ts
- SQL 변경 이력 · 0065_otw_play_authority_retention.sql
- 기능별 업무·어댑터 · handler.ts
- 기능별 업무·어댑터 · settings-repository.ts
- 기능별 업무·어댑터 · d1-schedule-board.ts
- 공유 계약 · operations.ts
- Play 저장·조회 · cloudflare-public-catalog-cache.ts
- SQL 변경 이력 · 0068_fixed_amazoness.sql
- 기능별 화면 · notice-manager.tsx
- Play 저장·조회 · public-catalog-cursor.ts
- 기능별 화면 · member-posts-overview.tsx
- 설정·빌드 경계 · components.json
- 설정·빌드 경계 · project-context.md
- 기능별 업무·어댑터 · admin-audit-handler.ts
- 개발·릴리스 도구 · vite.config.ts
- 기능별 화면 · snapshot-fonts.ts
- 설정·빌드 경계 · compilerOptions
- 기능별 업무·어댑터 · d1-protected-asset-reference-resolver.ts
- Play 저장·조회 · playlist-handler.ts
- 설정·빌드 경계 · vitest.worker.config.ts
- 기능별 화면 · index.ts
- 기능별 업무·어댑터 · handler.ts
- SQL 변경 이력 · `music_ingestion_jobs`
- 개발·릴리스 도구 · d1-seed-local.mjs
- 기능별 화면 · audit.ts
- SQL 변경 이력 · `youtube_api_usage_events`
- 기능별 업무·어댑터 · index.ts
- Play 저장·조회 · D1AiReviewRepository
- 제품·운영 문서 · Architecture candidates 01-03 final review an
- 제품·운영 문서 · current-work.md
- 설정·빌드 경계 · README.md
- SQL 변경 이력 · 0071_gifted_romulus.sql
- 개발·릴리스 도구 · upload-profile-backgrounds-to-r2.mjs
- Worker 조립·Queue · route-registry.ts
- 공유 계약 · notices.ts
- 제품·운영 문서 · X member feed and permanent archive design
- 제품·운영 문서 · Scheduled jobs v2 operating transition
- 제품·운영 문서 · OTW Play integrated admin workflow
- 제품·운영 문서 · OTW Play product requirements
- 기능별 화면 · profile-background-images.ts
- 기능별 화면 · notice-banner.tsx
- Play 화면·조회 · use-playlist-hero-transition.ts
- Play 저장·조회 · otw-play-members.ts
- 제품·운영 문서 · channel-upload-polling.md
- SQL 변경 이력 · `naver_cafe_source_checks`
- SQL 변경 이력 · 0075_colorful_layla_miller.sql
- 일정 업무 · manual-auto-update-service.ts
- 제품·운영 문서 · aeo.md
- 제품·운영 문서 · auto-update.md
- 설정·빌드 경계 · compilerOptions
- 기능별 업무·어댑터 · d1-active-handles.ts
- 설정·빌드 경계 · architecture.md
- 공유 계약 · content-history.ts
- 제품·운영 문서 · Retired implementation maintenance contract
- SQL 변경 이력 · 0051_clear_mantis.sql
- SQL 변경 이력 · 0063_youthful_jamie_braddock.sql
- 기능별 화면 · clip-date-groups.ts
- 기능별 화면 · vod-date-groups.ts
- 기능별 업무·어댑터 · settings-audit.ts
- SQL 변경 이력 · 0039_uneven_killmonger.sql
- 설정·빌드 경계 · PRODUCT.md
- 개발·릴리스 도구 · clerk-environment.mjs
- 기능별 화면 · NoticeFormDialog()
- 설정·빌드 경계 · compilerOptions
- SQL 변경 이력 · 0026_first_toro.sql
- 개발·릴리스 도구 · benchmark-otw-play-reads.mjs
- 개발·릴리스 도구 · sync-agent-to-cursor.mjs
- SQL 변경 이력 · 0038_misty_speed_demon.sql
- SQL 변경 이력 · 0079_next_iron_fist.sql
- 화면 라우팅 · OtwPlayPlaylistEditorPage()
- 제품·운영 문서 · cache-policy.md
- SQL 변경 이력 · 0087_burly_midnight.sql
- SQL 변경 이력 · 0137_x-repair-pending.sql
- SQL 변경 이력 · 0144_talented_cassandra_nova.sql
- 설정·빌드 경계 · drizzle.config.ts
- 개발·릴리스 도구 · optimize-profile-backgrounds.mjs
- 기능별 업무·어댑터 · d1-asset-access-reader.ts
- 설정·빌드 경계 · OTW Wrangler static deployment configuration
- 제품·운영 문서 · Change-scoped testing and maintenance
- SQL 변경 이력 · 0005_kind_dday_type.sql
- SQL 변경 이력 · 0037_fast_power_man.sql
- SQL 변경 이력 · 0097_fine_agent_zero.sql
- SQL 변경 이력 · `content_transition_chzzk_children`
- 설정·빌드 경계 · client deployment
- 공유 계약 · isBooleanValue()
- 제품·운영 문서 · OTW Play maintenance and verification guide
- SQL 변경 이력 · 0001_pink_whirlwind.sql
- SQL 변경 이력 · 0029_fat_agent_brand.sql
- SQL 변경 이력 · `music_ingestion_events`
- SQL 변경 이력 · 0062_colorful_magma.sql
- SQL 변경 이력 · 0104_asset_file_recovery.sql
- SQL 변경 이력 · 0111_asset_file_url_identity.sql
- 개발·릴리스 도구 · preflight.mjs
- 개발·릴리스 도구 · provision-ops-queues.mjs
- SQL 변경 이력 · content_transition_json_roots
- Play 저장·조회 · play-automation-settings.ts
- 제품·운영 문서 · drizzle-workflow.md compatibility pointer
- SQL 변경 이력 · 0004_radiant_dday.sql
- SQL 변경 이력 · 0008_reset_ddays.sql
- SQL 변경 이력 · 0016_breezy_norrin_radd.sql
- SQL 변경 이력 · 0106_asset_file_cleanup.sql
- SQL 변경 이력 · `content_transition_file_inventories`
- SQL 변경 이력 · `content_transition_chzzk_requests`
- 화면 라우팅 · index.tsx
- 화면 라우팅 · notice.tsx
- 화면 라우팅 · $playlistKey.tsx
- 화면 라우팅 · vods.tsx
- 기능별 업무·어댑터 · CloudflareD1ObservabilityReader
- SQL 변경 이력 · 0003_volatile_smiling_tiger.sql
- SQL 변경 이력 · 0012_flimsy_millenium_guard.sql
- SQL 변경 이력 · idx_x_post_references_author_due
- SQL 변경 이력 · 0095_otw-play-ready-search-backfill.sql
- SQL 변경 이력 · idx_youtube_feed_videos_available_fetched
- SQL 변경 이력 · 0148_soft_power_pack.sql
- 개발·릴리스 도구 · clerk-environment.d.mts
- 설정·빌드 경계 · vite-env.d.ts
- 설정·빌드 경계 · `ddays`
- 개발·릴리스 도구 · CLERK_ENVIRONMENT_TARGETS
- 개발·릴리스 도구 · DEFAULT_LOCAL_DEV_PORT
- 개발·릴리스 도구 · LOCAL_DEV_HOST
- 개발·릴리스 도구 · STATIC_ASSET_MANIFEST_PATH

## God Nodes (most connected - your core abstractions)
1. `cn()` - 232 edges
2. ``content_transitions`` - 204 edges
3. `react` - 184 edges
4. ``members`` - 153 edges
5. `apiFetch()` - 134 edges
6. `publicationHiddenSql()` - 129 edges
7. ``music_entities`` - 120 edges
8. ``music_cover_proposals`` - 112 edges
9. `SiteId` - 111 edges
10. ``music_performances`` - 105 edges

## Surprising Connections (you probably didn't know these)
- `Static LuvDia isolated Queue names and generic Workflow` --semantically_similar_to--> `Static OTW Queue and ScheduledOperationsWorkflow bindings`  [INFERRED] [semantically similar]
  wrangler.luvdia.jsonc → wrangler.jsonc
- `createEmptyPolicy()` --calls--> `withRouteSearch()`  [EXTRACTED]
  src/features/member-posts/queries/use-member-posts.ts → contracts/api-routes.ts
- `KirinukiSectionProps` --references--> `MemberDto`  [EXTRACTED]
  src/features/youtube/ui/kirinuki-section.tsx → contracts/members.ts
- `YouTubeSectionProps` --references--> `MemberDto`  [EXTRACTED]
  src/features/youtube/ui/youtube-section.tsx → contracts/members.ts
- `fetchAdminAuditLogs()` --calls--> `withRouteSearch()`  [EXTRACTED]
  src/features/audit/api/audit.ts → contracts/api-routes.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **PR176 admin catalog persistence and replay flow** — docs_architecture_pr176_existing_owner_remediation, docs_architecture_admin_catalog_query, docs_architecture_catalog_repository, docs_architecture_admin_catalog_service, docs_architecture_atomic_command_receipt, docs_architecture_intent_key_conflict_review [EXTRACTED 1.00]
- **Normal scheduled auto-update phase flow** — docs_architecture_scheduled_run_client, docs_architecture_scheduled_coordinator, docs_architecture_background_item_claim, docs_architecture_auto_update_scan, docs_architecture_auto_update_atomic_plan, docs_architecture_auto_update_match, docs_architecture_auto_update_finalize, docs_architecture_scheduled_job_repository [EXTRACTED 1.00]
- **Dated two-site closeout with pause preserved and explicit limits** — docs_architecture_review_otw_runtime_observation_20261020, docs_architecture_review_luvdia_runtime_observation_20261020, docs_architecture_review_observed_pause_ai_preservation, docs_architecture_review_operational_verification_limits [EXTRACTED 1.00]
- **PR176 targeted candidates01/02/03** — docs_architecture_review_pr176, docs_architecture_review_candidate01_atomic_command_receipts, docs_architecture_review_candidate02_admin_catalog_ownership, docs_architecture_review_candidate03_atomic_schedule_phases [EXTRACTED 1.00]
- **Current docs-only authority with automation pause and preservation** — docs_current_work_current_docs_only_scope, docs_current_work_preserve_workspace_runtime, docs_current_work_automation_ai_bulk_pause, docs_current_work_remaining_verification_limits [EXTRACTED 1.00]
- **Documented primary scheduled delivery flow, not runtime observation** — docs_operations_scheduled_jobs_v2_cron_bridge, docs_operations_scheduled_jobs_v2_scheduled_operations_workflow, docs_operations_scheduled_jobs_v2_d1_run_item_outbox_authority, docs_operations_scheduled_jobs_v2_queue_lease_cas [EXTRACTED 1.00]

## Communities (272 total, 78 thin omitted)

### Community 0 - "SQL 변경 이력 · `content_transitions`"
Cohesion: 0.03
Nodes (254): content_transition_selected_roots_level0_0, `members`, idx_members_code, idx_member_links_member_sort, idx_member_links_member_uid, idx_member_profile_images_member_sort, idx_member_profile_images_member_uid, `member_links` (+246 more)

### Community 1 - "D1 스키마 · index.ts"
Cohesion: 0.01
Nodes (226): AdminAuditLog, assetFileCleanup, assetFileReferencePaths, assetFileRetentionReleases, assetFileVersions, AutoUpdateRun, ChzzkApiCache, contentHistoricalLinks (+218 more)

### Community 2 - "SQL 변경 이력 · `music_channels`"
Cohesion: 0.07
Nodes (195): idx_schedules_date, `schedules`, `settings`, `update_logs`, `kirinuki_channels`, idx_pending_schedules_created_at, idx_pending_schedules_member_date_time, idx_pending_schedules_vod_id (+187 more)

### Community 3 - "Play 화면·조회 · catalog-manager.tsx"
Cohesion: 0.03
Nodes (168): AdminSettingsDto, aiBatchStatusLabels, OtwPlayAdminCatalogDto, OtwPlayAdminReleaseReadResponse, OtwPlayChannelRole, OtwPlayReleaseType, OtwPlayReviewFilters, OtwPlayReviewItemDto (+160 more)

### Community 4 - "Play 화면·조회 · react"
Cohesion: 0.04
Nodes (135): AiReviewFields, OtwPlayBroadcastMetadata, OtwPlayParticipantRole, OtwPlayParticipationType, OtwPlayRelationType, react, react-hook-form, ACTION_BADGE_VARIANTS (+127 more)

### Community 5 - "기능별 화면 · youtube-feed-manager.tsx"
Cohesion: 0.03
Nodes (129): NaverCafePostDto, NaverCafePostsConfigResponseDto, NaverCafePostsResponseDto, NaverCafePostsVisibility, NaverCafeSourceDto, NaverCafeSourcePayloadDto, NaverCafeSourceStatusDto, recharts (+121 more)

### Community 6 - "Worker 조립·Queue · routes.ts"
Cohesion: 0.03
Nodes (114): getSiteDefinition(), parseSiteId(), parseSiteStorageResources(), executeProfileBackgroundUpload(), createOtwPlayAdminCatalogService(), createOtwPlayAiBatchService(), createOtwPlayAiReviewService(), buildAssetFileStore() (+106 more)

### Community 7 - "기능별 화면 · apiFetch()"
Cohesion: 0.03
Nodes (112): apiRoutes, ExactRoutePath, ExactRoutePattern, withRouteSearch(), MemberDto, MemberProfileBackgroundImageDto, MemberProfileImageDto, MemberProfileLinkDto (+104 more)

### Community 8 - "플랫폼·내구 상태 · D1ScheduledJobRepository"
Cohesion: 0.03
Nodes (82): D1ReadBudgetDto, CreateOperationRunRequestDto, isRetiredScheduledJob(), isScheduledControlQueueMessage(), isScheduledJobQueueMessage(), isScheduledJobType(), OperationJobHealth, OperationRunAcceptedDto (+74 more)

### Community 9 - "기능별 화면 · utils.ts"
Cohesion: 0.04
Nodes (109): ChzzkLiveStatusMap, ScheduleStatus, date-fns, buildChzzkLiveUrl(), convertChzzkToLiveUrl(), getCurrentMemberAffiliation(), Member, MemberFilter() (+101 more)

### Community 10 - "기능별 업무·어댑터 · http-helpers.ts"
Cohesion: 0.04
Nodes (109): isSettingsKey(), isWritableSettingsKey(), parseSettingsUpdatePayload(), isScheduledJobStatus(), adminAuditLogs, getNoticeThumbnailExtension(), CHZZK_MAX_CHANNEL_IDS, ChzzkChannelTargetParseResult (+101 more)

### Community 11 - "기능별 업무·어댑터 · youtube.ts"
Cohesion: 0.03
Nodes (91): isYouTubeApiDailyQuotaUnitsValue(), OperationRunDto, CreateKirinukiChannelDto, KirinukiChannelDto, KirinukiVideosResponseDto, UpdateKirinukiChannelDto, YouTubeFeedChannelDto, YouTubeFeedRole (+83 more)

### Community 12 - "기능별 업무·어댑터 · types.ts"
Cohesion: 0.03
Nodes (102): ChzzkClipDto, ChzzkClipsBatchResponseDto, ChzzkClipsResponseDto, ChzzkHistoryDto, ChzzkLiveContentDto, ChzzkLiveStatusDebugDto, ChzzkLiveStatusDebugItemDto, ChzzkLiveStatusItemDto (+94 more)

### Community 13 - "SQL 변경 이력 · `music_cover_proposals`"
Cohesion: 0.07
Nodes (104): `notices`, `pending_schedules`, uidx_pending_schedules_member_date_time, uidx_pending_schedules_vod_id, idx_x_api_cache_expires_at, idx_x_api_cache_type, `x_api_cache`, idx_x_posts_handle_created_at (+96 more)

### Community 14 - "기능별 업무·어댑터 · x-api.ts"
Cohesion: 0.04
Nodes (117): buildResult(), buildXPostUrl(), CachedXPostsEntry, CachedXPostsWriteEntry, CachedXUser, collectLinkedXStatusIds(), collectXErrorMessages(), collectXPostsForHandles() (+109 more)

### Community 15 - "공유 계약 · otw-play.ts"
Cohesion: 0.02
Nodes (105): OTW_PLAY_ADMIN_ERROR_CODES, OTW_PLAY_CATALOG_EVENT_ACTOR_KINDS, OTW_PLAY_CATALOG_SORTS, OTW_PLAY_CHANNEL_MONITOR_STATUSES, OTW_PLAY_CHANNEL_POLL_CRON_MINUTE, OTW_PLAY_CHANNEL_POLL_INTERVAL_MINUTES, OTW_PLAY_CHANNEL_ROLES, OTW_PLAY_CHANNEL_VERIFICATION_STATUSES (+97 more)

### Community 16 - "Play 화면·조회 · button.tsx"
Cohesion: 0.05
Nodes (71): OtwPlayPublicParticipantDto, OtwPlayPublicSongSummaryDto, @clerk/clerk-react, lucide-react, ModeToggle(), THEME_OPTIONS, useTheme(), fetchMemberProfile() (+63 more)

### Community 17 - "Play 화면·조회 · member-profile-page.tsx"
Cohesion: 0.03
Nodes (74): ProtectedAssetReferenceContext, ProtectedAssetReferenceResponse, OtwPlaySubmissionKind, PublicUserMenu(), VodsGridSkeleton(), BackgroundSwipeState, formatProfileDate(), getProfileSignatureImageSrc() (+66 more)

### Community 18 - "Play 저장·조회 · admin-catalog-repository.ts"
Cohesion: 0.06
Nodes (39): OtwPlayAdminApproveProposalRequest, OtwPlayAdminCatalogEntryPreflightDto, OtwPlayAdminCatalogEntryPreflightRequest, OtwPlayAdminCatalogEntryResultDto, OtwPlayAdminChannelDto, OtwPlayAdminCommandResponse, OtwPlayAdminCreateCatalogEntryRequest, OtwPlayAdminCreateEntityRequest (+31 more)

### Community 19 - "기능별 화면 · auto-update-settings.tsx"
Cohesion: 0.04
Nodes (94): isAutoUpdateIntervalHours(), isXCollectionIntervalHours(), scheduledJobStatuses, REJECTION_REASON_OPTIONS, AUTO_UPDATE_TABS, AutoUpdateKpi(), AutoUpdateSettingsManager(), DiffCell() (+86 more)

### Community 20 - "기능별 업무·어댑터 · publicationHiddenSql()"
Cohesion: 0.04
Nodes (57): normalizeAdminSettings(), SCHEDULE_MEMBER_END, definitions, SiteId, SiteContentItem, ContentAccess, getHiddenMemberCodes(), SITE_OPENS_AT (+49 more)

### Community 21 - "화면 라우팅 · react-router"
Cohesion: 0.03
Nodes (62): @tanstack/react-router, AdminLayout(), ConsoleArea, ConsoleScreen(), tabs, RootNotFound(), RootRouteError(), Footer() (+54 more)

### Community 22 - "기능별 업무·어댑터 · naver-cafe-collector.ts"
Cohesion: 0.04
Nodes (78): naverCafePosts, NaverCafeSource, NaverCafeActor, NaverCafeApplication, NaverCafePostsContent, NaverCafeSourcePayload, NaverCafeSourceRecord, NaverCafeVisibility (+70 more)

### Community 23 - "Play 저장·조회 · d1-admin-catalog-repository.ts"
Cohesion: 0.06
Nodes (59): OtwPlayAdminPerformanceSourceInput, OtwPlayChannelVerificationStatus, normalizeOtwPlaySearchText(), isPublicationCutoffSqlError(), AdminCatalogRepositoryError, AdminCatalogRequest, AdminCatalogScope, AdminCreateCatalogEntryCommand (+51 more)

### Community 24 - "기능별 화면 · react-query"
Cohesion: 0.05
Nodes (70): OtwPlayIngestionReviewCandidateDto, YouTubeVideoDto, YouTubeVideosResponseDto, @tanstack/react-query, fetchChzzkHistory(), ChzzkHistory(), CompositeTabIcon(), CompositeTabIconProps (+62 more)

### Community 25 - "기능별 업무·어댑터 · site-seo.ts"
Cohesion: 0.08
Nodes (44): MemberProfileDto, requireSiteOrigin(), SiteDefinition, kstDate(), safeSiteContentUrl(), scheduleRange(), SiteContentSection, SitePublicContent (+36 more)

### Community 26 - "Play 저장·조회 · WorkQueueRepository"
Cohesion: 0.06
Nodes (23): AiBatchItemStatus, isAiBatchPending(), PlayWorkBatch, PlayWorkBatchStatus, PlayWorkCommand, PlayWorkDisposition, PlayWorkItem, PlayWorkOutcome (+15 more)

### Community 27 - "공통 UI·API · cn()"
Cohesion: 0.05
Nodes (67): class-variance-authority, @radix-ui/react-dialog, react-icons, AdminLayoutProps, SIDEBAR_SECTIONS, SidebarItem, SidebarSection, AppChromeMode (+59 more)

### Community 28 - "Play 저장·조회 · d1-public-catalog-reader.ts"
Cohesion: 0.05
Nodes (72): OtwPlaySourceRole, PublicCatalogEntity, PublicCatalogFacetGroup, PublicCatalogFacetMember, PublicCatalogFacets, PublicCatalogMemberIdentity, PublicCatalogOriginalArtist, PublicCatalogParticipant (+64 more)

### Community 29 - "Play 저장·조회 · d1-source-health-repository.ts"
Cohesion: 0.06
Nodes (52): OTW_PLAY_SOURCE_HEALTH_RETRY_CODES, OtwPlayAdminRecheckSourceRequest, OtwPlayAdminSourceDto, OtwPlayAdminSourceHealthDto, OtwPlayAdminSourceHealthItemDto, OtwPlaySourceHealthEventType, OtwPlaySourceHealthRetryCode, PlayTelemetryEventName (+44 more)

### Community 30 - "Play 저장·조회 · ingestion-service.ts"
Cohesion: 0.06
Nodes (21): OtwPlayConvertIngestionCandidateRequest, OtwPlayConvertIngestionCandidatesRequest, OtwPlayIgnoreIngestionCandidatesRequest, OtwPlayIngestionBudgetDto, OtwPlayIngestionConversionOutcome, OtwPlayIngestionConversionResultDto, OtwPlayIngestionJobDto, OtwPlayPlaylistPreflightRequest (+13 more)

### Community 31 - "Play 저장·조회 · public-catalog-handler.ts"
Cohesion: 0.05
Nodes (73): OtwPlayPublicCatalogDto, OtwPlayPublicConfigDto, OtwPlayPublicCreditDto, OtwPlayPublicEnvelope, OtwPlayPublicErrorCode, OtwPlayPublicFacetsDto, OtwPlayPublicSongDetailDto, allowed (+65 more)

### Community 32 - "기능별 업무·어댑터 · operations-application.ts"
Cohesion: 0.04
Nodes (56): normalizeAutoUpdateIntervalHours(), normalizeXCollectionIntervalHours(), parseAutoUpdateIntervalHours(), parseXCollectionIntervalHours(), OperationsActor, OperationsApplication, addStaleIssue(), addUsageToAggregate() (+48 more)

### Community 33 - "Play 저장·조회 · d1-member-submission-repository.ts"
Cohesion: 0.07
Nodes (34): OtwPlayCreateSubmissionRequest, OtwPlayMemberSubmissionDto, OtwPlayMemberSubmissionPageDto, OtwPlayMemberSubmissionStatus, OtwPlaySubmissionArtistDto, OtwPlaySubmissionPreflightDto, OtwPlaySubmissionPreflightRequest, OtwPlaySubmissionSubjectInput (+26 more)

### Community 34 - "Play 화면·조회 · index.ts"
Cohesion: 0.05
Nodes (52): OtwPlayMemberSongbookDto, OtwPlayMemberSongbookQuery, OtwPlayPublicCatalogQuery, appendOptional(), compareMemberValues(), fetchOtwPlayCatalog(), fetchOtwPlayConfig(), fetchOtwPlayFacets() (+44 more)

### Community 35 - "Play 저장·조회 · IngestionRepositoryError"
Cohesion: 0.08
Nodes (12): OtwPlayChannelMonitorDto, OtwPlayChannelMonitorReconcileDto, ChannelMonitorService, ChannelMonitorRepository, IngestionRepositoryError, OtwPlayYouTubeIngestionReader, nextChannelPollAt(), D1ChannelMonitorRepository (+4 more)

### Community 36 - "일정 업무 · index.ts"
Cohesion: 0.08
Nodes (56): ChzzkScanCommand, pendingSchedules, scheduleBroadcastObservations, buildLiveScheduleWriter(), editableCollectorSql(), commitPublicationBatch(), buildBroadcastSessions(), CollectorCommand (+48 more)

### Community 37 - "기능별 업무·어댑터 · d1-notice-gateway.ts"
Cohesion: 0.06
Nodes (24): MAX_NOTICE_IMAGES, MAX_NOTICE_LINKS, NoticeUseCases, NoticeGateway, NoticeMutationResult, NoticeThumbnailCleanupResult, NoticeThumbnailDeleteResult, NoticeThumbnailUploadInput (+16 more)

### Community 38 - "기능별 업무·어댑터 · x-collection.ts"
Cohesion: 0.06
Nodes (54): XHistoryPostDto, createXPostsApplication(), XPostFeedError, extractXHandleFromUrl(), fetchXPostPreviewById(), readStoredXReplyReference(), redactStoredXPosts(), claimXSourceLeases() (+46 more)

### Community 39 - "SQL 변경 이력 · 0102_content_transition_foundation.sql"
Cohesion: 0.05
Nodes (61): `content_historical_links`, `content_historical_records`, `content_historical_relations`, `content_transition_baseline_rows`, `content_transition_baselines`, `content_transition_commits`, `content_transition_dirty_rows`, `content_transition_evidence` (+53 more)

### Community 40 - "일정 업무 · schedule-handler.ts"
Cohesion: 0.09
Nodes (26): SaveScheduleResult, ScheduleDto, SchedulePayload, UpsertSchedulePayload, handleScheduleRequest, authorizeScheduleWrite(), ScheduleQuery, ScheduleQueryRepository (+18 more)

### Community 41 - "Play 저장·조회 · D1AiBatchRepository"
Cohesion: 0.07
Nodes (14): AiBatchDraft, AiBatchItem, AiBatchPage, AiBatchSelection, AiBatchSummary, AiReviewKind, AiReviewResult, AiBatchRepository (+6 more)

### Community 42 - "Play 저장·조회 · admin-catalog-input.ts"
Cohesion: 0.15
Nodes (50): OtwPlayAdminCreateChannelRequest, OtwPlayAdminUpdateChannelRequest, AdminInputResult, catalogSubjectKey(), fail(), hasDuplicateCatalogSubjects(), integer(), inValues() (+42 more)

### Community 43 - "Play 저장·조회 · PlaylistService"
Cohesion: 0.10
Nodes (16): PLAY_PLAYLIST_MAX_ITEMS, PlayDefaultPlaylistWrite, matchesPlaylist(), playlistArtwork(), PlaylistService, DefaultPlaylistSetting, DefaultPlaylistSettingsRepository, PlaylistArtwork (+8 more)

### Community 44 - "Play 저장·조회 · D1IngestionRepository"
Cohesion: 0.09
Nodes (13): contentRowHeldSql(), publicationChannelHiddenSql(), publicationCutoffSql(), IngestionMessageRecord, OtwPlayYouTubePlaylistPage, chunksOf(), D1IngestionRepository, jobSelect() (+5 more)

### Community 45 - "공유 계약 · configuration.ts"
Cohesion: 0.04
Nodes (48): AUTO_UPDATE_INTERVAL_HOURS, AUTO_UPDATE_RANGE_DAYS, AutoUpdateIntervalHours, AutoUpdateRangeDays, BooleanSettingValue, DEFAULT_AUTO_UPDATE_INTERVAL_HOURS, DEFAULT_AUTO_UPDATE_RANGE_DAYS, DEFAULT_OTW_PLAY_SUBMISSION_DAILY_LIMIT (+40 more)

### Community 46 - "기능별 화면 · x-posts.ts"
Cohesion: 0.08
Nodes (40): MemberPostsAggregateResponseDto, MemberPostsCursorDto, MemberPostSourcePolicyDto, MemberPostSourcePolicyStatus, XPostContextResponseDto, XPostDto, XPostMediaDto, XPostsByHandleDto (+32 more)

### Community 47 - "기능별 업무·어댑터 · youtube-feed.ts"
Cohesion: 0.09
Nodes (46): EXTENDED_SHORTS_START_AT, isYouTubeShort(), YouTubeShortClassificationInput, YouTubeShortsUnavailableError, OFFICIAL_CHANNEL_TARGETS_SQL, officialChannelTargetsSql(), readPublicFeedRows(), acquireBackfillLease() (+38 more)

### Community 48 - "플랫폼·내구 상태 · auth.ts"
Cohesion: 0.08
Nodes (43): AdminStatusResponse, getSitePublication(), SitePublicationStatus, renderSiteCountdown(), countdownAssets, handleAdminStatus, privateHeaders, readSitePublicationAccess() (+35 more)

### Community 49 - "Play 저장·조회 · public-catalog-service.ts"
Cohesion: 0.11
Nodes (22): isOtwPlayMemberPageEligible(), PublicCatalogCache, PublicCatalogCacheDocument, PublicCatalogDocument, PublicCatalogMeta, PublicCatalogReader, PublicCatalogSongSummary, assertContentReadable() (+14 more)

### Community 50 - "설정·빌드 경계 · package.json"
Cohesion: 0.04
Nodes (47): engines, node, name, packageManager, private, type, version, animejs (+39 more)

### Community 51 - "기능별 업무·어댑터 · x-reference-hydration.ts"
Cohesion: 0.08
Nodes (41): XLinkedPostPreviewDto, assertXApiNotBackedOff(), estimateXApiUsage(), invalidateXPostMemoryCache(), readDailyBudgetMicros(), readXApiBackoffUntil(), requestXApi(), reserveXApiBudget() (+33 more)

### Community 52 - "일정 업무 · commands.ts"
Cohesion: 0.09
Nodes (38): ChzzkChildResult, ChzzkMatchResult, ChzzkScanParent, ChzzkScanRequest, ChzzkScanResponse, ChzzkScanResult, ChzzkScanVideo, parseNumericId() (+30 more)

### Community 53 - "SQL 변경 이력 · `music_cover_proposal_participants`"
Cohesion: 0.06
Nodes (45): idx_music_cover_proposal_participants_entity_proposal, `music_cover_proposal_participants`, idx_music_cover_proposal_original_artists_member_proposal, idx_music_cover_proposal_participants_member_proposal, `__backup_music_channel_upload_candidate_origins`, `__backup_music_channel_websub_deliveries`, `__backup_music_channel_websub_subscriptions`, `__backup_music_cover_proposal_original_artists` (+37 more)

### Community 54 - "Play 저장·조회 · index.ts"
Cohesion: 0.09
Nodes (29): AiReviewBroadcastReader, AiReviewError, PlayTelemetryEvent, AI_REVIEW_PROMPT_VERSION, AiReviewMember, isAiReviewPromptSupported(), extractYouTubeVideoId(), hasUnsafeRawUrlCharacter() (+21 more)

### Community 55 - "기능별 업무·어댑터 · d1-member-posts-port.ts"
Cohesion: 0.09
Nodes (23): MemberPostsPageRequest, handleMemberPosts, createNaverCafePolicy(), createXPolicy(), emptyNaverCafe(), emptyX(), getCacheControl(), GetMemberPosts (+15 more)

### Community 56 - "개발·릴리스 도구 · d1-doctor.mjs"
Cohesion: 0.08
Nodes (39): args, baseUrl, checkCatalogMeta(), checkMigrations(), checkOtwPlaySubmissionDailyLimit(), checkPublicReadModelMeta(), checkPublicSortKeys(), checkSchema() (+31 more)

### Community 57 - "Play 저장·조회 · youtube-metadata.ts"
Cohesion: 0.09
Nodes (30): OtwPlayChannelMonitorCandidateDto, OtwPlayChannelMonitorStatus, OtwPlaySourceAvailabilityStatus, PREAPPROVED_COLLECTION_AUTHORITY, VerifiedYouTubeVideo, ChannelMonitorAutomationApprovalInput, EligibleChannelMonitorTarget, OtwPlayYouTubeChannelUploads (+22 more)

### Community 58 - "Play 저장·조회 · d1-release-repository.ts"
Cohesion: 0.10
Nodes (28): OtwPlayAdminReleaseAuditDto, OtwPlayAdminReleaseCommandResponse, OtwPlayAdminReleaseConfirmation, OtwPlayAdminReleaseFlagsDto, OtwPlayAdminReleaseRequest, OtwPlayAdminReleaseStateDto, OtwPlayAdminReleaseTransition, handleOtwPlayRelease (+20 more)

### Community 59 - "기능별 화면 · x-post-history-manager.tsx"
Cohesion: 0.10
Nodes (30): XHistoryPostStatus, fetchAdminStatus(), useAdminStatus(), fetchXHistoryPosts(), redactXHistoryPost(), XHistoryQuery, formatDate(), getReferencedPost() (+22 more)

### Community 60 - "일정 업무 · pending-command-handler.ts"
Cohesion: 0.12
Nodes (34): PendingAction, PendingApplyMode, PendingApprovalOptions, PendingRankedScheduleDto, PendingRejectionOptions, PendingRejectionReasonCode, PendingScheduleSummaryDto, PendingTargetMode (+26 more)

### Community 61 - "일정 업무 · d1-pending-schedule-query.ts"
Cohesion: 0.09
Nodes (30): PendingCandidateKind, PendingMatchConfidence, PendingMatchReason, PendingMissingField, PendingScheduleDto, ScheduleCandidateRejectionListDto, ScheduleCandidateRejectionQuery, handlePendingScheduleQuery (+22 more)

### Community 62 - "설정·빌드 경계 · scripts"
Cohesion: 0.05
Nodes (42): scripts, architecture:check, build, build:luvdia, cf-typegen, d1:doctor, d1:doctor:luvdia, d1:reset:local (+34 more)

### Community 63 - "Play 저장·조회 · AiReviewService"
Cohesion: 0.11
Nodes (9): AiReviewDto, AiReviewRequest, AiBatchService, AiReviewService, AiReviewAnalyzer, AiReviewContext, AiReviewQueue, AiReviewRecord (+1 more)

### Community 64 - "Play 저장·조회 · commands.ts"
Cohesion: 0.08
Nodes (32): OTW_PLAY_INGESTION_CANDIDATE_STATUSES, OtwPlayAdminRejectProposalRequest, CandidateMetadataCommand, CandidateMetadataMutation, parseCandidateMetadataMutation(), Base, CandidateReviewCommand, CandidateReviewMutation (+24 more)

### Community 65 - "Play 저장·조회 · ai-review-result.ts"
Cohesion: 0.10
Nodes (32): OTW_PLAY_PARTICIPANT_ROLES, OTW_PLAY_PARTICIPATION_TYPES, canonicalTags, normalizeOtwPlaySongTags(), OTW_PLAY_RECOMMENDED_SONG_TAGS, tagKey(), buildAiReviewData(), AiReviewInput (+24 more)

### Community 66 - "Play 화면·조회 · playlist-editor-page.tsx"
Cohesion: 0.14
Nodes (31): createMyPlaylist(), deleteMyPlaylist(), fetchDefaultPlaylists(), fetchMyPlaylist(), fetchMyPlaylists(), fetchPlaylistPerformances(), options(), saveMyPlaylist() (+23 more)

### Community 67 - "개발·릴리스 도구 · getSiteTarget()"
Cohesion: 0.11
Nodes (30): typescript, config, env, environment, origin, siteId, assertD1MetricsPreservation(), readWranglerJson() (+22 more)

### Community 68 - "기능별 화면 · dday-manager.tsx"
Cohesion: 0.12
Nodes (26): DDayPayload, DDayType, AdminGate(), AdminSectionHeader(), AdminSectionHeaderProps, createDDay(), deleteDDay(), fetchDDays() (+18 more)

### Community 69 - "설정·빌드 경계 · dependencies"
Cohesion: 0.05
Nodes (37): dependencies, animejs, @chakra-ui/react, class-variance-authority, @clerk/clerk-react, clsx, date-fns, dotenv (+29 more)

### Community 70 - "개발·릴리스 도구 · site-target.mjs"
Cohesion: 0.09
Nodes (32): matchesSiteViteProcess(), args, child, execFileAsync, hostArg, localEnvironment, matches, portArg (+24 more)

### Community 71 - "Play 저장·조회 · D1WorkQueueRepository"
Cohesion: 0.10
Nodes (11): WorkQueueError, WorkQueueMessage, createWorkQueueHandler(), invalid(), object(), parseWorkCommand(), validId(), D1WorkQueueRepository (+3 more)

### Community 72 - "Play 화면·조회 · play-player-context.tsx"
Cohesion: 0.11
Nodes (34): OtwPlayPublicPerformanceDetailDto, OtwPlayPublicPerformanceSummaryDto, OtwPlayPublicSourceDto, resolvePlaylistPerformances(), clampCurrentIndex(), createEmptyOtwPlayQueue(), findMatchingPerformanceIndex(), findNextPlayableQueueIndex() (+26 more)

### Community 73 - "일정 업무 · DbInstance"
Cohesion: 0.10
Nodes (24): autoUpdateRuns, settings, drizzle-orm, AdminCatalogGlobalAudit, DrizzleAdminCatalogAudit, AutoUpdateHistoryOptions, AutoUpdateResult, AutoUpdateRunActor (+16 more)

### Community 74 - "SQL 변경 이력 · `music_performances`"
Cohesion: 0.07
Nodes (32): idx_music_performances_song_id, `music_performances`, uidx_music_performances_dedupe_key, idx_music_performances_published_relation_released_id, idx_music_performances_published_released_id, idx_music_performances_published_song_released_id, idx_music_search_terms_normalized_kind_song, `music_search_terms` (+24 more)

### Community 75 - "기능별 업무·어댑터 · fetch.ts"
Cohesion: 0.11
Nodes (30): isCalendarDate(), isSiteContentPath(), siteContentCacheControl(), siteContentStatusText, handleAsset, handleApiRouteError(), handleFetch(), handleWorkerFetch() (+22 more)

### Community 76 - "Play 저장·조회 · D1PublicCatalogReader"
Cohesion: 0.12
Nodes (10): handleOtwPlayPublicCatalog, PublicCatalogPerformanceDetail, PublicCatalogReadDiagnostics, PublicCatalogRequestApplication, artworkSourceQuery(), D1PublicCatalogReader, participantQueryForPerformanceIds(), performanceDate() (+2 more)

### Community 77 - "일정 업무 · ScheduleActor"
Cohesion: 0.18
Nodes (10): PendingActionOutcome, PendingScheduleRepository, PendingScheduleRow, ScheduleActor, actorBindings(), D1PendingScheduleRepository, EmptyTargetRow, IdRow (+2 more)

### Community 78 - "기능별 업무·어댑터 · link-preview.ts"
Cohesion: 0.13
Nodes (34): CachedPreview, clampText(), clearLinkPreviewCacheForTests(), decodeHtmlEntities(), enrichLink(), enrichLinksWithPreviews(), fallbackPreview(), fetchHtml() (+26 more)

### Community 79 - "Play 저장·조회 · release-handler.ts"
Cohesion: 0.10
Nodes (29): OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS, OtwPlayAdminSourceRecheckResponse, createPlayTelemetryEvent(), NoopPlayTelemetryWriter, PLAY_TELEMETRY_EVENTS, PlayTelemetryCacheStatus, PlayTelemetryRecordKind, PlayTelemetryTrigger (+21 more)

### Community 80 - "Play 저장·조회 · member-submission-handler.ts"
Cohesion: 0.16
Nodes (29): OtwPlaySubmissionErrorCode, OtwPlaySubmissionParticipantInput, emptyBroadcastMetadata(), parseMemberSubmissionMutation(), codePointLength(), hasExactKeys(), isObject(), MemberSubmissionInputResult (+21 more)

### Community 81 - "기능별 업무·어댑터 · x-posts-service.ts"
Cohesion: 0.07
Nodes (15): XHistoryHealthResponseDto, XHistoryPostsResponseDto, authorizeXHandleTargets(), XTargetAuthorizationResult, XActor, XAllowlistUnavailableError, XCollectionAuditInput, XHistoryReadOptions (+7 more)

### Community 82 - "개발·릴리스 도구 · d1-reset-local.mjs"
Cohesion: 0.09
Nodes (30): shouldBlockDestructiveLocalReset(), applyMigrations(), args, assertSuccess(), bootstrapMemberCodes, canonical, createBootstrapCleanupSql(), createBootstrapSql() (+22 more)

### Community 83 - "기능별 화면 · x-post-card.tsx"
Cohesion: 0.13
Nodes (28): XPostLinkDto, extractXStatusId(), formatAbsoluteDate(), formatMetric(), formatRelativeDate(), getLinkDomain(), getLinkHref(), getPreviewLinks() (+20 more)

### Community 84 - "Play 화면·조회 · OtwPlayYouTubePlayer"
Cohesion: 0.07
Nodes (10): createOtwPlayYouTubePlayer(), loadYouTubeIframeApi(), OtwPlayYouTubePlayer, playerStateFromCode(), Window, YouTubePlaybackRequest, YouTubePlayerEvents, YouTubePlayerInstance (+2 more)

### Community 85 - "Play 저장·조회 · ingestion-handler.ts"
Cohesion: 0.17
Nodes (28): OTW_PLAY_INGESTION_CLASSIFICATIONS, OtwPlayDeleteReviewItemRequest, OtwPlayIngestionCandidateStatus, CandidateChannelMutation, parseCandidateChannelInput(), parseCandidateChannelMutation(), createIngestionHandler(), errorResponse() (+20 more)

### Community 86 - "Play 저장·조회 · d1-ingestion-repository.ts"
Cohesion: 0.12
Nodes (23): OtwPlayCreatePlaylistImportRequest, OtwPlayIngestionCandidatePageDto, OtwPlayIngestionClassification, OtwPlayIngestionItemFilters, OtwPlayIngestionReviewInput, OtwPlayPlaylistPreflightDto, CreateIngestionJobCommand, IngestionRepositoryErrorCode (+15 more)

### Community 87 - "기능별 화면 · multiview-page.tsx"
Cohesion: 0.17
Nodes (25): buildMulLiveUrl(), buildMultiviewSearchParams(), dedupeChannelIds(), dedupeMultiviewChannelIds(), extractMultiviewChannelId(), extractMultiviewChzzkChannelId(), isValidChzzkChannelId(), isValidMultiviewChannelId() (+17 more)

### Community 88 - "일정 업무 · auto-update-matcher.ts"
Cohesion: 0.10
Nodes (30): AUTO_UPDATE_ADDITIONAL_SCHEDULE_MINUTES, AUTO_UPDATE_RESUME_GAP_MS, AUTO_UPDATE_SHORT_SESSION_SECONDS, AUTO_UPDATE_TIME_WINDOW_MINUTES, AUTO_UPDATE_TITLE_DICE_THRESHOLD, AutoUpdateCandidateKind, AutoUpdateMatchConfidence, AutoUpdateMatchReason (+22 more)

### Community 89 - "SQL 변경 이력 · `naver_cafe_posts`"
Cohesion: 0.10
Nodes (24): `naver_cafe_posts`, idx_naver_cafe_posts_hidden_created, idx_naver_cafe_posts_member_hidden_created, idx_naver_cafe_posts_source_hidden_created, asset_file_reference_inputs, content_transition_file_paths, asset_file_reference_inputs, content_transition_file_paths (+16 more)

### Community 90 - "기능별 화면 · notice-page.tsx"
Cohesion: 0.11
Nodes (22): fetchNotices(), getNoticeImageUrls(), getNoticeLinks(), getNoticeRelatedMemberUids(), normalizeStringArray(), selectFeaturedNotice(), useNoticePageData(), configs (+14 more)

### Community 91 - "Play 화면·조회 · ai-review-panel.tsx"
Cohesion: 0.15
Nodes (24): AI_REVIEW_FIELDS, AiReviewEvidence, AiReviewField, AiReviewPerson, AiReviewRange, AiReviewStatus, AiReviewSuggestion, AiReviewTarget (+16 more)

### Community 92 - "Play 저장·조회 · playlists.ts"
Cohesion: 0.14
Nodes (16): OtwPlayPublicPerformanceResponseDto, PlayAdminDefaultPlaylist, PlayDefaultPlaylist, PlayPerformanceQuery, PlayPlaylist, PlayPlaylistSummary, PlayPlaylistWrite, PlayResolvedPerformances (+8 more)

### Community 93 - "일정 업무 · pending-schedule-service.ts"
Cohesion: 0.12
Nodes (17): PendingScheduleActionResult, PendingScheduleBatchResult, handlePendingScheduleCommand, AuditBatchInput, mapWithConcurrency(), PendingScheduleService, RunBatchInput, RunOneInput (+9 more)

### Community 94 - "기능별 업무·어댑터 · cloudflare-d1-observability-reader.ts"
Cohesion: 0.12
Nodes (25): D1ObservabilityReadWorkloadDto, D1ObservabilityReasonCode, D1ObservabilityResponseDto, D1ObservabilityWriteWorkloadDto, CacheLike, classifyD1WriteQueryForTest, classifyWriteQuery(), currentMetric() (+17 more)

### Community 95 - "기능별 업무·어댑터 · d1-r2-file-store.ts"
Cohesion: 0.13
Nodes (16): getAssetContentType(), getAssetMemberCode(), FileReplacement, parseFileReplacement(), D1R2FileStore, DurableFileIntent, FileWriteInput, fromRow() (+8 more)

### Community 96 - "기능별 업무·어댑터 · file-retention.ts"
Cohesion: 0.20
Nodes (23): fileReferenceProjectionSql(), fileReferenceProjectionTriggers(), indexedFileTables, currentFileIndexSql(), currentRowFileIndexSql(), selectedFileRowSql(), acquireLegacyFileSql(), candidatePathSql() (+15 more)

### Community 97 - "제품·운영 문서 · architecture.md"
Cohesion: 0.10
Nodes (26): useOtwPlayAdminCatalogPages query state and authenticated HTTP, AdminCatalogService, assets file protection and contracts/content-history DTO ownership, Atomic command, revision, event and success snapshot, addItems atomic attempt marker and superseded work closure, Finalize current-attempt aggregation and visible success history, Match current settings/ownership with candidate batch, Scan current settings/ownership with observation batch (+18 more)

### Community 98 - "기능별 화면 · types.ts"
Cohesion: 0.14
Nodes (24): DataRetentionCategory, NaverCafeSourceCheckStatus, OperationsStatusLevel, OperationJobSummaryDto, OperationJobSummaryListDto, OperationRunListDto, AutoUpdateOperationRun, AutoUpdateRunDetail (+16 more)

### Community 99 - "기능별 화면 · site-content-metadata.tsx"
Cohesion: 0.16
Nodes (16): siteContentQueryKey(), documentBootstraps, readDocumentBootstrap(), releaseDocumentBootstrap(), seedSiteContent(), SiteContentDateContext, SiteContentSelectedDateContext, CurrentSiteContentMetadata() (+8 more)

### Community 100 - "설정·빌드 경계 · devDependencies"
Cohesion: 0.08
Nodes (26): devDependencies, baseline-browser-mapping, @cloudflare/vite-plugin, @cloudflare/vitest-pool-workers, drizzle-kit, eslint, @eslint/js, eslint-plugin-react-hooks (+18 more)

### Community 101 - "개발·릴리스 도구 · architecture-check.mjs"
Cohesion: 0.10
Nodes (21): active, addError(), dependencyGraph, errors, findCycles(), forbiddenLegacyDirectories, getFrontendCapability(), getFrontendFeature() (+13 more)

### Community 102 - "설정·빌드 경계 · compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 103 - "일정 업무 · audit.ts"
Cohesion: 0.16
Nodes (12): AdminAuditLogDto, UpdateLogDto, UpdateLogPageResponseDto, UpdateLogQuery, updateLogs, handleUpdateLogs, UpdateLogReadOptions, UpdateLogRepository (+4 more)

### Community 104 - "일정 업무 · live-schedule.ts"
Cohesion: 0.16
Nodes (22): isScheduleMemberActive(), buildChzzkRouteApplication(), applyLiveScheduleFillPlan(), createLiveScheduleAutoFillService(), LiveScheduleAutoFillService, LiveScheduleStatusItem, autoFillUndecidedLiveSchedules(), buildLiveScheduleFillPlans() (+14 more)

### Community 105 - "SQL 변경 이력 · 0065_otw_play_authority_retention.sql"
Cohesion: 0.12
Nodes (23): `__backup_music_channel_websub_deliveries`, `__backup_music_ingestion_candidate_origins`, `__backup_music_ingestion_events`, idx_music_channel_websub_deliveries_monitor_received, idx_music_channel_websub_deliveries_status_received, idx_music_channel_websub_subscriptions_lease, idx_music_ingestion_events_candidate_created_id, idx_music_ingestion_events_job_created_id (+15 more)

### Community 106 - "기능별 업무·어댑터 · handler.ts"
Cohesion: 0.20
Nodes (14): createDDay(), deleteDDay(), listDDays(), updateDDay(), DDayRepository, DDayCommand, DDayRequestIdentity, DDayWriteInput (+6 more)

### Community 107 - "기능별 업무·어댑터 · settings-repository.ts"
Cohesion: 0.18
Nodes (10): SETTINGS_KEYS, SettingsKey, SettingWrite, SettingsAudit, SettingsRepository, SettingsService, DrizzleSettingsRepository, readAdminSettingValues() (+2 more)

### Community 108 - "기능별 업무·어댑터 · d1-schedule-board.ts"
Cohesion: 0.17
Nodes (13): DDayDto, NoticeDto, ScheduleBoardResponse, notices, schedules, ScheduleBoardReader, readScheduleBoard(), ScheduleBoardReaderResolver (+5 more)

### Community 109 - "공유 계약 · operations.ts"
Cohesion: 0.10
Nodes (21): AdminReviewSummaryDto, AutoUpdateOperationRunDto, AutoUpdateRunDetailDto, AutoUpdateRunResultDto, D1ObservabilityCurrentDayDto, D1ObservabilityDailyMetricDto, D1ObservabilityStatus, DataRetentionPolicyStatusDto (+13 more)

### Community 110 - "Play 저장·조회 · cloudflare-public-catalog-cache.ts"
Cohesion: 0.19
Nodes (17): PublicCatalogCacheEntry, PublicCatalogCacheKey, PublicCatalogCacheResource, canonicalPathAndQuery(), CloudflarePublicCatalogCache, CloudflarePublicCatalogCacheError, CloudflarePublicCatalogCacheFailureReason, CloudflarePublicCatalogCacheOperation (+9 more)

### Community 111 - "SQL 변경 이력 · 0068_fixed_amazoness.sql"
Cohesion: 0.14
Nodes (19): idx_scheduled_job_items_lane_status_available, idx_scheduled_job_items_lease, idx_scheduled_job_runs_job_status_accepted, idx_scheduled_job_runs_status_updated, idx_scheduled_outbox_status_available, idx_scheduled_usage_daily_day_resource, `scheduled_job_items`, `scheduled_job_runs` (+11 more)

### Community 112 - "기능별 화면 · notice-manager.tsx"
Cohesion: 0.15
Nodes (21): cleanupUnusedNoticeThumbnails(), createNotice(), deleteNotice(), fetchNoticeThumbnailStatus(), normalizeActive(), setFeaturedNotice(), updateNotice(), getNoticePublicationStatus() (+13 more)

### Community 113 - "Play 저장·조회 · public-catalog-cursor.ts"
Cohesion: 0.18
Nodes (20): decodePublicCatalogCursor(), encodePublicCatalogCursor(), isRecord(), isValidNullablePositionText(), isValidRequiredPositionText(), isValidRevision(), isValidSearchState(), isValidSongId() (+12 more)

### Community 114 - "기능별 화면 · member-posts-overview.tsx"
Cohesion: 0.19
Nodes (15): UnifiedMemberPostDto, fetchMemberPostsAggregate(), MemberPostsAggregateResponse, MemberPostSourcePolicy, UnifiedMemberPost, FeedSource, filterFeed(), groupFeed() (+7 more)

### Community 115 - "설정·빌드 경계 · components.json"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 116 - "설정·빌드 경계 · project-context.md"
Cohesion: 0.11
Nodes (17): Browser capability API to exact Worker registry to D1, Generated route tree, Worker bindings and agent mirrors, Latest product decisions and release evidence, Approved upload polling and retired WebSub, PublicAppShell and ContentPageShell, Public CHZZK selection and Mul.Live navigation, Node 24, pnpm 11.7, React 19, Vite 7, Worker/D1/Drizzle, Read-only Cron admission, Workflow and Queue execution (+9 more)

### Community 117 - "기능별 업무·어댑터 · admin-audit-handler.ts"
Cohesion: 0.24
Nodes (12): AdminAuditLogPageResponseDto, LogFilters, parseLogFilters(), handleAdminAuditLogs, AdminAuditLogReader, readAdminAuditLogs(), AdminAuditLogReaderResolver, createHandleAdminAuditLogs() (+4 more)

### Community 118 - "개발·릴리스 도구 · vite.config.ts"
Cohesion: 0.18
Nodes (16): STATIC_SHELL_PATHS, @cloudflare/vite-plugin, @tailwindcss/vite, vite, @vitejs/plugin-react, createSeoHtmlTransform(), currentFile, escapeHtml() (+8 more)

### Community 119 - "기능별 화면 · snapshot-fonts.ts"
Cohesion: 0.16
Nodes (16): fonts, prepareSnapshotFonts(), SNAPSHOT_FONT_FAMILY, SNAPSHOT_FONT_READ_EVENT, SNAPSHOT_FONT_TIMEOUT, SNAPSHOT_SYSTEM_FONT_EVENT, SnapshotFontContext, SnapshotFontMode (+8 more)

### Community 120 - "설정·빌드 경계 · compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+10 more)

### Community 121 - "기능별 업무·어댑터 · d1-protected-asset-reference-resolver.ts"
Cohesion: 0.22
Nodes (11): NoticeImageMemberValidator, isStaticProfileAsset(), AssetReferenceScope, classifyFileReference(), normalizeOwnedFilePath(), ownedFilePathSql(), validateFileOrigins(), D1ProtectedAssetReferenceResolver (+3 more)

### Community 122 - "Play 저장·조회 · playlist-handler.ts"
Cohesion: 0.27
Nodes (15): requiresOtwPlayMembership(), OTW_PLAY_ADMIN_PREVIEW_HEADER, formatAt(), releaseActions(), ReleasePanel(), PlaylistError, body(), createPlaylistHandler() (+7 more)

### Community 123 - "설정·빌드 경계 · vitest.worker.config.ts"
Cohesion: 0.18
Nodes (12): @cloudflare/vitest-pool-workers, testAliases, testCoverage, testMaxWorkers, OTW_PLAY_HARDENING_MIGRATION_NAMES, OTW_PLAY_INGESTION_TEST_MIGRATION_NAMES, OTW_PLAY_PROPOSAL_SEARCH_MIGRATION_NAMES, OTW_PLAY_PUBLIC_CATALOG_MIGRATION_NAMES (+4 more)

### Community 124 - "기능별 화면 · index.ts"
Cohesion: 0.22
Nodes (16): buildNoticeThumbnailAssetUrl(), getNoticeThumbnailContentTypeFromKey(), getNoticeThumbnailExtension(), getOwnedNoticeThumbnailKey(), isAcceptedNoticeThumbnailType(), isNoticeThumbnailAssetKey(), NOTICE_THUMBNAIL_ACCEPT, NOTICE_THUMBNAIL_ACCEPTED_TYPES (+8 more)

### Community 125 - "기능별 업무·어댑터 · handler.ts"
Cohesion: 0.20
Nodes (9): AssetObject, AssetReader, ProtectedAssetReferenceResolver, readAsset(), parseProtectedReferenceContext(), AssetReaderResolver, createHandleProtectedAssetReference(), createHandleR2Asset() (+1 more)

### Community 126 - "SQL 변경 이력 · `music_ingestion_jobs`"
Cohesion: 0.19
Nodes (16): idx_music_ingestion_candidates_channel_status_id, idx_music_ingestion_candidates_refresh_id, idx_music_ingestion_candidates_retention_id, idx_music_ingestion_candidates_status_updated_id, idx_music_ingestion_jobs_source_updated_id, idx_music_ingestion_jobs_status_retry_id, idx_music_ingestion_messages_status_retry_key, idx_music_ingestion_origins_candidate_discovered_id (+8 more)

### Community 127 - "개발·릴리스 도구 · d1-seed-local.mjs"
Cohesion: 0.13
Nodes (14): buildDestructiveRowCountSql(), hasProtectedLocalSeedData(), LOCAL_SEED_PROTECTED_TABLES, args, destructiveRowCount, fixtureFile, fixtureMemberCount, force (+6 more)

### Community 128 - "기능별 화면 · audit.ts"
Cohesion: 0.24
Nodes (12): buildQueryString(), fetchAdminAuditLogs(), fetchUpdateLogs(), getAuditResultSummary(), displayValue(), readRecordedChanges(), RecordedChange, AdminAuditLog (+4 more)

### Community 129 - "SQL 변경 이력 · `youtube_api_usage_events`"
Cohesion: 0.19
Nodes (14): idx_youtube_api_cache_expires_at, idx_youtube_api_cache_stale_until, idx_youtube_api_cache_type, idx_youtube_api_usage_events_cache_key, idx_youtube_api_usage_events_created_at, idx_youtube_api_usage_events_operation, idx_youtube_api_usage_events_status, `youtube_api_usage_events` (+6 more)

### Community 130 - "기능별 업무·어댑터 · index.ts"
Cohesion: 0.24
Nodes (12): buildNoticeThumbnailAssetUrl(), CONTENT_TYPE_BY_EXTENSION, EXTENSION_BY_TYPE, getNoticeThumbnailContentTypeFromKey(), getOwnedNoticeThumbnailKey(), getR2AssetKey(), isNoticeThumbnailAssetKey(), NOTICE_THUMBNAIL_ACCEPTED_TYPES (+4 more)

### Community 132 - "제품·운영 문서 · Architecture candidates 01-03 final review an"
Cohesion: 0.25
Nodes (15): docs/architecture.md owns actual responsibility paths, Candidate01 atomic authenticated command receipt and replay, Candidate02 useOtwPlayAdminCatalogPages owns list/off-page selection/retry, Bounded search and exact title/alias resolution, Latest-record merge preserves first page order, Candidate03 atomic schedule phase/lease/pause checks, New scans atomically retire excluded old matches and outbox, docs/current-work.md owns latest approval and pause (+7 more)

### Community 133 - "제품·운영 문서 · current-work.md"
Cohesion: 0.15
Nodes (12): Agent synchronization portability checks, .agent canonical rules and generated mirrors, Current work precedes operations and implementation, Minimum relevant project skills and dependency order, Web app and Worker scope; extension remains future work, Account aggregate 5,000,000 D1 rows/day and 80 percent stop threshold, Current request: Graphify/review update and reversible archive only, Deferred broad architecture, migration, Play/AI and lower-priority features (+4 more)

### Community 134 - "설정·빌드 경계 · README.md"
Cohesion: 0.14
Nodes (12): PR176 candidate 01–03 final review and verification limits, Preserve contracts and evidence; archive dated completed plans, current-work.md owns pause, resume and remaining work, Schedules, media, feed, multiview, Play and administration, Fail-closed Clerk development/production separation, Extend implemented Play from current contracts, D1 metrics binding checks before production deployment, Node 24.20.0 / pnpm 11.7.0; Worker runs on workerd (+4 more)

### Community 135 - "SQL 변경 이력 · 0071_gifted_romulus.sql"
Cohesion: 0.16
Nodes (13): idx_naver_cafe_posts_hidden_created, idx_naver_cafe_posts_member_hidden_created, idx_naver_cafe_posts_source_hidden_created, idx_youtube_api_usage_contexts_origin, idx_youtube_api_usage_contexts_workload, idx_youtube_feed_sources_due, idx_youtube_feed_videos_fetched, idx_youtube_feed_videos_source_published (+5 more)

### Community 136 - "개발·릴리스 도구 · upload-profile-backgrounds-to-r2.mjs"
Cohesion: 0.26
Nodes (10): buildD1LocationArgs(), parsePersistToOption(), resolveLocalD1Options(), result, target, parseSiteArgument(), createProfileUploadPlan(), option() (+2 more)

### Community 137 - "Worker 조립·Queue · route-registry.ts"
Cohesion: 0.16
Nodes (10): CompiledRoute, compilePath(), createRouteRegistry(), escapeRegExp(), WorkerHttpMethod, WorkerRouteAuth, WorkerRouteDefinition, WorkerRouteHandler (+2 more)

### Community 138 - "공유 계약 · notices.ts"
Cohesion: 0.33
Nodes (10): NoticeLinkDto, NoticePayload, NoticePublisherType, NoticeThumbnailAssetStatus, NoticeThumbnailCleanupResponse, NoticeThumbnailDeleteResponse, NoticeThumbnailReferenceStatus, NoticeThumbnailStatusResponse (+2 more)

### Community 139 - "제품·운영 문서 · X member feed and permanent archive design"
Cohesion: 0.21
Nodes (13): Confirmed single-post redaction and durable tombstones, Member post storage and operator history policy, Permanent X/Naver storage with provider media URLs, Historical provider deletion-sync retirement after upload HTTP404, Public member feed reads persisted D1 only, Historical2026-09-02 posts/facts198/198 readback, Activation-forward X collection and durable pagination, DELETE /api/x/posts/{postId} (+5 more)

### Community 140 - "제품·운영 문서 · Scheduled jobs v2 operating transition"
Cohesion: 0.24
Nodes (13): Atomic resource reservation before calls and dispatch, Free-tier Cron bridge at minutes3,13,23,33,53, Measured D1 usage differs from admission estimates, D1 run/item/outbox authority, Deployment migration gate with no implicit resource mutation, Scheduled jobs v2 operating transition, GET /api/operations/d1-observability?window=7d, GET /api/operations/job-summaries (+5 more)

### Community 141 - "제품·운영 문서 · OTW Play integrated admin workflow"
Cohesion: 0.23
Nodes (13): AI drafts cannot change human review, Ready or publication, Batch AI drafts with durable acceptance and recovery, Persisted candidate kind and singing_clip normalization, OTW Play integrated admin workflow, GET /api/play/admin/review-items, Migration0098_late_beast.sql batch/item storage, Unified import/review to private registration to explicit publication, POST/GET /api/play/admin/ai-reviews and GET /:id (+5 more)

### Community 142 - "제품·운영 문서 · OTW Play product requirements"
Cohesion: 0.18
Nodes (13): Saved review immediately reuses real song and participant IDs, OTW Play product requirements, Member discovery uses filtered /play/songs and legacy redirects, Approved polling with pause/generation/lease and no automatic gap backfill, Ready atomically materializes reusable catalog identities, Separate catalog identities and independent review/health/publication, One visible Play iframe and revalidated performance queue, Anonymous official catalog; private member data and administrator clips (+5 more)

### Community 143 - "기능별 화면 · profile-background-images.ts"
Cohesion: 0.23
Nodes (11): appendVersion(), buildProfileBackgroundImageSources(), buildProfileBackgroundImageSourceSets(), DEFAULT_PROFILE_BACKGROUND_ID, encodePathSegment(), getProfileBackgroundBaseUrl(), getProfileBackgroundEntries(), MAX_PROFILE_BACKGROUND_IMAGES (+3 more)

### Community 144 - "기능별 화면 · notice-banner.tsx"
Cohesion: 0.23
Nodes (11): getTodayKstDateString(), isNoticeVisibleOnDate(), NoticePublicationStatus, NoticeVisibilityInput, Notice, getNoticeSortTime(), NoticeBanner(), noticeTypeConfigs (+3 more)

### Community 145 - "Play 화면·조회 · use-playlist-hero-transition.ts"
Cohesion: 0.27
Nodes (10): copyTitle(), createPlaylistHeroTitle(), findTitle(), createPlaylistHeroTransition(), arrive(), isCollection(), isDetail(), PlaylistHeroScrollPositions (+2 more)

### Community 146 - "Play 저장·조회 · otw-play-members.ts"
Cohesion: 0.21
Nodes (5): OtwPlayMemberSummary, OtwPlayPublicMemberDto, PublicCatalogSeoReader, PublicCatalogSeoState, PublicCatalogSongSeoProjection

### Community 147 - "제품·운영 문서 · channel-upload-polling.md"
Cohesion: 0.21
Nodes (11): Admin OTW Play Channels and Operations run-status entry, Watermark-first uploads, 50-video metadata batches and 250-video cap, Global Play pause and per-channel resume remain separate, Hourly minute-23 UTC slot with at most ten due monitors, One-unit playlist/metadata requests and approximate 24 units/channel/day, D1/race/retirement/Queue regressions and owning PR production ledger, Replace WebSub with approved-channel uploads-playlist polling, Authenticated retirement 410s with historical tables and candidates preserved (+3 more)

### Community 148 - "SQL 변경 이력 · `naver_cafe_source_checks`"
Cohesion: 0.26
Nodes (11): `auto_update_runs`, idx_auto_update_runs_source_started, idx_auto_update_runs_started_at, idx_auto_update_runs_status, idx_naver_cafe_source_checks_checked_at, idx_naver_cafe_source_checks_source_checked, idx_naver_cafe_source_checks_status, `naver_cafe_source_checks` (+3 more)

### Community 149 - "SQL 변경 이력 · 0075_colorful_layla_miller.sql"
Cohesion: 0.24
Nodes (11): idx_x_compliance_jobs_created, idx_x_compliance_jobs_due, idx_x_member_daily_metrics_member_date, idx_x_post_facts_member_created, idx_x_post_facts_metrics_due, idx_x_post_facts_visible_created, idx_x_post_metric_snapshots_captured, `x_compliance_jobs` (+3 more)

### Community 150 - "일정 업무 · manual-auto-update-service.ts"
Cohesion: 0.29
Nodes (4): ManualAutoUpdateOutcome, ManualAutoUpdateService, ManualAutoUpdatePort, ManualAutoUpdateResult

### Community 151 - "제품·운영 문서 · aeo.md"
Cohesion: 0.22
Nodes (10): Schedule summary cache expires after 300 seconds or KST midnight, 503/no-store/noindex for essential content failures, Google Search AI features and your website, Dated AEO members-only Play access snapshot, 2026-09-22 local AEO verification and observation limits, Readable public initial HTML and JSON-LD, SiteContentMetadata and GET /api/site-content, Capability public readers provide stored SEO content (+2 more)

### Community 152 - "제품·운영 문서 · auto-update.md"
Cohesion: 0.24
Nodes (10): /admin/settings candidate review, rejection, execution and settings tabs, Admin approval rounds half-hours and fills only still-empty fields, Candidate insertion/audit rollback and stale cleanup, Configured hourly trigger with DB-controlled collection interval, Schedules/configuration capabilities and additive migration history, Settings, observations, pending, rejection and update-log schema, Persistent VOD rejection and explicit reopen, 60-minute session merge and one-to-one schedule matching (+2 more)

### Community 153 - "설정·빌드 경계 · compilerOptions"
Cohesion: 0.18
Nodes (10): ./tsconfig.node.json, compilerOptions, baseUrl, paths, tsBuildInfoFile, types, extends, include (+2 more)

### Community 154 - "기능별 업무·어댑터 · d1-active-handles.ts"
Cohesion: 0.27
Nodes (7): extractXHandle(), X_HANDLE_PATTERN, X_MAX_HANDLES, XHandleTargetParseResult, getD1Results(), readActiveXHandles(), XAllowlistUnavailableError

### Community 155 - "설정·빌드 경계 · architecture.md"
Cohesion: 0.22
Nodes (9): Capability public surfaces and narrow commands entries, worker/app composition root, Wire contracts and persistence schema ownership, Frontend capability dependency direction, Prohibited horizontal legacy paths, TanStack Query server-state authority, Change-scoped architecture verification, Worker Clean Architecture dependency direction (+1 more)

### Community 156 - "공유 계약 · content-history.ts"
Cohesion: 0.31
Nodes (6): HistoricalContentMaterial, HistoricalContentProvenance, HistoricalJsonValue, HistoricalPersonCredit, kinds, labels

### Community 157 - "제품·운영 문서 · Retired implementation maintenance contract"
Cohesion: 0.20
Nodes (10): Canonical YouTube quota without legacy runtime fallback, Retired implementation maintenance contract, Upload canary remains incomplete during global pause, Warmup keys rejected atomically without writes, Retired WebSub and HTTP410 maintenance boundary, Cron to generic Workflow to D1 Outbox to Queue, Current Cron/Workflow/Outbox/Queue and retired WebSub, YouTube API optimization and caching strategy (+2 more)

### Community 158 - "SQL 변경 이력 · 0051_clear_mantis.sql"
Cohesion: 0.29
Nodes (9): idx_music_public_performance_sort_keys_entity_performance, idx_music_public_performance_sort_keys_missing_song_performance, idx_music_public_performance_sort_keys_participant_song_performance, idx_music_search_grams_size_normalized_song, `music_public_performance_sort_keys`, `music_public_read_model_meta`, `music_search_gram_stats`, `music_search_grams` (+1 more)

### Community 159 - "SQL 변경 이력 · 0063_youthful_jamie_braddock.sql"
Cohesion: 0.36
Nodes (9): idx_music_channel_automation_approvals_status_channel, idx_music_channel_websub_deliveries_monitor_received, idx_music_channel_websub_deliveries_status_received, idx_music_channel_websub_subscriptions_lease, `music_channel_websub_deliveries`, `music_channel_websub_subscriptions`, uidx_music_channel_websub_deliveries_event, uidx_music_channel_websub_subscriptions_callback_hash (+1 more)

### Community 160 - "기능별 화면 · clip-date-groups.ts"
Cohesion: 0.40
Nodes (9): compareClipsByDateThenViews(), compareClipsByViews(), dateLabelFormatter, formatClipDateLabel(), getClipDateKey(), getClipTimestamp(), getDateKeyFromDate(), groupClipsByDate() (+1 more)

### Community 161 - "기능별 화면 · vod-date-groups.ts"
Cohesion: 0.36
Nodes (9): compareVodsByDate(), dateLabelFormatter, formatVodDateLabel(), getDateKeyFromDate(), getVodDateKey(), getVodTimestamp(), groupVodsByDate(), toVodDate() (+1 more)

### Community 162 - "기능별 업무·어댑터 · settings-audit.ts"
Cohesion: 0.33
Nodes (5): WritableSettingsKey, handleAdminSettings, SettingsActor, SettingsChange, DrizzleSettingsAudit

### Community 163 - "SQL 변경 이력 · 0039_uneven_killmonger.sql"
Cohesion: 0.22
Nodes (8): idx_naver_cafe_posts_hidden_created, idx_naver_cafe_posts_member_hidden_created, idx_naver_cafe_posts_source_hidden_created, idx_naver_cafe_source_checks_checked_at, idx_naver_cafe_source_checks_source_checked, idx_naver_cafe_source_checks_status, idx_x_posts_handle_hidden_created, `__new_naver_cafe_source_checks`

### Community 164 - "설정·빌드 경계 · PRODUCT.md"
Cohesion: 0.22
Nodes (8): Operator state and authoritative publication readback, Preserve song, vocalist, channel and broadcast facts, Daily to weekly, content and Play exploration, Play enablement, navigation and indexing boundaries, YouTube music archive: song, performance and source, Schedule and live-status-first fan service, Unofficial fan identity and rights correction paths, Keyboard, visible focus, labels, mobile targets and AA contrast

### Community 165 - "개발·릴리스 도구 · clerk-environment.mjs"
Cohesion: 0.42
Nodes (7): assertClerkDeploymentConfig(), assertClerkPublishableKeyForTarget(), assertClerkSiteIdentity(), CLERK_ENVIRONMENT_TARGETS, getClerkPublishableKeyKind(), resolveClerkEnvironmentTarget(), verifyClientBuildForDeploy()

### Community 166 - "기능별 화면 · NoticeFormDialog()"
Cohesion: 0.25
Nodes (9): deleteNoticeThumbnail(), uploadNoticeThumbnail(), addDays(), formatDateInput(), formatUploadSize(), getUploadFailureMessage(), isValidHttpUrl(), isValidImageResourceUrl() (+1 more)

### Community 167 - "설정·빌드 경계 · compilerOptions"
Cohesion: 0.22
Nodes (8): compilerOptions, baseUrl, paths, types, files, @contracts/*, @db/*, references

### Community 168 - "SQL 변경 이력 · 0026_first_toro.sql"
Cohesion: 0.39
Nodes (7): idx_x_api_usage_events_created_at, idx_x_api_usage_events_operation, idx_x_collection_runs_started_at, idx_x_collection_runs_status, idx_x_posts_hidden_at, `x_api_usage_events`, `x_collection_runs`

### Community 169 - "개발·릴리스 도구 · benchmark-otw-play-reads.mjs"
Cohesion: 0.25
Nodes (4): generated, output, root, sources

### Community 170 - "개발·릴리스 도구 · sync-agent-to-cursor.mjs"
Cohesion: 0.39
Nodes (7): checkLinks(), filesUnder(), localLinks(), rules, skills, slash(), syncAgentFiles()

### Community 171 - "SQL 변경 이력 · 0038_misty_speed_demon.sql"
Cohesion: 0.52
Nodes (6): `admin_audit_logs`, idx_admin_audit_logs_actor_created_at, idx_admin_audit_logs_created_at, idx_admin_audit_logs_event_created_at, idx_admin_audit_logs_resource_created_at, idx_admin_audit_logs_status_created_at

### Community 172 - "SQL 변경 이력 · 0079_next_iron_fist.sql"
Cohesion: 0.38
Nodes (6): idx_x_api_resource_daily_seen, idx_x_api_usage_daily_day, idx_x_post_references_due, idx_x_post_references_target, `x_api_resource_daily`, `x_api_usage_daily`

### Community 173 - "화면 라우팅 · OtwPlayPlaylistEditorPage()"
Cohesion: 0.29
Nodes (3): OtwPlayPlaylistEditorPage(), Route, Route

### Community 174 - "제품·운영 문서 · cache-policy.md"
Cohesion: 0.33
Nodes (5): Stored YouTube feeds with authenticated status and terminal run readback, Browser query, isolate memory, persistent D1 and HTTP caches, Documented YouTube/X/Naver fresh and stale TTL snapshot, X forceRefresh bypass and cost observation, WORKER_CACHE_POLICY and shared QueryClient TTL authorities

### Community 175 - "SQL 변경 이력 · 0087_burly_midnight.sql"
Cohesion: 0.60
Nodes (5): idx_music_playlists_owner_updated, `music_playlist_items`, `music_playlists`, uq_music_playlist_items_position, uq_music_playlists_owner_request

### Community 176 - "SQL 변경 이력 · 0137_x-repair-pending.sql"
Cohesion: 0.53
Nodes (5): idx_x_post_repair_facts, idx_x_post_repair_references, idx_x_quote_body_work_due, `x_post_repair_work`, `x_quote_body_work`

### Community 177 - "SQL 변경 이력 · 0144_talented_cassandra_nova.sql"
Cohesion: 0.33
Nodes (5): idx_scheduled_job_items_run_status_updated, idx_scheduled_job_runs_accepted, idx_scheduled_job_runs_job_accepted, idx_update_logs_datetime, idx_x_post_references_lease_token

### Community 178 - "설정·빌드 경계 · drizzle.config.ts"
Cohesion: 0.33
Nodes (5): envFiles, missing, required, dotenv, drizzle-kit

### Community 179 - "개발·릴리스 도구 · optimize-profile-backgrounds.mjs"
Cohesion: 0.33
Nodes (5): files, outputDir, projectRoot, sourceDir, widths

### Community 181 - "설정·빌드 경계 · OTW Wrangler static deployment configuration"
Cohesion: 0.53
Nodes (6): OTW Wrangler static deployment configuration, Static OTW D1/R2/Analytics resources, Static OTW Queue and ScheduledOperationsWorkflow bindings, Static OTW AI bindingtrue/modelgemini-3.8-flash/limit500, Static OTW worker/index.ts and dist/otw/client deployment, Static Seoul placement aws:ap-northeast-2

### Community 182 - "제품·운영 문서 · Change-scoped testing and maintenance"
Cohesion: 0.40
Nodes (5): Local real-D1/Queue regressions and composite verification, Actual D1 validates atomicity/CAS; browser flow remains separate, Change-scoped checks; final merge preparation owns preflight, Composite component evidence differs from single full preflight PASS, Change-scoped testing and maintenance

### Community 183 - "SQL 변경 이력 · 0005_kind_dday_type.sql"
Cohesion: 0.50
Nodes (4): `ddays_new`, idx_ddays_date, idx_ddays_date_new, `ddays`

### Community 184 - "SQL 변경 이력 · 0037_fast_power_man.sql"
Cohesion: 0.70
Nodes (4): idx_youtube_warmup_runs_source, idx_youtube_warmup_runs_started_at, idx_youtube_warmup_runs_status, `youtube_warmup_runs`

### Community 185 - "SQL 변경 이력 · 0097_fine_agent_zero.sql"
Cohesion: 0.40
Nodes (4): idx_music_channel_upload_origins_candidate, idx_music_ingestion_origins_job_candidate, `music_channel_upload_candidate_origins`, `music_ingestion_candidate_origins`

### Community 186 - "SQL 변경 이력 · `content_transition_chzzk_children`"
Cohesion: 0.50
Nodes (3): `content_transition_chzzk_children`, `content_transition_chzzk_stages`, `content_transition_chzzk_batches`

### Community 187 - "설정·빌드 경계 · client deployment"
Cohesion: 0.70
Nodes (5): LuvDia Wrangler static deployment configuration, Static LuvDia D1/R2/Analytics resources, Static LuvDia isolated Queue names and generic Workflow, Static LuvDia AI review bindingfalse, Static LuvDia worker/index.ts and dist/luvdia/client deployment

### Community 188 - "공유 계약 · isBooleanValue()"
Cohesion: 0.50
Nodes (4): isBooleanSettingValue(), isBooleanValue(), normalizeBoolean(), normalizeNullableBoolean()

### Community 189 - "제품·운영 문서 · OTW Play maintenance and verification guide"
Cohesion: 0.50
Nodes (4): Normal flow does not prove production faults or natural Cron, OTW Play maintenance and verification guide, Change affected DTO/application/adapter/HTTP/UI consumers, Real flow and authoritative readback define operational completion

### Community 190 - "SQL 변경 이력 · 0001_pink_whirlwind.sql"
Cohesion: 0.50
Nodes (3): idx_schedules_date, `__new_members`, `__new_schedules`

### Community 191 - "SQL 변경 이력 · 0029_fat_agent_brand.sql"
Cohesion: 0.50
Nodes (3): idx_pending_schedules_date_created_at, idx_schedules_date_member_time, idx_update_logs_member_created_at

### Community 192 - "SQL 변경 이력 · `music_ingestion_events`"
Cohesion: 0.83
Nodes (3): idx_music_ingestion_events_candidate_created_id, idx_music_ingestion_events_job_created_id, `music_ingestion_events`

### Community 193 - "SQL 변경 이력 · 0062_colorful_magma.sql"
Cohesion: 0.50
Nodes (3): idx_music_channel_upload_origins_monitor_generation_discovered, `music_channel_upload_candidate_origins`, uidx_music_channel_upload_monitors_channel

### Community 194 - "SQL 변경 이력 · 0104_asset_file_recovery.sql"
Cohesion: 0.83
Nodes (3): `asset_file_versions`, asset_file_versions_operation_id_unique, idx_asset_file_logical

### Community 195 - "SQL 변경 이력 · 0111_asset_file_url_identity.sql"
Cohesion: 0.67
Nodes (3): `asset_file_reference_paths`, `asset_file_retention_releases`, idx_asset_file_reference_path

## Knowledge Gaps
- **1471 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+1466 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1950 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **78 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SiteId` connect `기능별 업무·어댑터 · publicationHiddenSql()` to `Play 저장·조회 · D1AiReviewRepository`, `Worker 조립·Queue · routes.ts`, `기능별 업무·어댑터 · youtube.ts`, `기능별 업무·어댑터 · types.ts`, `기능별 업무·어댑터 · x-api.ts`, `기능별 업무·어댑터 · naver-cafe-collector.ts`, `Play 저장·조회 · d1-admin-catalog-repository.ts`, `Play 저장·조회 · WorkQueueRepository`, `기능별 업무·어댑터 · d1-active-handles.ts`, `Play 저장·조회 · d1-public-catalog-reader.ts`, `공유 계약 · content-history.ts`, `Play 저장·조회 · d1-source-health-repository.ts`, `기능별 업무·어댑터 · operations-application.ts`, `Play 저장·조회 · d1-member-submission-repository.ts`, `Play 저장·조회 · IngestionRepositoryError`, `일정 업무 · index.ts`, `기능별 업무·어댑터 · d1-notice-gateway.ts`, `기능별 업무·어댑터 · x-collection.ts`, `일정 업무 · schedule-handler.ts`, `Play 저장·조회 · D1IngestionRepository`, `기능별 업무·어댑터 · youtube-feed.ts`, `기능별 업무·어댑터 · x-reference-hydration.ts`, `기능별 업무·어댑터 · d1-asset-access-reader.ts`, `Play 저장·조회 · index.ts`, `기능별 업무·어댑터 · d1-member-posts-port.ts`, `Play 저장·조회 · D1WorkQueueRepository`, `일정 업무 · DbInstance`, `Play 저장·조회 · D1PublicCatalogReader`, `Play 저장·조회 · d1-ingestion-repository.ts`, `기능별 업무·어댑터 · d1-r2-file-store.ts`, `일정 업무 · live-schedule.ts`, `기능별 업무·어댑터 · d1-schedule-board.ts`, `기능별 업무·어댑터 · d1-protected-asset-reference-resolver.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `react` connect `Play 화면·조회 · react` to `Play 화면·조회 · catalog-manager.tsx`, `기능별 화면 · youtube-feed-manager.tsx`, `기능별 화면 · apiFetch()`, `기능별 화면 · utils.ts`, `기능별 화면 · notice-banner.tsx`, `Play 화면·조회 · member-profile-page.tsx`, `Play 화면·조회 · button.tsx`, `기능별 화면 · auto-update-settings.tsx`, `Play 화면·조회 · use-playlist-hero-transition.ts`, `화면 라우팅 · react-router`, `기능별 업무·어댑터 · publicationHiddenSql()`, `기능별 화면 · react-query`, `공통 UI·API · cn()`, `공유 계약 · content-history.ts`, `Play 화면·조회 · index.ts`, `기능별 화면 · x-posts.ts`, `설정·빌드 경계 · package.json`, `기능별 화면 · x-post-history-manager.tsx`, `Play 화면·조회 · playlist-editor-page.tsx`, `기능별 화면 · dday-manager.tsx`, `Play 화면·조회 · play-player-context.tsx`, `기능별 화면 · x-post-card.tsx`, `기능별 화면 · multiview-page.tsx`, `기능별 화면 · notice-page.tsx`, `Play 화면·조회 · ai-review-panel.tsx`, `기능별 화면 · site-content-metadata.tsx`, `기능별 화면 · notice-manager.tsx`, `기능별 화면 · member-posts-overview.tsx`, `기능별 화면 · snapshot-fonts.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `cn()` connect `공통 UI·API · cn()` to `Play 화면·조회 · index.ts`, `Play 화면·조회 · catalog-manager.tsx`, `기능별 화면 · dday-manager.tsx`, `Play 화면·조회 · react`, `기능별 화면 · NoticeFormDialog()`, `기능별 화면 · apiFetch()`, `기능별 화면 · youtube-feed-manager.tsx`, `기능별 화면 · utils.ts`, `Play 화면·조회 · button.tsx`, `Play 화면·조회 · member-profile-page.tsx`, `기능별 화면 · notice-banner.tsx`, `기능별 화면 · auto-update-settings.tsx`, `기능별 화면 · x-post-card.tsx`, `화면 라우팅 · react-router`, `기능별 화면 · multiview-page.tsx`, `기능별 화면 · react-query`, `기능별 화면 · notice-page.tsx`, `기능별 화면 · x-post-history-manager.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _1471 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SQL 변경 이력 · `content_transitions`` be split into smaller, more focused modules?**
  _Cohesion score 0.025156216332686922 - nodes in this community are weakly interconnected._
- **Should `D1 스키마 · index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.00881057268722467 - nodes in this community are weakly interconnected._
- **Should `SQL 변경 이력 · `music_channels`` be split into smaller, more focused modules?**
  _Cohesion score 0.07445887445887446 - nodes in this community are weakly interconnected._