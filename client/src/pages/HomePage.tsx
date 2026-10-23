import { Link } from "react-router-dom";
import { HandArrow, ScatterStars, Sparkle, TicketStub } from "../components/Decor";

export default function HomePage() {
  return (
    <div className="min-h-screen stage-bg relative overflow-hidden flex flex-col items-center justify-center px-6 py-16">
      <ScatterStars count={18} />
      <div className="spotlight-cone spotlight-breathe opacity-70" />
      <div className="spotlight-pool" />

      <div className="relative z-10 text-center max-w-3xl w-full">
        <p className="label-caps text-antique-gold/80 tracking-[0.45em] mb-6">Authorcraft Presents</p>

        <h1 className="font-serif leading-[0.92] text-parchment">
          <span className="block text-5xl sm:text-7xl md:text-8xl tracking-tight">STEAL</span>
          <span className="block text-5xl sm:text-7xl md:text-8xl tracking-tight text-antique-gold">THE SPOTLIGHT</span>
        </h1>

        <div className="flex items-center justify-center gap-4 my-8">
          <Sparkle size={12} />
          <div className="gold-rule w-24 sm:w-40" />
          <Sparkle size={12} delay={0.8} />
        </div>

        <p className="font-serif text-xl sm:text-2xl text-parchment/75 italic">
          A live talent showcase where every second counts and one judge holds the score.
        </p>

        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="relative">
            <HandArrow className="absolute -left-20 -top-3 text-antique-gold/70 hidden sm:block rotate-[-8deg]" />
            <Link
              to="/audience"
              className="btn-gold inline-block px-10 py-3.5 font-semibold tracking-[0.14em] uppercase text-sm"
            >
              Audience Screen
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            <Link to="/judge" className="btn-outline px-6 py-2.5 text-sm tracking-[0.12em] uppercase">
              Judge's Booth
            </Link>
            <Link to="/vote" className="btn-outline px-6 py-2.5 text-sm tracking-[0.12em] uppercase">
              Cast a Vote
            </Link>
            <Link to="/results" className="btn-outline px-6 py-2.5 text-sm tracking-[0.12em] uppercase">
              Final Results
            </Link>
            <Link to="/admin/login" className="btn-outline px-6 py-2.5 text-sm tracking-[0.12em] uppercase opacity-70">
              Backstage
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-16 w-full max-w-md">
        <TicketStub>
          <p className="label-caps text-charcoal-ink/60">Tonight's Programme</p>
          <p className="font-serif text-2xl text-charcoal-ink mt-1">Steal the Spotlight</p>
          <p className="text-sm text-charcoal-ink/70 mt-2">
            Live scoring · Audience votes count 20% · Results revealed on the house screen.
          </p>
        </TicketStub>
      </div>

      <p className="relative z-10 mt-10 label-caps text-parchment/35">Authorcraft · Est. for the love of the stage</p>
    </div>
  );
}
