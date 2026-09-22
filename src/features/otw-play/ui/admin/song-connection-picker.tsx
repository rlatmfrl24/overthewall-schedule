import { useState } from "react";
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
  onSelectNew?: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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
  const canCreate = Boolean(onSelectNew && normalizedQuery && !exactSongExists);
  const optionCount = matches.length + Number(canCreate);
  const expanded = open && normalizedQuery !== "";
  const selectOption = (index: number) => {
    const song = matches[index];
    if (song) {
      onSelectExisting(song.id, song.title);
      onQueryChange(song.title);
    } else if (canCreate && index === matches.length) {
      onSelectNew?.(query.trim());
    } else return;
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>기존 곡 검색</FieldLabel>
      <FieldDescription>
        {onSelectNew ? "곡명·별칭·원곡 가수로 검색해 연결하고, 정확히 일치하는 곡이 없으면 새 곡으로 입력합니다." : "곡명·별칭·원곡 가수로 검색해 기존 곡을 연결하세요."}
      </FieldDescription>
      <div className="relative" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
      <Input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? resultListId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${resultListId}-${activeIndex}` : undefined}
        value={query}
        placeholder="연결할 곡 검색"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onQueryChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); setActiveIndex(-1); }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && optionCount) {
            event.preventDefault();
            setOpen(true);
            const next = event.key === "ArrowDown" ? (activeIndex + 1) % optionCount : (activeIndex <= 0 ? optionCount - 1 : activeIndex - 1);
            setActiveIndex(next);
            document.getElementById(`${resultListId}-${next}`)?.scrollIntoView?.({ block: "nearest" });
          }
          if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (activeIndex >= 0) selectOption(activeIndex);
          }
        }}
      />
      {expanded ? (
        <div
          id={resultListId}
          role="listbox"
          aria-label="기존 곡 검색 결과"
          className="absolute top-full z-50 mt-1 max-h-64 w-full space-y-1 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((song, index) => (
            <button
              key={song.id}
              id={`${resultListId}-${index}`}
              type="button"
              tabIndex={-1}
              role="option"
              aria-selected={selectedSongId === song.id}
              className={`flex w-full items-start justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${activeIndex === index ? "bg-muted" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(index)}
            >
              <span className="font-medium">{song.title}</span>
              <span className="max-w-[45%] text-right text-xs text-muted-foreground">
                {(song.originalArtists ?? [])
                  .map((artist) => artist.displayName)
                  .join(", ") || "원곡 가수 미등록"}
              </span>
            </button>
          ))}
          {!onSelectNew && matches.length === 0 && <p className="p-2 text-sm text-muted-foreground">검색 결과가 없습니다. 다른 곡명·별칭·원곡 가수로 검색해 주세요.</p>}
          {canCreate ? (
            <button
              type="button"
              id={`${resultListId}-${matches.length}`}
              tabIndex={-1}
              role="option"
              aria-selected={selectedSongId === "__new"}
              className={`flex w-full items-center justify-between gap-3 rounded-sm border-t px-3 py-2 text-left text-sm font-medium hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${activeIndex === matches.length ? "bg-muted" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(matches.length)}
            >
              <span>새 곡 입력 · {query.trim()}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                검색 결과에 없는 곡
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
      </div>
      {selectedSong && onSelectNew ? <p className="text-sm text-muted-foreground" aria-label="현재 연결한 곡">{selectedSong.title} · {(selectedSong.originalArtists ?? []).map(artist => artist.displayName).join(", ") || "원곡 가수 미등록"}</p> : null}
    </Field>
  );
}
