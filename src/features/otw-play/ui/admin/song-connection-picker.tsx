import type { OtwPlayAdminCatalogDto } from "@contracts/otw-play";
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";

const normalizeSongSearch = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();

export function SongConnectionPicker({
  inputKey,
  catalog,
  selectedSongId,
  query,
  onQueryChange,
  onSelectExisting,
  onSelectNew,
}: {
  inputKey: string;
  catalog: OtwPlayAdminCatalogDto;
  selectedSongId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectExisting: (songId: string, title: string) => void;
  onSelectNew: (title: string) => void;
}) {
  const normalizedQuery = normalizeSongSearch(query);
  const activeSongs = catalog.songs.filter((song) => song.archivedAt === null);
  const matches = normalizedQuery
    ? activeSongs
        .filter((song) =>
          [
            song.title,
            ...(song.aliases ?? []).map((alias) => alias.alias),
            ...(song.originalArtists ?? []).map((artist) => artist.displayName),
          ].some((value) => normalizeSongSearch(value).includes(normalizedQuery)),
        )
        .sort((left, right) => left.title.localeCompare(right.title, "ko"))
        .slice(0, 12)
    : [];
  const exactSongExists =
    normalizedQuery !== "" &&
    activeSongs.some((song) =>
      [song.title, ...(song.aliases ?? []).map((alias) => alias.alias)].some(
        (value) => normalizeSongSearch(value) === normalizedQuery,
      ),
    );
  const selectedSong =
    selectedSongId === "__new"
      ? null
      : activeSongs.find((song) => song.id === selectedSongId) ?? null;
  const inputId = `song-search-${inputKey}`;
  const resultListId = `song-search-results-${inputKey}`;

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>기존 곡 검색</FieldLabel>
      <FieldDescription>
        곡명·별칭·원곡 가수로 검색해 연결하고, 정확히 일치하는 곡이 없으면 새 곡으로 입력합니다.
      </FieldDescription>
      <Input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={normalizedQuery !== ""}
        aria-controls={resultListId}
        value={query}
        placeholder="연결할 곡 검색"
        autoComplete="off"
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {selectedSong ? (
        <div
          className="rounded-md border bg-muted/20 p-3 text-sm"
          aria-label="현재 연결한 곡"
        >
          <span className="font-medium">{selectedSong.title}</span>
          <span className="text-muted-foreground">
            {(selectedSong.originalArtists ?? []).length > 0
              ? ` · ${(selectedSong.originalArtists ?? [])
                  .map((artist) => artist.displayName)
                  .join(", ")}`
              : " · 원곡 가수 미등록"}
          </span>
        </div>
      ) : null}
      {normalizedQuery ? (
        <div
          id={resultListId}
          role="listbox"
          aria-label="기존 곡 검색 결과"
          className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-background p-1"
        >
          {matches.map((song) => (
            <button
              key={song.id}
              type="button"
              role="option"
              aria-selected={selectedSongId === song.id}
              className="flex w-full items-start justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onSelectExisting(song.id, song.title)}
            >
              <span className="font-medium">{song.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(song.originalArtists ?? [])
                  .map((artist) => artist.displayName)
                  .join(", ") || "원곡 가수 미등록"}
              </span>
            </button>
          ))}
          {!exactSongExists ? (
            <button
              type="button"
              role="option"
              aria-selected={selectedSongId === "__new"}
              className="flex w-full items-center justify-between gap-3 rounded-sm border-t px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onSelectNew(query.trim())}
            >
              <span>새 곡 입력 · {query.trim()}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                검색 결과에 없는 곡
              </span>
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          검색어를 입력하면 연결 가능한 기존 곡을 표시합니다.
        </p>
      )}
    </Field>
  );
}
