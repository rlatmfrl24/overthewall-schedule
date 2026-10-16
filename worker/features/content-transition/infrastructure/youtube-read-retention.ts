/** Same policy/cutoff/budget as the existing read detail pruner. Unknown HTTP
 * evidence (including exhausted failures) and all source/frozen work stay held. */
export const nativeYouTubeChannelReadPrunableSql=(request="content_transition_chzzk_requests")=>`
  ${request}.settled_at IS NOT NULL AND length(${request}.settled_outcome_digest)=64
  AND ${request}.disposition='consumed' AND ${request}.response_json IS NOT NULL
  AND EXISTS(SELECT 1 FROM content_transition_operations o JOIN content_transitions t ON t.id=o.transition_id
    WHERE o.transition_id=${request}.transition_id AND o.operation_id=${request}.operation_id
      AND t.local_site=t.target_site AND t.phase IN ('target_owned','complete') AND o.source_seq IS NULL AND o.generation=t.generation
      AND json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.channel.mutate','otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve')
      AND json_extract(o.outcome_json,'$.outcome') IN ('committed','conflicted','failed') AND json_extract(o.outcome_json,'$.sideEffectReconciled')=1
      AND ((json_extract(o.envelope_json,'$.codec.id')='otw-play.channel.mutate'
        AND json_extract(o.outcome_json,'$.youtubeChannel.disposition')='consumed'
        AND json_extract(o.outcome_json,'$.youtubeChannel.requestKey')=${request}.request_key
        AND json_extract(o.outcome_json,'$.youtubeChannel.requestHash')=${request}.request_hash
        AND json_extract(o.outcome_json,'$.youtubeChannel.responseHash')=${request}.response_hash
        AND (json_extract(o.outcome_json,'$.outcome')<>'committed' OR (json_type(o.outcome_json,'$.youtubeChannel.result')='object' AND json_extract(o.outcome_json,'$.youtubeChannel.result')=json_extract(o.envelope_json,'$.nativeReceipt.result'))))
      OR (json_extract(o.envelope_json,'$.codec.id') IN ('otw-play.video.mutate','otw-play.candidate.convert','otw-play.candidate.refresh','otw-play.candidate.channel_approve')
        AND EXISTS(SELECT 1 FROM json_each(o.outcome_json,'$.youtubeVideo.reads') r WHERE json_extract(r.value,'$.disposition')='consumed'
          AND json_extract(r.value,'$.requestKey')=${request}.request_key AND json_extract(r.value,'$.requestHash')=${request}.request_hash AND json_extract(r.value,'$.responseHash')=${request}.response_hash)
        AND (CASE WHEN json_extract(o.envelope_json,'$.codec.id')='otw-play.candidate.convert' THEN json_type(o.envelope_json,'$.nativeReceipt.conversionResult')='object'
          ELSE json_extract(o.outcome_json,'$.outcome')<>'committed' OR json_type(o.envelope_json,'$.nativeReceipt.result')='object' END)))
      AND o.attempt_json IS NULL
      AND NOT EXISTS(SELECT 1 FROM content_transition_chzzk_attempts a WHERE a.transition_id=o.transition_id AND a.operation_id=o.operation_id
        AND (a.state IN ('started','uncertain') OR a.finished_at IS NULL OR a.response_hash IS NULL)))`;
