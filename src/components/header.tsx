import {
  SignedOut,
  SignInButton,
  SignedIn,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { ExternalLinkIcon, Menu, X } from "lucide-react";
import { useState } from "react";
import { ModeToggle } from "./mode-toggle";
import { isAdminUser } from "@/lib/admin";

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isLoaded, user } = useUser();
  const isAdmin = isLoaded && isAdminUser(user?.id);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <img src="/logo_otw.svg" width={90} height={25} alt="logo" />
          <h1
            aria-label="title"
            className="hidden sm:block text-xl font-bold tracking-tight mt-1"
          >
            오버더월 스케쥴표
          </h1>
        </div>

        {/* Desktop Navigation - Centered */}
        <nav
          aria-label="menu"
          className="hidden lg:flex items-center gap-1 absolute left-1/2 transform -translate-x-1/2"
        >
          <Link to="/" className="[&.active]:font-bold">
            <Button variant="ghost">오늘 스케쥴표</Button>
          </Link>
          <Link to="/weekly" className="[&.active]:font-bold">
            <Button variant="ghost">주간 스케쥴표</Button>
          </Link>
          <Link to="/vods" className="[&.active]:font-bold">
            <Button variant="ghost">다시보기 & 유튜브</Button>
          </Link>
          {isAdmin ? (
            <Link to="/admin" className="[&.active]:font-bold">
              <Button variant="ghost">관리자</Button>
            </Link>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              window.open(
                "https://multiview-overthewall.vercel.app/",
                "_blank"
              );
            }}
          >
            오버더월 멀티뷰 <ExternalLinkIcon className="h-4 w-4" />
          </Button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Auth */}
          <ModeToggle />
          <div aria-label="auth">
            <SignedOut>
              <SignInButton
                children={
                  <Button variant="outline" className="rounded-full">
                    로그인
                  </Button>
                }
              />
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-9 h-9",
                  },
                }}
              />
            </SignedIn>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
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

      {/* Mobile Menu - Overlay/Drawer style */}
      {isMenuOpen && (
        <div className="lg:hidden absolute top-16 left-0 w-full bg-background border-b border-border shadow-lg animate-in slide-in-from-top-2">
          <nav aria-label="mobile-menu" className="flex flex-col p-4 gap-2">
            <Link
              to="/"
              className="w-full"
              onClick={() => setIsMenuOpen(false)}
            >
              <Button
                variant="ghost"
                className="justify-start h-12 text-lg rounded-xl w-full"
              >
                오늘 스케쥴표
              </Button>
            </Link>
            <Link
              to="/weekly"
              className="w-full"
              onClick={() => setIsMenuOpen(false)}
            >
              <Button
                variant="ghost"
                className="justify-start h-12 text-lg rounded-xl w-full"
              >
                주간 스케쥴표
              </Button>
            </Link>
            {isAdmin ? (
              <Link
                to="/admin"
                className="w-full"
                onClick={() => setIsMenuOpen(false)}
              >
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-lg rounded-xl w-full"
                >
                  관리자
                </Button>
              </Link>
            ) : null}
            <Button
              variant="ghost"
              className="justify-start h-12 text-lg rounded-xl"
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
