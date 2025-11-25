import { Button } from "./components/ui/button";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/clerk-react";

function App() {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen font-sans">
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
            <SignInButton />
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </header>
      <div className="flex-1"></div>
      <footer className="w-full p-2 border-t flex items-center justify-center">
        <p className="text-md font-sans">
          본 스케쥴표/사이트는 오버더월 공식 계정이 아닌 팬 운영 사이트임을
          알립니다
        </p>
      </footer>
    </div>
  );
}

export default App;
