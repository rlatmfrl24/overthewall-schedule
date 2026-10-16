import type {OtwPlayAdminCreateSongRequest} from "@contracts/otw-play";

/** Original target-local creation identity; actor data never leaves its site. */
export interface AdminCreateSongCommand {
  input: OtwPlayAdminCreateSongRequest;
  actor: {userId:string;displayName:string|null;ipAddress:string|null};
  now: number;
  ids: {songId:string;eventId:string};
}
