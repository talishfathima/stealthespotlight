import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSocketState } from "../hooks/useRealtime";
import { CurtainFrame, ScatterStars, Sparkle } from "../components/Decor";
import { StatusPill } from "../components/StatusPill";
import type { PublicState } from "../types";

export default function AudiencePage() {
  const { state, connected } = useSocketState<PublicState>();

  const participantId = state?.activeParticipant?.id ?? null;
  const prevParticipantId = useRef<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (participantId !== null && prevParticipantId.current !== null && prevParticipantId.current !== participantId) {
      setTransitioning(true);
      const timer = window.setTimeout(() => setTransitioning(false), 950);
      return () => window.clearTimeout(timer);
    }
    prevParticipantId.current = participantId;
  }, [participantId]);

  useEffect(() => {
    prevParticipantId.current = participantId;
  }, [participantId]);

  const suspenseLine = useMemo(() => {
    if (!state) return "The stage is waiting.";
    if (state.status === "voting_open") return "The spotlight is yours.";
    if (state.status === "voting_closed") return "Hush… the scores are being kept.";
    if (state.status === "completed") return "The curtain falls.";
    return "The stage is waiting.";
  }, [state]);

  const voteUrl = state?.audienceVoteUrl ?? null;
  const qrImageUrl = voteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(voteUrl)}`
    : null;

  return (
    <CurtainFrame>
      <div className="relative min-h-screen flex flex-col">
        <ScatterStars count={10} />
        <div
          className={`spotlight-cone spotlight-breathe transition-opacity duration-700 ${
            state?.status === "voting_open" ? "opacity-90" : "opacity-45"
          }`}
        />
        <div className="spotlight-pool" />

        {/* Header */}
        <header className="relative z-10 text-center pt-[3.5vh] px-8">
          <p className="label-caps text-antique-gold/85 tracking-[0.5em] text-sm sm:text-base">{state?.club ?? "Authorcraft"}</p>
          <h1 className="font-serif text-4xl sm:text-6xl text-parchment tracking-tight mt-1">
            STEAL THE <span className="text-antique-gold">SPOTLIGHT</span>
          </h1>
          <div className="gold-rule w-1/3 mx-auto mt-4" />
        </header>

        {/* Stage */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-8">
          {!state || (!state.activeParticipant && state.status !== "completed") ? (
            <div className="text-center">
              <p className="font-serif text-4xl sm:text-6xl text-parchment/85 italic">{suspenseLine}</p>
              <div className="flex justify-center gap-3 mt-8">
                <Sparkle size={14} />
                <Sparkle size={10} delay={0.6} />
                <Sparkle size={16} delay={1.2} />
              </div>
              {!connected && <p className="label-caps text-muted-rose/70 mt-10">Reconnecting to the stage…</p>}
            </div>
          ) : state.activeParticipant ? (
            <div
              key={state.activeParticipant.id}
              className={`text-center max-w-4xl w-full ${transitioning ? "" : "rise-in"}`}
            >
              <p className="label-caps text-antique-gold tracking-[0.45em] text-base sm:text-lg">
                Participant No. {String(state.activeParticipant.number).padStart(2, "0")}
              </p>

              <h2 className="font-serif text-parchment leading-[1.02] mt-3 text-6xl sm:text-7xl md:text-8xl">
                {state.activeParticipant.name}
              </h2>

              {state.activeParticipant.performance_title && (
                <p className="font-serif italic text-parchment/75 text-2xl sm:text-3xl mt-5">
                  “{state.activeParticipant.performance_title}”
                </p>
              )}

              <div className="mt-10 flex flex-col items-center gap-6">
                <StatusPill status={state.status} className="text-base px-5 py-1.5" />

                {state.status === "voting_open" ? (
                  <div className="relative">
                    <p className="countdown-digits font-serif text-5xl sm:text-6xl leading-none text-antique-gold drop-shadow-[0_0_28px_rgba(198,161,91,0.45)]">
                      Voting is open
                    </p>
                    <p className="label-caps text-parchment/55 tracking-[0.35em] mt-3">
                      Cast your vote — the crew closes the round
                    </p>
                  </div>
                ) : (
                  <p className="font-serif italic text-parchment/70 text-xl sm:text-2xl">{suspenseLine}</p>
                )}
              </div>
            </div>
          ) : null}
        </main>

        {/* Footer */}
        <footer className="relative z-10 text-center pb-[3vh] px-8">
          <div className="gold-rule w-1/4 mx-auto mb-3" />
          <p className="label-caps text-parchment/40 tracking-[0.3em] text-xs">
            {state?.resultsPublished ? (
              <Link to="/results" className="hover:text-antique-gold transition-colors">
                Final results are in → view them here
              </Link>
            ) : (
              "Results will be revealed at the end of the show"
            )}
          </p>
          {!connected && <p className="label-caps text-muted-rose/80 mt-2">Connection lost — reconnecting…</p>}
        </footer>

        {state?.status === "voting_open" && voteUrl && (
          <div className="absolute bottom-24 right-8 z-20 max-w-[240px] bg-dark-plum/80 border border-antique-gold/35 p-4 text-center shadow-[0_0_28px_rgba(198,161,91,0.18)] backdrop-blur-sm">
            <p className="label-caps text-antique-gold tracking-[0.24em] text-[10px]">Scan or type to vote</p>
            {qrImageUrl && (
              <img
                src={qrImageUrl}
                alt="Audience vote QR code"
                className="w-32 h-32 bg-white p-2 rounded-sm mx-auto mt-3"
              />
            )}
            <a
              href={voteUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-parchment hover:text-antique-gold transition-colors text-xs font-semibold break-all mt-3"
            >
              {voteUrl}
            </a>
            <p className="text-parchment/45 text-[10px] mt-2">No login needed · one vote per performer</p>
          </div>
        )}

        {/* Participant-switch transition flash */}
        {transitioning && (
          <div className="pointer-events-none fixed inset-0 z-40 bg-dark-plum curtain-reveal" aria-hidden="true" />
        )}
      </div>
    </CurtainFrame>
  );
}
