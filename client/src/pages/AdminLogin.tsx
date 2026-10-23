import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, extractError, setAuthToken } from "../utils/api";
import { Sparkle, TicketStub } from "../components/Decor";
import type { User } from "../types";

export default function AdminLogin({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { username, password });
      if (res.data.user?.role !== "admin") {
        setError("That account does not have admin access.");
        setAuthToken(null);
        await api.post("/auth/logout");
        return;
      }
      setAuthToken(res.data.authToken);
      onLogin(res.data.user);
      navigate("/admin");
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen stage-bg relative overflow-hidden flex items-center justify-center px-4 py-12">
      <div className="spotlight-cone opacity-40" />
      <Sparkle size={12} className="absolute top-[18%] left-[16%]" delay={0.3} />
      <Sparkle size={9} className="absolute top-[28%] right-[20%]" delay={1.1} />
      <Sparkle size={14} className="absolute bottom-[22%] left-[26%]" delay={1.9} />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <p className="label-caps text-antique-gold/80 tracking-[0.4em]">Backstage</p>
          <h1 className="font-serif text-4xl sm:text-5xl text-parchment mt-2">Crew Access</h1>
          <p className="text-parchment/55 mt-2 text-sm">Sign in to run the show.</p>
        </div>

        <TicketStub className="paper-grain">
          <form onSubmit={submit} className="space-y-4 p-2">
            {error && (
              <p className="text-sm text-oxblood bg-muted-rose/20 border border-muted-rose/40 rounded px-3 py-2">
                {error}
              </p>
            )}
            <div>
              <label className="label-caps text-charcoal-ink/60 block mb-1">Username</label>
              <input
                className="field"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-caps text-charcoal-ink/60 block mb-1">Password</label>
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button disabled={busy} className="btn-oxblood w-full py-3 font-semibold tracking-[0.12em] uppercase text-sm mt-2">
              {busy ? "Opening the door…" : "Enter Backstage"}
            </button>
          </form>
        </TicketStub>

        <p className="text-center mt-6 text-xs text-parchment/40">
          Judges sign in separately at <span className="text-antique-gold">/judge</span>.
        </p>
      </div>
    </div>
  );
}
