import { useEffect, useRef, useState } from "react";
import { Input } from "@/shared/ui/input";

export function CatalogSearchInput({ value, onSearch }: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current) setDraft(value);
  }, [value]);

  return <Input
    aria-label="곡명·원곡 가수 검색"
    placeholder="곡명·원곡 가수 검색"
    className="min-w-0 flex-1 basis-48"
    value={draft}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={(event) => {
      composing.current = false;
      setDraft(event.currentTarget.value);
      onSearch(event.currentTarget.value);
    }}
    onChange={(event) => {
      setDraft(event.target.value);
      // URL navigation during IME composition can replace the unfinished syllable.
      if (!composing.current) onSearch(event.target.value);
    }}
  />;
}
