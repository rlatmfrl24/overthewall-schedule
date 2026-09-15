import {
  AI_REVIEW_FIELDS,
  type AiReviewResult,
  type AiReviewSuggestion,
  type AiReviewPerson,
  type AiReviewFields,
} from "@contracts/otw-play-ai-review";
import {
  OTW_PLAY_PARTICIPANT_ROLES,
  OTW_PLAY_PARTICIPATION_TYPES,
  type OtwPlayAdminCatalogDto,
} from "@contracts/otw-play";
import { parseBroadcastMetadata } from "./broadcast-metadata";
import { normalizeOtwPlaySongTags } from "@contracts/otw-play-tags";
import type { AiReviewMember } from "./ai-review-policy";
import { extractYouTubeVideoId } from "./youtube-video-id";
import { aiSongTitleKeys, aiSongTitlesMatch, aiVideoTimecodeSeconds, formatAiSongTitle } from "./ai-review-normalization";

const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= 30 && v.every(text);
const person = (v: unknown): v is AiReviewPerson =>
  record(v) &&
  text(v.name) &&
  v.name.length <= 120 &&
  ["person", "group"].includes(String(v.entityKind));
const norm = (s: string) =>
  s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");

export function parseAiReviewResult(
  raw: unknown,
  input: {
    range: { startSeconds: number; endSeconds: number } | null;
    video: {
      title: string;
      description?: string;
      durationSeconds: number | null;
      videoId?: string;
    };
  },
): AiReviewResult {
  if (
    !record(raw) ||
    typeof raw.videoAnalyzed !== "boolean" ||
    !Array.isArray(raw.songs) ||
    raw.songs.length > 100 ||
    !strings(raw.warnings)
  )
    throw new Error("Invalid analysis result");
  const result: AiReviewResult = {
    videoAnalyzed: raw.videoAnalyzed,
    warnings: raw.warnings,
    songs: [],
  };
  const start = input.range?.startSeconds ?? 0;
  const end = input.range?.endSeconds ?? input.video.durationSeconds;
  const inRange = (v: unknown): v is number =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= start &&
    end !== null &&
    v <= end;
  for (const item of raw.songs) {
    if (!record(item) || !record(item.values) || !record(item.evidence))
      throw new Error("Invalid suggestion");
    const suggestion: AiReviewSuggestion = {
      values: {},
      evidence: {},
      warnings: strings(item.warnings) ? item.warnings : [],
    };
    for (const key of AI_REVIEW_FIELDS) {
      const value = item.values[key];
      if (value == null) continue;
      if (key === "performanceTags" && Array.isArray(value) && value.length === 0) continue;
      const rawEvidence = Array.isArray(item.evidence[key]) ? [...item.evidence[key]] : [];
      // The model supplies audiovisual decisions together with their observation.
      if ((key === "segment" || key === "extent") && record(value) && text(value.observation)) {
        rawEvidence.push({ source: "video", text: value.observation, timecode: key === "segment" ? value.startTime : value.timecode });
      }
      const evidence = Array.isArray(rawEvidence)
        ? rawEvidence
            .map((e) => record(e) && "timecode" in e ? { ...e, seconds: aiVideoTimecodeSeconds(e.timecode) } : e)
            .filter(
              (e) =>
                record(e) &&
                text(e.text) &&
                (e.source === "video"
                  ? result.videoAnalyzed && inRange(e.seconds)
                  : e.source === "title"
                    ? input.video.title.includes(e.text)
                    : e.source === "description"
                      ? Boolean(input.video.description?.includes(e.text))
                      : e.source === "metadata"
                        ? JSON.stringify(input.video).includes(e.text)
                        : false),
            )
            .map((e) => ({
              source: e.source as
                | "title"
                | "description"
                | "metadata"
                | "video",
              text: String(e.text),
              seconds: e.source === "video" ? (e.seconds as number) : null,
            }))
        : [];
      let valid = evidence.length > 0;
      let cleaned: unknown = value;
      const sourceNames = (p: AiReviewPerson) => strings(p.sourceNames)
        ? [...new Set(p.sourceNames.map((name) => name.trim()).filter((name) =>
          name.length <= 120 && evidence.some((e) =>
            (e.source === "title" || e.source === "description") && e.text.includes(name),
          ),
        ))].slice(0, 5)
        : [];
      switch (key) {
        case "song":
          valid &&=
            record(value) &&
            text(value.title) &&
            Array.isArray(value.originalArtists) &&
            value.originalArtists.length > 0 &&
            value.originalArtists.length <= 30 &&
            value.originalArtists.every(person) &&
            strings(value.tags);
          if (valid) {
            const v = value as unknown as AiReviewFields["song"];
            const alternateTitles = strings(v.alternateTitles) ? [...new Set(v.alternateTitles.map((title) => title.trim()).filter((title) => evidence.some((e) => e.text.includes(title))))].slice(0, 5) : [];
            cleaned = {
              title: formatAiSongTitle(v.title, alternateTitles),
              alternateTitles,
              originalArtists: v.originalArtists.map((p) => ({
                name: p.name.trim(),
                sourceNames: sourceNames(p),
                entityKind: p.entityKind,
                subject: null,
              })),
              tags: normalizeOtwPlaySongTags(v.tags),
              existingSongId: null,
              candidates: [],
            };
          }
          break;
        case "participants":
          valid &&=
            Array.isArray(value) &&
            value.length > 0 &&
            value.length <= 30 &&
            value.every(
              (p) =>
                person(p) &&
                record(p) &&
                OTW_PLAY_PARTICIPANT_ROLES.includes(
                  p.role as AiReviewFields["participants"][number]["role"],
                ),
            );
          if (valid)
            cleaned = (value as AiReviewFields["participants"]).map((p) => ({
              name: p.name.trim(),
              sourceNames: sourceNames(p),
              entityKind: p.entityKind,
              subject: null,
              role: p.role,
            }));
          break;
        case "classification":
          valid &&=
            record(value) &&
            ["original", "cover", "singing_clip"].includes(
              String(value.relationType),
            ) &&
            ["official_mv", "official_video", "broadcast"].includes(
              String(value.releaseType),
            ) &&
            (value.relationType === "singing_clip") ===
              (value.releaseType === "broadcast");
          break;
        case "participationType":
          valid &&= OTW_PLAY_PARTICIPATION_TYPES.includes(
            value as AiReviewFields["participationType"],
          );
          break;
        case "performanceTags":
          valid &&= strings(value);
          break;
        case "segment":
          if (record(value) && ("startTime" in value || "endTime" in value)) {
            cleaned = { startSeconds: aiVideoTimecodeSeconds(value.startTime), endSeconds: aiVideoTimecodeSeconds(value.endTime) };
          }
          valid &&=
            result.videoAnalyzed &&
            record(cleaned) &&
            inRange(cleaned.startSeconds) &&
            inRange(cleaned.endSeconds) &&
            Number.isInteger(cleaned.startSeconds) &&
            Number.isInteger(cleaned.endSeconds) &&
            cleaned.endSeconds > cleaned.startSeconds &&
            evidence.some((e) => e.source === "video");
          break;
        case "broadcastDate":
          valid &&=
            record(value) &&
            Boolean(value.performedOn && value.dateEvidence) &&
            parseBroadcastMetadata({
              ...value,
              originalUrl: null,
              extent: null,
            }) !== null &&
            evidence.some(
              (e) => e.source === "title" || e.source === "description" || e.source === "video",
            );
          break;
        case "originalUrl":
          valid &&=
            text(value) &&
            parseBroadcastMetadata({
              performedOn: null,
              dateEvidence: null,
              originalUrl: value,
              extent: null,
            }) !== null &&
            // Only an explicitly evidenced source link, never an invented URL.
            evidence.some((e) => e.text.includes(String(value))) &&
            (extractYouTubeVideoId(String(value)) !== null ||
              /^https:\/\/chzzk\.naver\.com\/video\/\d+(?:[?#].*)?$/u.test(String(value))) &&
            (!input.video.videoId || extractYouTubeVideoId(String(value)) !== input.video.videoId);
          break;
        case "extent":
          if (record(value)) cleaned = value.value;
          valid &&=
            result.videoAnalyzed &&
            (cleaned === "full" || cleaned === "partial") &&
            evidence.some((e) => e.source === "video");
          break;
      }
      if (!valid) {
        const detail = key === "segment" && record(cleaned)
          ? ` (요청 ${start}~${end}초, 제안 ${JSON.stringify(cleaned.startSeconds)?.slice(0, 20)}~${JSON.stringify(cleaned.endSeconds)?.slice(0, 20)}초)`
          : key === "classification" && record(value)
            ? ` (${String(value.relationType).slice(0, 30)} / ${String(value.releaseType).slice(0, 30)})`
            : "";
        suggestion.warnings.push(
          `${key}: ${evidence.length === 0 ? "제공된 자료와 일치하는 근거가 없습니다" : "값의 형식·범위 또는 필수 근거를 확인할 수 없습니다"}${detail}. 자동 입력에서 제외했습니다.`,
        );
        continue;
      }
      Object.assign(suggestion.values, { [key]: cleaned });
      suggestion.evidence[key] = evidence;
    }
    result.songs.push(suggestion);
  }
  return result;
}

export function resolveAiReviewCatalog(
  result: AiReviewResult,
  catalog: OtwPlayAdminCatalogDto & {
    entityAliases?: Record<string, string[]>;
    members?: AiReviewMember[];
  },
): AiReviewResult {
  const resolved = structuredClone(result);
  const entities = catalog.entities.filter((e) => e.archivedAt === null);
  const members = catalog.members ?? [];
  const resolve = (p: AiReviewPerson): AiReviewPerson => {
    const names = new Set([p.name, ...(p.sourceNames ?? [])].map(norm));
    const matchedMembers = p.entityKind === "person" ? members.filter((m) =>
      [m.name, ...m.aliases].some((name) => names.has(norm(name))),
    ) : [];
    if (matchedMembers.length > 0) return {
      ...p,
      name: matchedMembers.length === 1 ? matchedMembers[0].name : p.name,
      subject: matchedMembers.length === 1 ? { kind: "member", memberUid: matchedMembers[0].uid } : null,
    };
    const matches = entities.filter((e) =>
      e.entityKind === p.entityKind && [e.displayName, ...(catalog.entityAliases?.[e.id] ?? [])].some(
        (name) => names.has(norm(name)),
      ),
    );
    return {
      ...p,
      subject:
        matches.length === 1
          ? { kind: "entity", entityId: matches[0].id }
          : matches.length > 1
            ? null
            : {
                kind: "new_external",
                clientKey: `ai:${norm(p.name)}`,
                displayName: p.name,
                entityKind: p.entityKind,
              },
    };
  };
  for (const s of resolved.songs) {
    if (s.values.participants)
      s.values.participants = s.values.participants.map((p) => ({
        ...resolve(p),
        role: p.role,
      })).filter((p, index, all) => all.findIndex((other) =>
        p.role === other.role && (p.subject && other.subject
          ? JSON.stringify(p.subject) === JSON.stringify(other.subject)
          : norm(p.name) === norm(other.name)),
      ) === index);
    const song = s.values.song;
    if (!song) continue;
    song.originalArtists = song.originalArtists.map(resolve);
    const titleKeys = new Set([song.title, ...(song.alternateTitles ?? [])].flatMap((title) => [...aiSongTitleKeys(title, song.originalArtists.map((p) => p.name))]));
    const matches = catalog.songs.filter(
      (c) =>
        c.archivedAt === null &&
        [c.title, ...(c.aliases ?? []).map((a) => a.alias)].some(
          (t) => aiSongTitlesMatch(titleKeys, aiSongTitleKeys(t, c.originalArtists.flatMap((a) => [a.displayName, ...(catalog.entityAliases?.[a.entityId] ?? [])]))),
        ),
    );
    const exact = matches.filter(
      (c) =>
        c.originalArtists.length === song.originalArtists.length &&
        song.originalArtists.every((p) =>
          c.originalArtists.some(
            (a) =>
              (p.subject?.kind === "entity" &&
                p.subject.entityId === a.entityId) ||
              (p.subject?.kind === "member" && entities.some((e) =>
                e.id === a.entityId && e.memberUid === (p.subject as { memberUid: number }).memberUid)) ||
              [p.name, ...(p.sourceNames ?? [])].some((name) => norm(a.displayName) === norm(name)),
          ),
        ),
    );
    song.existingSongId = exact.length === 1 ? exact[0].id : null;
    if (exact.length === 1) song.title = exact[0].title;
    song.tags = exact.length === 1 ? [...exact[0].tags] : normalizeOtwPlaySongTags(song.tags);
    song.candidates = matches.map((c) => ({
      id: c.id,
      title: `${c.title} · ${c.originalArtists.map((a) => a.displayName).join(", ")}`,
    }));
  }
  return resolved;
}
