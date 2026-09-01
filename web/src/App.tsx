import { Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { ImportWizard } from "./pages/ImportWizard";
import { JobDetail } from "./pages/JobDetail";
import { ProductReview } from "./pages/ProductReview";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 mx-auto w-full max-w-6xl px-3 sm:px-6 py-4 sm:py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<ImportWizard />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/jobs/:jobId/products/:productId" element={<ProductReview />} />
        </Routes>
      </main>
    </div>
  );
}
