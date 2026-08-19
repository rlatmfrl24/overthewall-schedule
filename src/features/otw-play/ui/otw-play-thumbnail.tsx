import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { OtwPlayPublicSourceDto } from "@contracts/otw-play";
import { cn } from "@/shared/lib/utils";

type ThumbnailSource = Pick<
  OtwPlayPublicSourceDto,
  "provider" | "externalId" | "thumbnailUrl"
>;

const getOtwPlayThumbnailCandidates = (
  source: ThumbnailSource | null | undefined,
) => {
  if (!source) return [];
  const candidates =
    source.provider === "youtube"
      ? [
          `https://i.ytimg.com/vi/${encodeURIComponent(source.externalId)}/maxresdefault.jpg`,
          source.thumbnailUrl,
        ]
      : [source.thumbnailUrl];
  return candidates.filter(
    (candidate, index): candidate is string =>
      Boolean(candidate) && candidates.indexOf(candidate) === index,
  );
};

export function OtwPlayThumbnail({
  source,
  alt = "",
  className,
  loading = "lazy",
  width,
  height,
  fallback,
}: {
  source: ThumbnailSource | null | undefined;
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  width: number;
  height: number;
  fallback?: ReactNode;
}) {
  const candidates = useMemo(
    () => getOtwPlayThumbnailCandidates(source),
    [source],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const src = candidates[candidateIndex];
  if (!src) return fallback ?? null;

  const advanceCandidate = () => {
    setCandidateIndex((current) =>
      Math.min(current + 1, candidates.length),
    );
  };

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      className={cn("object-cover", className)}
      onError={advanceCandidate}
      onLoad={(event) => {
        if (
          candidateIndex === 0 &&
          candidates.length > 1 &&
          (event.currentTarget.naturalWidth < 640 ||
            event.currentTarget.naturalHeight < 360)
        ) {
          advanceCandidate();
        }
      }}
    />
  );
}
