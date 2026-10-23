import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, extractError } from "../utils/api";
import { ConfettiBurst, CurtainFrame, ScatterStars, Sparkle, StarDoodle } from "../components/Decor";
import { useSocketState } from "../hooks/useRealtime";
import type { PublicState, PublishedResults } from "../types";

function RankMedal({ rank }: { rank: number }) {
  const label = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : String(rank);
  const color =
    rank === 1 ? "text-antique-gold" : rank === 2 ? "text-parchment/80" : rank === 3 ? "text-muted-rose" : "text-parchment/50";
  return <span className={`font-serif countdown-digits ${rank === 1 ? "text-6xl" : rank <= 3 ? "text-4xl" : "text-2xl"} ${color}`}>{label}</span>;
}

export default function ResultsPage() {
  const { state } = useSocketState<PublicState>();
  const [results, setResults] = useState<PublishedResults | null>(null);
  const [error, setError] = useState("");

  const published = state?.resultsPublished ?? false;

  useEffect(() => {
    if (!published) {
      setResults(null);
      return;
    }
    api
      .get("/results")
      .then((res) => setResults(res.data))
      .catch((err) => setError(extractError(err)));
  }, [published]);

  const winners = results?.winners ?? [];
  const champion = winners.find((w) => w.rank === 1);
  const runnersUp = winners.filter((w) => w.rank > 1);

  // Not published yet.
  if (!published) {
    return (
      <div className="min-h-screen stage-bg relative overflow-hidden flex flex-col items-center justify-center px-6 text-center">
        <ScatterStars count={12} />
        <div className="spotlight-cone opacity-50" />
        <div className="relative z-10">
          <p className="label-caps text-antique-gold/80 tracking-[0.45em]">{state?.club ?? "Authorcraft"}</p>
          <h1 className="font-serif text-5xl sm:text-7xl text-parchment mt-3">STEAL THE SPOTLIGHT</h1>
          <div className="gold-rule w-40 mx-auto my-8" />
          <p className="font-serif text-3xl sm:text-4xl text-parchment/80 italic">The spotlight is yours…</p>
          <p className="text-parchment/50 mt-4 max-w-md mx-auto">
            The results are being kept under wraps until the host reveals them. Check back in a moment.
          </p>
          <div className="flex justify-center gap-3 mt-10">
            <Sparkle size={13} />
            <Sparkle size={9} delay={0.7} />
            <Sparkle size={15} delay={1.4} />
          </div>
          <Link to="/" className="btn-outline inline-block mt-12 px-6 py-2.5 text-xs tracking-wider uppercase">
            ← Back to the lobby
          </Link>
        </div>
      </div>
    );
  }

  if (!results && !error) {
    return (
      <div className="min-h-screen stage-bg flex items-center justify-center">
        <p className="font-serif text-2xl text-antique-gold">Drawing the curtain…</p>
      </div>
    );
  }

  if (error && !results) {
    return (
      <div className="min-h-screen stage-bg flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-serif text-2xl text-muted-rose">{error}</p>
        <Link to="/" className="btn-outline px-6 py-2.5 text-xs tracking-wider uppercase">
          ← Back to the lobby
        </Link>
      </div>
    );
  }

  return (
    <CurtainFrame>
      <ConfettiBurst active />
      <div className="relative min-h-screen px-6 sm:px-12 py-[4vh] flex flex-col items-center">
        <ScatterStars count={12} />

        <header className="relative z-10 text-center">
          <p className="label-caps text-antique-gold/85 tracking-[0.5em]">{results?.club ?? "Authorcraft"}</p>
          <h1 className="font-serif text-4xl sm:text-6xl text-parchment mt-2">
            THE <span className="text-antique-gold">RESULTS</span>
          </h1>
          <div className="gold-rule w-48 mx-auto mt-4" />
        </header>

        {/* Champion */}
        {champion && (
          <section className="relative z-10 mt-[3vh] text-center max-w-2xl w-full stamp-in">
            <div className="relative inline-block px-6">
              <StarDoodle size={20} className="absolute -top-3 -left-2" delay={0.2} />
              <StarDoodle size={14} className="absolute top-6 -right-4" delay={1.1} />
              <p className="label-caps text-antique-gold tracking-[0.5em] mb-2">Winner</p>
              <p className="label-caps text-parchment/50 tracking-[0.4em]">
                No. {String(champion.participant.number).padStart(2, "0")}
              </p>
              <h2 className="font-serif text-6xl sm:text-7xl md:text-8xl text-antique-gold leading-[1.02] mt-1 drop-shadow-[0_0_30px_rgba(198,161,91,0.35)]">
                {champion.participant.name}
              </h2>
              {champion.participant.performance_title && (
                <p className="font-serif italic text-parchment/70 text-xl sm:text-2xl mt-3">
                  “{champion.participant.performance_title}”
                </p>
              )}
              <p className="font-serif text-5xl sm:text-6xl text-parchment countdown-digits mt-5">
                {champion.average !== null ? champion.average.toFixed(2) : "—"}
              </p>
              <p className="label-caps text-parchment/45 tracking-[0.35em] mt-1">score · 80% judges / 20% audience</p>
            </div>
          </section>
        )}

        {/* Runners up */}
        {runnersUp.length > 0 && (
          <section className="relative z-10 mt-[3vh] w-full max-w-3xl">
            <div className="gold-rule mb-5" />
            <div className="space-y-2.5">
              {runnersUp.map((entry, i) => (
                <div
                  key={entry.participant.id}
                  className="rise-in flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-4 gold-frame bg-dark-plum/60"
                  style={{ animationDelay: `${0.35 + i * 0.12}s` }}
                >
                  <RankMedal rank={entry.rank} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-serif text-2xl sm:text-3xl text-parchment truncate leading-tight">
                      {entry.participant.name}
                    </p>
                    <p className="label-caps text-parchment/40 mt-0.5">
                      No. {String(entry.participant.number).padStart(2, "0")}
                      {entry.participant.performance_title ? ` · ${entry.participant.performance_title}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-serif text-3xl sm:text-4xl text-antique-gold countdown-digits leading-none">
                      {entry.average !== null ? entry.average.toFixed(2) : "—"}
                    </p>
                    <p className="label-caps text-parchment/35 mt-1">avg</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="relative z-10 mt-auto pt-[3vh] text-center w-full">
          <div className="gold-rule w-1/4 mx-auto mb-3" />
          <p className="label-caps text-parchment/40 tracking-[0.3em] text-xs">
            Authorcraft · Steal the Spotlight · Thank you for performing
          </p>
          <Link to="/" className="btn-outline inline-block mt-5 px-6 py-2 text-xs tracking-wider uppercase">
            ← Lobby
          </Link>
        </footer>
      </div>
    </CurtainFrame>
  );
}
