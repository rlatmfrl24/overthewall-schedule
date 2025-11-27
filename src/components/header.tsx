import {
  SignedOut,
  SignInButton,
  SignedIn,
  UserButton,
} from "@clerk/clerk-react";
import { Button } from "./ui/button";
import { ExternalLinkIcon, Menu, X } from "lucide-react";
import { useState } from "react";

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="w-full border-b bg-background">
      <div className="p-4 flex items-center justify-between relative">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo_otw.svg" width={90} height={25} alt="logo" />
          <h1
            aria-label="title"
            className="text-xl sm:text-2xl font-bold mt-2 whitespace-nowrap"
          >
            오버더월 스케쥴표
          </h1>
        </div>

        {/* Desktop Navigation */}
        <nav
          aria-label="menu"
          className="hidden md:flex items-center gap-2 absolute left-1/2 transform -translate-x-1/2"
        >
          <Button variant="ghost">오늘 스케쥴표</Button>
          <Button variant="ghost">주간 스케쥴표</Button>
          <Button
            variant="ghost"
            onClick={() => {
              window.open(
                "https://multiview-overthewall.vercel.app/",
                "_blank"
              );
            }}
          >
            오버더월 멀티뷰 <ExternalLinkIcon className="ml-2 h-4 w-4" />
          </Button>
        </nav>

        <div className="flex items-center gap-4">
          {/* Desktop Auth */}
          {/* Auth */}
          <div aria-label="auth">
            <SignedOut>
              <SignInButton
                children={<Button variant="ghost">로그인</Button>}
              />
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t p-4 flex flex-col gap-4 bg-background">
          <nav aria-label="mobile-menu" className="flex flex-col gap-2">
            <Button variant="ghost" className="justify-start">
              오늘 스케쥴표
            </Button>
            <Button variant="ghost" className="justify-start">
              주간 스케쥴표
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                window.open(
                  "https://multiview-overthewall.vercel.app/",
                  "_blank"
                );
              }}
            >
              오버더월 멀티뷰 <ExternalLinkIcon className="ml-2 h-4 w-4" />
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
};
