import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { Member } from "@/features/members";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { FieldError, FieldLabel } from "@/shared/ui/field";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { MAX_NOTICE_IMAGES, MAX_NOTICE_LINKS } from "@contracts/notices";
import { deleteNoticeThumbnail, uploadNoticeThumbnail } from "../../api/notices";
import {
  getNoticeImageUrls,
  getNoticeLinks,
  getNoticeRelatedMemberUids,
} from "../../model/notice-content";
import {
  isAcceptedNoticeThumbnailType,
  NOTICE_THUMBNAIL_ACCEPT,
  NOTICE_THUMBNAIL_MAX_BYTES,
  NOTICE_THUMBNAIL_MAX_LABEL,
} from "../../model/notice-thumbnails";
import type { Notice } from "../../model/types";

const noticeTypeConfigs = {
  notice: { label: "공지사항" },
  event: { label: "이벤트" },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

export interface NoticeFormValues {
  id?: number;
  content: string;
  links: Array<{ label: string; url: string }>;
  image_urls: string[];
  related_member_uids: number[];
  type: NoticeTypeKey;
  started_at: string;
  ended_at: string;
  is_active: boolean;
}

interface NoticeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: NoticeFormValues) => Promise<void>;
  initialValues?: Notice | null;
  members: Member[];
  isSaving?: boolean;
}

const emptyValues: NoticeFormValues = {
  content: "",
  links: [],
  image_urls: [],
  related_member_uids: [],
  type: "notice",
  started_at: "",
  ended_at: "",
  is_active: true,
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidImageResourceUrl = (value: string) =>
  value.trim().startsWith("/") || isValidHttpUrl(value);

const formatUploadSize = (value: number) => {
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
};

const getUploadFailureMessage = (file: File, error?: unknown) => {
  if (!isAcceptedNoticeThumbnailType(file.type)) {
    return `${file.name}: webp, png, jpg 이미지만 사용할 수 있습니다.`;
  }
  if (file.size > NOTICE_THUMBNAIL_MAX_BYTES) {
    return `${file.name}: ${NOTICE_THUMBNAIL_MAX_LABEL} 이하만 가능합니다 (${formatUploadSize(file.size)}).`;
  }
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;
  return status === 503
    ? `${file.name}: R2 버킷 설정을 확인해주세요.`
    : `${file.name}: 업로드에 실패했습니다.`;
};

export function NoticeFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  members,
  isSaving = false,
}: NoticeFormDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageUrlsRef = useRef(new Set<string>());
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NoticeFormValues>({ defaultValues: emptyValues });
  const { fields: linkFields, append, remove, move } = useFieldArray({
    control,
    name: "links",
  });
  const imageUrls = watch("image_urls");
  const relatedMemberUids = watch("related_member_uids");

  const cleanupPendingImages = (preservedUrls: string[] = []) => {
    const preserved = new Set(preservedUrls);
    for (const url of Array.from(pendingImageUrlsRef.current)) {
      if (preserved.has(url)) continue;
      pendingImageUrlsRef.current.delete(url);
      void deleteNoticeThumbnail(url).catch((error) => {
        console.warn("Failed to clean up unused notice image:", error);
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    pendingImageUrlsRef.current.clear();
    setImageUrlInput("");
    setMessage(null);
    if (!initialValues) {
      reset(emptyValues);
      return;
    }
    reset({
      id: initialValues.id,
      content: initialValues.content ?? "",
      links: getNoticeLinks(initialValues),
      image_urls: getNoticeImageUrls(initialValues),
      related_member_uids: getNoticeRelatedMemberUids(initialValues),
      type: initialValues.type === "event" ? "event" : "notice",
      started_at: initialValues.started_at ?? "",
      ended_at: initialValues.ended_at ?? "",
      is_active: initialValues.is_active !== false,
    });
  }, [initialValues, open, reset]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (isSaving || isUploading) return;
      cleanupPendingImages();
    }
    onOpenChange(nextOpen);
  };

  const setImages = (next: string[]) => {
    setValue("image_urls", next, { shouldDirty: true, shouldValidate: true });
  };

  const uploadFiles = async (files: File[]) => {
    if (getValues("image_urls").length >= MAX_NOTICE_IMAGES) {
      setMessage(`이미지는 최대 ${MAX_NOTICE_IMAGES}개까지 등록할 수 있습니다.`);
      return;
    }
    setIsUploading(true);
    setMessage(null);
    const failures: string[] = [];
    let uploaded = 0;
    let omitted = 0;
    for (const [index, file] of files.entries()) {
      if (getValues("image_urls").length >= MAX_NOTICE_IMAGES) {
        omitted = files.length - index;
        break;
      }
      if (
        !isAcceptedNoticeThumbnailType(file.type) ||
        file.size > NOTICE_THUMBNAIL_MAX_BYTES
      ) {
        failures.push(getUploadFailureMessage(file));
        continue;
      }
      try {
        const result = await uploadNoticeThumbnail(file);
        const url = result.thumbnail_url.trim();
        const current = getValues("image_urls");
        if (current.includes(url)) {
          void deleteNoticeThumbnail(url).catch(() => undefined);
          failures.push(`${file.name}: 중복 이미지입니다.`);
          continue;
        }
        pendingImageUrlsRef.current.add(url);
        setImages([...current, url]);
        uploaded += 1;
      } catch (error) {
        failures.push(getUploadFailureMessage(file, error));
      }
    }
    if (omitted > 0) failures.push(`${omitted}개 파일은 최대 개수를 초과했습니다.`);
    setMessage(
      failures.length > 0
        ? `${uploaded}개 업로드 완료 · ${failures.join(" ")}`
        : `${uploaded}개 이미지를 업로드했습니다.`,
    );
    setIsUploading(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) void uploadFiles(files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLFormElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;
    event.preventDefault();
    if (!isUploading && !isSaving) void uploadFiles(files);
  };

  const addImageUrl = () => {
    const url = imageUrlInput.trim();
    if (!isValidImageResourceUrl(url)) {
      setMessage("이미지는 http(s) URL 또는 / 로 시작하는 내부 경로여야 합니다.");
      return;
    }
    if (imageUrls.length >= MAX_NOTICE_IMAGES) {
      setMessage(`이미지는 최대 ${MAX_NOTICE_IMAGES}개까지 등록할 수 있습니다.`);
      return;
    }
    if (imageUrls.includes(url)) {
      setMessage("이미 등록된 이미지입니다.");
      return;
    }
    setImages([...imageUrls, url]);
    setImageUrlInput("");
    setMessage(null);
  };

  const removeImage = (index: number) => {
    const removed = imageUrls[index];
    setImages(imageUrls.filter((_, currentIndex) => currentIndex !== index));
    if (pendingImageUrlsRef.current.delete(removed)) {
      void deleteNoticeThumbnail(removed).catch(() => undefined);
    }
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= imageUrls.length) return;
    const next = [...imageUrls];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setImages(next);
  };

  const toggleMember = (uid: number, checked: boolean) => {
    setValue(
      "related_member_uids",
      checked
        ? [...relatedMemberUids, uid]
        : relatedMemberUids.filter((value) => value !== uid),
      { shouldDirty: true },
    );
  };

  const submit = async (values: NoticeFormValues) => {
    if (values.started_at && values.ended_at && values.started_at > values.ended_at) {
      setError("ended_at", {
        type: "validate",
        message: "종료일은 시작일과 같거나 이후여야 합니다.",
      });
      return;
    }
    const links = values.links.map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }));
    if (new Set(links.map((link) => link.url)).size !== links.length) {
      setMessage("같은 링크 URL을 중복 등록할 수 없습니다.");
      return;
    }
    clearErrors("ended_at");
    setMessage(null);
    const normalized = { ...values, links, image_urls: values.image_urls.map((url) => url.trim()) };
    await onSubmit(normalized);
    cleanupPendingImages(normalized.image_urls);
    for (const url of normalized.image_urls) pendingImageUrlsRef.current.delete(url);
  };

  const applyPeriodPreset = (days: number) => {
    const today = new Date();
    setValue("started_at", formatDateInput(today), { shouldDirty: true });
    setValue("ended_at", formatDateInput(addDays(today, Math.max(days - 1, 0))), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initialValues ? "공지사항 수정" : "새 공지사항 등록"}</DialogTitle>
          <DialogDescription>
            링크와 이미지는 표시할 순서대로 최대 10개까지 등록할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} onPaste={handlePaste} className="space-y-6 py-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="content">내용</FieldLabel>
            <Textarea
              id="content"
              className="min-h-[110px] resize-none"
              placeholder="공지 내용을 입력하세요"
              {...register("content", { required: "내용을 입력해주세요." })}
            />
            <FieldError errors={[errors.content]} />
          </div>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" />링크</h3>
                <p className="mt-1 text-xs text-muted-foreground">이름과 HTTP(S) URL을 함께 입력합니다.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={linkFields.length >= MAX_NOTICE_LINKS}
                onClick={() => append({ label: "", url: "" })}
              >
                <Plus className="h-4 w-4" /> 링크 추가
              </Button>
            </div>
            {linkFields.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">등록된 링크가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {linkFields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_auto]">
                    <div>
                      <Input
                        aria-label={`링크 ${index + 1} 이름`}
                        placeholder="링크 이름"
                        {...register(`links.${index}.label`, { required: "링크 이름이 필요합니다." })}
                      />
                      <FieldError errors={[errors.links?.[index]?.label]} />
                    </div>
                    <div>
                      <Input
                        aria-label={`링크 ${index + 1} URL`}
                        placeholder="https://..."
                        {...register(`links.${index}.url`, {
                          required: "링크 URL이 필요합니다.",
                          validate: (value) => isValidHttpUrl(value) || "HTTP(S) URL을 입력해주세요.",
                        })}
                      />
                      <FieldError errors={[errors.links?.[index]?.url]} />
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`링크 ${index + 1} 위로 이동`} disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronUp className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`링크 ${index + 1} 아래로 이동`} disabled={index === linkFields.length - 1} onClick={() => move(index, index + 1)}><ChevronDown className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`링크 ${index + 1} 삭제`} onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4" />이미지</h3>
                <p className="mt-1 text-xs text-muted-foreground">파일 다중 선택·붙여넣기 지원 · 파일당 {NOTICE_THUMBNAIL_MAX_LABEL}</p>
              </div>
              <input ref={fileInputRef} className="sr-only" type="file" accept={NOTICE_THUMBNAIL_ACCEPT} multiple aria-label="공지 이미지 파일" onChange={handleFileChange} />
              <Button type="button" variant="outline" size="sm" disabled={isUploading || imageUrls.length >= MAX_NOTICE_IMAGES} onClick={() => fileInputRef.current?.click()}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} 파일 선택
              </Button>
            </div>
            <div className="flex gap-2">
              <Input aria-label="이미지 URL" value={imageUrlInput} onChange={(event) => setImageUrlInput(event.target.value)} placeholder="https://... 또는 /assets/..." />
              <Button type="button" variant="secondary" onClick={addImageUrl} disabled={imageUrls.length >= MAX_NOTICE_IMAGES}>추가</Button>
            </div>
            {imageUrls.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">이미지가 없으면 OTW 플레이스홀더가 표시됩니다.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {imageUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="overflow-hidden rounded-md border bg-muted/20">
                    <div className="aspect-[16/9] bg-background"><img src={url} alt={`공지 이미지 ${index + 1}`} className="h-full w-full object-cover" /></div>
                    <div className="flex min-w-0 items-center gap-1 p-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <span className="min-w-0 flex-1 truncate text-xs" title={url}>{url}</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`이미지 ${index + 1} 위로 이동`} disabled={index === 0} onClick={() => moveImage(index, index - 1)}><ChevronUp className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`이미지 ${index + 1} 아래로 이동`} disabled={index === imageUrls.length - 1} onClick={() => moveImage(index, index + 1)}><ChevronDown className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`이미지 ${index + 1} 삭제`} onClick={() => removeImage(index)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-semibold">관련 멤버</h3>
              <p className="mt-1 text-xs text-muted-foreground">공동 게시자가 아닌 분류 태그입니다. 미선택 시 OTW 단독 공지입니다.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => {
                const checked = relatedMemberUids.includes(member.uid);
                return (
                  <label key={member.uid} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", checked && "border-primary bg-primary/5")}>
                    <Checkbox checked={checked} onCheckedChange={(value) => toggleMember(member.uid, value === true)} />
                    <span className="truncate">{member.oshi_mark ? `${member.oshi_mark} ` : ""}{member.name}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>유형</FieldLabel>
              <Select value={watch("type")} onValueChange={(value) => setValue("type", value as NoticeTypeKey, { shouldDirty: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(noticeTypeConfigs).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-3 self-end rounded-md border px-3 py-2.5 text-sm font-medium">
              <Checkbox checked={watch("is_active")} onCheckedChange={(value) => setValue("is_active", value === true, { shouldDirty: true })} /> 게시 활성화
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyPeriodPreset(7)}>7일</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPeriodPreset(30)}>30일</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setValue("started_at", ""); setValue("ended_at", ""); clearErrors("ended_at"); }}>상시 게시</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><FieldLabel htmlFor="started_at">시작일</FieldLabel><Input id="started_at" type="date" {...register("started_at")} /></div>
              <div><FieldLabel htmlFor="ended_at">종료일</FieldLabel><Input id="ended_at" type="date" {...register("ended_at")} /><FieldError errors={[errors.ended_at]} /></div>
            </div>
          </div>

          {message ? <div role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{message}</div> : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSaving || isUploading} onClick={() => handleDialogOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSaving || isUploading}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {initialValues ? "수정 저장" : "공지 등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
