import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CurtainFrame } from "../components/Decor";
import { api, extractError } from "../utils/api";
import { getAudienceVoterId } from "../utils/audience";
import { useSocketState } from "../hooks/useRealtime";
import type { PublicState } from "../types";

export default function AudienceVotePage() {
  const { state, connected } = useSocketState<PublicState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [votedFor, setVotedFor] = useState<number | null>(null);

  const participantId = state?.activeParticipant?.id ?? null;
  const alreadyVoted = participantId !== null && votedFor === participantId;

  useEffect(() => {
    setVotedFor(null);
    setMessage("");
  }, [participantId]);

  const choices = useMemo(() => {
    if (!state) return [];
    return Array.from({ length: state.scoringMax - state.scoringMin + 1 }, (_, index) => state.scoringMin + index);
  }, [state]);

  const submitVote = async (score: number) => {
    if (!participantId) return;
    setBusy(true);
    setMessage("");
    try {
      await api.post("/audience/vote", { voterId: getAudienceVoterId(), score });
      setVotedFor(participantId);
      setMessage("Your vote was recorded.");
    } catch (error) {
      const text = extractError(error);
      if (/already voted/i.test(text)) setVotedFor(participantId);
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CurtainFrame>
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="gold-frame bg-dark-plum/85 p-6 sm:p-8 w-full max-w-2xl">
          <div className="text-center mb-6">
            <p className="label-caps text-antique-gold tracking-[0.35em] text-xs">Audience voting</p>
            <h1 className="font-serif text-4xl sm:text-5xl mt-2 text-parchment">Cast your vote</h1>
            <p className="text-parchment/45 text-xs mt-2">No login needed — one vote per performer on this device.</p>
          </div>

          {!state ? (
            <p className="text-parchment/70 text-center">Connecting to the stage…</p>
          ) : state.status !== "voting_open" ? (
            <div className="text-center space-y-4">
              <p className="font-serif text-3xl text-parchment/80">Voting is closed.</p>
              <p className="text-parchment/60">This round has ended. The next round will open automatically.</p>
              <Link to="/audience" className="btn-outline inline-block px-5 py-3 text-xs tracking-wider uppercase">
                Return to stage
              </Link>
            </div>
          ) : !state.activeParticipant ? (
            <div className="text-center space-y-4">
              <p className="font-serif text-3xl text-parchment/80">Waiting for the next performer…</p>
              {!connected && <p className="text-muted-rose/80 text-sm">Reconnecting…</p>}
            </div>
          ) : alreadyVoted ? (
            <div className="text-center space-y-4">
              <p className="label-caps text-parchment/60 tracking-[0.32em]">Now performing</p>
              <h2 className="font-serif text-4xl sm:text-5xl text-antique-gold">
                {state.activeParticipant.name}
              </h2>
              <div className="rounded-sm border border-[#9fd39f]/60 bg-[#9fd39f]/10 px-4 py-3 text-[#dff7df]">
                {message || "Your vote was recorded."}
              </div>
              <p className="text-parchment/55 text-sm">
                Thanks! Voting unlocks again when the next performer takes the stage.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <p className="label-caps text-parchment/60 tracking-[0.32em]">Now performing</p>
                <h2 className="font-serif text-4xl sm:text-5xl text-antique-gold mt-2">
                  {state.activeParticipant.name}
                </h2>
                {state.activeParticipant.performance_title && (
                  <p className="font-serif italic text-parchment/65 text-xl mt-2">
                    “{state.activeParticipant.performance_title}”
                  </p>
                )}
              </div>

              {message && (
                <div className="mb-5 rounded-sm border border-muted-rose/60 bg-muted-rose/10 px-4 py-3 text-center text-muted-rose">
                  {message}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {choices.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => submitVote(value)}
                    disabled={busy}
                    className="btn-gold py-4 text-xl font-semibold disabled:opacity-60"
                  >
                    {value}
                  </button>
                ))}
              </div>

              <p className="text-center text-parchment/50 text-xs mt-5 tracking-[0.18em] uppercase">
                Choose a score from {state.scoringMin} to {state.scoringMax}
              </p>
              {!connected && (
                <p className="text-center text-muted-rose/70 text-xs mt-2">Reconnecting to the stage…</p>
              )}
            </>
          )}
        </div>
      </div>
    </CurtainFrame>
  );
}
