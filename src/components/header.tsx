import {
  SignedOut,
  SignInButton,
  SignedIn,
  UserButton,
} from "@clerk/clerk-react";
import { Button } from "./ui/button";

export const Header = () => {
  return (
    <header className="w-full p-4 border-b flex items-center justify-between">
      <div className="flex items-center justify-center gap-2">
        <img src="/logo_otw.svg" width={90} height={25} alt="logo" />
        <h1 aria-label="title" className="text-2xl font-bold mt-2">
          오버더월 스케쥴표
        </h1>
        <nav aria-label="menu" className="flex items-center mt-2 ml-4">
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
            오버더월 멀티뷰
          </Button>
        </nav>
      </div>
      <div aria-label="" className="mr-4">
        <SignedOut>
          <SignInButton children={<Button variant="ghost">로그인</Button>} />
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
};
