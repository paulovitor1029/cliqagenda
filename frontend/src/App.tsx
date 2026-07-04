import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { AdminPage } from "./pages/AdminPage";
import { ClientLanding, PublicBusinessPage } from "./pages/PublicPage";
import { SystemAdminPage } from "./pages/SystemAdminPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ClientLanding />} />
      <Route path="/p/:businessSlug" element={<PublicBusinessPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<RegisterPage />} />
      <Route path="/admin/*" element={<AdminPage />} />
      <Route path="/sistema" element={<SystemAdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
