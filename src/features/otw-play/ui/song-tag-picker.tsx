import { useId, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

const RECOMMENDED_SONG_TAGS = ["K-POP", "J-POP", "보컬로이드"] as const;
const SONG_TAG_WHITESPACE_PATTERN = /\s+/gu;
const SONG_TAG_PUNCTUATION_PATTERN = /\p{P}+/gu;

const songTagKey = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .replace(SONG_TAG_WHITESPACE_PATTERN, " ")
    .toLowerCase()
    .replace(SONG_TAG_PUNCTUATION_PATTERN, " ")
    .replace(SONG_TAG_WHITESPACE_PATTERN, " ")
    .trim();

export function SongTagPicker({
  tags,
  onChange,
  label = "장르(분류)",
  inputId,
  placeholder = "장르 또는 분류 입력",
  selectedLabel = "선택한 장르(분류)",
  description = "곡 자체의 장르·씬 분류입니다. 가창 형태와 별도로 최대 10개까지 입력할 수 있습니다.",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  inputId?: string;
  placeholder?: string;
  selectedLabel?: string;
  description?: string;
}) {
  const [value, setValue] = useState("");
  const generatedInputId = useId();
  const resolvedInputId = inputId ?? generatedInputId;
  const includesTag = (candidate: string) =>
    tags.some((item) => songTagKey(item) === songTagKey(candidate));
  const add = (raw: string) => {
    const tag = raw.normalize("NFKC").trim();
    const key = songTagKey(tag);
    if (!tag || !key || tags.length >= 10) return;
    if (includesTag(tag)) {
      setValue("");
      return;
    }
    onChange([...tags, tag]);
    setValue("");
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={resolvedInputId}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {RECOMMENDED_SONG_TAGS.map((tag) => (
          <Button
            key={tag}
            type="button"
            size="sm"
            variant={includesTag(tag) ? "secondary" : "outline"}
            disabled={includesTag(tag)}
            onClick={() => add(tag)}
          >
            {tag}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={resolvedInputId}
          value={value}
          maxLength={40}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add(value);
          }}
        />
        <Button type="button" variant="outline" onClick={() => add(value)}>
          추가
        </Button>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label={selectedLabel}>
          {tags.map((tag) => (
            <Badge key={tag} className="gap-1">
              {tag}
              <button
                type="button"
                aria-label={`${tag} 제거`}
                onClick={() => onChange(tags.filter((item) => item !== tag))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
