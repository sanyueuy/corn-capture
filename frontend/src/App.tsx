import { Navigate, Route, Routes } from "react-router-dom";
import { AnnotatePage } from "./pages/AnnotatePage";
import { CapturePage } from "./pages/CapturePage";
import { ProjectsPage } from "./pages/ProjectsPage";


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/capture/:projectId" element={<CapturePage />} />
      <Route path="/annotate/:projectId" element={<AnnotatePage />} />
    </Routes>
  );
}
