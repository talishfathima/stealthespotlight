import { useEffect, useState } from "react";
import { api, extractError, setAuthToken } from "../utils/api";
import { refreshSocketAuth, useSocketState } from "../hooks/useRealtime";
import { Sparkle } from "../components/Decor";
import { StatusPill } from "../components/StatusPill";
import type { JudgeState, User } from "../types";

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 10;

export default function JudgePage() {
  const { state, connected } = useSocketState<JudgeState>();
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const SCORING_MIN = state?.scoringMin ?? DEFAULT_MIN;
  const SCORING_MAX = state?.scoringMax ?? DEFAULT_MAX;

  useEffect(() => {
    api
      .get("/auth/me")
      .then((res) => {
        if (res.data.authToken) setAuthToken(res.data.authToken);
        setUser(res.data.user);
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (state?.mySubmission?.score != null) setSelected(state.mySubmission.score);
  }, [state?.activeParticipant?.id, state?.mySubmission?.score]);

  const votingOpen = state?.status === "voting_open";
  const activeId = state?.activeParticipant?.id ?? null;
  const alreadySubmitted = state?.mySubmission?.score != null && !state?.mySubmission?.isMissing;

  const submit = async () => {
    if (activeId === null) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api.post("/scores", { participantId: activeId, score: selected });
      setFeedback({ kind: "ok", text: `Score of ${selected} submitted for ${state?.activeParticipant?.name}.` });
    } catch (err) {
      setFeedback({ kind: "err", text: extractError(err) });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setAuthToken(null);
    refreshSocketAuth();
    await api.post("/auth/logout");
    setUser(null);
    window.location.reload();
  };

  if (!user || user.role !== "judge") {
    return (
      <div className="min-h-screen stage-bg flex items-center justify-center px-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              const res = await api.post("/auth/login", {
                username: form.get("username"),
                password: form.get("password"),
              });
              if (res.data.user?.role !== "judge") {
                setFeedback({ kind: "err", text: "That account is not a judge account." });
                setAuthToken(null);
                await api.post("/auth/logout");
                return;
              }
              setAuthToken(res.data.authToken);
              refreshSocketAuth();
              setUser(res.data.user);
            } catch (err) {
              setFeedback({ kind: "err", text: extractError(err) });
            }
          }}
          className="gold-frame bg-dark-plum/85 p-8 w-full max-w-sm space-y-4"
        >
          <h1 className="font-serif text-3xl text-center text-antique-gold">Judge's Booth</h1>
          <p className="label-caps text-center text-parchment/50">Authorcraft · Steal the Spotlight</p>
          {feedback?.kind === "err" && <p className="text-sm text-muted-rose text-center">{feedback.text}</p>}
          <input name="username" className="field" placeholder="Username" defaultValue="judge" />
          <input name="password" className="field" type="password" placeholder="Password" />
          <button className="btn-gold w-full py-2.5 font-semibold tracking-wide">Sign In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen stage-bg relative overflow-hidden flex flex-col">
      <div className="spotlight-cone opacity-40" />
      <Sparkle size={11} className="absolute top-[12%] left-[12%]" delay={0.4} />
      <Sparkle size={9} className="absolute top-[20%] right-[14%]" delay={1.3} />

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-5">
        <div>
          <p className="label-caps text-antique-gold/80 tracking-[0.35em]">Judge's Booth</p>
          <p className="text-xs text-parchment/45 mt-0.5">Signed in as {user.display_name}</p>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="status-pill status-open">
              <span className="dot" /> Live
            </span>
          ) : (
            <span className="status-pill status-closed">
              <span className="dot" /> Offline
            </span>
          )}
          <button onClick={logout} className="btn-outline px-3 py-1.5 text-xs tracking-wider uppercase">
            Sign out
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          {!state?.activeParticipant ? (
            <div className="gold-frame bg-dark-plum/70 p-10 text-center">
              <p className="font-serif text-3xl sm:text-4xl text-parchment/85 italic">The stage is waiting.</p>
              <p className="text-parchment/50 mt-3 text-sm">
                The current performer will appear here the moment the admin selects them.
              </p>
            </div>
          ) : (
            <div className="gold-frame bg-dark-plum/75 p-6 sm:p-9 text-center">
              <div className="flex items-center justify-center gap-3">
                <StatusPill status={state.status} />
                {votingOpen && (
                  <span className="label-caps text-[#9fd39f] tracking-[0.25em]">
                    Vote now
                  </span>
                )}
              </div>

              <p className="label-caps text-antique-gold/85 tracking-[0.4em] mt-6">
                Participant No. {String(state.activeParticipant.number).padStart(2, "0")}
              </p>
              <h2 className="font-serif text-4xl sm:text-5xl text-parchment mt-2 leading-tight">
                {state.activeParticipant.name}
              </h2>
              {state.activeParticipant.performance_title && (
                <p className="font-serif italic text-parchment/65 text-lg mt-2">
                  “{state.activeParticipant.performance_title}”
                </p>
              )}

              <div className="gold-rule my-7" />

              {alreadySubmitted ? (
                <div className="py-4">
                  <p className="label-caps text-[#9fd39f] tracking-[0.3em]">Score Locked</p>
                  <p className="font-serif text-7xl text-antique-gold mt-3 countdown-digits">
                    {state.mySubmission?.score}
                  </p>
                  <p className="text-parchment/55 text-sm mt-3">
                    Your score is in. It cannot be changed without admin approval.
                  </p>
                  {state.mySubmission?.isCorrected && (
                    <p className="label-caps text-muted-rose mt-2">Corrected by admin</p>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  <label className="label-caps text-parchment/55 block mb-4">
                    Your Score ({SCORING_MIN}–{SCORING_MAX})
                  </label>

                  <div className="flex items-center justify-center gap-3 mb-6">
                    <button
                      type="button"
                      onClick={() => setSelected((s) => Math.max(SCORING_MIN, s - 1))}
                      disabled={!votingOpen}
                      className="btn-outline w-12 h-12 text-2xl leading-none"
                      aria-label="Decrease score"
                    >
                      −
                    </button>
                    <div
                      className={`font-serif countdown-digits text-8xl w-28 ${
                        votingOpen ? "text-antique-gold" : "text-parchment/30"
                      }`}
                    >
                      {selected}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected((s) => Math.min(SCORING_MAX, s + 1))}
                      disabled={!votingOpen}
                      className="btn-outline w-12 h-12 text-2xl leading-none"
                      aria-label="Increase score"
                    >
                      +
                    </button>
                  </div>

                  <div className="flex justify-center gap-1.5 flex-wrap mb-7">
                    {Array.from({ length: SCORING_MAX - SCORING_MIN + 1 }, (_, i) => SCORING_MIN + i).map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={!votingOpen}
                        onClick={() => setSelected(n)}
                        className={`w-9 h-9 rounded text-sm font-semibold transition-colors ${
                          selected === n
                            ? "bg-antique-gold text-charcoal-ink"
                            : "bg-parchment/10 text-parchment/70 hover:bg-parchment/20"
                        } ${!votingOpen ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={submit}
                    disabled={!votingOpen || busy || activeId === null}
                    className={`w-full py-4 font-semibold tracking-[0.14em] uppercase text-base ${
                      votingOpen ? "btn-gold" : "btn-oxblood"
                    }`}
                  >
                    {busy ? "Submitting…" : votingOpen ? "Submit Score" : "Voting Is Closed"}
                  </button>

                  {!votingOpen && (
                    <p className="text-parchment/50 text-sm mt-4">
                      {state.mySubmission?.isMissing
                        ? "Your score was not submitted before voting closed and has been marked missing."
                        : "Wait for the admin to open voting for this performer."}
                    </p>
                  )}
                </div>
              )}

              {feedback && (
                <p
                  className={`text-sm mt-5 px-3 py-2 rounded border ${
                    feedback.kind === "ok"
                      ? "text-[#9fd39f] border-[#9fd39f]/40 bg-[#9fd39f]/10"
                      : "text-muted-rose border-muted-rose/40 bg-muted-rose/10"
                  }`}
                >
                  {feedback.text}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
