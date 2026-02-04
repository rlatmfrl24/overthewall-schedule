import { Github, Mail } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="w-full border-t bg-muted/20 mt-auto py-1.5 sm:py-2">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-xs sm:text-sm text-muted-foreground">
          <span className="sm:hidden"></span>
          <span className="hidden sm:inline">
            본 스케쥴표/사이트는 오버더월 공식 계정이 아닌 팬 운영 사이트임을
            알립니다.
          </span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-0.5">
          <a

            href="https://github.com/rlatmfrl24/overthewall-schedule/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub 저장소"
          >
            <Github className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>GitHub</span>
          </a>
          <a
            href="mailto:397love@gmail.com"
            className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="문의 메일"
          >
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>문의하기</span>
          </a>
          <p className="text-[10px] sm:text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
