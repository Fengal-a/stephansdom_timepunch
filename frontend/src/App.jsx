import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

export default function App() {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);
  const [path, setPath]   = useState(window.location.pathname);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    setReady(true);

    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(to) {
    window.history.pushState({}, "", to);
    setPath(to);
  }

  function handleLogin(userData) {
    setUser(userData);
    navigate("/");
  }

  async function handleLogout() {
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/");
  }

  if (!ready) return null;
  if (path === "/forgot-password") return <ForgotPassword onBack={() => navigate("/")} />;
  if (path.startsWith("/reset-password")) return <ResetPassword onDone={() => navigate("/")} />;
  if (!user) return <Login onLogin={handleLogin} onForgot={() => navigate("/forgot-password")} />;
  if (user.is_admin) return <Admin user={user} onLogout={handleLogout} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
