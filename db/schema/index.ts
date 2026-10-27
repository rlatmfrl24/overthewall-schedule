import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  sqliteTable,
  text,
  index,
  check,
  foreignKey,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const multiviewChannels = sqliteTable("multiview_channels", {
  owner_user_id: text().notNull(),
  channel_id: text().notNull(),
  channel_name: text().notNull(),
  channel_image_url: text(),
  added_at: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.owner_user_id, table.channel_id] }),
  index("idx_multiview_channels_owner_added").on(table.owner_user_id, table.added_at, table.channel_id),
  check("multiview_channel_identity", sql`length(trim(${table.owner_user_id}))>0 AND length(${table.channel_id})=32 AND ${table.channel_id} NOT GLOB '*[^0-9a-f]*' AND length(trim(${table.channel_name}))>0`),
]);

export const musicAdminCommandResults = sqliteTable("music_admin_command_results", {
  site_id: text().notNull(),
  actor_user_id: text().notNull(),
  request_key: text().notNull(),
  request_hash: text().notNull(),
  http_status: integer().notNull(),
  result_json: text().notNull(),
  created_at: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.site_id, table.actor_user_id, table.request_key] }),
  check("music_admin_command_result_site", sql`${table.site_id} IN ('otw','luvdia')`),
  check("music_admin_command_result_identity", sql`length(${table.request_key}) BETWEEN 16 AND 100 AND length(${table.actor_user_id})>0 AND length(${table.request_hash})=64`),
  check("music_admin_command_result_response", sql`${table.http_status} IN (200,201) AND json_valid(${table.result_json}) AND json_type(${table.result_json})='object'`),
]);

export const assetFileReferences = sqliteTable("asset_file_references", {
  logical_key: text().primaryKey(), version_key: text().notNull(), hash: text().notNull(), size: integer().notNull(),
  content_type: text().notNull(), updated_at: integer().notNull(),
}, table => [check("asset_reference_bytes", sql`length(${table.hash})=64 AND ${table.size}>=0 AND length(${table.version_key})>0`)]);

export const assetFileReferencePaths=sqliteTable("asset_file_reference_paths",{
  row_table:text().notNull(),row_key:text().notNull(),field:text().notNull(),raw_url:text().notNull(),origin:text(),path:text().notNull(),
},table=>[
  primaryKey({columns:[table.row_table,table.row_key,table.field]}),
  index("idx_asset_file_reference_path").on(table.path,table.origin),
]);

export const assetFileRetentionReleases=sqliteTable("asset_file_retention_releases",{
  logical_key:text().primaryKey(),released_at:integer().notNull().default(0),held:integer().notNull().default(1),
},table=>[check("asset_retention_release_state",sql`${table.logical_key} LIKE 'notices/thumbnails/%' AND ${table.released_at}>=0 AND ${table.held} IN (0,1) AND (${table.held}=1 OR ${table.released_at}>0)`) ]);

export const assetFileVersions = sqliteTable("asset_file_versions", {
  version_key: text().primaryKey(), operation_id: text().notNull().unique(), logical_key: text().notNull(),
  site_id: text().notNull(), generation: integer().notNull(), resource: text().notNull(),
  previous_version: text(), hash: text().notNull(), size: integer().notNull(), content_type: text().notNull(),
  member_uid:integer(),member_code:text(),
  transition_id: text(), transition_operation_id: text(), created_at: integer().notNull(), attempted_at: integer(),
  object_version: text(), verified_at: integer(), reference_committed_at: integer(), acknowledged_at: integer(), released_at: integer(),
}, table => [
  index("idx_asset_file_logical").on(table.logical_key),
  check("asset_file_identity", sql`${table.site_id} IN ('otw','luvdia') AND ${table.generation}>0 AND length(${table.hash})=64 AND ${table.size}>=0 AND length(${table.logical_key})>0 AND length(${table.operation_id})>0 AND length(${table.resource})>0`),
  check("asset_file_progress", sql`(${table.object_version} IS NULL)=(${table.verified_at} IS NULL) AND (${table.reference_committed_at} IS NULL OR ${table.verified_at} IS NOT NULL) AND (${table.acknowledged_at} IS NULL OR ${table.reference_committed_at} IS NOT NULL) AND (${table.transition_id} IS NULL)=(${table.transition_operation_id} IS NULL)`),
]);

export const contentTransitions = sqliteTable("content_transitions", {
  id: text().primaryKey(),
  source_site: text().notNull(), target_site: text().notNull(),
  source_resource: text().notNull(), target_resource: text().notNull(),
  local_site: text().notNull(), local_resource: text().notNull(),
  generation: integer().notNull(), protocol: integer().notNull(),
  manifest_digest: text().notNull(), manifest_revision:integer().notNull().default(0), plan_json: text().notNull(),
  phase: text().notNull().default("prepared"),
  maintenance_state: text().notNull().default("open"),
  maintenance_started_at: integer(),
  maintenance_stopped_at: integer(),
  maintenance_proof_json: text(),
  aborted_at: integer(),
  protection_receipt_json: text(), readiness_json: text(), readiness_expires_at: integer(),
  fence_json: text(), installation_json: text(), archive_receipt_json: text(),
  checkpoint_revision: integer().notNull().default(0),
  checkpoints_json: text().notNull().default("[]"),
}, table => [
  check("content_transition_sites", sql`${table.source_site} IN ('otw','luvdia') AND ${table.target_site} IN ('otw','luvdia') AND ${table.source_site} <> ${table.target_site}
    AND ((${table.local_site} = ${table.source_site} AND ${table.local_resource} = ${table.source_resource}) OR (${table.local_site} = ${table.target_site} AND ${table.local_resource} = ${table.target_resource}))
    AND length(${table.source_resource}) > 0 AND length(${table.target_resource}) > 0 AND ${table.source_resource} <> ${table.target_resource}`),
  check("content_transition_protocol", sql`${table.protocol} = 1 AND ${table.generation} >= 2 AND ${table.checkpoint_revision} >= 0`),
  check("content_transition_phase", sql`${table.phase} IN ('prepared','protected','copying','replaying','target_ingress_ready','source_fenced','target_owned','complete')`),
  check("content_transition_json", sql`json_valid(${table.plan_json}) AND json_type(${table.plan_json})='object' AND json_valid(${table.checkpoints_json}) AND json_type(${table.checkpoints_json})='array'`),
  uniqueIndex("uidx_content_transition_active").on(sql`(1)`).where(sql`${table.phase} <> 'complete' AND ${table.aborted_at} IS NULL`),
]);
export const contentTransitionOperations = sqliteTable("content_transition_operations", {
  seq: integer().primaryKey({ autoIncrement: true }),
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  operation_id: text().notNull(), idempotency_key: text().notNull(), payload_hash: text().notNull(),
  source_seq: integer(),
  generation: integer().notNull(), admitted_at: integer().notNull(),
  envelope_json: text().notNull(), attempt_json: text(), outcome_json: text(),
  transferred: integer({ mode: "boolean" }).notNull().default(false),
  outcome_acknowledged: integer({ mode: "boolean" }).notNull().default(false),
}, table => [
  uniqueIndex("uidx_content_transition_operation").on(table.transition_id, table.operation_id),
  uniqueIndex("uidx_content_transition_idempotency").on(table.transition_id, table.idempotency_key),
  uniqueIndex("uidx_content_transition_source_operation").on(table.transition_id, table.source_seq),
  check("content_transition_operation_envelope", sql`length(${table.operation_id})>0 AND length(${table.payload_hash})>0 AND length(${table.idempotency_key})>0 AND ${table.generation}>0 AND json_valid(${table.envelope_json}) AND json_type(${table.envelope_json})='object'`),
]);
export const contentTransitionFileIntents = sqliteTable("content_transition_file_intents", {
  seq: integer().primaryKey({ autoIncrement: true }),
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  intent_id: text().notNull(), operation_id: text().notNull(), generation: integer().notNull(),
  source_seq: integer(),
  version_key: text().notNull(), envelope_json: text().notNull(), outcome_json: text(),
  transferred: integer({ mode: "boolean" }).notNull().default(false),
  outcome_acknowledged: integer({ mode: "boolean" }).notNull().default(false),
}, table => [
  uniqueIndex("uidx_content_transition_file_intent").on(table.transition_id, table.intent_id),
  uniqueIndex("uidx_content_transition_source_file").on(table.transition_id, table.source_seq),
  uniqueIndex("uidx_content_transition_file_version").on(table.version_key),
  foreignKey({ columns: [table.transition_id, table.operation_id], foreignColumns: [contentTransitionOperations.transition_id, contentTransitionOperations.operation_id] }),
  check("content_transition_file_envelope", sql`json_valid(${table.envelope_json}) AND json_type(${table.envelope_json})='object' AND length(${table.intent_id})>0 AND length(${table.version_key})>0 AND ${table.generation}>0`),
]);
export const contentTransitionFileEvidence=sqliteTable("content_transition_file_evidence",{
  transition_id:text().notNull(),intent_id:text().notNull(),evidence_id:text().notNull(),observation_json:text().notNull(),
},table=>[
  primaryKey({columns:[table.transition_id,table.intent_id,table.evidence_id]}),
  foreignKey({columns:[table.transition_id,table.intent_id],foreignColumns:[contentTransitionFileIntents.transition_id,contentTransitionFileIntents.intent_id]}).onDelete("cascade"),
  check("content_file_evidence_json",sql`json_valid(${table.observation_json}) AND json_type(${table.observation_json})='object'`),
]);
export const contentTransitionCommits = sqliteTable("content_transition_commits", {
  seq: integer().primaryKey({ autoIncrement: true }),
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  operation_id: text().notNull(), sealed: integer({ mode: "boolean" }).notNull().default(false),
}, table => [uniqueIndex("uidx_content_transition_commit").on(table.transition_id, table.operation_id)]);
export const contentTransitionPermits = sqliteTable("content_transition_permits", {
  id: integer().primaryKey(), transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  operation_id: text().notNull(), generation: integer().notNull(),
  mode: text().notNull().default("business"),
  version_matches: integer().notNull().default(1),
  commit_seq: integer().notNull().references(() => contentTransitionCommits.seq, { onDelete: "cascade" }),
}, table => [
  check("content_transition_single_permit", sql`${table.id}=1 AND ${table.generation}>0 AND ${table.mode} IN ('business','baseline','archive','identity')`),
  check("content_transition_version_conflict", sql`${table.version_matches}=1`),
]);
export const contentTransitionDirtyRows = sqliteTable("content_transition_dirty_rows", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  row_table: text().notNull(), row_key: text().notNull(),
  structural: integer().notNull().default(1),
}, table => [primaryKey({ columns: [table.transition_id, table.row_table, table.row_key] })]);
export const contentTransitionEvidence = sqliteTable("content_transition_evidence", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  operation_id: text().notNull(), evidence_id: text().notNull(), attempt_identity: text().notNull(),
  evidence_json: text().notNull(),
}, table => [
  primaryKey({ columns: [table.transition_id, table.operation_id, table.evidence_id] }),
  foreignKey({ columns: [table.transition_id, table.operation_id], foreignColumns: [contentTransitionOperations.transition_id, contentTransitionOperations.operation_id] }),
  check("content_transition_evidence_json", sql`json_valid(${table.evidence_json}) AND json_type(${table.evidence_json})='object'`),
]);
export const contentTransitionReplay = sqliteTable("content_transition_replay", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  commit_seq: integer().notNull(), previous_commit: integer().notNull(), digest: text().notNull(),
  projected_json: text().notNull(),
}, table => [
  primaryKey({ columns: [table.transition_id, table.commit_seq] }),
  check("content_transition_replay_json", sql`json_valid(${table.projected_json}) AND json_type(${table.projected_json})='array' AND ${table.commit_seq}>${table.previous_commit}`),
]);
export const contentTransitionDirtyRoots = sqliteTable("content_transition_dirty_roots", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  root_table: text().notNull(), root_key: text().notNull(),
}, table => [primaryKey({ columns: [table.transition_id, table.root_table, table.root_key] })]);
export const contentTransitionMembership = sqliteTable("content_transition_membership", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  root_table: text().notNull(), root_key: text().notNull(), row_table: text().notNull(), row_key: text().notNull(),
  archive_previous_access: text(),
}, table => [
  primaryKey({ columns: [table.transition_id, table.root_table, table.root_key, table.row_table, table.row_key] }),
  index("idx_content_transition_membership_row").on(table.transition_id, table.row_table, table.row_key),
  index("idx_content_transition_membership_lookup").on(table.row_table, table.row_key, table.transition_id),
]);
export const contentTransitionImages = sqliteTable("content_transition_images", {
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  row_table: text().notNull(), row_key: text().notNull(), image_json: text().notNull(),
  root_count: integer().notNull().default(0),
}, table => [
  primaryKey({ columns: [table.transition_id, table.row_table, table.row_key] }),
  index("idx_content_transition_images_orphan").on(table.transition_id, table.root_count),
  check("content_transition_image_json", sql`json_valid(${table.image_json}) AND json_type(${table.image_json})='object'`),
]);
export const contentTransitionJournal = sqliteTable("content_transition_journal", {
  seq: integer().primaryKey({ autoIncrement: true }),
  transition_id: text().notNull().references(() => contentTransitions.id, { onDelete: "cascade" }),
  commit_seq: integer().notNull().references(() => contentTransitionCommits.seq, { onDelete: "cascade" }),
  row_table: text().notNull(), row_key: text().notNull(), before_json: text(), after_json: text(),
}, table => [
  index("idx_content_transition_journal_commit").on(table.transition_id, table.commit_seq, table.seq),
  index("idx_content_transition_journal_row").on(table.transition_id,table.row_table,table.row_key,table.commit_seq,table.seq),
  check("content_transition_journal_image", sql`${table.before_json} IS NOT NULL OR ${table.after_json} IS NOT NULL`),
]);
export const contentTransitionIdentityProofs=sqliteTable("content_transition_identity_proofs",{
  transition_id:text().notNull().references(()=>contentTransitions.id,{onDelete:"cascade"}),
  member_uid:integer().notNull(),first_commit:integer().notNull(),target_entity_id:text().notNull(),
  source_name:text().notNull(),normalized_name:text().notNull(),
  protocol:integer().notNull(),manifest_digest:text().notNull(),manifest_revision:integer().notNull(),generation:integer().notNull(),
},table=>[
  primaryKey({columns:[table.transition_id,table.member_uid,table.source_name]}),
  check("content_identity_proof_shape",sql`${table.protocol}=1 AND ${table.first_commit}>0 AND length(${table.target_entity_id})>0 AND length(${table.normalized_name})>0`),
]);
export const contentHistoricalRecords = sqliteTable("content_historical_records", {
  source_site: text().notNull(), source_table: text().notNull(), source_key: text().notNull(),
  record_json: text().notNull(), protocol: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.source_site, table.source_table, table.source_key] }),
  check("content_historical_record", sql`${table.source_site} IN ('otw','luvdia') AND ${table.protocol}=1 AND json_valid(${table.record_json}) AND json_type(${table.record_json})='object'`),
]);
export const contentHistoricalLinks = sqliteTable("content_historical_links", {
  source_site: text().notNull(), source_table: text().notNull(), source_key: text().notNull(),
  subject_table: text().notNull(), subject_key: text().notNull(),
}, table => [
  primaryKey({ columns: [table.source_site,table.source_table,table.source_key,table.subject_table,table.subject_key] }),
  foreignKey({ columns: [table.source_site,table.source_table,table.source_key], foreignColumns: [contentHistoricalRecords.source_site,contentHistoricalRecords.source_table,contentHistoricalRecords.source_key], name:"content_historical_link_record" }).onDelete("cascade"),
  index("idx_content_historical_subject").on(table.subject_table,table.subject_key),
]);

export const musicAiReviewBatches = sqliteTable("music_ai_review_batches", {
  id: text().primaryKey(),
  actor: text().notNull(),
  request_key: text().notNull().unique(),
  selection_json: text().notNull(),
  created_at: integer().notNull(),
});
export const contentTransitionChzzkRequests = sqliteTable("content_transition_chzzk_requests", {
  transition_id:text().notNull(),operation_id:text().notNull(),request_key:text().notNull(),request_hash:text().notNull(),request_json:text().notNull(),
  response_hash:text(),response_json:text(),attempt:integer().notNull().default(0),claim:text(),retry_at:integer().notNull().default(0),
  disposition:text(),settled_outcome_digest:text(),settled_at:integer(),
},table=>[
  primaryKey({columns:[table.transition_id,table.operation_id,table.request_key]}),
  foreignKey({columns:[table.transition_id,table.operation_id],foreignColumns:[contentTransitionOperations.transition_id,contentTransitionOperations.operation_id]}).onDelete("cascade"),
  check("content_transition_chzzk_request_state",sql`length(${table.request_hash})=64 AND json_valid(${table.request_json}) AND ${table.attempt}>=0 AND ${table.retry_at}>=0 AND (${table.response_hash} IS NULL)=(${table.response_json} IS NULL) AND (${table.response_hash} IS NULL OR (length(${table.response_hash})=64 AND json_valid(${table.response_json})))`),
]);
export const contentTransitionChzzkAttempts = sqliteTable("content_transition_chzzk_attempts", {
  transition_id:text().notNull(),operation_id:text().notNull(),request_key:text().notNull(),attempt:integer().notNull(),claim:text().notNull(),
  started_at:integer().notNull(),uncertain_at:integer(),finished_at:integer(),state:text().notNull().default("started"),response_hash:text(),
  superseded_by_response_hash:text(),resolved_at:integer(),
},table=>[
  primaryKey({columns:[table.transition_id,table.operation_id,table.request_key,table.attempt]}),
  foreignKey({columns:[table.transition_id,table.operation_id,table.request_key],foreignColumns:[contentTransitionChzzkRequests.transition_id,contentTransitionChzzkRequests.operation_id,contentTransitionChzzkRequests.request_key]}).onDelete("cascade"),
  check("content_transition_chzzk_attempt_state",sql`${table.attempt}>0 AND length(${table.claim})>0 AND ${table.started_at}>=0 AND ${table.state} IN ('started','uncertain','response_committed','superseded','failed') AND (${table.response_hash} IS NULL OR length(${table.response_hash})=64)`),
]);
export const contentTransitionChzzkStages=sqliteTable("content_transition_chzzk_stages",{
  transition_id:text().notNull(),operation_id:text().notNull(),parent_json:text().notNull(),
  completion_json:text(),handover_acknowledged:integer({mode:"boolean"}).notNull().default(false),finalizer_json:text(),
},table=>[
  primaryKey({columns:[table.transition_id,table.operation_id]}),
  foreignKey({columns:[table.transition_id,table.operation_id],foreignColumns:[contentTransitionOperations.transition_id,contentTransitionOperations.operation_id]}).onDelete("cascade"),
  check("content_chzzk_stage_json",sql`json_valid(${table.parent_json}) AND (${table.completion_json} IS NULL OR json_valid(${table.completion_json})) AND (${table.finalizer_json} IS NULL OR json_valid(${table.finalizer_json}))`),
]);
export const contentTransitionChzzkChildren=sqliteTable("content_transition_chzzk_children",{
  transition_id:text().notNull(),operation_id:text().notNull(),child_key:text().notNull(),member_uid:integer().notNull(),member_code:text().notNull(),date:text().notNull(),
  input_json:text(),result_json:text(),accounted_at:integer(),
},table=>[
  primaryKey({columns:[table.transition_id,table.operation_id,table.child_key]}),
  foreignKey({columns:[table.transition_id,table.operation_id],foreignColumns:[contentTransitionChzzkStages.transition_id,contentTransitionChzzkStages.operation_id]}).onDelete("cascade"),
  check("content_chzzk_child_result",sql`${table.member_uid}>0 AND length(${table.child_key})>0 AND length(${table.member_code})>0 AND (${table.result_json} IS NULL OR json_valid(${table.result_json})) AND (${table.accounted_at} IS NULL OR ${table.result_json} IS NOT NULL)`),
]);
export const contentTransitionChzzkBatches=sqliteTable("content_transition_chzzk_batches",{
  transition_id:text().notNull(),operation_id:text().notNull(),child_key:text().notNull(),batch_key:text().notNull(),
  command_json:text().notNull(),before_json:text().notNull(),result_json:text(),
},table=>[
  primaryKey({columns:[table.transition_id,table.operation_id,table.child_key,table.batch_key]}),
  foreignKey({columns:[table.transition_id,table.operation_id,table.child_key],foreignColumns:[contentTransitionChzzkChildren.transition_id,contentTransitionChzzkChildren.operation_id,contentTransitionChzzkChildren.child_key]}).onDelete("cascade"),
  check("content_chzzk_batch_json",sql`json_valid(${table.command_json}) AND json_valid(${table.before_json}) AND (${table.result_json} IS NULL OR json_valid(${table.result_json}))`),
]);

export const assetFileCleanup = sqliteTable("asset_file_cleanup", {
  object_key:text().primaryKey(),logical_key:text().notNull(),site_id:text().notNull(),resource:text().notNull(),
  object_version:text().notNull(),hash:text().notNull(),size:integer().notNull(),generation:integer().notNull().default(1),claimed_at:integer().notNull(),deleted_at:integer(),
},table=>[
  index("idx_asset_file_cleanup_logical").on(table.logical_key),
  check("asset_cleanup_identity",sql`${table.site_id} IN ('otw','luvdia') AND length(${table.resource})>0 AND length(${table.object_version})>0 AND length(${table.hash})=64 AND ${table.size}>=0 AND ${table.claimed_at}>=0 AND (${table.deleted_at} IS NULL OR ${table.deleted_at}>=${table.claimed_at})`),
]);
export const contentTransitionFileAvailabilityEvidence=sqliteTable("content_transition_file_availability_evidence",{
  transition_id:text().notNull().references(()=>contentTransitions.id,{onDelete:"cascade"}),
  evidence_id:text().notNull(),observation_json:text().notNull(),
},table=>[
  primaryKey({columns:[table.transition_id,table.evidence_id]}),
  check("content_file_availability_observation",sql`json_valid(${table.observation_json}) AND json_type(${table.observation_json})='object'`),
]);
export const contentTransitionManifestRevisions=sqliteTable("content_transition_manifest_revisions",{
  transition_id:text().notNull().references(()=>contentTransitions.id,{onDelete:"cascade"}),
  revision:integer().notNull(),parent_digest:text().notNull(),manifest_digest:text().notNull(),receipt_json:text().notNull(),
},table=>[
  primaryKey({columns:[table.transition_id,table.revision]}),
  uniqueIndex("uidx_content_manifest_parent").on(table.transition_id,table.parent_digest),
  uniqueIndex("uidx_content_manifest_digest").on(table.transition_id,table.manifest_digest),
  check("content_manifest_revision",sql`${table.revision}>0 AND json_valid(${table.receipt_json})`),
]);
export const contentTransitionBaselines = sqliteTable("content_transition_baselines", {
  transition_id:text().primaryKey().references(()=>contentTransitions.id,{onDelete:"cascade"}),
  manifest_digest:text().notNull(),
  source_boundary:integer().notNull(), expected_rows:integer().notNull(), expected_digest:text().notNull(),
  staged_rows:integer().notNull().default(0), staged_digest:text().notNull().default("0"),
  receipt_json:text(),
},table=>[check("content_baseline_counts",sql`${table.expected_rows}>=0 AND ${table.staged_rows}>=0 AND ${table.staged_rows}<=${table.expected_rows}`)]);
export const contentTransitionBaselineRows=sqliteTable("content_transition_baseline_rows",{
  transition_id:text().notNull().references(()=>contentTransitionBaselines.transition_id,{onDelete:"cascade"}),
  ordinal:integer().notNull(), row_table:text().notNull(), row_key:text().notNull(),
  row_digest:text().notNull(), record_json:text().notNull(), dependency_rank:integer().notNull(),
  installed:integer({mode:"boolean"}).notNull().default(false),
},table=>[
  primaryKey({columns:[table.transition_id,table.ordinal]}),
  uniqueIndex("uidx_content_baseline_row").on(table.transition_id,table.row_table,table.row_key),
  index("idx_content_baseline_pending").on(table.transition_id,table.installed,table.dependency_rank,table.ordinal),
  check("content_baseline_record",sql`${table.ordinal}>=0 AND json_valid(${table.record_json}) AND json_type(${table.record_json})='object'`),
]);
export const musicPlaylistWorkQueues = sqliteTable("music_playlist_work_queues", {
  id: text().primaryKey(),
  playlist_id: text().notNull().unique(),
  source_url: text().notNull(),
  title: text(),
  owner_channel_id: text(),
  owner_channel_title: text(),
  item_count: integer(),
  metadata_checked_at: integer(),
  page_token: text(),
  scan_generation: integer().notNull().default(1),
  scan_item_count: integer(),
  scan_checked_at: integer(),
  progress_uncertain: integer().notNull().default(1),
  status: text().notNull().default("checking"),
  error_message: text(),
  actor: text().notNull(),
  version: integer().notNull().default(0),
  lease_token: text(),
  lease_until: integer(),
  dispatch_until: integer(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}, table => [
  check("playlist_work_queue_status", sql`${table.status} IN ('checking','waiting','exhausted','failed','archived')`),
  index("idx_playlist_work_queue_pending").on(table.status, table.dispatch_until),
]);
export const musicPlaylistWorkBatches = sqliteTable("music_playlist_work_batches", {
  id: text().primaryKey(),
  queue_id: text().notNull().references(() => musicPlaylistWorkQueues.id),
  job_id: text().notNull().unique(),
  ai_batch_id: text(),
  request_key: text().notNull().unique(),
  actor: text().notNull(),
  status: text().notNull().default("preparing"),
  page_token: text(),
  next_page_token: text(),
  page_recorded: integer().notNull().default(0),
  scan_generation: integer().notNull().default(1),
  completion_key: text(),
  start_next: integer().notNull().default(0),
  next_batch_id: text(),
  error_message: text(),
  version: integer().notNull().default(0),
  lease_token: text(),
  lease_until: integer(),
  dispatch_until: integer(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}, table => [
  uniqueIndex("uidx_playlist_work_active_batch").on(sql`(1)`).where(sql`${table.status} != 'completed'`),
  index("idx_playlist_work_batches_queue").on(table.queue_id, table.created_at),
  index("idx_playlist_work_batches_pending").on(table.status, table.dispatch_until),
  check("playlist_work_batch_status", sql`${table.status} IN ('preparing','review','completing','completed')`),
]);
export const musicPlaylistWorkItems = sqliteTable("music_playlist_work_items", {
  id: text().primaryKey(),
  batch_id: text().notNull().references(() => musicPlaylistWorkBatches.id),
  candidate_id: text(),
  playlist_item_id: text().notNull(),
  playlist_position: integer(),
  disposition: text().notNull().default("pending"),
  reason: text(),
  error_message: text(),
  version: integer().notNull().default(0),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}, table => [
  uniqueIndex("uidx_playlist_work_batch_item").on(table.batch_id, table.playlist_item_id),
  index("idx_playlist_work_items_candidate").on(table.candidate_id, table.disposition),
  index("idx_playlist_work_items_deferred").on(table.disposition, table.id),
  check("playlist_work_item_disposition", sql`${table.disposition} IN ('pending','deferred','excluded','duplicate')`),
]);
export const musicAiReviewBatchItems = sqliteTable("music_ai_review_batch_items", {
  id: text().primaryKey(),
  batch_id: text().notNull().references(() => musicAiReviewBatches.id, { onDelete: "cascade" }),
  candidate_id: text().notNull(),
  candidate_version: integer().notNull(),
  candidate_kind: text().notNull(),
  title: text(),
  auto_apply: integer().notNull(),
  dispatch_until: integer(),
  status: text().notNull().default("queued"),
  review_id: text(),
  generation: integer().notNull().default(0),
  result_json: text(),
  error_message: text(),
  lease_token: text(),
  lease_until: integer(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}, table => [
  uniqueIndex("uidx_ai_batch_candidate").on(table.batch_id, table.candidate_id),
  uniqueIndex("uidx_ai_batch_active_candidate").on(table.candidate_id).where(sql`${table.status} IN ('queued','analyzing','saving')`),
  index("idx_ai_batch_draft").on(table.candidate_id, table.created_at),
  index("idx_ai_batch_pending").on(table.status, table.lease_until),
  check("ai_batch_item_status", sql`${table.status} IN ('queued','analyzing','saving','saved','needs_selection','failed','changed')`),
]);

export const musicAiReviews = sqliteTable("music_ai_reviews", {
  id: text().primaryKey(),
  candidate_id: text(),
  video_id: text().notNull(),
  candidate_kind: text().notNull(),
  range_json: text().notNull(),
  target_key: text().notNull(),
  input_hash: text().notNull(),
  input_json: text(),
  model: text().notNull(),
  prompt_version: text().notNull(),
  status: text().notNull(),
  result_json: text(),
  usage_json: text(),
  attempts: integer().notNull().default(0),
  lease_token: text(),
  lease_until: integer(),
  next_retry_at: integer(),
  error_code: text(),
  error_message: text(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
  expires_at: integer().notNull(),
}, table => [
  index("idx_music_ai_reviews_expires_id").on(table.expires_at,table.id),
  index("idx_music_ai_reviews_hash_expiry").on(table.input_hash,table.expires_at),
  index("idx_music_ai_reviews_target").on(table.target_key, table.created_at),
  index("idx_music_ai_reviews_recovery").on(table.status, table.next_retry_at),
  uniqueIndex("uidx_music_ai_reviews_active").on(table.input_hash).where(sql`${table.status} IN ('queued','running','retry_wait')`),
  check("music_ai_reviews_status", sql`${table.status} IN ('queued','running','retry_wait','succeeded','partial','failed')`),
  check("music_ai_reviews_kind", sql`${table.candidate_kind} IN ('official_video','singing_clip')`),
  check("music_ai_reviews_attempts", sql`${table.attempts} BETWEEN 0 AND 3`),
]);
export const musicAiReviewRequests = sqliteTable("music_ai_review_requests", {
  request_key: text().primaryKey(),
  request_hash: text().notNull(),
  review_id: text().notNull().references(() => musicAiReviews.id, { onDelete: "cascade" }),
  created_at: integer().notNull(),
});

export const contentTransitionFileInventories=sqliteTable("content_transition_file_inventories",{
  transition_id:text().notNull().references(()=>contentTransitions.id,{onDelete:"cascade"}),inventory_id:text().notNull(),
  plan_json:text().notNull(),manifest_revision:integer().notNull(),state:text().notNull().default("armed"),
  coverage_json:text(),source_boundary:integer(),expected_rows:integer(),expected_digest:text(),
  staged_rows:integer().notNull().default(0),staged_digest:text().notNull().default("0"),
},table=>[
  primaryKey({columns:[table.transition_id,table.inventory_id]}),
  check("content_file_inventory_state",sql`${table.state} IN ('armed','observed','sealed','receiving','received') AND json_valid(${table.plan_json}) AND ${table.manifest_revision}>=0 AND ${table.staged_rows}>=0`),
]);
export const contentTransitionFileInventoryRows=sqliteTable("content_transition_file_inventory_rows",{
  transition_id:text().notNull(),inventory_id:text().notNull(),kind:text().notNull(),identity:text().notNull(),value_json:text().notNull(),
},table=>[
  primaryKey({columns:[table.transition_id,table.inventory_id,table.kind,table.identity]}),
  foreignKey({columns:[table.transition_id,table.inventory_id],foreignColumns:[contentTransitionFileInventories.transition_id,contentTransitionFileInventories.inventory_id]}).onDelete("cascade"),
  check("content_file_inventory_row",sql`${table.kind} IN ('reference','object') AND json_valid(${table.value_json})`),
]);
export const contentTransitionMaterializedRows=sqliteTable("content_transition_materialized_rows",{
  transition_id:text().notNull().references(()=>contentTransitions.id,{onDelete:"cascade"}),
  row_table:text().notNull(),row_key:text().notNull(),
},table=>[primaryKey({columns:[table.transition_id,table.row_table,table.row_key]})]);
export const contentHistoricalRelations=sqliteTable("content_historical_relations",{
  source_site:text().notNull(),from_table:text().notNull(),from_key:text().notNull(),
  to_table:text().notNull(),to_key:text().notNull(),
},table=>[
  primaryKey({columns:[table.source_site,table.from_table,table.from_key,table.to_table,table.to_key]}),
  index("idx_content_history_relation_target").on(table.source_site,table.to_table,table.to_key),
]);
export const musicAiReviewAttempts = sqliteTable("music_ai_review_attempts", {
  token: text().primaryKey(),
  review_id: text().notNull().references(() => musicAiReviews.id, { onDelete: "cascade" }),
  started_at: integer().notNull(),
  finished_at: integer(),
  outcome: text().notNull().default("running"),
  usage_json: text(),
}, table => [index("idx_music_ai_review_attempts_started").on(table.started_at)]);

export const musicPlaylists = sqliteTable("music_playlists", {
  id: text().primaryKey(),
  owner_user_id: text().notNull(),
  title: text().notNull(),
  description: text().notNull().default(""),
  version: integer().notNull().default(0),
  origin_default_id: text(),
  representative_performance_id: text(),
  create_request_id: text().notNull(),
  create_payload: text().notNull(),
  write_token: text().notNull(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
}, table => [
  uniqueIndex("uq_music_playlists_owner_request").on(table.owner_user_id, table.create_request_id),
  index("idx_music_playlists_owner_updated").on(table.owner_user_id, table.updated_at),
  check("music_playlists_title_check", sql`length(trim(${table.title})) BETWEEN 1 AND 120`),
  check("music_playlists_version_check", sql`${table.version} >= 0`),
]);

export const musicPlaylistItems = sqliteTable("music_playlist_items", {
  playlist_id: text().notNull().references(() => musicPlaylists.id, { onDelete: "cascade" }),
  // Keep the reference when a catalog performance is deleted; readback returns an unavailable slot.
  performance_id: text().notNull(),
  position: integer().notNull(),
}, table => [
  primaryKey({ columns: [table.playlist_id, table.performance_id] }),
  uniqueIndex("uq_music_playlist_items_position").on(table.playlist_id, table.position),
  check("music_playlist_items_position_check", sql`${table.position} >= 0`),
]);

import type {
  OtwPlayCatalogEventActorKind,
  OtwPlayChannelRole,
  OtwPlayChannelVerificationStatus,
  OtwPlayDatePrecision,
  OtwPlayEntityKind,
  OtwPlayIngestionCandidateStatus,
  OtwPlayIngestionClassification,
  OtwPlayIngestionConversionOutcome,
  OtwPlayIngestionJobStatus,
  OtwPlayParticipantRole,
  OtwPlayParticipationType,
  OtwPlayProvider,
  OtwPlayProposalStatus,
  OtwPlayPublicationStatus,
  OtwPlayQualityStatus,
  OtwPlayRelationType,
  OtwPlayReleaseType,
  OtwPlaySearchTermKind,
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceRelationType,
  OtwPlaySourceRole,
} from "../../contracts/otw-play";

export const members = sqliteTable(
  "members",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    uid: integer().primaryKey({ autoIncrement: true }),
    code: text().notNull(),
    name: text().notNull(),
    main_color: text("main_color"),
    sub_color: text("sub_color"),
    oshi_mark: text("oshi_mark"),
    url_twitter: text("url_twitter"),
    url_youtube: text("url_youtube"),
    url_chzzk: text("url_chzzk"),
    youtube_channel_id: text("youtube_channel_id"), // UCxxxxxxxx 형태의 YouTube 채널 ID
    birth_date: text("birth_date"),
    debut_date: text("debut_date"),
    unit_name: text("unit_name"),
    fan_name: text("fan_name"),
    introduction: text("introduction"),
    is_deprecated: integer("is_deprecated", { mode: "boolean" }),
  },
  (table) => [check("members_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_members_code").on(table.code),
    index("idx_members_youtube_channel").on(table.youtube_channel_id)],
);

export const memberProfileImages = sqliteTable(
  "member_profile_images",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    image_url: text("image_url").notNull(),
    alt: text(),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_member_profile_images_member_uid").on(table.member_uid),
    index("idx_member_profile_images_member_sort").on(
      table.member_uid,
      table.sort_order,
    ),
  ],
);

export const memberLinks = sqliteTable(
  "member_links",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    type: text("type").notNull(),
    label: text().notNull(),
    url: text().notNull(),
    youtube_channel_id: text("youtube_channel_id"),
    sort_order: integer("sort_order").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_member_links_member_uid").on(table.member_uid),
    index("idx_member_links_youtube_owner").on(table.youtube_channel_id, table.member_uid),
    index("idx_member_links_member_sort").on(table.member_uid, table.sort_order),
    check(
      "member_links_type_check",
      sql`type IN ('youtube_vod', 'youtube_sub', 'twitcasting')`,
    ),
  ],
);

export const schedules = sqliteTable(
  "schedules",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull(),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("schedules_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_schedules_date").on(table.date),
    index("idx_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
    index("idx_schedules_date_member_time").on(
      table.date,
      table.member_uid,
      table.start_time,
    ),
    check(
      "schedules_status_check",
      sql`status IN ('방송', '휴방', '게릴라', '미정')`,
    ),
  ],
);

export const notices = sqliteTable(
  "notices",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: integer().primaryKey({ autoIncrement: true }),
    content: text().notNull(),
    links: text("links", { mode: "json" })
      .$type<Array<{ label: string; url: string }>>()
      .notNull()
      .default(sql`'[]'`),
    image_urls: text("image_urls", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    related_member_uids: text("related_member_uids", { mode: "json" })
      .$type<number[]>()
      .notNull()
      .default(sql`'[]'`),
    historical_related_people: text("historical_related_people", { mode: "json" })
      .$type<import("../../contracts/content-history").HistoricalPersonCredit[]>().notNull().default(sql`'[]'`),
    url: text(),
    thumbnail_url: text("thumbnail_url"),
    type: text("type").notNull().default("notice"),
    publisher_type: text("publisher_type").notNull().default("otw"),
    publisher_member_uid: integer("publisher_member_uid"),
    is_active: integer("is_active", { mode: "boolean" }).default(true),
    is_featured: integer("is_home_visible", { mode: "boolean" }).default(
      true,
    ),
    started_at: text("started_at"),
    ended_at: text("ended_at"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  () => [
    check("notices_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    check("notices_type_check", sql`type IN ('notice', 'event')`),
    check("notices_historical_people_check", sql`json_valid(historical_related_people) AND json_type(historical_related_people) = 'array'`),
  ],
);

export const ddays = sqliteTable(
  "ddays",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    date: text().notNull(),
    description: text(),
    color: text(),
    type: text("type").notNull().default("event"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("ddays_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_ddays_date").on(table.date),
    check("ddays_type_check", sql`type IN ('debut', 'birthday', 'event')`),
  ],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type MemberProfileImage = typeof memberProfileImages.$inferSelect;
export type NewMemberProfileImage = typeof memberProfileImages.$inferInsert;
export type MemberLink = typeof memberLinks.$inferSelect;
export type NewMemberLink = typeof memberLinks.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;
export type DDay = typeof ddays.$inferSelect;
export type NewDDay = typeof ddays.$inferInsert;

// 자동 업데이트 설정 테이블
export const settings = sqliteTable("settings", {
  key: text().primaryKey(),
  value: text(),
  updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const musicDefaultPlaylistSettings = sqliteTable("music_default_playlist_settings", {
  playlist_key: text().primaryKey(),
  title: text(),
  description: text(),
  representative_performance_id: text(),
  version: integer().notNull().default(1),
  updated_by: text().notNull(),
  updated_at: integer().notNull(),
  write_token: text().notNull(),
}, table => [
  check("music_default_playlist_title_check", sql`${table.title} IS NULL OR length(trim(${table.title})) BETWEEN 1 AND 120`),
  check("music_default_playlist_description_check", sql`${table.description} IS NULL OR length(${table.description}) <= 2000`),
  check("music_default_playlist_version_check", sql`${table.version} >= 1`),
]);

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

// X API 응답 캐시 테이블
export const xApiCache = sqliteTable(
  "x_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
  },
  (table) => [
    index("idx_x_api_cache_type").on(table.type),
    index("idx_x_api_cache_expires_at").on(table.expires_at),
  ],
);

export type XApiCache = typeof xApiCache.$inferSelect;
export type NewXApiCache = typeof xApiCache.$inferInsert;

// X 게시글 영구 저장 테이블
export const xPosts = sqliteTable(
  "x_posts",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: text().primaryKey(),
    handle: text().notNull(),
    user_id: text("user_id"),
    username: text().notNull(),
    value: text().notNull(),
    created_at: text("created_at").notNull(),
    first_seen_at: integer("first_seen_at").notNull().default(0),
    fetched_at: integer("fetched_at").notNull(),
    hidden_at: integer("hidden_at"),
    hidden_reason: text("hidden_reason"),
    content_removed_at: integer("content_removed_at"),
  },
  (table) => [
    check("x_posts_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_x_posts_handle_created_at").on(table.handle, table.created_at),
    index("idx_x_posts_handle_hidden_created").on(
      table.handle,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_x_posts_public_handle_created").on(sql`lower(${table.handle})`, sql`${table.created_at} DESC`, sql`${table.id} DESC`)
      .where(sql`content_access = 'normal' AND hidden_at IS NULL AND content_removed_at IS NULL`),
    index("idx_x_posts_user_id").on(table.user_id),
    index("idx_x_posts_hidden_at").on(table.hidden_at),
  ],
);

export type XStoredPost = typeof xPosts.$inferSelect;
export type NewXStoredPost = typeof xPosts.$inferInsert;

// X 게시글 소스별 증분 수집 상태
export const xPostSources = sqliteTable("x_post_sources", {
  handle: text().primaryKey(),
  user_id: text("user_id"),
  username: text(),
  collection_started_at: integer("collection_started_at"),
  initialization_completed_at: integer("initialization_completed_at"),
  deactivated_at: integer("deactivated_at"),
  last_seen_post_id: text("last_seen_post_id"),
  sync_pagination_token: text("sync_pagination_token"),
  sync_base_post_id: text("sync_base_post_id"),
  sync_newest_post_id: text("sync_newest_post_id"),
  last_attempt_at: integer("last_attempt_at"),
  cadence_anchor_at: integer("cadence_anchor_at"),
  last_success_at: integer("last_success_at"),
  next_check_at: integer("next_check_at"),
  consecutive_failures: integer("consecutive_failures").notNull().default(0),
  last_error_code: text("last_error_code"),
  lease_token: text("lease_token"),
  lease_until: integer("lease_until"),
  generation: integer().notNull().default(0),
  last_checked_at: integer("last_checked_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  last_error: text("last_error"),
});

export type XPostSource = typeof xPostSources.$inferSelect;
export type NewXPostSource = typeof xPostSources.$inferInsert;

// One-member XAA rollout; independent from the REST completeness watermark.
export const xActivityState = sqliteTable("x_activity_state", {
  id: integer().primaryKey(),
  handle: text().notNull(),
  user_id: text("user_id").notNull(),
  tag: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(false),
  status: text().notNull().default("stopped"),
  webhook_id: text("webhook_id"),
  subscription_id: text("subscription_id"),
  expires_at: integer("expires_at"),
  lease_until: integer("lease_until").notNull().default(0),
  last_error: text("last_error"),
  updated_at: integer("updated_at").notNull(),
}, table => [check("x_activity_single_member", sql`${table.id} = 1`)]);

export const xActivityInbox = sqliteTable("x_activity_inbox", {
  event_id: text("event_id").primaryKey(),
  post_id: text("post_id").notNull(),
  handle: text().notNull(),
  user_id: text("user_id").notNull(),
  payload: text(),
  hydrated_payload: text("hydrated_payload"),
  received_at: integer("received_at").notNull(),
  charged: integer({ mode: "boolean" }).notNull().default(false),
  status: text().notNull().default("pending"),
  media_source: text("media_source").notNull().default("pending"),
  media_count: integer("media_count").notNull().default(0),
  media_types: text("media_types").notNull().default(""),
  lease_until: integer("lease_until").notNull().default(0),
  next_attempt_at: integer("next_attempt_at").notNull().default(0),
  lookup_attempted_at: integer("lookup_attempted_at"),
  lookup_attempts: integer("lookup_attempts").notNull().default(0),
  last_error: text("last_error"),
}, table => [
  index("idx_x_activity_pending").on(table.status, table.next_attempt_at),
  index("idx_x_activity_received").on(table.received_at),
  index("idx_x_activity_post").on(table.post_id),
]);

export const xSharedBudgets = sqliteTable("x_shared_budgets", {
  day: text().primaryKey(),
  used: integer().notNull().default(0),
  reserved: integer().notNull().default(0),
  limit_value: integer("limit_value").notNull().default(1_000_000),
  seed_detail: text("seed_detail").notNull(),
  updated_at: integer("updated_at").notNull(),
}, table => [check("x_shared_budget_nonnegative", sql`${table.used} >= 0 AND ${table.reserved} >= 0 AND ${table.limit_value} = 1000000`)]);

export const xSharedRequests = sqliteTable("x_shared_requests", {
  id: text().primaryKey(),
  site: text().$type<"otw" | "luvdia">().notNull(),
  operation: text().notNull(),
  path: text().notNull(),
  status: text().notNull(),
  claim_token: text("claim_token").notNull(),
  estimate: integer().notNull(),
  cost: integer().notNull().default(0),
  result: text(),
  post_ids: text("post_ids").notNull().default("[]"),
  day: text().notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
}, table => [index("idx_x_shared_requests_day").on(table.day, table.status)]);

export const xActivityCoordinator = sqliteTable("x_activity_coordinator", {
  id: integer().primaryKey(),
  ready: integer({ mode: "boolean" }).notNull().default(false),
  webhook_id: text("webhook_id"),
  webhook_url: text("webhook_url"),
  lease_until: integer("lease_until").notNull().default(0),
  bootstrap_extra_day: text("bootstrap_extra_day"),
  bootstrap_extra_micros: integer("bootstrap_extra_micros").notNull().default(0),
  last_error: text("last_error"),
  updated_at: integer("updated_at").notNull(),
}, table => [check("x_activity_coordinator_singleton", sql`${table.id} = 1`)]);

export const xActivitySites = sqliteTable("x_activity_sites", {
  site: text().$type<"otw" | "luvdia">().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull().default(false),
  pause_reason: text("pause_reason"),
  resume_at: integer("resume_at"),
  synced_at: integer("synced_at"),
  last_error: text("last_error"),
  updated_at: integer("updated_at").notNull(),
});

export const xActivityTargets = sqliteTable("x_activity_targets", {
  site: text().$type<"otw" | "luvdia">().notNull(),
  handle: text().notNull(),
  user_id: text("user_id"),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  status: text().notNull().default("pending"),
  last_error: text("last_error"),
  updated_at: integer("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.site, table.handle] }), index("idx_x_activity_target_user").on(table.user_id, table.enabled)]);

export const xActivitySubscriptions = sqliteTable("x_activity_subscriptions", {
  user_id: text("user_id").primaryKey(),
  tag: text().notNull().unique(),
  subscription_id: text("subscription_id").unique(),
  webhook_id: text("webhook_id"),
  expires_at: integer("expires_at"),
  status: text().notNull().default("pending"),
  lease_until: integer("lease_until").notNull().default(0),
  last_error: text("last_error"),
  updated_at: integer("updated_at").notNull(),
});

export const xActivityDispatch = sqliteTable("x_activity_dispatch", {
  event_id: text("event_id").primaryKey(),
  post_id: text("post_id").notNull(),
  user_id: text("user_id").notNull(),
  payload: text(),
  received_at: integer("received_at").notNull(),
  charged: integer({ mode: "boolean" }).notNull().default(false),
  otw_status: text("otw_status").notNull().default("not_target"),
  luvdia_status: text("luvdia_status").notNull().default("not_target"),
  lease_until: integer("lease_until").notNull().default(0),
  next_attempt_at: integer("next_attempt_at").notNull().default(0),
  last_error: text("last_error"),
}, table => [index("idx_x_activity_dispatch_pending").on(table.next_attempt_at, table.received_at), index("idx_x_activity_dispatch_post").on(table.post_id)]);

export const xActivityCacheRedactions = sqliteTable("x_activity_cache_redactions", {
  post_id: text("post_id").primaryKey(),
  created_at: integer("created_at").notNull(),
  completed_at: integer("completed_at"),
  next_attempt_at: integer("next_attempt_at").notNull().default(0),
  last_error: text("last_error"),
}, table => [index("idx_x_activity_redaction_pending").on(table.next_attempt_at).where(sql`${table.completed_at} IS NULL`)]);

export const xPostReferences = sqliteTable(
  "x_post_references",
  {
    source_post_id: text("source_post_id")
      .notNull()
      .references(() => xPosts.id, { onDelete: "cascade" }),
    relation_type: text("relation_type")
      .$type<"reply" | "quote">()
      .notNull(),
    referenced_post_id: text("referenced_post_id").notNull(),
    resolution_state: text("resolution_state")
      .$type<"pending" | "local" | "hydrated" | "link_only" | "terminal">()
      .notNull()
      .default("pending"),
    attempt_count: integer("attempt_count").notNull().default(0),
    next_attempt_at: integer("next_attempt_at"),
    last_error_code: text("last_error_code"),
    hydrated_at: integer("hydrated_at"),
    lease_token: text("lease_token"),
    lease_until: integer("lease_until"),
    author_id: text("author_id"),
    author_state: text("author_state").$type<"not_required" | "pending" | "resolved" | "terminal">().notNull().default("not_required"),
    author_attempt_count: integer("author_attempt_count").notNull().default(0),
    author_next_attempt_at: integer("author_next_attempt_at"),
    author_last_error_code: text("author_last_error_code"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.source_post_id, table.relation_type] }),
    index("idx_x_post_references_due").on(
      table.resolution_state,
      table.next_attempt_at,
    ),
    index("idx_x_post_references_target").on(table.referenced_post_id),
    index("idx_x_post_references_lease_token").on(table.lease_token).where(sql`lease_token IS NOT NULL`),
    index("idx_x_post_references_author_due").on(table.author_state, table.author_next_attempt_at),
    check(
      "x_post_references_relation_check",
      sql`${table.relation_type} IN ('reply', 'quote')`,
    ),
    check(
      "x_post_references_state_check",
      sql`${table.resolution_state} IN ('pending', 'local', 'hydrated', 'link_only', 'terminal')`,
    ),
  ],
);

export const xPostRepairWork = sqliteTable("x_post_repair_work", {
  post_id: text().primaryKey().references(() => xPosts.id, { onDelete: "cascade" }),
  facts_pending: integer().notNull().default(1),
  references_pending: integer().notNull().default(1),
  generation: integer().notNull().default(1),
  checked_at: integer().notNull().default(0),
}, table => [
  index("idx_x_post_repair_facts").on(table.checked_at, table.post_id).where(sql`${table.facts_pending}=1`),
  index("idx_x_post_repair_references").on(table.checked_at, table.post_id).where(sql`${table.references_pending}=1`),
]);

export const xQuoteBodyWork = sqliteTable("x_quote_body_work", {
  source_post_id: text().primaryKey().references(() => xPosts.id, { onDelete: "cascade" }),
  due_at: integer().notNull(),
  created_at: integer().notNull(),
}, table => [index("idx_x_quote_body_work_due").on(table.due_at, table.created_at, table.source_post_id)]);

export const xApiResourceDaily = sqliteTable(
  "x_api_resource_daily",
  {
    utc_day: text("utc_day").notNull(),
    resource_type: text("resource_type")
      .$type<"post" | "user" | "media">()
      .notNull(),
    resource_id: text("resource_id").notNull(),
    first_operation: text("first_operation").notNull(),
    unit_cost_micros: integer("unit_cost_micros").notNull(),
    first_seen_at: integer("first_seen_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.utc_day, table.resource_type, table.resource_id],
    }),
    index("idx_x_api_resource_daily_seen").on(table.first_seen_at),
  ],
);

export const xApiUsageDaily = sqliteTable(
  "x_api_usage_daily",
  {
    utc_day: text("utc_day").notNull(),
    operation: text().notNull(),
    resource_type: text("resource_type").notNull(),
    request_count: integer("request_count").notNull().default(0),
    resource_count: integer("resource_count").notNull().default(0),
    unique_resource_count: integer("unique_resource_count").notNull().default(0),
    listed_cost_micros: integer("listed_cost_micros").notNull().default(0),
    conservative_cost_micros: integer("conservative_cost_micros")
      .notNull()
      .default(0),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.utc_day, table.operation, table.resource_type] }),
    index("idx_x_api_usage_daily_day").on(table.utc_day),
  ],
);

// X 장기 기록은 원문 x_posts와 분리한다. 관리자 원문 제거 이후에도
// 최소 식별자와 tombstone을 남기기 위한 정규화 레이어다.
export const xPostFacts = sqliteTable(
  "x_post_facts",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    post_id: text("post_id").primaryKey(),
    member_uid: integer("member_uid").notNull(),
    member_name_snapshot: text("member_name_snapshot").notNull(),
    post_type: text("post_type").notNull(),
    created_at: integer("created_at").notNull(),
    first_seen_at: integer("first_seen_at").notNull(),
    media_count: integer("media_count").notNull().default(0),
    link_count: integer("link_count").notNull().default(0),
    edit_root_post_id: text("edit_root_post_id"),
    superseded_by_post_id: text("superseded_by_post_id"),
    hidden_at: integer("hidden_at"),
    hidden_reason: text("hidden_reason"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check("x_post_facts_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_x_post_facts_member_created").on(table.member_uid, table.created_at),
    index("idx_x_post_facts_visible_created").on(table.hidden_at, table.created_at),
    check(
      "x_post_facts_type_check",
      sql`${table.post_type} IN ('post', 'reply', 'quote')`,
    ),
  ],
);

// X API 과금 추정 이벤트 로그
export const xApiUsageEvents = sqliteTable(
  "x_api_usage_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    operation: text().notNull(),
    endpoint: text().notNull(),
    resource_type: text("resource_type").notNull(),
    resource_count: integer("resource_count").notNull(),
    estimated_cost_micros: integer("estimated_cost_micros").notNull(),
    status: integer().notNull(),
    created_at: integer("created_at").notNull(),
    detail: text(),
  },
  (table) => [
    index("idx_x_api_usage_events_created_at").on(table.created_at),
    index("idx_x_api_usage_events_operation").on(table.operation),
  ],
);

export type XApiUsageEvent = typeof xApiUsageEvents.$inferSelect;
export type NewXApiUsageEvent = typeof xApiUsageEvents.$inferInsert;

// X 백그라운드 수집 실행 로그
export const xCollectionRuns = sqliteTable(
  "x_collection_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at"),
    checked_handles: integer("checked_handles").notNull().default(0),
    refreshed_handles: integer("refreshed_handles").notNull().default(0),
    posts_returned: integer("posts_returned").notNull().default(0),
    posts_stored: integer("posts_stored").notNull().default(0),
    api_calls: integer("api_calls").notNull().default(0),
    estimated_cost_micros: integer("estimated_cost_micros")
      .notNull()
      .default(0),
    effective_interval_minutes: integer("effective_interval_minutes"),
    unique_resources: integer("unique_resources").notNull().default(0),
    preview_deferred: integer("preview_deferred").notNull().default(0),
    coalesced_handles: integer("coalesced_handles").notNull().default(0),
    status: text().notNull(),
    error: text(),
  },
  (table) => [
    index("idx_x_collection_runs_started_at").on(table.started_at),
    index("idx_x_collection_runs_status").on(table.status),
  ],
);

export type XCollectionRun = typeof xCollectionRuns.$inferSelect;
export type NewXCollectionRun = typeof xCollectionRuns.$inferInsert;

// YouTube API 응답 캐시 테이블
export const youtubeApiCache = sqliteTable(
  "youtube_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
    stale_until: integer("stale_until").notNull(),
    refresh_after: integer("refresh_after").notNull().default(0),
    last_status: integer("last_status"),
    last_error: text("last_error"),
  },
  (table) => [
    index("idx_youtube_api_cache_type").on(table.type),
    index("idx_youtube_api_cache_expires_at").on(table.expires_at),
    index("idx_youtube_api_cache_stale_until").on(table.stale_until),
    check(
      "youtube_api_cache_type_check",
      sql`type IN ('uploads_playlist', 'channel_videos')`,
    ),
  ],
);

export type YouTubeApiCache = typeof youtubeApiCache.$inferSelect;
export type NewYouTubeApiCache = typeof youtubeApiCache.$inferInsert;

// CHZZK VOD/클립 API 응답 캐시 테이블
export const chzzkApiCache = sqliteTable(
  "chzzk_api_cache",
  {
    key: text().primaryKey(),
    type: text().notNull(),
    value: text().notNull(),
    fetched_at: integer("fetched_at").notNull(),
    expires_at: integer("expires_at").notNull(),
    stale_until: integer("stale_until").notNull(),
    last_status: integer("last_status"),
    last_error: text("last_error"),
  },
  () => [
    check(
      "chzzk_api_cache_type_check",
      sql`type IN ('vods', 'clips')`,
    ),
  ],
);

export type ChzzkApiCache = typeof chzzkApiCache.$inferSelect;
export type NewChzzkApiCache = typeof chzzkApiCache.$inferInsert;

// 자동 일정 보완에 사용하는 CHZZK VOD 영구 관측 기록
export const scheduleBroadcastObservations = sqliteTable(
  "schedule_broadcast_observations",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    vod_id: text("vod_id").primaryKey(),
    member_uid: integer("member_uid").notNull(),
    channel_id: text("channel_id").notNull(),
    title: text().notNull(),
    started_at: integer("started_at").notNull(),
    ended_at: integer("ended_at").notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    thumbnail_url: text("thumbnail_url"),
    first_seen_at: integer("first_seen_at").notNull(),
    last_seen_at: integer("last_seen_at").notNull(),
  },
  (table) => [
    check("schedule_broadcast_observations_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_schedule_broadcast_observations_member_started").on(
      table.member_uid,
      table.started_at,
    ),
    index("idx_schedule_broadcast_observations_last_seen").on(
      table.last_seen_at,
    ),
    check(
      "schedule_broadcast_observations_timing_check",
      sql`${table.ended_at} >= ${table.started_at}`,
    ),
    check(
      "schedule_broadcast_observations_duration_check",
      sql`${table.duration_seconds} >= 0`,
    ),
  ],
);

export type ScheduleBroadcastObservation =
  typeof scheduleBroadcastObservations.$inferSelect;
export type NewScheduleBroadcastObservation =
  typeof scheduleBroadcastObservations.$inferInsert;

// YouTube API 호출 사용량 이벤트 로그
export const youtubeApiUsageEvents = sqliteTable(
  "youtube_api_usage_events",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    operation: text().notNull(),
    channel_id: text("channel_id"),
    cache_key: text("cache_key"),
    quota_units: integer("quota_units").notNull(),
    status: integer().notNull(),
    duration_ms: integer("duration_ms").notNull(),
    created_at: integer("created_at").notNull(),
    error: text(),
    request_origin: text("request_origin")
      .notNull()
      .default("legacy_unknown"),
  },
  (table) => [
    index("idx_youtube_api_usage_events_created_at").on(table.created_at),
    check(
      "youtube_api_usage_events_operation_check",
      sql`operation IN ('channels.list', 'playlistItems.list', 'videos.list')`,
    ),
    check(
      "youtube_api_usage_events_request_origin_check",
      sql`request_origin IN ('demand', 'manual', 'scheduled', 'legacy_unknown')`,
    ),
  ],
);

export type YouTubeApiUsageEvent = typeof youtubeApiUsageEvents.$inferSelect;
export type NewYouTubeApiUsageEvent =
  typeof youtubeApiUsageEvents.$inferInsert;

// 공급자별 세부 origin/correlation은 기존 usage event 계약을 깨지 않도록
// 1:1 보조 테이블에 additive하게 기록한다.
export const youtubeApiUsageContexts = sqliteTable(
  "youtube_api_usage_contexts",
  {
    usage_event_id: integer("usage_event_id")
      .primaryKey()
      .references(() => youtubeApiUsageEvents.id, { onDelete: "cascade" }),
    operation: text().notNull(),
    origin: text().notNull(),
    workload: text().notNull(),
    scheduled_run_id: text("scheduled_run_id"),
    scheduled_item_id: text("scheduled_item_id"),
    ingestion_job_id: text("ingestion_job_id"),
    monitor_id: text("monitor_id"),
  },
  () => [],
);

// 일반 YouTube 신규 업로드 피드 수집 상태. OTW Play 카탈로그와 분리한다.
export const youtubeFeedSources = sqliteTable(
  "youtube_feed_sources",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source_kind: text("source_kind").$type<"official" | "kirinuki">().notNull(),
    member_uid: integer("member_uid").references(() => members.uid, {
      onDelete: "cascade",
    }),
    kirinuki_channel_id: integer("kirinuki_channel_id"),
    youtube_channel_id: text("youtube_channel_id").notNull(),
    uploads_playlist_id: text("uploads_playlist_id"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    collection_started_at: integer("collection_started_at").notNull(),
    initialization_completed_at: integer("initialization_completed_at"),
    deactivated_at: integer("deactivated_at"),
    last_seen_video_id: text("last_seen_video_id"),
    sync_page_token: text("sync_page_token"),
    sync_base_video_id: text("sync_base_video_id"),
    sync_newest_video_id: text("sync_newest_video_id"),
    backfill_page_token: text("backfill_page_token"),
    backfill_frontier_published_at: integer(
      "backfill_frontier_published_at",
    ),
    backfill_exhausted_at: integer("backfill_exhausted_at"),
    backfill_lease_until: integer("backfill_lease_until"),
    backfill_retry_after: integer("backfill_retry_after"),
    last_attempt_at: integer("last_attempt_at"),
    last_success_at: integer("last_success_at"),
    next_check_at: integer("next_check_at"),
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    last_error_code: text("last_error_code"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_youtube_feed_sources_channel_kind").on(
      table.youtube_channel_id,
      table.source_kind,
    ),
    index("idx_youtube_feed_sources_due").on(
      table.enabled,
      table.next_check_at,
      table.id,
    ),
    check(
      "youtube_feed_sources_owner_check",
      sql`(${table.source_kind} = 'official' AND ${table.member_uid} IS NOT NULL
          AND ${table.kirinuki_channel_id} IS NULL)
        OR (${table.source_kind} = 'kirinuki' AND ${table.member_uid} IS NULL
          AND ${table.kirinuki_channel_id} IS NOT NULL)`,
    ),
    check(
      "youtube_feed_sources_failure_check",
      sql`${table.consecutive_failures} >= 0`,
    ),
  ],
);

export const youtubeFeedVideos = sqliteTable(
  "youtube_feed_videos",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    video_id: text("video_id").primaryKey(),
    source_id: integer("source_id")
      .notNull()
      .references(() => youtubeFeedSources.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    thumbnail_url: text("thumbnail_url"),
    channel_title: text("channel_title").notNull().default(""),
    duration_seconds: integer("duration_seconds").notNull().default(0),
    view_count: integer("view_count").notNull().default(0),
    is_short: integer("is_short", { mode: "boolean" }).notNull().default(false),
    published_at: integer("published_at").notNull(),
    fetched_at: integer("fetched_at").notNull(),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    check("youtube_feed_videos_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_youtube_feed_videos_source_published").on(
      table.source_id,
      table.published_at,
    ),
    index("idx_youtube_feed_videos_fetched").on(table.fetched_at),
    index("idx_youtube_feed_videos_available_fetched").on(table.source_id, table.fetched_at, table.video_id).where(sql`available = 1`),
    index("idx_youtube_feed_videos_public_published").on(table.source_id, sql`${table.published_at} DESC`, table.video_id)
      .where(sql`content_access = 'normal' AND available = 1`),
    index("idx_youtube_feed_videos_public_kind_published").on(table.source_id, table.is_short, sql`${table.published_at} DESC`, table.video_id)
      .where(sql`content_access = 'normal' AND available = 1`),
    index("idx_youtube_feed_videos_short_published").on(
      table.is_short,
      sql`${table.published_at} DESC`,
      table.video_id,
    ),
  ],
);

export type YouTubeFeedSource = typeof youtubeFeedSources.$inferSelect;
export type NewYouTubeFeedSource = typeof youtubeFeedSources.$inferInsert;
export type YouTubeFeedVideo = typeof youtubeFeedVideos.$inferSelect;
export type NewYouTubeFeedVideo = typeof youtubeFeedVideos.$inferInsert;

// YouTube 캐시 백그라운드 예열 실행 이력
export const youtubeWarmupRuns = sqliteTable(
  "youtube_warmup_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    status: text().notNull(),
    target_count: integer("target_count").notNull(),
    skipped_fresh_count: integer("skipped_fresh_count").notNull(),
    refreshed_count: integer("refreshed_count").notNull(),
    failed_count: integer("failed_count").notNull(),
    stale_fallback_count: integer("stale_fallback_count").notNull(),
    baseline_count: integer("baseline_count").notNull().default(0),
    changed_count: integer("changed_count").notNull().default(0),
    unchanged_count: integer("unchanged_count").notNull().default(0),
    api_calls: integer("api_calls").notNull(),
    quota_units: integer("quota_units").notNull(),
    duration_ms: integer("duration_ms").notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at").notNull(),
    error: text(),
  },
  (table) => [
    index("idx_youtube_warmup_runs_started_at").on(table.started_at),
    index("idx_youtube_warmup_runs_status").on(table.status),
    index("idx_youtube_warmup_runs_source").on(table.source),
    check(
      "youtube_warmup_runs_source_check",
      sql`source IN ('scheduled', 'manual')`,
    ),
    check(
      "youtube_warmup_runs_status_check",
      sql`status IN ('success', 'skipped', 'partial', 'failed')`,
    ),
  ],
);

export type YouTubeWarmupRun = typeof youtubeWarmupRuns.$inferSelect;
export type NewYouTubeWarmupRun = typeof youtubeWarmupRuns.$inferInsert;

// 네이버 카페 게시판 소스 테이블
export const naverCafeSources = sqliteTable(
  "naver_cafe_sources",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    cafe_url: text("cafe_url").notNull(),
    member_uid: integer("member_uid"),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    collection_started_at: integer("collection_started_at"),
    initialization_completed_at: integer("initialization_completed_at"),
    deactivated_at: integer("deactivated_at"),
    last_seen_article_id: integer("last_seen_article_id"),
    sync_page: integer("sync_page"),
    sync_base_article_id: integer("sync_base_article_id"),
    sync_newest_article_id: integer("sync_newest_article_id"),
    cadence_anchor_at: integer("cadence_anchor_at"),
    last_attempt_at: integer("last_attempt_at"),
    last_success_at: integer("last_success_at"),
    next_check_at: integer("next_check_at"),
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    last_error_code: text("last_error_code"),
    archived_at: integer("archived_at"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: numeric("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_naver_cafe_sources_enabled").on(table.enabled),
    index("idx_naver_cafe_sources_member_uid").on(table.member_uid),
    index("idx_naver_cafe_sources_sort_order").on(table.sort_order),
    uniqueIndex("uidx_naver_cafe_sources_cafe_menu").on(
      table.cafe_id,
      table.menu_id,
    ),
  ],
);

export type NaverCafeSource = typeof naverCafeSources.$inferSelect;
export type NewNaverCafeSource = typeof naverCafeSources.$inferInsert;

// 네이버 카페 소스별 상태 점검 이력
export const naverCafeSourceChecks = sqliteTable(
  "naver_cafe_source_checks",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source_id: integer("source_id")
      .notNull()
      .references(() => naverCafeSources.id, { onDelete: "cascade" }),
    source_name: text("source_name").notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    trigger: text().notNull(),
    status: text().notNull(),
    checked_at: integer("checked_at").notNull(),
    duration_ms: integer("duration_ms").notNull().default(0),
    post_count: integer("post_count").notNull().default(0),
    error: text(),
  },
  (table) => [
    index("idx_naver_cafe_source_checks_source_checked").on(
      table.source_id,
      table.checked_at,
    ),
    index("idx_naver_cafe_source_checks_checked_at").on(table.checked_at),
    index("idx_naver_cafe_source_checks_status").on(table.status),
    check(
      "naver_cafe_source_checks_trigger_check",
      sql`${table.trigger} IN ('manual', 'scheduled')`,
    ),
    check(
      "naver_cafe_source_checks_status_check",
      sql`${table.status} IN ('ok', 'stale', 'error', 'private', 'invalid_response', 'disabled')`,
    ),
  ],
);

export type NaverCafeSourceCheck =
  typeof naverCafeSourceChecks.$inferSelect;
export type NewNaverCafeSourceCheck =
  typeof naverCafeSourceChecks.$inferInsert;

// 네이버 카페 게시글 저장 테이블
export const naverCafePosts = sqliteTable(
  "naver_cafe_posts",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: text().primaryKey(),
    article_id: integer("article_id").notNull(),
    source_id: integer("source_id")
      .notNull()
      .references(() => naverCafeSources.id, { onDelete: "restrict" }),
    source_name: text("source_name").notNull(),
    cafe_id: text("cafe_id").notNull(),
    menu_id: text("menu_id").notNull(),
    member_uid: integer("member_uid"),
    title: text().notNull(),
    summary: text().notNull(),
    created_at: text("created_at").notNull(),
    url: text().notNull(),
    thumbnail_url: text("thumbnail_url"),
    comment_count: integer("comment_count").notNull().default(0),
    read_count: integer("read_count").notNull().default(0),
    like_count: integer("like_count").notNull().default(0),
    is_new: integer("is_new", { mode: "boolean" }).notNull().default(false),
    first_seen_at: integer("first_seen_at").notNull().default(0),
    fetched_at: integer("fetched_at").notNull(),
    hidden_at: integer("hidden_at"),
    hidden_reason: text("hidden_reason"),
    content_removed_at: integer("content_removed_at"),
  },
  (table) => [
    check("naver_cafe_posts_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    index("idx_naver_cafe_posts_source_hidden_created").on(
      table.source_id,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_naver_cafe_posts_member_hidden_created").on(
      table.member_uid,
      table.hidden_at,
      table.created_at,
    ),
    index("idx_naver_cafe_posts_hidden_created").on(
      table.hidden_at,
      table.created_at,
    ),
  ],
);

export type NaverCafePost = typeof naverCafePosts.$inferSelect;
export type NewNaverCafePost = typeof naverCafePosts.$inferInsert;

export const naverCafeUsageDaily = sqliteTable(
  "naver_cafe_usage_daily",
  {
    kst_date: text("kst_date").primaryKey(),
    requests_used: integer("requests_used").notNull().default(0),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "naver_cafe_usage_daily_requests_check",
      sql`${table.requests_used} >= 0 AND ${table.requests_used} <= 240`,
    ),
  ],
);

// 스케쥴 통합 업데이트 로그 테이블
export const updateLogs = sqliteTable(
  "update_logs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    schedule_id: integer("schedule_id"),
    member_uid: integer("member_uid"),
    member_name: text("member_name"),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    schedule_date: text("schedule_date").notNull(),
    action: text().notNull(),
    title: text(),
    previous_status: text("previous_status"),
    vod_id: text("vod_id"),
    reason_code: text("reason_code"),
    reason_note: text("reason_note"),
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_update_logs_created_at").on(table.created_at),
    index("idx_update_logs_datetime").on(sql`datetime(${table.created_at})`),
    index("idx_update_logs_action_created_at").on(
      table.action,
      table.created_at,
    ),
    index("idx_update_logs_schedule_date_created_at").on(
      table.schedule_date,
      table.created_at,
    ),
    index("idx_update_logs_member_created_at").on(
      table.member_uid,
      table.created_at,
    ),
  ],
);

export type UpdateLog = typeof updateLogs.$inferSelect;
export type NewUpdateLog = typeof updateLogs.$inferInsert;

// 관리자 감사 로그 테이블
export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    event_type: text("event_type").notNull(),
    resource_type: text("resource_type").notNull(),
    resource_id: text("resource_id"),
    action: text().notNull(),
    status: text().notNull(),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    target_count: integer("target_count"),
    success_count: integer("success_count"),
    failure_count: integer("failure_count"),
    detail: text(),
    error: text(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_admin_audit_logs_created_at").on(table.created_at),
    index("idx_admin_audit_logs_event_created_at").on(
      table.event_type,
      table.created_at,
    ),
    index("idx_admin_audit_logs_actor_created_at").on(
      table.actor_id,
      table.created_at,
    ),
    index("idx_admin_audit_logs_resource_created_at").on(
      table.resource_type,
      table.created_at,
    ),
    index("idx_admin_audit_logs_status_created_at").on(
      table.status,
      table.created_at,
    ),
    check(
      "admin_audit_logs_status_check",
      sql`${table.status} IN ('success', 'partial', 'failed', 'skipped')`,
    ),
  ],
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;

// 자동 업데이트 실행 단위 이력
export const autoUpdateRuns = sqliteTable(
  "auto_update_runs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    source: text().notNull(),
    status: text().notNull(),
    started_at: integer("started_at").notNull(),
    finished_at: integer("finished_at").notNull(),
    range_days: integer("range_days").notNull(),
    checked_count: integer("checked_count").notNull().default(0),
    segment_count: integer("segment_count").notNull().default(0),
    session_count: integer("session_count").notNull().default(0),
    resume_merged_count: integer("resume_merged_count").notNull().default(0),
    updated_count: integer("updated_count").notNull().default(0),
    created_count: integer("created_count").notNull().default(0),
    existing_count: integer("existing_count").notNull().default(0),
    pending_created_count: integer("pending_created_count").notNull().default(0),
    rejected_suppressed_count: integer("rejected_suppressed_count")
      .notNull()
      .default(0),
    duplicate_pending_count: integer("duplicate_pending_count")
      .notNull()
      .default(0),
    short_suppressed_count: integer("short_suppressed_count")
      .notNull()
      .default(0),
    holiday_suppressed_count: integer("holiday_suppressed_count")
      .notNull()
      .default(0),
    ambiguous_count: integer("ambiguous_count").notNull().default(0),
    obsolete_pending_count: integer("obsolete_pending_count")
      .notNull()
      .default(0),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    error: text(),
    detail: text(),
  },
  (table) => [
    index("idx_auto_update_runs_started_at").on(table.started_at),
    index("idx_auto_update_runs_status").on(table.status),
    index("idx_auto_update_runs_source_started").on(
      table.source,
      table.started_at,
    ),
    check(
      "auto_update_runs_source_check",
      sql`${table.source} IN ('scheduled', 'manual')`,
    ),
    check(
      "auto_update_runs_status_check",
      sql`${table.status} IN ('success', 'failed')`,
    ),
  ],
);

export type AutoUpdateRun = typeof autoUpdateRuns.$inferSelect;
export type NewAutoUpdateRun = typeof autoUpdateRuns.$inferInsert;

// 승인 대기 스케줄 테이블
// Evidence and operator decisions for one member's Korean calendar day.
export const scheduleDayAssessments = sqliteTable("schedule_day_assessments", {
  content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
  member_uid: integer().notNull().references(() => members.uid),
  date: text().notNull(),
  channel_id: text().notNull(),
  checked_at: integer().notNull(),
  range_start: integer().notNull(),
  range_end: integer().notNull(),
  scan_status: text({ enum: ["complete", "failed", "incomplete"] }).notNull(),
  broadcast_seen: integer().notNull().default(0),
  decision: text({ enum: ["none", "pending", "approved", "rejected"] }).notNull().default("none"),
  decided_at: integer(),
  decided_by: text(),
  rejection_reason: text(),
}, table => [check("schedule_day_assessments_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    primaryKey({ columns: [table.member_uid, table.date] })]);

export const pendingSchedules = sqliteTable(
  "pending_schedules",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: integer().primaryKey({ autoIncrement: true }),
    member_uid: integer("member_uid").notNull(),
    member_name: text("member_name").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull().default("방송"),
    action_type: text("action_type").notNull(), // "create" | "update"
    existing_schedule_id: integer("existing_schedule_id"), // 수정 대상 스케줄 ID
    previous_status: text("previous_status"), // 수정 전 상태
    previous_start_time: text("previous_start_time"), // 수정 전 시작 시각
    previous_title: text("previous_title"), // 수정 전 제목
    candidate_kind: text("candidate_kind"),
    match_reason: text("match_reason"),
    match_confidence: text("match_confidence"),
    ranked_schedule_ids: text("ranked_schedule_ids"),
    source_vod_ids: text("source_vod_ids"),
    session_started_at: text("session_started_at"),
    session_ended_at: text("session_ended_at"),
    vod_segment_count: integer("vod_segment_count").notNull().default(1),
    vod_id: text("vod_id"), // 중복 방지용 VOD 식별자
    vod_started_at: text("vod_started_at"), // VOD 기준 방송 시작 시각
    vod_duration_seconds: integer("vod_duration_seconds"), // 총 방송 길이(초)
    vod_thumbnail_url: text("vod_thumbnail_url"), // 방송 썸네일 URL
    processed_reset_at: text("processed_reset_at"), // 처리 완료 판정 리셋 시각
    created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("pending_schedules_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    uniqueIndex("uidx_pending_holiday_member_date").on(table.member_uid, table.date)
      .where(sql`${table.candidate_kind} = 'holiday_suggestion'`),
    index("idx_pending_schedules_vod_id").on(table.vod_id),
    index("idx_pending_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
    index("idx_pending_schedules_created_at").on(table.created_at),
    index("idx_pending_schedules_date_created_at").on(
      table.date,
      table.created_at,
    ),
    uniqueIndex("uidx_pending_schedules_vod_id")
      .on(table.vod_id)
      .where(sql`${table.vod_id} IS NOT NULL`),
    uniqueIndex("uidx_pending_schedules_member_date_time").on(
      table.member_uid,
      table.date,
      table.start_time,
    ),
  ],
);

export type PendingSchedule = typeof pendingSchedules.$inferSelect;
export type NewPendingSchedule = typeof pendingSchedules.$inferInsert;

// 관리자가 재검토를 허용할 때까지 수집에서 제외되는 VOD 후보
export const scheduleCandidateRejections = sqliteTable(
  "schedule_candidate_rejections",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: integer().primaryKey({ autoIncrement: true }),
    vod_id: text("vod_id").notNull(),
    member_uid: integer("member_uid").notNull(),
    member_name: text("member_name").notNull(),
    date: text().notNull(),
    start_time: text("start_time"),
    title: text(),
    status: text().notNull(),
    action_type: text("action_type").notNull(),
    existing_schedule_id: integer("existing_schedule_id"),
    previous_status: text("previous_status"),
    previous_start_time: text("previous_start_time"),
    previous_title: text("previous_title"),
    candidate_kind: text("candidate_kind"),
    match_reason: text("match_reason"),
    match_confidence: text("match_confidence"),
    ranked_schedule_ids: text("ranked_schedule_ids"),
    source_vod_ids: text("source_vod_ids"),
    session_started_at: text("session_started_at"),
    session_ended_at: text("session_ended_at"),
    vod_segment_count: integer("vod_segment_count").notNull().default(1),
    vod_started_at: text("vod_started_at"),
    vod_duration_seconds: integer("vod_duration_seconds"),
    vod_thumbnail_url: text("vod_thumbnail_url"),
    reason_code: text("reason_code"),
    reason_note: text("reason_note"),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    rejected_at: numeric("rejected_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("schedule_candidate_rejections_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    uniqueIndex("uidx_schedule_candidate_rejections_vod_id").on(
      table.vod_id,
    ),
    index("idx_schedule_rejections_fragments").on(table.source_vod_ids).where(sql`${table.source_vod_ids} IS NOT NULL AND ${table.source_vod_ids} <> '[]'`),
    index("idx_schedule_candidate_rejections_rejected_at").on(
      table.rejected_at,
    ),
    index("idx_schedule_candidate_rejections_member_date").on(
      table.member_uid,
      table.date,
    ),
    index("idx_schedule_candidate_rejections_reason_rejected").on(
      table.reason_code,
      table.rejected_at,
    ),
    check(
      "schedule_candidate_rejections_reason_check",
      sql`${table.reason_code} IS NULL OR ${table.reason_code} IN ('not_needed', 'already_reflected', 'wrong_match', 'duplicate', 'other')`,
    ),
  ],
);

export type ScheduleCandidateRejection =
  typeof scheduleCandidateRejections.$inferSelect;
export type NewScheduleCandidateRejection =
  typeof scheduleCandidateRejections.$inferInsert;

// 키리누키 채널 테이블 (유튜브 채널 영상 모음)
export const kirinukiChannels = sqliteTable("kirinuki_channels", {
  id: integer().primaryKey({ autoIncrement: true }),
  channel_name: text("channel_name").notNull(),
  channel_url: text("channel_url").notNull(),
  youtube_channel_id: text("youtube_channel_id").notNull(),
  created_at: numeric("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type KirinukiChannel = typeof kirinukiChannels.$inferSelect;
export type NewKirinukiChannel = typeof kirinukiChannels.$inferInsert;

export const musicEntities = sqliteTable(
  "music_entities",
  {
    id: text().primaryKey(),
    member_uid: integer("member_uid").references(() => members.uid, {
      onDelete: "set null",
    }),
    entity_kind: text("entity_kind").$type<OtwPlayEntityKind>().notNull(),
    display_name: text("display_name").notNull(),
    normalized_name: text("normalized_name").notNull(),
    slug: text().notNull(),
    archived_at: integer("archived_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_entities_slug").on(table.slug),
    uniqueIndex("uidx_music_entities_member_uid")
      .on(table.member_uid)
      .where(sql`${table.member_uid} IS NOT NULL`),
    uniqueIndex("uidx_music_entities_external_kind_normalized_name")
      .on(table.entity_kind, table.normalized_name)
      .where(sql`${table.member_uid} IS NULL`),
    index("idx_music_entities_normalized_name_id").on(
      table.normalized_name,
      table.id,
    ),
    check(
      "music_entities_kind_check",
      sql`${table.entity_kind} IN ('person', 'group', 'organization')`,
    ),
    check(
      "music_entities_member_kind_check",
      sql`${table.member_uid} IS NULL OR ${table.entity_kind} = 'person'`,
    ),
    check(
      "music_entities_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.display_name})) > 0 AND length(trim(${table.normalized_name})) > 0 AND length(trim(${table.slug})) > 0`,
    ),
    check(
      "music_entities_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_entities_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.archived_at} IS NULL OR (typeof(${table.archived_at}) = 'integer' AND ${table.archived_at} >= 0))`,
    ),
  ],
);

export type MusicEntity = typeof musicEntities.$inferSelect;
export type NewMusicEntity = typeof musicEntities.$inferInsert;

export const musicEntityAliases = sqliteTable(
  "music_entity_aliases",
  {
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "cascade" }),
    alias: text().notNull(),
    normalized_alias: text("normalized_alias").notNull(),
    locale: text(),
    alias_kind: text("alias_kind"),
  },
  (table) => [
    primaryKey({
      columns: [table.entity_id, table.normalized_alias],
      name: "pk_music_entity_aliases",
    }),
    index("idx_music_entity_aliases_normalized_alias_entity").on(
      table.normalized_alias,
      table.entity_id,
    ),
    check(
      "music_entity_aliases_required_text_check",
      sql`length(trim(${table.alias})) > 0 AND length(trim(${table.normalized_alias})) > 0`,
    ),
  ],
);

export type MusicEntityAlias = typeof musicEntityAliases.$inferSelect;
export type NewMusicEntityAlias = typeof musicEntityAliases.$inferInsert;

export const musicSongs = sqliteTable(
  "music_songs",
  {
    id: text().primaryKey(),
    slug: text().notNull(),
    title: text().notNull(),
    normalized_title: text("normalized_title").notNull(),
    // Immutable canonical identity; mutable display metadata must not rewrite it.
    dedupe_key: text("dedupe_key").notNull(),
    is_otw_original: integer("is_otw_original", { mode: "boolean" })
      .notNull(),
    original_release_date: text("original_release_date"),
    original_release_precision: text("original_release_precision")
      .$type<OtwPlayDatePrecision>()
      .notNull()
      .default("unknown"),
    merged_into_song_id: text("merged_into_song_id"),
    archived_at: integer("archived_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.merged_into_song_id],
      foreignColumns: [table.id],
      name: "fk_music_songs_merged_into_song",
    }).onDelete("restrict"),
    uniqueIndex("uidx_music_songs_slug").on(table.slug),
    uniqueIndex("uidx_music_songs_dedupe_key").on(table.dedupe_key),
    index("idx_music_songs_merged_into_song_id").on(
      table.merged_into_song_id,
    ),
    index("idx_music_songs_normalized_title_id").on(
      table.normalized_title,
      table.id,
    ),
    check(
      "music_songs_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.slug})) > 0 AND length(trim(${table.title})) > 0 AND length(trim(${table.normalized_title})) > 0 AND length(trim(${table.dedupe_key})) > 0`,
    ),
    check(
      "music_songs_otw_original_check",
      sql`${table.is_otw_original} IN (0, 1)`,
    ),
    check(
      "music_songs_release_precision_check",
      sql`${table.original_release_precision} IN ('year', 'month', 'day', 'unknown')`,
    ),
    check(
      "music_songs_release_date_check",
      sql`(${table.original_release_precision} = 'unknown' AND ${table.original_release_date} IS NULL)
        OR (${table.original_release_precision} = 'year'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]')
        OR (${table.original_release_precision} = 'month'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr(${table.original_release_date}, 6, 2) BETWEEN '01' AND '12')
        OR (${table.original_release_precision} = 'day'
          AND ${table.original_release_date} IS NOT NULL
          AND ${table.original_release_date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date(${table.original_release_date}, '+0 days') IS NOT NULL
          AND date(${table.original_release_date}, '+0 days') = ${table.original_release_date})`,
    ),
    check(
      "music_songs_merge_target_check",
      sql`${table.merged_into_song_id} IS NULL OR ${table.merged_into_song_id} <> ${table.id}`,
    ),
    check(
      "music_songs_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_songs_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.archived_at} IS NULL OR (typeof(${table.archived_at}) = 'integer' AND ${table.archived_at} >= 0))`,
    ),
  ],
);

export type MusicSong = typeof musicSongs.$inferSelect;
export type NewMusicSong = typeof musicSongs.$inferInsert;

export const musicSongTags = sqliteTable(
  "music_song_tags",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    tag_key: text("tag_key").notNull(),
    display_name: text("display_name").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.tag_key],
      name: "pk_music_song_tags",
    }),
    index("idx_music_song_tags_key_song").on(table.tag_key, table.song_id),
    check(
      "music_song_tags_required_text_check",
      sql`length(trim(${table.tag_key})) BETWEEN 1 AND 80 AND length(trim(${table.display_name})) BETWEEN 1 AND 40`,
    ),
  ],
);

export type MusicSongTag = typeof musicSongTags.$inferSelect;
export type NewMusicSongTag = typeof musicSongTags.$inferInsert;

export const musicSongAliases = sqliteTable(
  "music_song_aliases",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    alias: text().notNull(),
    normalized_alias: text("normalized_alias").notNull(),
    locale: text(),
    alias_kind: text("alias_kind"),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.normalized_alias],
      name: "pk_music_song_aliases",
    }),
    index("idx_music_song_aliases_normalized_alias_song").on(
      table.normalized_alias,
      table.song_id,
    ),
    check(
      "music_song_aliases_required_text_check",
      sql`length(trim(${table.alias})) > 0 AND length(trim(${table.normalized_alias})) > 0`,
    ),
  ],
);

export type MusicSongAlias = typeof musicSongAliases.$inferSelect;
export type NewMusicSongAlias = typeof musicSongAliases.$inferInsert;

export const musicSongOriginalArtists = sqliteTable(
  "music_song_original_artists",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
    credit_order: integer("credit_order").notNull().default(0),
    is_primary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.entity_id],
      name: "pk_music_song_original_artists",
    }),
    uniqueIndex("uidx_music_song_original_artists_credit_order").on(
      table.song_id,
      table.credit_order,
    ),
    index("idx_music_song_original_artists_entity_song").on(
      table.entity_id,
      table.song_id,
    ),
    check(
      "music_song_original_artists_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_song_original_artists_primary_check",
      sql`${table.is_primary} IN (0, 1)`,
    ),
  ],
);

export type MusicSongOriginalArtist =
  typeof musicSongOriginalArtists.$inferSelect;
export type NewMusicSongOriginalArtist =
  typeof musicSongOriginalArtists.$inferInsert;

export const musicChannels = sqliteTable(
  "music_channels",
  {
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull(),
    external_channel_id: text("external_channel_id").notNull(),
    display_name: text("display_name").notNull(),
    channel_role: text("channel_role").$type<OtwPlayChannelRole>().notNull(),
    verification_status: text("verification_status")
      .$type<OtwPlayChannelVerificationStatus>()
      .notNull()
      .default("pending"),
    active: integer({ mode: "boolean" }).notNull().default(false),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channels_provider_external").on(
      table.provider,
      table.external_channel_id,
    ),
    index("idx_music_channels_verification_active_role").on(
      table.verification_status,
      table.active,
      table.channel_role,
    ),
    check("music_channels_provider_check", sql`${table.provider} = 'youtube'`),
    check(
      "music_channels_external_id_check",
      sql`length(${table.external_channel_id}) = 24 AND substr(${table.external_channel_id}, 1, 2) = 'UC' AND substr(${table.external_channel_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_channels_role_check",
      sql`${table.channel_role} IN ('otw_official', 'unit_official', 'member_music', 'member_main', 'project_official', 'approved_kirinuki', 'other')`,
    ),
    check(
      "music_channels_verification_check",
      sql`${table.verification_status} IN ('pending', 'approved', 'revoked')`,
    ),
    check("music_channels_active_check", sql`${table.active} IN (0, 1)`),
    check(
      "music_channels_active_approval_check",
      sql`${table.active} = 0 OR ${table.verification_status} = 'approved'`,
    ),
    check(
      "music_channels_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.display_name})) > 0`,
    ),
    check(
      "music_channels_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_channels_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannel = typeof musicChannels.$inferSelect;
export type NewMusicChannel = typeof musicChannels.$inferInsert;

export const musicChannelEntities = sqliteTable(
  "music_channel_entities",
  {
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      columns: [table.channel_id, table.entity_id],
      name: "pk_music_channel_entities",
    }),
    index("idx_music_channel_entities_entity_channel").on(
      table.entity_id,
      table.channel_id,
    ),
  ],
);

export type MusicChannelEntity = typeof musicChannelEntities.$inferSelect;
export type NewMusicChannelEntity = typeof musicChannelEntities.$inferInsert;

export const musicMediaSources = sqliteTable(
  "music_media_sources",
  {
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull(),
    external_id: text("external_id").notNull(),
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    title: text(),
    thumbnail_url: text("thumbnail_url"),
    duration_seconds: integer("duration_seconds"),
    provider_published_at: integer("provider_published_at"),
    availability_status: text("availability_status")
      .$type<OtwPlaySourceAvailabilityStatus>()
      .notNull()
      .default("unknown"),
    last_checked_at: integer("last_checked_at"),
    next_check_at: integer("next_check_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_media_sources_provider_external").on(
      table.provider,
      table.external_id,
    ),
    index("idx_music_media_sources_channel_published_id").on(
      table.channel_id,
      sql`${table.provider_published_at} DESC`,
      table.id,
    ),
    index("idx_music_media_sources_unplayable_checked").on(sql`CASE WHEN ${table.last_checked_at} IS NULL THEN 0 ELSE ${table.last_checked_at} END`,table.id).where(sql`${table.availability_status} <> 'playable'`),
    index("idx_music_media_sources_availability_checked").on(
      table.availability_status,
      table.last_checked_at,
    ),
    index("idx_music_media_sources_next_check_id").on(
      table.next_check_at,
      table.id,
    ),
    check(
      "music_media_sources_provider_check",
      sql`${table.provider} = 'youtube'`,
    ),
    check(
      "music_media_sources_external_id_check",
      sql`length(${table.external_id}) = 11 AND ${table.external_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_media_sources_availability_check",
      sql`${table.availability_status} IN ('unknown', 'playable', 'private', 'embed_disabled', 'deleted', 'region_blocked', 'unavailable')`,
    ),
    check(
      "music_media_sources_duration_check",
      sql`${table.duration_seconds} IS NULL OR (typeof(${table.duration_seconds}) = 'integer' AND ${table.duration_seconds} >= 0)`,
    ),
    check(
      "music_media_sources_check_times_check",
      sql`(${table.last_checked_at} IS NULL OR (typeof(${table.last_checked_at}) = 'integer' AND ${table.last_checked_at} >= 0))
        AND (${table.next_check_at} IS NULL OR (typeof(${table.next_check_at}) = 'integer' AND ${table.next_check_at} >= 0))
        AND (${table.provider_published_at} IS NULL OR (typeof(${table.provider_published_at}) = 'integer' AND ${table.provider_published_at} >= 0))`,
    ),
    check(
      "music_media_sources_required_text_check",
      sql`length(trim(${table.id})) > 0`,
    ),
    check(
      "music_media_sources_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_media_sources_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicMediaSource = typeof musicMediaSources.$inferSelect;
export type NewMusicMediaSource = typeof musicMediaSources.$inferInsert;

export const musicMediaSourceRelations = sqliteTable(
  "music_media_source_relations",
  {
    // source_id is the dependent excerpt/alternate; related_source_id is its reference.
    source_id: text("source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    related_source_id: text("related_source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    relation_type: text("relation_type")
      .$type<OtwPlaySourceRelationType>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.source_id,
        table.related_source_id,
        table.relation_type,
      ],
      name: "pk_music_media_source_relations",
    }),
    index("idx_music_media_source_relations_related_type").on(
      table.related_source_id,
      table.relation_type,
    ),
    check(
      "music_media_source_relations_type_check",
      sql`${table.relation_type} IN ('excerpt_of', 'alternate_of')`,
    ),
    check(
      "music_media_source_relations_self_check",
      sql`${table.source_id} <> ${table.related_source_id}`,
    ),
  ],
);

export type MusicMediaSourceRelation =
  typeof musicMediaSourceRelations.$inferSelect;
export type NewMusicMediaSourceRelation =
  typeof musicMediaSourceRelations.$inferInsert;

export const musicPerformances = sqliteTable(
  "music_performances",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: text().primaryKey(),
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "restrict" }),
    // Immutable canonical identity; participant metadata is deliberately excluded.
    dedupe_key: text("dedupe_key").notNull(),
    relation_type: text("relation_type").$type<OtwPlayRelationType>().notNull(),
    release_type: text("release_type").$type<OtwPlayReleaseType>().notNull(),
    participation_type: text("participation_type")
      .$type<OtwPlayParticipationType>()
      .notNull(),
    publication_status: text("publication_status")
      .$type<OtwPlayPublicationStatus>()
      .notNull()
      .default("draft"),
    quality_status: text("quality_status")
      .$type<OtwPlayQualityStatus>()
      .notNull()
      .default("ok"),
    released_at: integer("released_at"),
    broadcast_metadata: text("broadcast_metadata"),
    catalog_published_at: integer("catalog_published_at"),
    internal_note: text("internal_note"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check("music_performances_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    check("music_performances_broadcast_metadata_check", sql`${table.broadcast_metadata} IS NULL OR CASE WHEN json_valid(${table.broadcast_metadata}) THEN coalesce((
      json_type(${table.broadcast_metadata}) = 'object'
      AND json_type(${table.broadcast_metadata}, '$.performedOn') IN ('text', 'null')
      AND json_type(${table.broadcast_metadata}, '$.dateEvidence') IN ('text', 'null')
      AND json_type(${table.broadcast_metadata}, '$.originalUrl') IN ('text', 'null')
      AND (json_type(${table.broadcast_metadata}, '$.extent') = 'null' OR json_extract(${table.broadcast_metadata}, '$.extent') IN ('full', 'partial'))) , 0)
      ELSE 0 END`),
    check("music_performances_catalog_published_at_check", sql`${table.catalog_published_at} IS NULL OR (typeof(${table.catalog_published_at}) = 'integer' AND ${table.catalog_published_at} >= 0)`),
    index("idx_music_performances_broadcast_published").on(table.catalog_published_at, table.id)
      .where(sql`${table.publication_status} = 'published' AND ${table.release_type} = 'broadcast'`),
    uniqueIndex("uidx_music_performances_dedupe_key").on(table.dedupe_key),
    uniqueIndex("uidx_music_performances_id_song_id").on(
      table.id,
      table.song_id,
    ),
    index("idx_music_performances_song_id").on(table.song_id),
    index("idx_music_performances_published_released_id")
      .on(sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_song_released_id")
      .on(table.song_id, sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_relation_released_id")
      .on(table.relation_type, sql`${table.released_at} DESC`, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_released_song_id")
      .on(sql`${table.released_at} DESC`, table.song_id, table.id)
      .where(sql`${table.publication_status} = 'published'`),
    index("idx_music_performances_published_participation_released_song_id")
      .on(
        table.participation_type,
        sql`${table.released_at} DESC`,
        table.song_id,
        table.id,
      )
      .where(sql`${table.publication_status} = 'published'`),
    check(
      "music_performances_relation_type_check",
      sql`${table.relation_type} IN ('original', 'cover', 'singing_clip')`,
    ),
    check(
      "music_performances_release_type_check",
      sql`${table.release_type} IN ('official_mv', 'official_video', 'broadcast', 'live', 'shorts')`,
    ),
    check(
      "music_performances_participation_type_check",
      sql`${table.participation_type} IN ('solo', 'duet', 'unit', 'group', 'external_collab')`,
    ),
    check(
      "music_performances_publication_status_check",
      sql`${table.publication_status} IN ('draft', 'published', 'withdrawn')`,
    ),
    check(
      "music_performances_quality_status_check",
      sql`${table.quality_status} IN ('ok', 'needs_update')`,
    ),
    check(
      "music_performances_required_text_check",
      sql`length(trim(${table.id})) > 0 AND length(trim(${table.dedupe_key})) > 0`,
    ),
    check(
      "music_performances_release_time_check",
      sql`${table.released_at} IS NULL OR (typeof(${table.released_at}) = 'integer' AND ${table.released_at} >= 0)`,
    ),
    check(
      "music_performances_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_performances_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicPerformance = typeof musicPerformances.$inferSelect;
export type NewMusicPerformance = typeof musicPerformances.$inferInsert;

export const musicPerformanceTags = sqliteTable(
  "music_performance_tags",
  {
    performance_id: text("performance_id")
      .notNull()
      .references(() => musicPerformances.id, { onDelete: "cascade" }),
    tag_key: text("tag_key").notNull(),
    display_name: text("display_name").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.performance_id, table.tag_key],
      name: "pk_music_performance_tags",
    }),
    index("idx_music_performance_tags_key_performance").on(
      table.tag_key,
      table.performance_id,
    ),
    check(
      "music_performance_tags_required_text_check",
      sql`length(trim(${table.tag_key})) BETWEEN 1 AND 80 AND length(trim(${table.display_name})) BETWEEN 1 AND 40`,
    ),
  ],
);

export type MusicPerformanceTag = typeof musicPerformanceTags.$inferSelect;
export type NewMusicPerformanceTag = typeof musicPerformanceTags.$inferInsert;

export const musicPerformanceParticipants = sqliteTable(
  "music_performance_participants",
  {
    performance_id: text("performance_id")
      .notNull()
      .references(() => musicPerformances.id, { onDelete: "cascade" }),
    entity_id: text("entity_id")
      .notNull()
      .references(() => musicEntities.id, { onDelete: "restrict" }),
    participant_role: text("participant_role")
      .$type<OtwPlayParticipantRole>()
      .notNull(),
    credit_order: integer("credit_order").notNull().default(0),
    credit_name_snapshot: text("credit_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.performance_id, table.entity_id],
      name: "pk_music_performance_participants",
    }),
    uniqueIndex("uidx_music_performance_participants_credit_order").on(
      table.performance_id,
      table.credit_order,
    ),
    index("idx_music_performance_participants_entity_performance").on(
      table.entity_id,
      table.performance_id,
    ),
    check(
      "music_performance_participants_role_check",
      sql`${table.participant_role} IN ('vocal', 'featured_vocal', 'chorus', 'other')`,
    ),
    check(
      "music_performance_participants_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_performance_participants_snapshot_check",
      sql`length(trim(${table.credit_name_snapshot})) > 0`,
    ),
  ],
);

export type MusicPerformanceParticipant =
  typeof musicPerformanceParticipants.$inferSelect;
export type NewMusicPerformanceParticipant =
  typeof musicPerformanceParticipants.$inferInsert;

export const musicPublicPerformanceSortKeys = sqliteTable(
  "music_public_performance_sort_keys",
  {
    performance_id: text("performance_id").primaryKey(),
    song_id: text("song_id").notNull(),
    representative_participant_entity_id: text(
      "representative_participant_entity_id",
    ).references(() => musicEntities.id, { onDelete: "restrict" }),
    normalized_participant: text("normalized_participant"),
  },
  (table) => [
    foreignKey({
      columns: [table.performance_id, table.song_id],
      foreignColumns: [musicPerformances.id, musicPerformances.song_id],
      name: "fk_music_public_performance_sort_keys_performance_song",
    }).onDelete("cascade"),
    index(
      "idx_music_public_performance_sort_keys_participant_song_performance",
    )
      .on(
        table.normalized_participant,
        table.song_id,
        table.performance_id,
      )
      .where(sql`${table.normalized_participant} IS NOT NULL`),
    index("idx_music_public_performance_sort_keys_missing_song_performance")
      .on(table.song_id, table.performance_id)
      .where(sql`${table.normalized_participant} IS NULL`),
    index("idx_music_public_performance_sort_keys_entity_performance").on(
      table.representative_participant_entity_id,
      table.performance_id,
    ),
    check(
      "music_public_performance_sort_keys_participant_pair_check",
      sql`(${table.representative_participant_entity_id} IS NULL AND ${table.normalized_participant} IS NULL)
        OR (${table.representative_participant_entity_id} IS NOT NULL
          AND ${table.normalized_participant} IS NOT NULL
          AND length(trim(${table.normalized_participant})) > 0)`,
    ),
  ],
);

export type MusicPublicPerformanceSortKey =
  typeof musicPublicPerformanceSortKeys.$inferSelect;
export type NewMusicPublicPerformanceSortKey =
  typeof musicPublicPerformanceSortKeys.$inferInsert;

export const musicPerformanceSources = sqliteTable(
  "music_performance_sources",
  {
    performance_id: text("performance_id")
      .notNull()
      .references(() => musicPerformances.id, { onDelete: "cascade" }),
    source_id: text("source_id")
      .notNull()
      .references(() => musicMediaSources.id, { onDelete: "restrict" }),
    start_seconds: integer("start_seconds").notNull().default(0),
    end_seconds: integer("end_seconds"),
    source_role: text("source_role").$type<OtwPlaySourceRole>().notNull(),
    priority: integer().notNull().default(0),
    is_primary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.performance_id, table.source_id, table.start_seconds],
      name: "pk_music_performance_sources",
    }),
    uniqueIndex("uidx_music_performance_sources_source_start").on(
      table.source_id,
      table.start_seconds,
    ),
    uniqueIndex("uidx_music_performance_sources_primary")
      .on(table.performance_id)
      .where(sql`${table.is_primary} = 1`),
    index("idx_music_performance_sources_performance_priority_source").on(
      table.performance_id,
      table.priority,
      table.source_id,
    ),
    check(
      "music_performance_sources_range_check",
      sql`typeof(${table.start_seconds}) = 'integer' AND ${table.start_seconds} >= 0
        AND (${table.end_seconds} IS NULL OR (typeof(${table.end_seconds}) = 'integer' AND ${table.end_seconds} > ${table.start_seconds}))`,
    ),
    check(
      "music_performance_sources_role_check",
      sql`${table.source_role} IN ('official', 'kirinuki', 'broadcast_original', 'alternate')`,
    ),
    check(
      "music_performance_sources_priority_check",
      sql`typeof(${table.priority}) = 'integer' AND ${table.priority} >= 0`,
    ),
    check(
      "music_performance_sources_primary_check",
      sql`${table.is_primary} IN (0, 1)`,
    ),
  ],
);

export type MusicPerformanceSource =
  typeof musicPerformanceSources.$inferSelect;
export type NewMusicPerformanceSource =
  typeof musicPerformanceSources.$inferInsert;

export const musicCoverProposals = sqliteTable(
  "music_cover_proposals",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: text().primaryKey(),
    submitted_by_user_id: text("submitted_by_user_id"),
    historical_source_site: text("historical_source_site").$type<"otw" | "luvdia">(),
    historical_source_record_id: text("historical_source_record_id"),
    historical_review: integer("historical_review", { mode: "boolean" }).notNull().default(false),
    idempotency_key: text("idempotency_key").notNull(),
    submitted_url: text("submitted_url").notNull(),
    youtube_video_id: text("youtube_video_id").notNull(),
    segment_start_seconds: integer("segment_start_seconds")
      .notNull()
      .default(0),
    submission_kind: text("submission_kind").$type<"official_cover" | "singing_clip">().notNull().default("official_cover"),
    submitted_broadcast_json: text("submitted_broadcast_json"),
    submitted_title: text("submitted_title").notNull(),
    submitted_tags_json: text("submitted_tags_json").notNull().default("[]"),
    suggested_song_id: text("suggested_song_id").references(
      () => musicSongs.id,
      { onDelete: "set null" },
    ),
    submitted_note: text("submitted_note"),
    status: text().$type<OtwPlayProposalStatus>().notNull().default("pending_review"),
    version: integer().notNull().default(0),
    review_lock_token: text("review_lock_token"),
    review_lock_expires_at: integer("review_lock_expires_at"),
    reviewed_by_user_id: text("reviewed_by_user_id"),
    reviewed_at: integer("reviewed_at"),
    review_result_code: text("review_result_code"),
    review_note: text("review_note"),
    approved_performance_id: text("approved_performance_id").references(
      () => musicPerformances.id,
      { onDelete: "restrict" },
    ),
    approved_performance_snapshot_json: text("approved_performance_snapshot_json"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check("music_cover_proposals_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    uniqueIndex("uidx_music_cover_proposals_submitter_idempotency").on(
      table.submitted_by_user_id,
      table.idempotency_key,
    ),
    index("idx_music_cover_proposals_video").on(table.youtube_video_id),
    uniqueIndex("uidx_music_cover_proposals_pending_video_segment")
      .on(table.youtube_video_id, table.segment_start_seconds)
      .where(sql`${table.status} = 'pending_review'`),
    uniqueIndex("uidx_music_cover_proposals_approved_performance").on(
      table.approved_performance_id,
    ),
    index("idx_music_cover_proposals_status_created_id").on(
      table.status,
      table.created_at,
      table.id,
    ),
    index("idx_music_cover_proposals_submitter_created_id").on(
      table.submitted_by_user_id,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    index("idx_music_cover_proposals_reviewer_reviewed_id")
      .on(
        table.reviewed_by_user_id,
        sql`${table.reviewed_at} DESC`,
        table.id,
      )
      .where(sql`${table.reviewed_by_user_id} IS NOT NULL`),
    index("idx_music_cover_proposals_suggested_song_id").on(
      table.suggested_song_id,
    ),
    check(
      "music_cover_proposals_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND length(trim(${table.idempotency_key})) > 0
        AND length(trim(${table.submitted_url})) > 0
        AND length(trim(${table.submitted_title})) > 0`,
    ),
    check(
      "music_cover_proposals_video_id_check",
      sql`length(${table.youtube_video_id}) = 11 AND ${table.youtube_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_cover_proposals_segment_check",
      sql`typeof(${table.segment_start_seconds}) = 'integer' AND ${table.segment_start_seconds} >= 0`,
    ),
    check(
      "music_cover_proposals_tags_json_check",
      sql`CASE
        WHEN typeof(${table.submitted_tags_json}) <> 'text' THEN 0
        WHEN json_valid(${table.submitted_tags_json}) = 0 THEN 0
        ELSE json_type(${table.submitted_tags_json}) = 'array'
      END`,
    ),
    check(
      "music_cover_proposals_status_check",
      sql`${table.status} IN ('pending_review', 'approved', 'rejected', 'withdrawn')`,
    ),
    check(
      "music_cover_proposals_version_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0`,
    ),
    check(
      "music_cover_proposals_lock_pair_check",
      sql`(${table.review_lock_token} IS NULL AND ${table.review_lock_expires_at} IS NULL)
        OR (${table.review_lock_token} IS NOT NULL
          AND length(trim(${table.review_lock_token})) > 0
          AND typeof(${table.review_lock_expires_at}) = 'integer'
          AND ${table.review_lock_expires_at} >= 0)`,
    ),
    check(
      "music_cover_proposals_provenance_check",
      sql`(${table.historical_source_site} IS NULL AND ${table.historical_source_record_id} IS NULL
          AND ${table.submitted_by_user_id} IS NOT NULL AND length(trim(${table.submitted_by_user_id})) > 0
          AND ${table.historical_review} = 0)
        OR (${table.historical_source_site} IS NOT NULL AND ${table.historical_source_site} IN ('otw', 'luvdia')
          AND ${table.historical_source_record_id} IS NOT NULL AND length(trim(${table.historical_source_record_id})) > 0
          AND ${table.submitted_by_user_id} IS NULL AND ${table.historical_review} IN (0, 1))`,
    ),
    uniqueIndex("uidx_music_cover_proposals_historical_origin").on(table.historical_source_site, table.historical_source_record_id),
    check(
      "music_cover_proposals_review_pair_check",
      sql`(${table.historical_review} = 0 AND ${table.reviewed_by_user_id} IS NULL AND ${table.reviewed_at} IS NULL)
        OR (${table.historical_review} = 0 AND ${table.reviewed_by_user_id} IS NOT NULL
          AND length(trim(${table.reviewed_by_user_id})) > 0
          AND typeof(${table.reviewed_at}) = 'integer'
          AND ${table.reviewed_at} >= ${table.created_at})
        OR (${table.historical_review} = 1 AND ${table.historical_source_site} IS NOT NULL
          AND ${table.reviewed_by_user_id} IS NULL AND ${table.status} IN ('approved', 'rejected')
          AND typeof(${table.reviewed_at}) = 'integer' AND ${table.reviewed_at} >= ${table.created_at})`,
    ),
    check(
      "music_cover_proposals_status_outcome_check",
      sql`(${table.status} = 'pending_review'
          AND ${table.reviewed_by_user_id} IS NULL
          AND ${table.reviewed_at} IS NULL
          AND ${table.review_result_code} IS NULL
          AND ${table.review_note} IS NULL
          AND ${table.approved_performance_id} IS NULL)
        OR (${table.status} = 'approved'
          AND (${table.reviewed_by_user_id} IS NOT NULL OR ${table.historical_review} = 1)
          AND ${table.reviewed_at} IS NOT NULL
          AND (${table.approved_performance_id} IS NOT NULL
            OR ${table.approved_performance_snapshot_json} IS NOT NULL))
        OR (${table.status} = 'rejected'
          AND (${table.reviewed_by_user_id} IS NOT NULL OR ${table.historical_review} = 1)
          AND ${table.reviewed_at} IS NOT NULL
          AND ${table.approved_performance_id} IS NULL)
        OR (${table.status} = 'withdrawn'
          AND ${table.reviewed_by_user_id} IS NULL
          AND ${table.reviewed_at} IS NULL
          AND ${table.review_result_code} IS NULL
          AND ${table.review_note} IS NULL
          AND ${table.approved_performance_id} IS NULL)`,
    ),
    check(
      "music_cover_proposals_deleted_approval_check",
      sql`${table.approved_performance_snapshot_json} IS NULL OR CASE
        WHEN json_valid(${table.approved_performance_snapshot_json}) = 0 THEN 0
        ELSE coalesce(${table.status} = 'approved'
          AND ${table.approved_performance_id} IS NULL
          AND json_type(${table.approved_performance_snapshot_json}) = 'object'
          AND json_type(${table.approved_performance_snapshot_json}, '$.performanceId') = 'text'
          AND length(trim(json_extract(${table.approved_performance_snapshot_json}, '$.performanceId'))) > 0
          AND json_type(${table.approved_performance_snapshot_json}, '$.songId') = 'text'
          AND json_type(${table.approved_performance_snapshot_json}, '$.deletedAt') = 'integer'
          AND json_extract(${table.approved_performance_snapshot_json}, '$.deletedAt') >= ${table.reviewed_at}, 0)
        END`,
    ),
    check(
      "music_cover_proposals_terminal_lock_check",
      sql`${table.status} = 'pending_review'
        OR (${table.review_lock_token} IS NULL AND ${table.review_lock_expires_at} IS NULL)`,
    ),
    check(
      "music_cover_proposals_optional_text_check",
      sql`(${table.submitted_note} IS NULL OR length(trim(${table.submitted_note})) > 0)
        AND (${table.review_result_code} IS NULL OR length(trim(${table.review_result_code})) > 0)
        AND (${table.review_note} IS NULL OR length(trim(${table.review_note})) > 0)`,
    ),
    check(
      "music_cover_proposals_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicCoverProposal = typeof musicCoverProposals.$inferSelect;
export type NewMusicCoverProposal = typeof musicCoverProposals.$inferInsert;

export const musicCoverProposalParticipants = sqliteTable(
  "music_cover_proposal_participants",
  {
    proposal_id: text("proposal_id")
      .notNull()
      .references(() => musicCoverProposals.id, { onDelete: "cascade" }),
    credit_order: integer("credit_order").notNull().default(0),
    resolved_entity_id: text("resolved_entity_id").references(
      () => musicEntities.id,
      { onDelete: "restrict" },
    ),
    submitted_member_uid: integer("submitted_member_uid").references(
      () => members.uid,
      { onDelete: "set null" },
    ),
    submitted_name_snapshot: text("submitted_name_snapshot").notNull(),
    participant_role: text("participant_role")
      .$type<OtwPlayParticipantRole>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.proposal_id, table.credit_order],
      name: "pk_music_cover_proposal_participants",
    }),
    index("idx_music_cover_proposal_participants_entity_proposal").on(
      table.resolved_entity_id,
      table.proposal_id,
    ),
    index("idx_music_cover_proposal_participants_member_proposal").on(
      table.submitted_member_uid,
      table.proposal_id,
    ),
    check(
      "music_cover_proposal_participants_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_cover_proposal_participants_snapshot_check",
      sql`length(trim(${table.submitted_name_snapshot})) > 0`,
    ),
    check(
      "music_cover_proposal_participants_role_check",
      sql`${table.participant_role} IN ('vocal', 'featured_vocal', 'chorus', 'other')`,
    ),
  ],
);

export type MusicCoverProposalParticipant =
  typeof musicCoverProposalParticipants.$inferSelect;
export type NewMusicCoverProposalParticipant =
  typeof musicCoverProposalParticipants.$inferInsert;

export const musicCoverProposalOriginalArtists = sqliteTable(
  "music_cover_proposal_original_artists",
  {
    proposal_id: text("proposal_id")
      .notNull()
      .references(() => musicCoverProposals.id, { onDelete: "cascade" }),
    credit_order: integer("credit_order").notNull().default(0),
    resolved_entity_id: text("resolved_entity_id").references(
      () => musicEntities.id,
      { onDelete: "restrict" },
    ),
    submitted_member_uid: integer("submitted_member_uid").references(
      () => members.uid,
      { onDelete: "set null" },
    ),
    submitted_name_snapshot: text("submitted_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.proposal_id, table.credit_order],
      name: "pk_music_cover_proposal_original_artists",
    }),
    index("idx_music_cover_proposal_original_artists_entity_proposal").on(
      table.resolved_entity_id,
      table.proposal_id,
    ),
    index("idx_music_cover_proposal_original_artists_member_proposal").on(
      table.submitted_member_uid,
      table.proposal_id,
    ),
    check(
      "music_cover_proposal_original_artists_credit_order_check",
      sql`typeof(${table.credit_order}) = 'integer' AND ${table.credit_order} >= 0`,
    ),
    check(
      "music_cover_proposal_original_artists_snapshot_check",
      sql`length(trim(${table.submitted_name_snapshot})) > 0`,
    ),
  ],
);

export type MusicCoverProposalOriginalArtist =
  typeof musicCoverProposalOriginalArtists.$inferSelect;
export type NewMusicCoverProposalOriginalArtist =
  typeof musicCoverProposalOriginalArtists.$inferInsert;

export const musicCatalogEvents = sqliteTable(
  "music_catalog_events",
  {
    id: text().primaryKey(),
    aggregate_type: text("aggregate_type").notNull(),
    aggregate_id: text("aggregate_id").notNull(),
    event_type: text("event_type").notNull(),
    actor_kind: text("actor_kind")
      .$type<OtwPlayCatalogEventActorKind>()
      .notNull(),
    actor_user_id: text("actor_user_id"),
    before_json: text("before_json"),
    after_json: text("after_json"),
    detail_json: text("detail_json"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_music_catalog_events_aggregate_created_id").on(
      table.aggregate_type,
      table.aggregate_id,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    index("idx_music_catalog_events_type_created_id").on(
      table.event_type,
      sql`${table.created_at} DESC`,
      table.id,
    ),
    check(
      "music_catalog_events_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND length(trim(${table.aggregate_type})) > 0
        AND length(trim(${table.aggregate_id})) > 0
        AND length(trim(${table.event_type})) > 0`,
    ),
    check(
      "music_catalog_events_actor_kind_check",
      sql`${table.actor_kind} IN ('member', 'admin', 'system')`,
    ),
    check(
      "music_catalog_events_actor_check",
      sql`(${table.actor_kind} = 'system' AND ${table.actor_user_id} IS NULL)
        OR (${table.actor_kind} IN ('member', 'admin')
          AND ${table.actor_user_id} IS NOT NULL
          AND length(trim(${table.actor_user_id})) > 0)`,
    ),
    check(
      "music_catalog_events_json_check",
        sql`CASE
          WHEN ${table.before_json} IS NULL THEN 1
          WHEN typeof(${table.before_json}) <> 'text' THEN 0
          WHEN json_valid(${table.before_json}) = 0 THEN 0
          ELSE json_type(${table.before_json}) = 'object'
        END
        AND CASE
          WHEN ${table.after_json} IS NULL THEN 1
          WHEN typeof(${table.after_json}) <> 'text' THEN 0
          WHEN json_valid(${table.after_json}) = 0 THEN 0
          ELSE json_type(${table.after_json}) = 'object'
        END
        AND CASE
          WHEN ${table.detail_json} IS NULL THEN 1
          WHEN typeof(${table.detail_json}) <> 'text' THEN 0
          WHEN json_valid(${table.detail_json}) = 0 THEN 0
          ELSE json_type(${table.detail_json}) = 'object'
        END`,
    ),
    check(
      "music_catalog_events_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0`,
    ),
  ],
);

export type MusicCatalogEvent = typeof musicCatalogEvents.$inferSelect;
export type NewMusicCatalogEvent = typeof musicCatalogEvents.$inferInsert;

export const musicIngestionJobs = sqliteTable(
  "music_ingestion_jobs",
  {
    id: text().primaryKey(),
    source_kind: text("source_kind").notNull().default("playlist_import"),
    candidate_kind: text("candidate_kind", { enum: ["official_video", "singing_clip"] }).notNull().default("official_video"),
    source_external_id: text("source_external_id").notNull(),
    source_url: text("source_url").notNull(),
    source_title: text("source_title"),
    owner_channel_id: text("owner_channel_id").notNull(),
    owner_channel_title: text("owner_channel_title"),
    source_metadata_checked_at: integer("source_metadata_checked_at"),
    import_mode: text("import_mode").notNull(),
    range_start_position: integer("range_start_position").notNull().default(0),
    requested_item_count: integer("requested_item_count").notNull(),
    status: text().$type<OtwPlayIngestionJobStatus>().notNull().default("queued"),
    actor_user_id: text("actor_user_id").notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    last_error_code: text("last_error_code"),
    next_retry_at: integer("next_retry_at"),
    created_at: integer("created_at").notNull(),
    started_at: integer("started_at"),
    completed_at: integer("completed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_jobs_actor_idempotency").on(
      table.actor_user_id,
      table.idempotency_key,
    ),
    index("idx_music_ingestion_jobs_source_updated_id").on(
      table.source_kind,
      table.source_external_id,
      sql`${table.updated_at} DESC`,
      table.id,
    ),
    index("idx_music_ingestion_jobs_status_retry_id").on(
      table.status,
      table.next_retry_at,
      table.id,
    ),
    check(
      "music_ingestion_jobs_required_text_check",
      sql`length(trim(${table.id})) > 0
        AND ${table.source_kind} = 'playlist_import'
        AND length(trim(${table.source_external_id})) > 0
        AND length(trim(${table.source_url})) > 0
        AND (${table.source_title} IS NULL OR length(trim(${table.source_title})) > 0)
        AND length(trim(${table.owner_channel_id})) > 0
        AND (${table.owner_channel_title} IS NULL OR length(trim(${table.owner_channel_title})) > 0)
        AND length(trim(${table.actor_user_id})) > 0
        AND length(trim(${table.idempotency_key})) > 0`,
    ),
    check(
      "music_ingestion_jobs_mode_count_check",
      sql`${table.import_mode} IN ('all_new', 'recent')
        AND typeof(${table.range_start_position}) = 'integer'
        AND ${table.range_start_position} >= 0
        AND typeof(${table.requested_item_count}) = 'integer'
        AND ${table.requested_item_count} >= 0
        AND ${table.requested_item_count} <= 5000`,
    ),
    check(
      "music_ingestion_jobs_status_check",
      sql`${table.status} IN ('queued', 'collecting', 'completed', 'partial', 'failed')`,
    ),
    check(
      "music_ingestion_jobs_error_check",
      sql`(${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))`,
    ),
    check(
      "music_ingestion_jobs_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.started_at} IS NULL
          OR (typeof(${table.started_at}) = 'integer' AND ${table.started_at} >= ${table.created_at}))
        AND (${table.completed_at} IS NULL
          OR (typeof(${table.completed_at}) = 'integer' AND ${table.completed_at} >= ${table.created_at}))
        AND (${table.source_metadata_checked_at} IS NULL
          OR (typeof(${table.source_metadata_checked_at}) = 'integer'
            AND ${table.source_metadata_checked_at} >= ${table.created_at}))`,
    ),
  ],
);

export type MusicIngestionJob = typeof musicIngestionJobs.$inferSelect;
export type NewMusicIngestionJob = typeof musicIngestionJobs.$inferInsert;

export const musicIngestionCandidates = sqliteTable(
  "music_ingestion_candidates",
  {
    content_access: text("content_access").$type<"normal" | "admin_archive">().notNull().default("normal"),
    id: text().primaryKey(),
    provider: text().$type<OtwPlayProvider>().notNull().default("youtube"),
    external_video_id: text("external_video_id").notNull(),
    candidate_kind: text("candidate_kind").notNull().default("official_video"),
    status: text().$type<OtwPlayIngestionCandidateStatus>().notNull().default("discovered"),
    classification: text().$type<OtwPlayIngestionClassification>().notNull().default("pending_metadata"),
    exclusion_reason: text("exclusion_reason"),
    title: text(),
    channel_id: text("channel_id"),
    channel_title: text("channel_title"),
    thumbnail_url: text("thumbnail_url"),
    duration_seconds: integer("duration_seconds"),
    provider_published_at: integer("provider_published_at"),
    availability_status: text("availability_status")
      .$type<OtwPlaySourceAvailabilityStatus>()
      .notNull()
      .default("unknown"),
    made_for_kids: integer("made_for_kids", { mode: "boolean" }),
    metadata_checked_at: integer("metadata_checked_at"),
    review_input_json: text("review_input_json"),
    reviewed_by_user_id: text("reviewed_by_user_id"),
    last_conversion_outcome: text("last_conversion_outcome")
      .$type<OtwPlayIngestionConversionOutcome>(),
    last_conversion_error_code: text("last_conversion_error_code"),
    last_conversion_attempt_at: integer("last_conversion_attempt_at"),
    first_discovered_at: integer("first_discovered_at").notNull(),
    last_discovered_at: integer("last_discovered_at").notNull(),
    retention_expires_at: integer("retention_expires_at").notNull(),
    next_retry_at: integer("next_retry_at"),
    linked_performance_id: text("linked_performance_id").references(
      () => musicPerformances.id,
      { onDelete: "restrict" },
    ),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check("music_ingestion_candidates_content_access_check", sql`content_access IN ('normal', 'admin_archive')`),
    uniqueIndex("uidx_music_ingestion_candidates_provider_video").on(
      table.provider,
      table.external_video_id,
    ),
    index("idx_music_ingestion_candidates_status_updated_id").on(
      table.status,
      sql`${table.updated_at} DESC`,
      table.id,
    ),
    index("idx_music_ingestion_candidates_channel_status_id").on(
      table.channel_id,
      table.status,
      table.id,
    ),
    index("idx_music_ingestion_candidates_refresh_id").on(
      table.metadata_checked_at,
      table.id,
    ),
    index("idx_music_ingestion_candidates_retention_id").on(
      table.retention_expires_at,
      table.id,
    ),
    check(
      "music_ingestion_candidates_identity_check",
      sql`${table.provider} = 'youtube'
        AND length(${table.external_video_id}) = 11
        AND ${table.external_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'
        AND ${table.candidate_kind} IN ('official_video', 'singing_clip')`,
    ),
    check(
      "music_ingestion_candidates_status_check",
      sql`${table.status} IN ('discovered', 'needs_input', 'ready', 'converted', 'ignored', 'blocked')`,
    ),
    check(
      "music_ingestion_candidates_classification_check",
      sql`${table.classification} IN ('pending_metadata', 'eligible', 'existing_catalog',
        'existing_proposal', 'existing_candidate', 'channel_review', 'policy_blocked',
        'unavailable', 'scope_review', 'playlist_duplicate')`,
    ),
    check(
      "music_ingestion_candidates_metadata_check",
      sql`(${table.exclusion_reason} IS NULL OR length(trim(${table.exclusion_reason})) > 0)
        AND (${table.title} IS NULL OR length(trim(${table.title})) > 0)
        AND (${table.channel_id} IS NULL OR length(trim(${table.channel_id})) > 0)
        AND (${table.channel_title} IS NULL OR length(trim(${table.channel_title})) > 0)
        AND (${table.duration_seconds} IS NULL
          OR (typeof(${table.duration_seconds}) = 'integer' AND ${table.duration_seconds} >= 0))`,
    ),
    check(
      "music_ingestion_candidates_availability_check",
      sql`${table.availability_status} IN ('unknown', 'playable', 'private',
        'embed_disabled', 'deleted', 'region_blocked', 'unavailable')`,
    ),
    check(
      "music_ingestion_candidates_review_json_check",
      sql`CASE
        WHEN ${table.review_input_json} IS NULL THEN 1
        WHEN typeof(${table.review_input_json}) <> 'text' THEN 0
        WHEN json_valid(${table.review_input_json}) = 0 THEN 0
        ELSE json_type(${table.review_input_json}) = 'object'
      END`,
    ),
    check(
      "music_ingestion_candidates_boolean_check",
      sql`${table.made_for_kids} IS NULL
        OR (typeof(${table.made_for_kids}) = 'integer'
          AND ${table.made_for_kids} IN (0, 1))`,
    ),
    check(
      "music_ingestion_candidates_conversion_check",
      sql`CASE
        WHEN ${table.last_conversion_outcome} IS NULL THEN
          ${table.last_conversion_error_code} IS NULL
          AND ${table.last_conversion_attempt_at} IS NULL
        WHEN ${table.last_conversion_outcome} NOT IN ('created', 'duplicate', 'stale',
          'validation_failed', 'retryable_failed') THEN 0
        WHEN typeof(${table.last_conversion_attempt_at}) <> 'integer'
          OR ${table.last_conversion_attempt_at} < ${table.created_at} THEN 0
        WHEN ${table.last_conversion_error_code} IS NOT NULL
          AND length(trim(${table.last_conversion_error_code})) = 0 THEN 0
        ELSE 1
      END`,
    ),
    check(
      "music_ingestion_candidates_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.first_discovered_at}) = 'integer' AND ${table.first_discovered_at} >= 0
        AND typeof(${table.last_discovered_at}) = 'integer'
        AND ${table.last_discovered_at} >= ${table.first_discovered_at}
        AND typeof(${table.retention_expires_at}) = 'integer'
        AND ${table.retention_expires_at} >= ${table.last_discovered_at}
        AND (${table.metadata_checked_at} IS NULL
          OR (typeof(${table.metadata_checked_at}) = 'integer' AND ${table.metadata_checked_at} >= 0))
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicIngestionCandidate = typeof musicIngestionCandidates.$inferSelect;
export type NewMusicIngestionCandidate = typeof musicIngestionCandidates.$inferInsert;

export const musicChannelAutomationApprovals = sqliteTable(
  "music_channel_automation_approvals",
  {
    channel_id: text("channel_id")
      .primaryKey()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    scope: text().$type<"candidate_collection">().notNull(),
    status: text().$type<"approved" | "revoked">().notNull(),
    operator_reference: text("operator_reference").notNull(),
    approval_reference: text("approval_reference").notNull(),
    revocation_procedure: text("revocation_procedure").notNull(),
    approved_by_user_id: text("approved_by_user_id").notNull(),
    approved_at: integer("approved_at").notNull(),
    revoked_by_user_id: text("revoked_by_user_id"),
    revoked_at: integer("revoked_at"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_music_channel_automation_approvals_status_channel").on(
      table.status,
      table.channel_id,
    ),
    check(
      "music_channel_automation_approvals_required_check",
      sql`${table.scope} = 'candidate_collection'
        AND ${table.status} IN ('approved', 'revoked')
        AND length(trim(${table.operator_reference})) > 0
        AND length(trim(${table.approval_reference})) > 0
        AND length(trim(${table.revocation_procedure})) > 0
        AND length(trim(${table.approved_by_user_id})) > 0`,
    ),
    check(
      "music_channel_automation_approvals_revocation_check",
      sql`(${table.status} = 'approved'
          AND ${table.revoked_by_user_id} IS NULL
          AND ${table.revoked_at} IS NULL)
        OR (${table.status} = 'revoked'
          AND length(trim(${table.revoked_by_user_id})) > 0
          AND typeof(${table.revoked_at}) = 'integer'
          AND ${table.revoked_at} >= ${table.approved_at})`,
    ),
    check(
      "music_channel_automation_approvals_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.approved_at}) = 'integer' AND ${table.approved_at} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannelAutomationApproval =
  typeof musicChannelAutomationApprovals.$inferSelect;
export type NewMusicChannelAutomationApproval =
  typeof musicChannelAutomationApprovals.$inferInsert;

export const musicChannelUploadMonitors = sqliteTable(
  "music_channel_upload_monitors",
  {
    id: text().primaryKey(),
    channel_id: text("channel_id")
      .notNull()
      .references(() => musicChannels.id, { onDelete: "restrict" }),
    uploads_playlist_id: text("uploads_playlist_id").notNull(),
    status: text().$type<"active" | "paused">().notNull().default("active"),
    check_interval_minutes: integer("check_interval_minutes").notNull().default(360),
    last_checked_at: integer("last_checked_at"),
    next_check_at: integer("next_check_at").notNull(),
    last_seen_video_id: text("last_seen_video_id"),
    last_seen_published_at: integer("last_seen_published_at"),
    sync_page_token: text("sync_page_token"),
    sync_base_video_id: text("sync_base_video_id"),
    sync_newest_video_id: text("sync_newest_video_id"),
    sync_started_at: integer("sync_started_at"),
    last_success_at: integer("last_success_at"),
    consecutive_failures: integer("consecutive_failures").notNull().default(0),
    last_recent_reconciled_at: integer("last_recent_reconciled_at"),
    last_error_code: text("last_error_code"),
    lease_until: integer("lease_until"),
    generation: integer().notNull().default(0),
    deleted_at: integer("deleted_at"),
    created_by_user_id: text("created_by_user_id").notNull(),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_upload_monitors_channel")
      .on(table.channel_id)
      .where(sql`${table.deleted_at} IS NULL`),
    index("idx_music_channel_upload_monitors_due").on(
      table.status,
      table.next_check_at,
      table.lease_until,
      table.id,
    ),
    check(
      "music_channel_upload_monitors_identity_check",
      sql`length(trim(${table.id})) > 0
        AND length(${table.uploads_playlist_id}) = 24
        AND substr(${table.uploads_playlist_id}, 1, 2) = 'UU'
        AND substr(${table.uploads_playlist_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(trim(${table.created_by_user_id})) > 0`,
    ),
    check(
      "music_channel_upload_monitors_status_interval_check",
      sql`${table.status} IN ('active', 'paused')
        AND typeof(${table.check_interval_minutes}) = 'integer'
        AND ${table.check_interval_minutes} >= 60
        AND ${table.check_interval_minutes} <= 1440`,
    ),
    check(
      "music_channel_upload_monitors_watermark_check",
      sql`(${table.last_seen_video_id} IS NULL
          OR (length(${table.last_seen_video_id}) = 11
            AND ${table.last_seen_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'))
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)`,
    ),
    check(
      "music_channel_upload_monitors_version_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.generation}) = 'integer' AND ${table.generation} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND typeof(${table.next_check_at}) = 'integer' AND ${table.next_check_at} >= 0
        AND (${table.last_checked_at} IS NULL
          OR (typeof(${table.last_checked_at}) = 'integer' AND ${table.last_checked_at} >= 0))
        AND (${table.last_seen_published_at} IS NULL
          OR (typeof(${table.last_seen_published_at}) = 'integer' AND ${table.last_seen_published_at} >= 0))
        AND (${table.last_recent_reconciled_at} IS NULL
          OR (typeof(${table.last_recent_reconciled_at}) = 'integer' AND ${table.last_recent_reconciled_at} >= 0))
        AND (${table.lease_until} IS NULL
          OR (typeof(${table.lease_until}) = 'integer' AND ${table.lease_until} >= 0))
        AND (${table.deleted_at} IS NULL
          OR (typeof(${table.deleted_at}) = 'integer' AND ${table.deleted_at} >= ${table.created_at}))`,
    ),
  ],
);

export const musicChannelWebsubSubscriptions = sqliteTable(
  "music_channel_websub_subscriptions",
  {
    id: text().primaryKey(),
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "restrict" }),
    monitor_generation: integer("monitor_generation").notNull(),
    topic_url: text("topic_url").notNull(),
    callback_token_hash: text("callback_token_hash").notNull(),
    secret_version: integer("secret_version").notNull(),
    status: text()
      .$type<
        | "pending"
        | "active"
        | "renewing"
        | "unsubscribing"
        | "unsubscribed"
        | "denied"
        | "failed"
      >()
      .notNull(),
    pending_mode: text("pending_mode").$type<"subscribe" | "unsubscribe">(),
    requested_at: integer("requested_at").notNull(),
    verified_at: integer("verified_at"),
    lease_expires_at: integer("lease_expires_at"),
    last_notification_at: integer("last_notification_at"),
    last_error_code: text("last_error_code"),
    version: integer().notNull().default(0),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_websub_subscriptions_monitor_generation").on(
      table.monitor_id,
      table.monitor_generation,
    ),
    uniqueIndex("uidx_music_channel_websub_subscriptions_callback_hash").on(
      table.callback_token_hash,
    ),
    index("idx_music_channel_websub_subscriptions_lease").on(
      table.status,
      table.lease_expires_at,
      table.id,
    ),
    check(
      "music_channel_websub_subscriptions_identity_check",
      sql`length(trim(${table.id})) > 0
        AND typeof(${table.monitor_generation}) = 'integer'
        AND ${table.monitor_generation} >= 0
        AND length(${table.topic_url}) = 80
        AND substr(${table.topic_url}, 1, 56) = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id='
        AND length(${table.callback_token_hash}) = 64
        AND ${table.callback_token_hash} NOT GLOB '*[^a-f0-9]*'
        AND typeof(${table.secret_version}) = 'integer'
        AND ${table.secret_version} >= 1`,
    ),
    check(
      "music_channel_websub_subscriptions_status_check",
      sql`${table.status} IN ('pending', 'active', 'renewing', 'unsubscribing',
        'unsubscribed', 'denied', 'failed')
        AND (${table.pending_mode} IS NULL
          OR ${table.pending_mode} IN ('subscribe', 'unsubscribe'))
        AND ((${table.status} IN ('pending', 'renewing') AND ${table.pending_mode} = 'subscribe')
          OR (${table.status} = 'unsubscribing' AND ${table.pending_mode} = 'unsubscribe')
          OR (${table.status} IN ('active', 'unsubscribed', 'denied', 'failed')
            AND ${table.pending_mode} IS NULL))
        AND (${table.status} <> 'active'
          OR (${table.verified_at} IS NOT NULL AND ${table.lease_expires_at} IS NOT NULL))`,
    ),
    check(
      "music_channel_websub_subscriptions_time_check",
      sql`typeof(${table.version}) = 'integer' AND ${table.version} >= 0
        AND typeof(${table.requested_at}) = 'integer' AND ${table.requested_at} >= 0
        AND (${table.verified_at} IS NULL
          OR (typeof(${table.verified_at}) = 'integer' AND ${table.verified_at} >= 0))
        AND (${table.lease_expires_at} IS NULL
          OR (typeof(${table.lease_expires_at}) = 'integer'
            AND ${table.lease_expires_at} >= ${table.requested_at}))
        AND (${table.last_notification_at} IS NULL
          OR (typeof(${table.last_notification_at}) = 'integer'
            AND ${table.last_notification_at} >= 0))
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type MusicChannelWebsubSubscription =
  typeof musicChannelWebsubSubscriptions.$inferSelect;
export type NewMusicChannelWebsubSubscription =
  typeof musicChannelWebsubSubscriptions.$inferInsert;

export const musicChannelWebsubDeliveries = sqliteTable(
  "music_channel_websub_deliveries",
  {
    id: text().primaryKey(),
    subscription_id: text("subscription_id")
      .notNull()
      .references(() => musicChannelWebsubSubscriptions.id, { onDelete: "restrict" }),
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "restrict" }),
    monitor_generation: integer("monitor_generation").notNull(),
    external_channel_id: text("external_channel_id").notNull(),
    external_video_id: text("external_video_id").notNull(),
    provider_updated_at: integer("provider_updated_at").notNull(),
    status: text()
      .$type<
        | "pending"
        | "enqueued"
        | "processing"
        | "completed"
        | "rejected"
        | "failed"
        | "dead_letter"
      >()
      .notNull(),
    attempt_count: integer("attempt_count").notNull().default(0),
    last_error_code: text("last_error_code"),
    received_at: integer("received_at").notNull(),
    enqueued_at: integer("enqueued_at"),
    processed_at: integer("processed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_channel_websub_deliveries_event").on(
      table.subscription_id,
      table.external_video_id,
      table.provider_updated_at,
    ),
    index("idx_music_channel_websub_deliveries_status_received").on(
      table.status,
      table.received_at,
      table.id,
    ),
    index("idx_music_channel_websub_deliveries_monitor_received").on(
      table.monitor_id,
      sql`${table.received_at} DESC`,
      table.id,
    ),
    check(
      "music_channel_websub_deliveries_identity_check",
      sql`length(trim(${table.id})) > 0
        AND typeof(${table.monitor_generation}) = 'integer'
        AND ${table.monitor_generation} >= 0
        AND length(${table.external_channel_id}) = 24
        AND substr(${table.external_channel_id}, 1, 2) = 'UC'
        AND substr(${table.external_channel_id}, 3) NOT GLOB '*[^A-Za-z0-9_-]*'
        AND length(${table.external_video_id}) = 11
        AND ${table.external_video_id} NOT GLOB '*[^A-Za-z0-9_-]*'`,
    ),
    check(
      "music_channel_websub_deliveries_status_check",
      sql`${table.status} IN ('pending', 'enqueued', 'processing', 'completed',
        'rejected', 'failed', 'dead_letter')
        AND typeof(${table.attempt_count}) = 'integer'
        AND ${table.attempt_count} >= 0
        AND (${table.last_error_code} IS NULL OR length(trim(${table.last_error_code})) > 0)`,
    ),
    check(
      "music_channel_websub_deliveries_time_check",
      sql`typeof(${table.provider_updated_at}) = 'integer' AND ${table.provider_updated_at} >= 0
        AND typeof(${table.received_at}) = 'integer' AND ${table.received_at} >= 0
        AND (${table.enqueued_at} IS NULL
          OR (typeof(${table.enqueued_at}) = 'integer' AND ${table.enqueued_at} >= ${table.received_at}))
        AND (${table.processed_at} IS NULL
          OR (typeof(${table.processed_at}) = 'integer' AND ${table.processed_at} >= ${table.received_at}))
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.received_at}`,
    ),
  ],
);

export type MusicChannelWebsubDelivery =
  typeof musicChannelWebsubDeliveries.$inferSelect;
export type NewMusicChannelWebsubDelivery =
  typeof musicChannelWebsubDeliveries.$inferInsert;

export const musicChannelUploadCandidateOrigins = sqliteTable(
  "music_channel_upload_candidate_origins",
  {
    monitor_id: text("monitor_id")
      .notNull()
      .references(() => musicChannelUploadMonitors.id, { onDelete: "cascade" }),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => musicIngestionCandidates.id, { onDelete: "cascade" }),
    provider_published_at: integer("provider_published_at"),
    discovered_at: integer("discovered_at").notNull(),
    monitor_generation: integer("monitor_generation").notNull().default(0),
  },
  (table) => [
    index("idx_music_channel_upload_origins_candidate").on(table.candidate_id),
    primaryKey({ columns: [table.monitor_id, table.candidate_id] }),
    index("idx_music_channel_upload_origins_monitor_discovered").on(
      table.monitor_id,
      sql`${table.discovered_at} DESC`,
      table.candidate_id,
    ),
    index("idx_music_channel_upload_origins_monitor_generation_discovered").on(
      table.monitor_id,
      table.monitor_generation,
      sql`${table.discovered_at} DESC`,
      table.candidate_id,
    ),
    check(
      "music_channel_upload_origins_generation_time_check",
      sql`typeof(${table.monitor_generation}) = 'integer'
        AND ${table.monitor_generation} >= 0
        AND typeof(${table.discovered_at}) = 'integer'
        AND ${table.discovered_at} >= 0
        AND (${table.provider_published_at} IS NULL
          OR (typeof(${table.provider_published_at}) = 'integer'
            AND ${table.provider_published_at} >= 0))`,
    ),
  ],
);

export const musicIngestionEvents = sqliteTable(
  "music_ingestion_events",
  {
    id: text().primaryKey(),
    job_id: text("job_id").references(() => musicIngestionJobs.id, {
      onDelete: "restrict",
    }),
    candidate_id: text("candidate_id").references(
      () => musicIngestionCandidates.id,
      { onDelete: "restrict" },
    ),
    event_type: text("event_type").notNull(),
    actor_user_id: text("actor_user_id").notNull(),
    detail_json: text("detail_json").notNull().default("{}"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_music_ingestion_events_job_created_id").on(
      table.job_id,
      table.created_at,
      table.id,
    ),
    index("idx_music_ingestion_events_candidate_created_id").on(
      table.candidate_id,
      table.created_at,
      table.id,
    ),
    check(
      "music_ingestion_events_required_check",
      sql`length(trim(${table.id})) > 0
        AND (${table.job_id} IS NOT NULL OR ${table.candidate_id} IS NOT NULL)
        AND length(trim(${table.event_type})) > 0
        AND length(trim(${table.actor_user_id})) > 0
        AND json_valid(${table.detail_json}) = 1
        AND json_type(${table.detail_json}) = 'object'
        AND typeof(${table.created_at}) = 'integer'
        AND ${table.created_at} >= 0`,
    ),
  ],
);

export type MusicIngestionEvent = typeof musicIngestionEvents.$inferSelect;
export type NewMusicIngestionEvent = typeof musicIngestionEvents.$inferInsert;

export const musicIngestionCandidateOrigins = sqliteTable(
  "music_ingestion_candidate_origins",
  {
    id: text().primaryKey(),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => musicIngestionCandidates.id, { onDelete: "cascade" }),
    job_id: text("job_id")
      .notNull()
      .references(() => musicIngestionJobs.id, { onDelete: "cascade" }),
    origin_kind: text("origin_kind").notNull().default("playlist_import"),
    playlist_id: text("playlist_id").notNull(),
    playlist_item_id: text("playlist_item_id").notNull(),
    playlist_position: integer("playlist_position").notNull(),
    is_playlist_duplicate: integer("is_playlist_duplicate", { mode: "boolean" })
      .notNull()
      .default(false),
    discovered_at: integer("discovered_at").notNull(),
  },
  (table) => [
    index("idx_music_ingestion_origins_job_candidate").on(table.job_id, table.candidate_id),
    uniqueIndex("uidx_music_ingestion_origins_job_item").on(
      table.job_id,
      table.playlist_item_id,
    ),
    index("idx_music_ingestion_origins_job_position_id").on(
      table.job_id,
      table.playlist_position,
      table.id,
    ),
    index("idx_music_ingestion_origins_candidate_discovered_id").on(
      table.candidate_id,
      sql`${table.discovered_at} DESC`,
      table.id,
    ),
    check(
      "music_ingestion_origins_required_check",
      sql`${table.origin_kind} = 'playlist_import'
        AND length(trim(${table.id})) > 0
        AND length(trim(${table.playlist_id})) > 0
        AND length(trim(${table.playlist_item_id})) > 0
        AND typeof(${table.playlist_position}) = 'integer'
        AND ${table.playlist_position} >= 0
        AND typeof(${table.is_playlist_duplicate}) = 'integer'
        AND ${table.is_playlist_duplicate} IN (0, 1)
        AND typeof(${table.discovered_at}) = 'integer'
        AND ${table.discovered_at} >= 0`,
    ),
  ],
);

export type MusicIngestionCandidateOrigin =
  typeof musicIngestionCandidateOrigins.$inferSelect;
export type NewMusicIngestionCandidateOrigin =
  typeof musicIngestionCandidateOrigins.$inferInsert;

export const musicIngestionMessages = sqliteTable(
  "music_ingestion_messages",
  {
    idempotency_key: text("idempotency_key").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => musicIngestionJobs.id, { onDelete: "cascade" }),
    message_kind: text("message_kind").notNull(),
    payload_key: text("payload_key").notNull(),
    page_token: text("page_token"),
    video_ids_json: text("video_ids_json"),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    last_error_code: text("last_error_code"),
    next_retry_at: integer("next_retry_at"),
    created_at: integer("created_at").notNull(),
    completed_at: integer("completed_at"),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_music_ingestion_messages_job_kind_payload").on(
      table.job_id,
      table.message_kind,
      table.payload_key,
    ),
    index("idx_music_ingestion_messages_status_retry_key").on(
      table.status,
      table.next_retry_at,
      table.idempotency_key,
    ),
    check(
      "music_ingestion_messages_required_check",
      sql`length(trim(${table.idempotency_key})) > 0
        AND length(trim(${table.payload_key})) > 0
        AND ${table.message_kind} IN ('playlist_page', 'video_batch')
        AND ${table.status} IN ('pending', 'completed', 'failed')
        AND typeof(${table.attempts}) = 'integer' AND ${table.attempts} >= 0`,
    ),
    check(
      "music_ingestion_messages_payload_check",
      sql`(${table.message_kind} = 'playlist_page' AND ${table.video_ids_json} IS NULL)
        OR (${table.message_kind} = 'video_batch'
          AND ${table.page_token} IS NULL
          AND ${table.video_ids_json} IS NOT NULL
          AND json_valid(${table.video_ids_json}) = 1
          AND json_type(${table.video_ids_json}) = 'array')`,
    ),
    check(
      "music_ingestion_messages_time_check",
      sql`typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}
        AND (${table.completed_at} IS NULL
          OR (typeof(${table.completed_at}) = 'integer' AND ${table.completed_at} >= ${table.created_at}))
        AND (${table.next_retry_at} IS NULL
          OR (typeof(${table.next_retry_at}) = 'integer' AND ${table.next_retry_at} >= 0))`,
    ),
  ],
);

export type MusicIngestionMessage = typeof musicIngestionMessages.$inferSelect;
export type NewMusicIngestionMessage = typeof musicIngestionMessages.$inferInsert;

export const musicSearchTerms = sqliteTable(
  "music_search_terms",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    term_kind: text("term_kind").$type<OtwPlaySearchTermKind>().notNull(),
    display_value: text("display_value").notNull(),
    normalized_term: text("normalized_term").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.term_kind, table.normalized_term],
      name: "pk_music_search_terms",
    }),
    index("idx_music_search_terms_normalized_kind_song").on(
      table.normalized_term,
      table.term_kind,
      table.song_id,
    ),
    check(
      "music_search_terms_kind_check",
      sql`${table.term_kind} IN ('title', 'title_alias', 'original_artist', 'participant')`,
    ),
    check(
      "music_search_terms_required_text_check",
      sql`length(trim(${table.display_value})) > 0 AND length(trim(${table.normalized_term})) > 0`,
    ),
  ],
);

export type MusicSearchTerm = typeof musicSearchTerms.$inferSelect;
export type NewMusicSearchTerm = typeof musicSearchTerms.$inferInsert;

export const musicSearchGrams = sqliteTable(
  "music_search_grams",
  {
    song_id: text("song_id")
      .notNull()
      .references(() => musicSongs.id, { onDelete: "cascade" }),
    gram_size: integer("gram_size").notNull(),
    normalized_gram: text("normalized_gram").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.song_id, table.gram_size, table.normalized_gram],
      name: "pk_music_search_grams",
    }),
    index("idx_music_search_grams_size_normalized_song").on(
      table.gram_size,
      table.normalized_gram,
      table.song_id,
    ),
    check(
      "music_search_grams_size_check",
      sql`typeof(${table.gram_size}) = 'integer'
        AND ${table.gram_size} IN (2, 3)`,
    ),
    check(
      "music_search_grams_value_check",
      sql`typeof(${table.normalized_gram}) = 'text'
        AND length(${table.normalized_gram}) = ${table.gram_size}`,
    ),
  ],
);

export type MusicSearchGram = typeof musicSearchGrams.$inferSelect;
export type NewMusicSearchGram = typeof musicSearchGrams.$inferInsert;

export const musicSearchGramStats = sqliteTable(
  "music_search_gram_stats",
  {
    gram_size: integer("gram_size").notNull(),
    normalized_gram: text("normalized_gram").notNull(),
    song_count: integer("song_count").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.gram_size, table.normalized_gram],
      name: "pk_music_search_gram_stats",
    }),
    check(
      "music_search_gram_stats_size_check",
      sql`typeof(${table.gram_size}) = 'integer'
        AND ${table.gram_size} IN (2, 3)`,
    ),
    check(
      "music_search_gram_stats_value_check",
      sql`typeof(${table.normalized_gram}) = 'text'
        AND length(${table.normalized_gram}) = ${table.gram_size}`,
    ),
    check(
      "music_search_gram_stats_count_check",
      sql`typeof(${table.song_count}) = 'integer'
        AND ${table.song_count} > 0`,
    ),
  ],
);

export type MusicSearchGramStat = typeof musicSearchGramStats.$inferSelect;
export type NewMusicSearchGramStat =
  typeof musicSearchGramStats.$inferInsert;

export const musicCatalogMeta = sqliteTable(
  "music_catalog_meta",
  {
    id: integer().primaryKey(),
    revision: integer().notNull().default(0),
    public_read_enabled: integer("public_read_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    navigation_visible: integer("navigation_visible", { mode: "boolean" })
      .notNull()
      .default(false),
    updated_at: integer("updated_at").notNull().default(0),
  },
  (table) => [
    check(
      "music_catalog_meta_singleton_check",
      sql`typeof(${table.id}) = 'integer' AND ${table.id} = 1`,
    ),
    check(
      "music_catalog_meta_revision_check",
      sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 0`,
    ),
    check(
      "music_catalog_meta_flags_check",
      sql`typeof(${table.public_read_enabled}) = 'integer'
        AND ${table.public_read_enabled} IN (0, 1)
        AND typeof(${table.navigation_visible}) = 'integer'
        AND ${table.navigation_visible} IN (0, 1)`,
    ),
    check(
      "music_catalog_meta_navigation_check",
      sql`${table.navigation_visible} = 0 OR ${table.public_read_enabled} = 1`,
    ),
    check(
      "music_catalog_meta_time_check",
      sql`typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= 0`,
    ),
  ],
);

export type MusicCatalogMeta = typeof musicCatalogMeta.$inferSelect;
export type NewMusicCatalogMeta = typeof musicCatalogMeta.$inferInsert;

export const musicPublicReadModelMeta = sqliteTable(
  "music_public_read_model_meta",
  {
    id: integer().primaryKey(),
    revision: integer().notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    check(
      "music_public_read_model_meta_singleton_check",
      sql`typeof(${table.id}) = 'integer' AND ${table.id} = 1`,
    ),
    check(
      "music_public_read_model_meta_revision_check",
      sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 0`,
    ),
    check(
      "music_public_read_model_meta_time_check",
      sql`typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= 0`,
    ),
  ],
);

export type MusicPublicReadModelMeta =
  typeof musicPublicReadModelMeta.$inferSelect;
export type NewMusicPublicReadModelMeta =
  typeof musicPublicReadModelMeta.$inferInsert;

export const scheduledJobRuns = sqliteTable(
  "scheduled_job_runs",
  {
    id: text().primaryKey(),
    job_type: text("job_type").notNull(),
    source: text().notNull(),
    idempotency_key: text("idempotency_key").notNull(),
    scheduled_bucket: text("scheduled_bucket"),
    status: text().notNull().default("queued"),
    actor_id: text("actor_id"),
    actor_name: text("actor_name"),
    actor_ip: text("actor_ip"),
    scheduled_for: integer("scheduled_for"),
    accepted_at: integer("accepted_at").notNull(),
    started_at: integer("started_at"),
    finished_at: integer("finished_at"),
    total_items: integer("total_items").notNull().default(0),
    completed_items: integer("completed_items").notNull().default(0),
    failed_items: integer("failed_items").notNull().default(0),
    skipped_items: integer("skipped_items").notNull().default(0),
    last_error: text("last_error"),
    summary_json: text("summary_json"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_scheduled_job_runs_status_accepted").on(table.status, sql`${table.accepted_at} DESC`, sql`${table.id} DESC`),
    index("idx_scheduled_job_runs_accepted").on(sql`${table.accepted_at} DESC`, sql`${table.id} DESC`),
    index("idx_scheduled_job_runs_job_accepted").on(table.job_type, sql`${table.accepted_at} DESC`, sql`${table.id} DESC`),
    index("idx_scheduled_job_runs_success_finished")
      .on(table.job_type, sql`${table.finished_at} DESC`, sql`${table.id} DESC`)
      .where(sql`${table.status} = 'succeeded' AND ${table.finished_at} IS NOT NULL`),
    uniqueIndex("uidx_scheduled_job_runs_idempotency").on(
      table.idempotency_key,
    ),
    index("idx_scheduled_job_runs_job_status_accepted").on(
      table.job_type,
      table.status,
      table.accepted_at,
    ),
    index("idx_scheduled_job_runs_status_updated").on(
      table.status,
      table.updated_at,
    ),
    check(
      "scheduled_job_runs_source_check",
      sql`${table.source} IN ('scheduled', 'manual')`,
    ),
    check(
      "scheduled_job_runs_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'throttled')`,
    ),
    check(
      "scheduled_job_runs_counts_check",
      sql`typeof(${table.total_items}) = 'integer' AND ${table.total_items} >= 0
        AND typeof(${table.completed_items}) = 'integer' AND ${table.completed_items} >= 0
        AND typeof(${table.failed_items}) = 'integer' AND ${table.failed_items} >= 0
        AND typeof(${table.skipped_items}) = 'integer' AND ${table.skipped_items} >= 0`,
    ),
    check(
      "scheduled_job_runs_time_check",
      sql`typeof(${table.accepted_at}) = 'integer' AND ${table.accepted_at} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;
export type NewScheduledJobRun = typeof scheduledJobRuns.$inferInsert;

export const scheduledJobItems = sqliteTable(
  "scheduled_job_items",
  {
    id: text().primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => scheduledJobRuns.id, { onDelete: "cascade" }),
    target_key: text("target_key").notNull(),
    phase: text().notNull(),
    lane: text().notNull(),
    status: text().notNull().default("queued"),
    attempts: integer().notNull().default(0),
    lease_token: text("lease_token"),
    lease_until: integer("lease_until"),
    continuation_json: text("continuation_json"),
    result_json: text("result_json"),
    last_error_code: text("last_error_code"),
    last_error: text("last_error"),
    available_at: integer("available_at").notNull(),
    started_at: integer("started_at"),
    finished_at: integer("finished_at"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_scheduled_job_items_run_status_updated").on(table.run_id, table.status, sql`${table.updated_at} DESC`),
    uniqueIndex("uidx_scheduled_job_items_run_target_phase").on(
      table.run_id,
      table.target_key,
      table.phase,
    ),
    index("idx_scheduled_job_items_lane_status_available").on(
      table.lane,
      table.status,
      table.available_at,
    ),
    index("idx_scheduled_job_items_lease").on(
      table.status,
      table.lease_until,
    ),
    check(
      "scheduled_job_items_status_check",
      sql`${table.status} IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'throttled')`,
    ),
    check(
      "scheduled_job_items_attempts_check",
      sql`typeof(${table.attempts}) = 'integer' AND ${table.attempts} >= 0`,
    ),
    check(
      "scheduled_job_items_time_check",
      sql`typeof(${table.available_at}) = 'integer' AND ${table.available_at} >= 0
        AND typeof(${table.created_at}) = 'integer' AND ${table.created_at} >= 0
        AND typeof(${table.updated_at}) = 'integer' AND ${table.updated_at} >= ${table.created_at}`,
    ),
  ],
);

export type ScheduledJobItem = typeof scheduledJobItems.$inferSelect;
export type NewScheduledJobItem = typeof scheduledJobItems.$inferInsert;

export const scheduledOutbox = sqliteTable(
  "scheduled_outbox",
  {
    id: text().primaryKey(),
    run_id: text("run_id")
      .notNull()
      .references(() => scheduledJobRuns.id, { onDelete: "cascade" }),
    item_id: text("item_id")
      .notNull()
      .references(() => scheduledJobItems.id, { onDelete: "cascade" }),
    lane: text().notNull(),
    event_type: text("event_type").notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    available_at: integer("available_at").notNull(),
    lease_token: text("lease_token"),
    lease_until: integer("lease_until"),
    dispatched_at: integer("dispatched_at"),
    reconciled_at: integer("reconciled_at"),
    last_error: text("last_error"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_scheduled_outbox_item_event").on(
      table.item_id,
      table.event_type,
    ),
    index("idx_scheduled_outbox_status_available").on(
      table.status,
      table.available_at,
    ),
    index("idx_scheduled_outbox_unresolved").on(table.available_at, table.id).where(
      sql`(${table.event_type} = 'reconcile' AND ${table.reconciled_at} IS NULL) OR (${table.event_type} = 'execute' AND ${table.status} IN ('pending', 'failed', 'dispatching'))`,
    ),
    check(
      "scheduled_outbox_status_check",
      sql`${table.status} IN ('pending', 'dispatching', 'dispatched', 'failed')`,
    ),
    check(
      "scheduled_outbox_attempts_check",
      sql`typeof(${table.attempts}) = 'integer' AND ${table.attempts} >= 0`,
    ),
  ],
);

export type ScheduledOutboxRecord = typeof scheduledOutbox.$inferSelect;
export type NewScheduledOutboxRecord = typeof scheduledOutbox.$inferInsert;

export const scheduledUsageDaily = sqliteTable(
  "scheduled_usage_daily",
  {
    day: text().notNull(),
    lane: text().notNull(),
    resource: text().notNull(),
    reserved: integer().notNull().default(0),
    used: integer().notNull().default(0),
    limit_value: integer("limit_value").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.day, table.lane, table.resource],
      name: "pk_scheduled_usage_daily",
    }),
    index("idx_scheduled_usage_daily_day_resource").on(
      table.day,
      table.resource,
    ),
    check(
      "scheduled_usage_daily_counts_check",
      sql`typeof(${table.reserved}) = 'integer' AND ${table.reserved} >= 0
        AND typeof(${table.used}) = 'integer' AND ${table.used} >= 0
        AND typeof(${table.limit_value}) = 'integer' AND ${table.limit_value} > 0`,
    ),
  ],
);

export type ScheduledUsageDaily = typeof scheduledUsageDaily.$inferSelect;
export type NewScheduledUsageDaily = typeof scheduledUsageDaily.$inferInsert;
