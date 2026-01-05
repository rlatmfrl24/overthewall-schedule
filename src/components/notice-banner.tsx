import { useCallback, useEffect, useMemo, useState } from "react";
import { type Notice } from "@/db/schema";
import { ArrowUpRight, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

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

export function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const loadNotices = useCallback(async () => {
    try {
      const response = await fetch("/api/notices");
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
  const hasLink = Boolean(currentNotice?.url);

  const handleNoticeClick = () => {
    if (!hasLink) return;
    window.open(currentNotice.url!, "_blank");
  };

  if (visibleNotices.length === 0) return null;

  return (
    <div className="container mx-auto">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border shadow-sm backdrop-blur-md group/banner">
        <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="flex items-center gap-2 py-2.5 px-3 sm:px-4">
          <div className="shrink-0">
            <div className="p-1.5 bg-primary/10 rounded-lg group-hover/banner:bg-primary/20 transition-colors">
              <Megaphone className="w-4 h-4 text-primary" />
            </div>
          </div>

          <Link
            to="/notice"
            title="전체 공지사항 보러가기"
            aria-label="전체 공지사항 보러가기"
            className="flex items-center justify-center w-8 h-8 rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <ArrowUpRight className="w-4 h-4" />
          </Link>

          <div
            className={cn(
              "flex-1 overflow-hidden h-5 relative",
              hasLink ? "cursor-pointer" : "cursor-default"
            )}
            onClick={handleNoticeClick}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentNotice?.id ?? currentIndex}
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={cn(
                  "absolute w-full truncate text-[13.5px] font-bold text-foreground",
                  hasLink &&
                    "hover:underline decoration-primary/30 underline-offset-4"
                )}
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
          </div>
        </div>
      </div>
    </div>
  );
}
