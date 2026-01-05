import { useCallback, useEffect, useMemo, useState } from "react";
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

  const handleNoticeClick = () => {
    if (currentNotice?.url) {
      window.open(currentNotice.url, "_blank");
    }
  };

  if (visibleNotices.length === 0) return null;

  return (
    <div className="container mx-auto">
      <div className="relative overflow-hidden rounded-xl bg-card border border-border shadow-sm backdrop-blur-md group/banner">
        <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-transparent pointer-events-none" />

        <div className="flex items-center py-2.5 px-3 sm:px-4">
          <div className="shrink-0 mr-3">
            <div className="p-1.5 bg-primary/10 rounded-lg group-hover/banner:bg-primary/20 transition-colors">
              <Megaphone className="w-4 h-4 text-primary" />
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden h-5 relative cursor-pointer"
            onClick={handleNoticeClick}
          >
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
    </div>
  );
}
