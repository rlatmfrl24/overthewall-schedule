import { Github, Mail } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="w-full py-2 border-t bg-muted/20 mt-auto">
      <div className="container mx-auto px-4 flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">
          본 스케쥴표/사이트는 오버더월 공식 계정이 아닌 팬 운영 사이트임을
          알립니다.
        </p>
        <div className="flex items-center gap-4 mt-1">
          <a
            href="https://github.com/rlatmfrl24/overthewall-schedule/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="GitHub 저장소"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </a>
          <a
            href="mailto:397love@gmail.com"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="문의 메일"
          >
            <Mail className="h-4 w-4" />
            <span>문의하기</span>
          </a>
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
