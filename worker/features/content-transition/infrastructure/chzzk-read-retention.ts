/** Only native target work can release read payloads. Original source/frozen
 * controls remain outside ordinary retention, even after the transition ends. */
export const nativeChzzkWholeCompleteSql = (operation="o",transition="t") => `
  ${transition}.local_site=${transition}.target_site AND ${transition}.phase IN ('target_owned','complete')
  AND ${operation}.source_seq IS NULL AND ${operation}.generation=${transition}.generation
  AND json_extract(${operation}.envelope_json,'$.codec.id')='schedules.chzzk_scan'
  AND json_extract(${operation}.outcome_json,'$.outcome') IN ('committed','conflicted','failed')
  AND json_extract(${operation}.outcome_json,'$.sideEffectReconciled')=1
  AND json_type(${operation}.outcome_json,'$.chzzkScan.result')='object'
  AND json_type(${operation}.outcome_json,'$.chzzkScan.reads')='array'
  AND (${operation}.attempt_json IS NULL OR json_extract(${operation}.attempt_json,'$.status') IN ('completed','failed'))
  AND (json_type(${operation}.envelope_json,'$.payload.parent') IS NULL OR EXISTS(
    SELECT 1 FROM content_transition_chzzk_stages s WHERE s.transition_id=${operation}.transition_id AND s.operation_id=${operation}.operation_id
      AND json(s.parent_json)=json_extract(${operation}.envelope_json,'$.payload.parent')
      AND json_extract(s.completion_json,'$.completion')=json_extract(${operation}.outcome_json,'$.chzzkScan')
      AND json_extract(s.completion_json,'$.owner.site')=${transition}.local_site
      AND json_extract(s.completion_json,'$.owner.resource')=${transition}.local_resource
      AND json_extract(s.completion_json,'$.owner.generation')=${transition}.generation
      AND json_extract(s.finalizer_json,'$.runId')=json_extract(s.parent_json,'$.runId')
      AND json_extract(s.finalizer_json,'$.status') IN ('succeeded','partial','failed')
      AND json_type(s.finalizer_json,'$.result')='object'
      AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_children c WHERE c.transition_id=s.transition_id AND c.operation_id=s.operation_id AND (c.result_json IS NULL OR c.accounted_at IS NULL))
  ))
  AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_attempts a WHERE a.transition_id=${operation}.transition_id AND a.operation_id=${operation}.operation_id
    AND (a.state IN ('started','uncertain') OR a.finished_at IS NULL OR a.response_hash IS NULL))`;

export const nativeChzzkReadPrunableSql = (request="content_transition_chzzk_requests") => `
  ${request}.settled_at IS NOT NULL AND length(${request}.settled_outcome_digest)=64
  AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
    WHERE o.transition_id=${request}.transition_id AND o.operation_id=${request}.operation_id AND ${nativeChzzkWholeCompleteSql()}
      AND ${request}.attempt>0 AND ${request}.disposition='consumed' AND ${request}.response_json IS NOT NULL AND EXISTS(
          SELECT 1 FROM json_each(o.outcome_json,'$.chzzkScan.reads') used
          WHERE json_extract(used.value,'$.requestKey')=${request}.request_key
            AND json_extract(used.value,'$.requestHash')=${request}.request_hash
            AND json_extract(used.value,'$.responseHash')=${request}.response_hash))`;
