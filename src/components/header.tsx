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
import { useXPostsConfig } from "@/hooks/use-x-posts-config";
import { useNaverCafePostsConfig } from "@/hooks/use-naver-cafe-posts-config";

export const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { visibility: xPostsVisibility } = useXPostsConfig();
  const { enabled: cafePostsEnabled, visibility: cafePostsVisibility } =
    useNaverCafePostsConfig();
  const isAdmin = isLoaded && isAdminUser(user?.id);
  const showXPostsLink =
    xPostsVisibility === "public" ||
    (xPostsVisibility === "members" && isSignedIn);
  const showCafePostsLink =
    cafePostsEnabled &&
    (cafePostsVisibility === "public" ||
      (cafePostsVisibility === "members" && isSignedIn));
  const showMemberPostsLink = showXPostsLink || showCafePostsLink;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-border">
      <div className="container mx-auto grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* Logo & Title */}
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setIsMenuOpen(false)}
        >
          <img
            src="/logo_otw.svg"
            width={90}
            height={25}
            alt="오버더월"
            className="h-auto w-[82px] shrink-0 sm:w-[90px]"
          />
          <h1
            aria-label="title"
            className="hidden min-w-0 truncate whitespace-nowrap text-lg font-bold tracking-tight sm:block lg:text-xl"
          >
            오버더월 스케쥴표
          </h1>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="menu"
          className="hidden min-w-0 items-center justify-center gap-0.5 justify-self-center md:flex"
        >
          <Link to="/" className="[&.active]:font-bold">
            <Button
              variant="ghost"
              className="h-9 px-2.5 text-sm whitespace-nowrap lg:px-3"
            >
              오늘 스케쥴표
            </Button>
          </Link>
          <Link to="/weekly" className="[&.active]:font-bold">
            <Button
              variant="ghost"
              className="h-9 px-2.5 text-sm whitespace-nowrap lg:px-3"
            >
              주간 스케쥴표
            </Button>
          </Link>
          <Link to="/vods" className="[&.active]:font-bold">
            <Button
              variant="ghost"
              className="h-9 px-2.5 text-sm whitespace-nowrap lg:px-3"
            >
              VOD & 클립
            </Button>
          </Link>
          {showMemberPostsLink ? (
            <Link to="/feed" className="hidden [&.active]:font-bold 2xl:block">
              <Button
                variant="ghost"
                className="h-9 px-3 text-sm whitespace-nowrap"
              >
                멤버 게시글
              </Button>
            </Link>
          ) : null}
          {isAdmin ? (
            <Link to="/admin" className="hidden [&.active]:font-bold 2xl:block">
              <Button
                variant="ghost"
                className="h-9 px-3 text-sm whitespace-nowrap"
              >
                관리자
              </Button>
            </Link>
          ) : null}
          <Button
            variant="ghost"
            className="hidden h-9 px-3 text-sm whitespace-nowrap 2xl:inline-flex"
            onClick={() => {
              window.open("https://cafe.naver.com/otwoffical", "_blank");
            }}
          >
            공식 팬카페 <ExternalLinkIcon className="h-4 w-4 shrink-0" />
          </Button>

          <Button
            variant="ghost"
            className="hidden h-9 px-3 text-sm whitespace-nowrap 2xl:inline-flex"
            onClick={() => {
              window.open(
                "https://multiview-overthewall.vercel.app/",
                "_blank",
              );
            }}
          >
            오버더월 멀티뷰 <ExternalLinkIcon className="h-4 w-4 shrink-0" />
          </Button>
        </nav>

        {/* Right Actions */}
        <div className="flex min-w-0 items-center justify-self-end gap-1.5 sm:gap-2 md:col-start-3">
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
          <div className="2xl:hidden">
            <Button
              variant="ghost"
              className="h-9 rounded-full px-2.5 xl:px-3"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            >
              {isMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
              <span className="hidden text-sm font-semibold lg:inline">
                더보기
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Menu - Overlay/Drawer style */}
      {isMenuOpen && (
        <div className="absolute top-full left-0 w-full border-b border-border bg-background shadow-lg animate-in slide-in-from-top-2 md:left-auto md:right-4 md:top-[calc(100%+0.5rem)] md:w-80 md:overflow-hidden md:rounded-xl md:border 2xl:hidden">
          <nav
            aria-label="mobile-menu"
            className="flex flex-col items-stretch p-4 gap-2"
          >
            <Link
              to="/"
              className="w-full md:hidden"
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
              className="w-full md:hidden"
              onClick={() => setIsMenuOpen(false)}
            >
              <Button
                variant="ghost"
                className="justify-start h-12 text-lg rounded-xl w-full"
              >
                주간 스케쥴표
              </Button>
            </Link>
            <Link
              to="/vods"
              className="w-full md:hidden"
              onClick={() => setIsMenuOpen(false)}
            >
              <Button
                variant="ghost"
                className="justify-start h-12 text-lg rounded-xl w-full"
              >
                VOD & 클립
              </Button>
            </Link>
            {showMemberPostsLink ? (
              <Link
                to="/feed"
                className="w-full"
                onClick={() => setIsMenuOpen(false)}
              >
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-lg rounded-xl w-full"
                >
                  멤버 게시글
                </Button>
              </Link>
            ) : null}
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
              className="justify-start h-12 text-lg rounded-xl w-full"
              onClick={() => {
                setIsMenuOpen(false);
                window.open("https://cafe.naver.com/otwoffical", "_blank");
              }}
            >
              공식 팬카페 <ExternalLinkIcon className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="justify-start h-12 text-lg rounded-xl w-full"
              onClick={() => {
                setIsMenuOpen(false);
                window.open(
                  "https://multiview-overthewall.vercel.app/",
                  "_blank",
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
