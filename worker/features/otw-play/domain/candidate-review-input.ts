import type {OtwPlayIngestionReviewInput} from '@contracts/otw-play';
import {parseCreateCatalogEntry} from './admin-catalog-input';
type IngestionInputResult<T>={ok:true;value:T}|{ok:false;fields:Record<string,string>};
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hasExactKeys=(value:Record<string,unknown>,allowed:readonly string[])=>Object.keys(value).every(key=>allowed.includes(key));
export const parseCandidateReviewInput = (
  value: unknown,
): IngestionInputResult<OtwPlayIngestionReviewInput> => {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "song",
      "participants",
      "relationType",
      "releaseType",
      "participationType",
      "performanceTags",
      "startSeconds",
      "endSeconds",
      "internalNote",
      "broadcast",
    ])
  ) {
    return { ok: false, fields: { input: "invalid_shape" } };
  }
  const parsed = parseCreateCatalogEntry({
    expectedCatalogRevision: 0,
    youtubeUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
    startSeconds: value.startSeconds ?? 0,
    endSeconds: value.endSeconds ?? null,
    ...value,
    channel: { kind: "existing", channelId: "candidate-channel" },
    publicationTarget: "draft",
  });
  if (!parsed.ok) {
    return { ok: false, fields: { input: "invalid_review_input" } };
  }
  const {
    song,
    participants,
    relationType,
    releaseType,
    participationType,
    performanceTags,
    startSeconds,
    endSeconds,
    internalNote,
    broadcast,
  } = parsed.value;
  return {
    ok: true,
    value: {
      song,
      participants,
      relationType,
      releaseType,
      participationType,
      ...(performanceTags === undefined ? {} : { performanceTags }),
      ...(value.startSeconds !== undefined ? { startSeconds } : {}),
      ...(value.endSeconds !== undefined ? { endSeconds } : {}),
      internalNote,
      ...(broadcast === undefined ? {} : { broadcast }),
    },
  };
};

