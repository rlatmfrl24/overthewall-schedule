import { Link } from "@tanstack/react-router";
import { Github, Mail } from "lucide-react";
import { getSiteCopyrightNotice } from "@/shared/lib/site-rights";

const footerLinkClassName =
  "inline-flex h-5 items-center gap-1.5 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground sm:text-sm";

const footerIconClassName = "h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4";

export const Footer = () => {
  return (
    <footer className="mt-auto w-full shrink-0 border-t bg-muted/20 py-1 sm:py-1.5 lg:h-14 lg:py-0">
      <div className="container mx-auto flex h-full flex-col items-center justify-center gap-0.5 px-4 text-center">
        <p className="text-xs sm:text-sm text-muted-foreground">
          <span className="sm:hidden">팬 운영 사이트입니다.</span>
          <span className="hidden sm:inline">
            본 스케쥴표/사이트는 오버더월 공식 계정이 아닌 팬 운영 사이트임을
            알립니다.
          </span>
        </p>
        <div className="mt-0 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-x-4">
          <a
            href="https://github.com/rlatmfrl24/overthewall-schedule/issues"
            target="_blank"
            rel="noopener noreferrer"
            className={footerLinkClassName}
            aria-label="GitHub 저장소"
          >
            <Github className={footerIconClassName} />
            <span>GitHub</span>
          </a>
          <a
            href="mailto:397love@gmail.com"
            className={footerLinkClassName}
            aria-label="문의 메일"
          >
            <Mail className={footerIconClassName} />
            <span>문의하기</span>
          </a>
          <Link
            to="/rights"
            className="inline-flex h-5 items-center text-[10px] leading-none text-muted-foreground/60 transition-colors hover:text-foreground sm:text-xs"
            aria-label="저작권 및 권리 안내"
          >
            {getSiteCopyrightNotice()}
          </Link>
        </div>
      </div>
    </footer>
  );
};
