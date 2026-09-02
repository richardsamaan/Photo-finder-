import { Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Assessment } from "./pages/Assessment";
import { MyVocabulary } from "./pages/MyVocabulary";
import { WordDetail } from "./pages/WordDetail";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/vocabulary" element={<MyVocabulary />} />
          <Route path="/vocabulary/:userVocabularyId" element={<WordDetail />} />
        </Routes>
      </main>
    </div>
  );
}
