const priority = (item: string) => `CASE WHEN json_valid(${item}.continuation_json) THEN CASE WHEN json_type(${item}.continuation_json,'$.executionPriority')='object' THEN json_extract(${item}.continuation_json,'$.executionPriority') END END`;
export const hasExecutionPrioritySql = (item: string) => `(json_type(${priority(item)},'$.deadlineAt')='integer'
  AND json_extract(${priority(item)},'$.deadlineAt')>=0
  AND json_type(${priority(item)},'$.lastAttemptAt')='integer'
  AND json_type(${priority(item)},'$.key')='text')`;
const rank = (item: string) => `(json_extract(${priority(item)},'$.deadlineAt'),json_extract(${priority(item)},'$.lastAttemptAt'),json_extract(${priority(item)},'$.key'),${item}.target_key,${item}.phase)`;

// Explicit planner priority serializes only ranked work in its own run; legacy work is unchanged.
export const executionPriorityReadySql = (item: string) => `(NOT COALESCE(${hasExecutionPrioritySql(item)},0) OR NOT EXISTS(
  SELECT 1 FROM scheduled_job_items prior INDEXED BY idx_scheduled_job_items_run_status_updated
  WHERE prior.run_id=${item}.run_id AND prior.status IN ('queued','running') AND prior.id<>${item}.id
    AND ${hasExecutionPrioritySql("prior")}
    AND ((prior.status='running' AND prior.lease_until>?)
      OR (prior.status='queued' AND prior.available_at<=? AND ${rank("prior")}<${rank(item)}))))`;
