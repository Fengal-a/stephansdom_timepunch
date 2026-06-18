import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";

export default function App() {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    setReady(true);
  }, []);

  function handleLogin(userData) {
    setUser(userData);
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
  }

  if (!ready) return null;
  if (!user)  return <Login onLogin={handleLogin} />;
  if (user.is_admin) return <Admin user={user} onLogout={handleLogout} />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}