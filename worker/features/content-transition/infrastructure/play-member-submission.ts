import {memberSubmissionVersion,type MemberSubmissionCommand} from "../../otw-play/commands";
/** Original own-user/status/version predicate; create retains its own unique key. */
export function memberSubmissionPredicate(command:MemberSubmissionCommand) {
  return command.action==="create"
    ? {sql:"NOT EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=? OR (submitted_by_user_id=? AND idempotency_key=?))",bindings:[command.proposalId,command.userId,command.input.clientRequestId]}
    : {sql:"EXISTS(SELECT 1 FROM music_cover_proposals WHERE id=? AND submitted_by_user_id=? AND content_access='normal' AND status='pending_review' AND version=?)",bindings:[command.proposalId,command.userId,memberSubmissionVersion(command)]};
}
// All three owning mutations produce pending/withdrawn proposals. Approved song
// links are absent by the original predicate, not reconstructed from later reads.
const fields:Record<string,string>={
  id:"p.id",clientRequestId:"p.idempotency_key",youtubeUrl:"p.submitted_url",youtubeVideoId:"p.youtube_video_id",title:"p.submitted_title",
  submissionKind:"p.submission_kind",broadcastJson:"p.submitted_broadcast_json",suggestedSongId:"p.suggested_song_id",tags:"json(p.submitted_tags_json)",note:"p.submitted_note",status:"p.status",version:"p.version",
  editable:"json(iif(p.status='pending_review','true','false'))",withdrawable:"json(iif(p.status='pending_review','true','false'))",approvedPerformanceDeleted:"json(iif(p.approved_performance_snapshot_json IS NOT NULL,'true','false'))",
  createdAt:"p.created_at",updatedAt:"p.updated_at",approvedSong:"json('null')",
  participants:`json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_patch(json_object('creditOrder',credit_order,'memberUid',submitted_member_uid,'displayName',submitted_name_snapshot,'participantRole',participant_role),iif(resolved_entity_id IS NULL,'{}',json_object('entityId',resolved_entity_id))) value FROM music_cover_proposal_participants WHERE proposal_id=p.id ORDER BY credit_order)))`,
  originalArtists:`json((SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT json_patch(json_object('creditOrder',credit_order,'memberUid',submitted_member_uid,'displayName',submitted_name_snapshot),iif(resolved_entity_id IS NULL,'{}',json_object('entityId',resolved_entity_id))) value FROM music_cover_proposal_original_artists WHERE proposal_id=p.id ORDER BY credit_order)))`,
};
let dto="'{}'";const entries=Object.entries(fields);
for(let i=0;i<entries.length;i+=15) dto=`json_set(${dto},${entries.slice(i,i+15).flatMap(([key,value])=>[`'$.${key}'`,value]).join(",")})`;
export const memberSubmissionResultSql=`(SELECT ${dto} FROM music_cover_proposals p WHERE p.id=? AND p.submitted_by_user_id=? AND p.content_access='normal' AND p.status IN ('pending_review','withdrawn'))`;
