import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { type Notice } from "@/db/schema";
import { Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass: "bg-primary text-primary-foreground",
  },
  event: {
    label: "이벤트",
    badgeClass: "bg-secondary text-secondary-foreground",
  },
} as const;
type NoticeTypeKey = keyof typeof noticeTypeConfigs;

const resolveNoticeType = (value?: string): NoticeTypeKey => {
  if (value && value in noticeTypeConfigs) {
    return value as NoticeTypeKey;
  }
  return "notice";
};

type NoticeFormState = {
  id?: number;
  content: string;
  url: string;
  type: NoticeTypeKey;
  started_at: string;
  ended_at: string;
  is_active: "0" | "1";
};

const initialFormState: NoticeFormState = {
  content: "",
  url: "",
  type: "notice",
  started_at: "",
  ended_at: "",
  is_active: "1",
};

export function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [managerOpen, setManagerOpen] = useState(false);
  const [formState, setFormState] = useState<NoticeFormState>(initialFormState);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    try {
      const response = await fetch("/api/notices?includeInactive=1");
      if (!response.ok) {
        throw new Error("Failed to load notices");
      }
      const data = (await response.json()) as Notice[];
      setNotices(data);
    } catch (error) {
      console.error("Failed to load notices:", error);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const visibleNotices = useMemo(
    () => notices.filter((notice) => notice.is_active !== "0"),
    [notices]
  );

  useEffect(() => {
    setCurrentIndex((prev) =>
      visibleNotices.length ? Math.min(prev, visibleNotices.length - 1) : 0
    );
  }, [visibleNotices.length]);

  useEffect(() => {
    if (visibleNotices.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleNotices.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [visibleNotices.length]);

  const currentNotice = visibleNotices[currentIndex];

  const handleNoticeClick = () => {
    if (currentNotice?.url) {
      window.open(currentNotice.url, "_blank");
    }
  };

  const resetForm = () => {
    setFormMode("create");
    setFormState(initialFormState);
    setFormMessage(null);
  };

  const handleEdit = (notice: Notice) => {
    setFormMode("edit");
    setFormState({
      id: notice.id,
      content: notice.content ?? "",
      url: notice.url ?? "",
      type: resolveNoticeType(notice.type),
      started_at: notice.started_at ?? "",
      ended_at: notice.ended_at ?? "",
      is_active: notice.is_active === "0" ? "0" : "1",
    });
    setManagerOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.content.trim()) {
      setFormMessage("내용을 입력하세요.");
      return;
    }

    setIsSaving(true);
    setFormMessage(null);

    try {
      const payload = {
        content: formState.content.trim(),
        url: formState.url.trim() || undefined,
        type: formState.type,
        started_at: formState.started_at || undefined,
        ended_at: formState.ended_at || undefined,
        is_active: formState.is_active,
        ...(formMode === "edit" ? { id: formState.id } : {}),
      };

      const response = await fetch("/api/notices", {
        method: formMode === "edit" ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("네트워크 오류");
      }

      await loadNotices();
      resetForm();
      setFormMessage("저장되었습니다.");
    } catch (error) {
      console.error("Failed to save notice:", error);
      setFormMessage("저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (notice: Notice) => {
    if (!notice.id) return;
    if (!window.confirm("이 공지사항/이벤트를 삭제할까요?")) return;

    try {
      const response = await fetch(`/api/notices?id=${notice.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("삭제 실패");
      }

      await loadNotices();
      setFormMessage("삭제되었습니다.");
    } catch (error) {
      console.error("Failed to delete notice:", error);
      setFormMessage("삭제에 실패했습니다.");
    }
  };

  return (
    <div className="container mx-auto mb-4 px-4">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border shadow-sm backdrop-blur-md group/banner">
        <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="flex items-center py-2 px-3 sm:px-4">
          <div className="shrink-0 mr-3">
            <div className="p-1.5 bg-primary/10 rounded-lg group-hover/banner:bg-primary/20 transition-colors">
              <Megaphone className="w-4 h-4 text-primary" />
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden h-5 relative cursor-pointer"
            onClick={handleNoticeClick}
          >
            {visibleNotices.length === 0 ? (
              <div className="text-[13px] text-muted-foreground">
                등록된 공지사항 또는 이벤트가 없습니다.
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentNotice?.id ?? currentIndex}
                  initial={{ y: 15, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -15, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="absolute w-full truncate text-[13.5px] font-bold text-foreground hover:underline decoration-primary/30 underline-offset-4"
                >
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black mr-2 shadow-sm leading-none align-middle mb-0.5 ${
                      noticeTypeConfigs[resolveNoticeType(currentNotice?.type)]
                        .badgeClass
                    }`}
                  >
                    {
                      noticeTypeConfigs[resolveNoticeType(currentNotice?.type)]
                        .label
                    }
                  </span>
                  <span className="align-middle">{currentNotice?.content}</span>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {visibleNotices.length > 1 && (
          <div className="absolute bottom-0 left-0 h-0.5 bg-primary/5 w-full">
            <motion.div
              key={currentIndex}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 5, ease: "linear" }}
              className="h-full bg-primary/30"
            />
          </div>
        )}
      </div>

      <section className="mt-3 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm font-semibold text-foreground">
          <span>공지사항 / 이벤트 편집</span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setManagerOpen((prev) => !prev)}
          >
            {managerOpen ? "접기" : "관리 열기"}
          </button>
        </div>

        {managerOpen && (
          <div className="mt-4 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="텍스트를 입력하세요."
                value={formState.content}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    content: event.target.value,
                  }))
                }
                rows={3}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  placeholder="https://..."
                  value={formState.url}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      url: event.target.value,
                    }))
                  }
                />

                <select
                  className="rounded-xl border border-border bg-transparent px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={formState.type}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      type: event.target.value as NoticeTypeKey,
                    }))
                  }
                >
                  {Object.entries(noticeTypeConfigs).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-muted-foreground">
                  시작일
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                    value={formState.started_at}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        started_at: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="text-xs text-muted-foreground">
                  종료일
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-border bg-transparent px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                    value={formState.ended_at}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        ended_at: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="text-xs text-muted-foreground col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.is_active === "1"}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        is_active: event.target.checked ? "1" : "0",
                      }))
                    }
                  />
                  노출 여부
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "저장 중..." : "저장하기"}
                </button>
                {formMode === "edit" && (
                  <button
                    type="button"
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
                    onClick={resetForm}
                  >
                    취소
                  </button>
                )}
              </div>

              {formMessage && (
                <p className="text-xs text-muted-foreground">{formMessage}</p>
              )}
            </form>

            <div className="space-y-2">
              {notices.map((notice) => {
                const typeKey = resolveNoticeType(notice.type);
                const isActive = notice.is_active !== "0";
                return (
                  <div
                    key={notice.id}
                    className="flex flex-wrap items-start gap-3 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${noticeTypeConfigs[typeKey].badgeClass}`}
                        >
                          {noticeTypeConfigs[typeKey].label}
                        </span>
                        <span className="text-muted-foreground">
                          {isActive ? "노출" : "비노출"}
                        </span>
                      </div>

                      <p className="truncate text-sm text-foreground">
                        {notice.content}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {notice.url && (
                          <a
                            href={notice.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dashed decoration-secondary/60"
                          >
                            링크 열기
                          </a>
                        )}
                        {notice.started_at && (
                          <span>시작: {notice.started_at}</span>
                        )}
                        {notice.ended_at && (
                          <span>종료: {notice.ended_at}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-xl border border-border px-3 py-1 text-[11px] font-semibold"
                        onClick={() => handleEdit(notice)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-destructive px-3 py-1 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10"
                        onClick={() => handleDelete(notice)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
