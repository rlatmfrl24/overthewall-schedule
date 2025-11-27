import { DailySchedule } from "./components/daily-schedule";
import { Header } from "./components/header";

function App() {
  return (
    <div className="flex flex-col items-center h-screen w-full font-sans overflow-hidden">
      <Header />
      <DailySchedule />
      <footer className="w-full py-2 border-t bg-muted/20 mt-auto">
        <div className="container mx-auto px-4 flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm text-muted-foreground">
            본 스케쥴표/사이트는 오버더월 공식 계정이 아닌 팬 운영 사이트임을
            알립니다.
          </p>
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
