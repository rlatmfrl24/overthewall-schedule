import type {
  OtwPlayCreateSubmissionRequest,
  OtwPlaySubmissionParticipantInput,
  OtwPlaySubmissionPreflightRequest,
  OtwPlaySubmissionSubjectInput,
} from "@contracts/otw-play";
import { OTW_PLAY_PARTICIPANT_ROLES } from "@contracts/otw-play";

export type MemberSubmissionInputResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: Record<string, string> };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const codePointLength = (value: string) => [...value].length;

const text = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return normalized && codePointLength(normalized) <= max ? normalized : null;
};

const optionalText = (value: unknown, max: number) => {
  if (value === undefined || value === null || value === "") return null;
  return text(value, max);
};

const hasExactKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
) => Object.keys(value).every((key) => allowed.includes(key));

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseSubject = (value: unknown): OtwPlaySubmissionSubjectInput | null => {
  if (!isObject(value)) return null;
  if (
    value.kind === "member" &&
    hasExactKeys(value, ["kind", "memberUid"]) &&
    Number.isSafeInteger(value.memberUid) &&
    Number(value.memberUid) > 0
  ) {
    return { kind: "member", memberUid: Number(value.memberUid) };
  }
  if (
    value.kind === "external" &&
    hasExactKeys(value, ["kind", "displayName"])
  ) {
    const displayName = text(value.displayName, 300);
    return displayName ? { kind: "external", displayName } : null;
  }
  return null;
};

const parseSubjects = (
  value: unknown,
  minimum: number,
  maximum: number,
) => {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    return null;
  }
  const parsed = value.map(parseSubject);
  return parsed.every((subject): subject is OtwPlaySubmissionSubjectInput =>
    Boolean(subject),
  )
    ? parsed
    : null;
};

const parseParticipant = (
  value: unknown,
): OtwPlaySubmissionParticipantInput | null => {
  if (!isObject(value)) return null;
  const participantRole =
    value.participantRole === undefined
      ? "vocal"
      : OTW_PLAY_PARTICIPANT_ROLES.find(
          (role) => role === value.participantRole,
        );
  if (!participantRole) return null;
  if (
    value.kind === "member" &&
    hasExactKeys(value, ["kind", "memberUid", "participantRole"]) &&
    Number.isSafeInteger(value.memberUid) &&
    Number(value.memberUid) > 0
  ) {
    return {
      kind: "member",
      memberUid: Number(value.memberUid),
      participantRole,
    };
  }
  if (
    value.kind === "external" &&
    hasExactKeys(value, ["kind", "displayName", "participantRole"])
  ) {
    const displayName = text(value.displayName, 300);
    return displayName
      ? { kind: "external", displayName, participantRole }
      : null;
  }
  return null;
};

const parseParticipants = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) {
    return null;
  }
  const parsed = value.map(parseParticipant);
  return parsed.every(
    (participant): participant is OtwPlaySubmissionParticipantInput =>
      Boolean(participant),
  )
    ? parsed
    : null;
};

export const parseSubmissionPreflight = (
  value: unknown,
): MemberSubmissionInputResult<OtwPlaySubmissionPreflightRequest> => {
  if (!isObject(value) || !hasExactKeys(value, ["youtubeUrl", "title"])) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const youtubeUrl = text(value.youtubeUrl, 500);
  const title = optionalText(value.title, 300);
  if (!youtubeUrl || (value.title !== undefined && value.title !== null && !title)) {
    return { ok: false, fields: { body: "invalid_preflight" } };
  }
  return { ok: true, value: { youtubeUrl, ...(title ? { title } : {}) } };
};

export const parseCreateSubmission = (
  value: unknown,
): MemberSubmissionInputResult<OtwPlayCreateSubmissionRequest> => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "clientRequestId",
      "youtubeUrl",
      "title",
      "suggestedSongId",
      "originalArtists",
      "participants",
      "note",
    ])
  ) {
    return { ok: false, fields: { body: "invalid_shape" } };
  }
  const clientRequestId = text(value.clientRequestId, 36);
  const youtubeUrl = text(value.youtubeUrl, 500);
  const title = text(value.title, 300);
  const suggestedSongId = optionalText(value.suggestedSongId, 128);
  const note = optionalText(value.note, 1_000);
  const originalArtists = parseSubjects(value.originalArtists, 1, 20);
  const participants = parseParticipants(value.participants);
  if (
    !clientRequestId ||
    !UUID_V4_PATTERN.test(clientRequestId) ||
    !youtubeUrl ||
    !title ||
    !originalArtists ||
    !participants ||
    (value.suggestedSongId !== undefined &&
      value.suggestedSongId !== null &&
      !suggestedSongId) ||
    (value.note !== undefined && value.note !== null && value.note !== "" && !note)
  ) {
    return { ok: false, fields: { body: "invalid_submission" } };
  }
  return {
    ok: true,
    value: {
      clientRequestId: clientRequestId.toLowerCase(),
      youtubeUrl,
      title,
      suggestedSongId,
      originalArtists,
      participants,
      note,
    },
  };
};
