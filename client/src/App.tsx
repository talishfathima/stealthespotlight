import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import HomePage from "./pages/HomePage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import JudgePage from "./pages/JudgePage";
import AudiencePage from "./pages/AudiencePage";
import ResultsPage from "./pages/ResultsPage";
import AudienceVotePage from "./pages/AudienceVotePage";
import { api, extractError, setAuthToken } from "./utils/api";
import { refreshSocketAuth } from "./hooks/useRealtime";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => {
        if (res.data.authToken) setAuthToken(res.data.authToken);
        setUser(res.data.user);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen stage-bg flex items-center justify-center">
        <p className="font-serif text-2xl text-antique-gold tracking-wide">Loading the stage…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/admin/login"
        element={user?.role === "admin" ? <Navigate to="/admin" replace /> : <AdminLogin onLogin={setUser} />}
      />
      <Route
        path="/admin"
        element={user?.role === "admin" ? <AdminDashboard /> : <Navigate to="/admin/login" replace />}
      />
      <Route
        path="/judge"
        element={user?.role === "judge" ? <JudgePage /> : <JudgeLogin onLogin={setUser} />}
      />
      <Route path="/audience" element={<AudiencePage />} />
      <Route path="/vote" element={<AudienceVotePage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function JudgeLogin({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("judge");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { username, password });
      if (res.data.user?.role !== "judge") {
        setError("This account is not a judge account.");
        setAuthToken(null);
        await api.post("/auth/logout");
        return;
      }
      setAuthToken(res.data.authToken);
      refreshSocketAuth();
      onLogin(res.data.user);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stage-bg flex items-center justify-center px-4">
      <form onSubmit={submit} className="gold-frame bg-dark-plum/80 p-8 w-full max-w-sm space-y-4">
        <h1 className="font-serif text-3xl text-center text-antique-gold">Judge Sign-In</h1>
        <p className="label-caps text-center text-parchment/50">Authorcraft · Steal the Spotlight</p>
        {error && <p className="text-sm text-muted-rose text-center">{error}</p>}
        <input className="field" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="field" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} className="btn-gold w-full py-2.5 font-semibold tracking-wide">
          {busy ? "Signing in…" : "Enter the Judges' Booth"}
        </button>
      </form>
    </div>
  );
}
