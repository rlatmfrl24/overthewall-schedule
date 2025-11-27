import { DailySchedule } from "./components/daily-schedule";
import { Header } from "./components/header";

function App() {
  return (
    <div className="flex flex-col items-center h-screen w-full font-sans overflow-hidden">
      <Header />
      <DailySchedule />
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
