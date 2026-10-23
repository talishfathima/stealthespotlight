import { useMemo, useState } from "react";
import { api, extractError, setAuthToken } from "../utils/api";
import { useSocketState, useElapsed } from "../hooks/useRealtime";
import { StatusPill } from "../components/StatusPill";
import { Sparkle, HandArrow } from "../components/Decor";
import type { AdminState, JudgeAccount, Participant } from "../types";

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-charcoal-ink/80 flex items-center justify-center p-4">
      <div className="gold-frame bg-dark-plum p-7 max-w-md w-full">
        <h3 className="font-serif text-2xl text-parchment">{title}</h3>
        <p className="text-parchment/70 text-sm mt-3 leading-relaxed">{body}</p>
        <div className="flex gap-3 mt-7 justify-end">
          <button onClick={onCancel} className="btn-outline px-5 py-2 text-sm tracking-wider uppercase">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={danger ? "btn-oxblood px-5 py-2 text-sm tracking-wider uppercase" : "btn-gold px-5 py-2 text-sm tracking-wider uppercase font-semibold"}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CorrectScoreDialog({
  score,
  scoringMax,
  onDone,
  onCancel,
}: {
  score: { id: number; judgeName: string; score: number | null };
  scoringMax: number;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<number>(score.score ?? 0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/scores/${score.id}/correct`, { newScore: value, reason });
      onDone(`Score for ${score.judgeName} corrected to ${value}.`);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal-ink/80 flex items-center justify-center p-4">
      <form onSubmit={submit} className="gold-frame bg-dark-plum p-7 max-w-md w-full space-y-4">
        <h3 className="font-serif text-2xl text-parchment">Correct Score</h3>
        <p className="text-parchment/65 text-sm">
          {score.judgeName}'s current score:{" "}
          <span className="font-serif text-xl text-antique-gold countdown-digits">
            {score.score ?? "missing"}
          </span>
        </p>
        {error && <p className="text-sm text-muted-rose">{error}</p>}
        <div>
          <label className="label-caps text-parchment/50 block mb-1">New score (0–{scoringMax})</label>
          <input
            type="number"
            min={0}
            max={scoringMax}
            className="field"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="label-caps text-parchment/50 block mb-1">Reason (kept in the audit log)</label>
          <input
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. accidentally submitted the wrong number"
            required
          />
        </div>
        <div className="flex gap-2 pt-1 justify-end">
          <button type="button" onClick={onCancel} className="btn-outline px-5 py-2 text-sm tracking-wider uppercase">
            Cancel
          </button>
          <button disabled={busy} className="btn-gold px-5 py-2 text-sm tracking-wider uppercase font-semibold">
            {busy ? "Saving…" : "Apply Correction"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ParticipantForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Participant;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    number: initial?.number ?? 1,
    name: initial?.name ?? "",
    performance_title: initial?.performance_title ?? "",
    photo_url: initial?.photo_url ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, number: Number(form.number) };
      if (initial) {
        await api.put(`/participants/${initial.id}`, payload);
      } else {
        await api.post("/participants", payload);
      }
      onSaved();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-4 gold-frame bg-dark-plum/70">
      <p className="label-caps text-antique-gold">{initial ? "Edit Participant" : "Add Participant"}</p>
      {error && <p className="text-sm text-muted-rose">{error}</p>}
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div>
          <label className="label-caps text-parchment/50 block mb-1">No.</label>
          <input
            type="number"
            min={1}
            className="field"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: Number(e.target.value) })}
            required
          />
        </div>
        <div>
          <label className="label-caps text-parchment/50 block mb-1">Name</label>
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <label className="label-caps text-parchment/50 block mb-1">Performance Title (optional)</label>
        <input
          className="field"
          value={form.performance_title ?? ""}
          onChange={(e) => setForm({ ...form, performance_title: e.target.value })}
        />
      </div>
      <div>
        <label className="label-caps text-parchment/50 block mb-1">Photo URL (optional)</label>
        <input
          className="field"
          value={form.photo_url ?? ""}
          onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button disabled={busy} className="btn-gold px-5 py-2 text-sm tracking-wider uppercase font-semibold">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline px-5 py-2 text-sm tracking-wider uppercase">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Password that avoids characters people confuse when reading it aloud. */
function generatePassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

function AddJudgeForm({
  onSaved,
  onCancel,
}: {
  onSaved: (created: { username: string; password: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ username: "", displayName: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/judges", {
        username: form.username.trim(),
        displayName: form.displayName.trim() || undefined,
        password: form.password,
      });
      onSaved({ username: res.data.username, password: form.password });
      setForm({ username: "", displayName: "", password: "" });
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-4 gold-frame bg-dark-plum/70">
      <p className="label-caps text-antique-gold">Add Judge</p>
      {error && <p className="text-sm text-muted-rose">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label-caps text-parchment/50 block mb-1">Username</label>
          <input
            className="field"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="e.g. judge2"
            autoComplete="off"
            required
          />
          <p className="text-[11px] text-parchment/35 mt-1">3-32 characters. Letters, numbers, dot, dash, underscore.</p>
        </div>
        <div>
          <label className="label-caps text-parchment/50 block mb-1">Display name</label>
          <input
            className="field"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="e.g. Guest Judge"
            required
          />
        </div>
      </div>
      <div>
        <label className="label-caps text-parchment/50 block mb-1">Password</label>
        <div className="flex gap-2">
          <input
            className="field"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="at least 8 characters"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setForm({ ...form, password: generatePassword() })}
            className="btn-outline px-3 py-1 text-[11px] tracking-wider uppercase shrink-0"
          >
            Generate
          </button>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button disabled={busy} className="btn-gold px-5 py-2 text-sm tracking-wider uppercase font-semibold">
          {busy ? "Adding…" : "Add Judge"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline px-5 py-2 text-sm tracking-wider uppercase">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ResetPasswordDialog({
  judge,
  onDone,
  onCancel,
}: {
  judge: JudgeAccount;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(generatePassword());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/judges/${judge.id}/reset-password`, { newPassword: value });
      onDone(`New password set for ${judge.display_name}.`);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal-ink/80 flex items-center justify-center p-4">
      <form onSubmit={submit} className="gold-frame bg-dark-plum p-7 max-w-md w-full space-y-4">
        <h3 className="font-serif text-2xl text-parchment">Reset password</h3>
        <p className="text-parchment/65 text-sm">
          Set a new password for <span className="text-antique-gold">{judge.display_name}</span> (@{judge.username}) and
          share it with them. Their scores stay exactly as they are.
        </p>
        {error && <p className="text-sm text-muted-rose">{error}</p>}
        <div>
          <label className="label-caps text-parchment/50 block mb-1">New password</label>
          <div className="flex gap-2">
            <input
              className="field"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setValue(generatePassword())}
              className="btn-outline px-3 py-1 text-[11px] tracking-wider uppercase shrink-0"
            >
              Generate
            </button>
          </div>
        </div>
        <div className="flex gap-2 pt-1 justify-end">
          <button type="button" onClick={onCancel} className="btn-outline px-5 py-2 text-sm tracking-wider uppercase">
            Cancel
          </button>
          <button disabled={busy} className="btn-gold px-5 py-2 text-sm tracking-wider uppercase font-semibold">
            {busy ? "Saving…" : "Set Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

function JudgesPanel({
  judges,
  votingOpen,
  show,
}: {
  judges: JudgeAccount[];
  votingOpen: boolean;
  show: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [resetting, setResetting] = useState<JudgeAccount | null>(null);
  const [removing, setRemoving] = useState<JudgeAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const removeJudge = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/judges/${removing.id}`);
      show(`${removing.display_name} removed.`);
      setRemoving(null);
    } catch (err) {
      show(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gold-frame bg-dark-plum/55 p-4 sm:p-5 mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-caps text-antique-gold tracking-[0.35em]">Judges' Panel</p>
          <p className="text-[11px] text-parchment/40 mt-0.5">
            {judges.length} judge{judges.length === 1 ? "" : "s"} signed up · each judge scores every performer once
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setCredentials(null); }}
          disabled={votingOpen}
          className="btn-outline px-4 py-2 text-xs tracking-wider uppercase disabled:opacity-40"
          title={votingOpen ? "Close voting before adding a judge" : undefined}
        >
          {showForm ? "Close" : "+ Add Judge"}
        </button>
      </div>

      {votingOpen && (
        <p className="text-[11px] text-muted-rose/80 mt-2">
          Voting is open — close it before adding or removing a judge.
        </p>
      )}

      {credentials && (
        <div className="mt-3 px-4 py-3 gold-frame bg-oxblood/50">
          <p className="label-caps text-antique-gold">Judge account created</p>
          <p className="text-sm text-parchment/80 mt-1">
            Share these with the judge — they sign in at <span className="text-antique-gold">/judge</span>.
          </p>
          <p className="font-mono text-sm text-parchment mt-2">
            username: <span className="text-antique-gold">{credentials.username}</span>
          </p>
          <p className="font-mono text-sm text-parchment">
            password: <span className="text-antique-gold">{credentials.password}</span>
          </p>
          <button
            onClick={() => setCredentials(null)}
            className="btn-outline px-3 py-1 text-[11px] tracking-wider uppercase mt-3"
          >
            Done
          </button>
        </div>
      )}

      {showForm && !votingOpen && (
        <div className="mt-4">
          <AddJudgeForm
            onSaved={(created) => {
              setShowForm(false);
              setCredentials(created);
              show(`Judge "${created.username}" created.`);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {judges.length === 0 && (
          <p className="text-parchment/45 text-sm col-span-full py-4 text-center">
            No judges yet. Add one before the show starts.
          </p>
        )}
        {judges.map((judge) => (
          <div key={judge.id} className="rounded-sm border border-parchment/12 bg-parchment/[0.04] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-parchment font-medium truncate">{judge.display_name}</p>
                <p className="text-parchment/45 text-xs truncate">@{judge.username}</p>
              </div>
              <span className="label-caps text-parchment/40 shrink-0">
                {judge.score_count} score{judge.score_count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => setResetting(judge)}
                disabled={busy}
                className="btn-outline px-3 py-0.5 text-[10px] tracking-wider uppercase"
              >
                Reset Password
              </button>
              <button
                onClick={() => setRemoving(judge)}
                disabled={busy || judge.score_count > 0}
                className="btn-outline px-3 py-0.5 text-[10px] tracking-wider uppercase text-muted-rose border-muted-rose/40 disabled:opacity-30"
                title={
                  judge.score_count > 0
                    ? "This judge already has scores on record and cannot be removed mid-show"
                    : undefined
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {resetting && (
        <ResetPasswordDialog
          judge={resetting}
          onCancel={() => setResetting(null)}
          onDone={(msg) => {
            setResetting(null);
            show(msg);
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          danger
          title={`Remove ${removing.display_name}?`}
          body={`@${removing.username} will no longer be able to sign in and will not be marked missing for any performer. This cannot be undone.`}
          confirmLabel="Remove judge"
          onCancel={() => setRemoving(null)}
          onConfirm={removeJudge}
        />
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const { state, connected } = useSocketState<AdminState>();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "reset" | "delete" | "publish" | "unpublish"; participant?: Participant }>(null);
  const [correcting, setCorrecting] = useState<null | { id: number; judgeName: string; score: number | null }>(null);
  const [toast, setToast] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const votingOpenedAt = state?.status === "voting_open" ? state.votingOpenedAt : null;
  const elapsed = useElapsed(votingOpenedAt);
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const show = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3200);
  };

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusyAction(true);
    try {
      await fn();
      show(okMsg);
      setConfirm(null);
      setEditing(null);
      setShowAddForm(false);
    } catch (err) {
      show(extractError(err));
    } finally {
      setBusyAction(false);
    }
  };

  const orderedParticipants = useMemo(() => state?.participants ?? [], [state?.participants]);
  const leaderboard = state?.leaderboard ?? [];
  const activeId = state?.activeParticipant?.id ?? null;

  const nextParticipant = useMemo(() => {
    if (!activeId) return orderedParticipants[0] ?? null;
    const index = orderedParticipants.findIndex((p) => p.id === activeId);
    return index >= 0 ? (orderedParticipants[index + 1] ?? null) : null;
  }, [orderedParticipants, activeId]);

  const moveParticipant = async (id: number, direction: -1 | 1) => {
    const ids = orderedParticipants.map((p) => p.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await run(() => api.put("/participants/reorder", { order: ids }), "Order updated.");
  };

  if (!state) {
    return (
      <div className="min-h-screen stage-bg flex items-center justify-center">
        <p className="font-serif text-2xl text-antique-gold">Connecting to backstage…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen stage-bg">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-5">
        {/* Top bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="label-caps text-antique-gold/80 tracking-[0.4em]">Backstage Control</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-parchment">
              Steal the <span className="text-antique-gold">Spotlight</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {connected ? (
              <span className="status-pill status-open">
                <span className="dot" /> Live
              </span>
            ) : (
              <span className="status-pill status-closed">
                <span className="dot" /> Reconnecting…
              </span>
            )}
            <StatusPill status={state.status} />
            <button
              onClick={() => setShowLeaderboard(true)}
              className="btn-outline px-4 py-2 text-xs tracking-wider uppercase"
            >
              Leaderboard
            </button>
            <a href="/audience" target="_blank" rel="noreferrer" className="btn-outline px-4 py-2 text-xs tracking-wider uppercase">
              Audience Screen ↗
            </a>
            <button
              onClick={() => run(async () => { setAuthToken(null); await api.post("/auth/logout"); window.location.href = "/admin/login"; }, "")}
              className="btn-outline px-4 py-2 text-xs tracking-wider uppercase opacity-70"
            >
              Sign out
            </button>
          </div>
        </header>

        {toast && (
          <div className="mb-4 px-4 py-2.5 gold-frame bg-oxblood/60 text-parchment text-sm">{toast}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-5">
          {/* Left: participant queue */}
          <aside className="gold-frame bg-dark-plum/60 p-4 flex flex-col max-h-[calc(100vh-140px)]">
            <div className="flex items-center justify-between mb-3">
              <p className="label-caps text-antique-gold">Participants ({orderedParticipants.length})</p>
              <button
                onClick={() => { setShowAddForm(!showAddForm); setEditing(null); }}
                className="btn-outline px-3 py-1 text-xs tracking-wider uppercase"
              >
                + Add
              </button>
            </div>

            {showAddForm && (
              <div className="mb-3">
                <ParticipantForm onSaved={() => { setShowAddForm(false); show("Participant added."); }} onCancel={() => setShowAddForm(false)} />
              </div>
            )}
            {editing && (
              <div className="mb-3">
                <ParticipantForm
                  initial={editing}
                  onSaved={() => { setEditing(null); show("Participant updated."); }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}

            <div className="thin-scroll overflow-y-auto flex-1 space-y-2 pr-1">
              {orderedParticipants.length === 0 && (
                <p className="text-parchment/45 text-sm py-6 text-center">
                  No participants yet. Add them before the show.
                </p>
              )}
              {orderedParticipants.map((p, i) => {
                const isActive = p.id === activeId;
                const entry = leaderboard.find((l) => l.participant.id === p.id);
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-sm p-3 border transition-colors ${
                      isActive
                        ? "border-antique-gold bg-oxblood/50"
                        : "border-parchment/15 bg-parchment/[0.04] hover:border-antique-gold/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-serif text-antique-gold text-lg leading-none mt-0.5 w-7 shrink-0">
                        {String(p.number).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-parchment font-medium truncate">{p.name}</p>
                        {p.performance_title && (
                          <p className="text-parchment/50 text-xs truncate italic">{p.performance_title}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {isActive && <span className="label-caps text-antique-gold">On Stage</span>}
                          {entry && (
                            <span className="label-caps text-parchment/40">
                              {entry.average !== null ? `Avg ${entry.average.toFixed(2)}` : "No score"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2 justify-end">
                      <button
                        onClick={() => moveParticipant(p.id, -1)}
                        disabled={i === 0}
                        className="btn-outline px-2 py-0.5 text-xs disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveParticipant(p.id, 1)}
                        disabled={i === orderedParticipants.length - 1}
                        className="btn-outline px-2 py-0.5 text-xs disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => { setEditing(p); setShowAddForm(false); }}
                        className="btn-outline px-2 py-0.5 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirm({ kind: "delete", participant: p })}
                        className="btn-outline px-2 py-0.5 text-xs text-muted-rose border-muted-rose/40"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => run(() => api.post("/event/select-participant", { participantId: p.id }), `${p.name} is on stage.`)}
                        disabled={busyAction}
                        className="btn-gold px-2.5 py-0.5 text-xs font-semibold"
                      >
                        Set Active
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setConfirm({ kind: "reset" })}
              className="btn-outline mt-3 w-full py-2 text-xs tracking-wider uppercase text-muted-rose border-muted-rose/40"
            >
              Reset All Scores
            </button>
          </aside>

          {/* Center: stage control */}
          <section className="gold-frame bg-dark-plum/55 p-6 sm:p-8 relative overflow-hidden">
            <Sparkle size={11} className="absolute top-4 right-6" delay={0.5} />
            <p className="label-caps text-antique-gold/80 tracking-[0.35em]">Stage Control</p>

            {state.activeParticipant ? (
              <div className="mt-5 text-center">
                <p className="label-caps text-parchment/50 tracking-[0.4em]">
                  Now Performing · No. {String(state.activeParticipant.number).padStart(2, "0")}
                </p>
                <h2 className="font-serif text-5xl sm:text-6xl text-parchment mt-2 leading-tight">
                  {state.activeParticipant.name}
                </h2>
                {state.activeParticipant.performance_title && (
                  <p className="font-serif italic text-parchment/65 text-xl mt-2">
                    “{state.activeParticipant.performance_title}”
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-10 text-center relative">
                <HandArrow className="absolute -left-6 top-2 text-antique-gold/50 hidden sm:block" />
                <p className="font-serif text-3xl text-parchment/70 italic">No performer selected.</p>
                <p className="text-parchment/45 text-sm mt-2">Choose someone from the queue to put them on stage.</p>
              </div>
            )}

            {/* Countdown + voting controls */}
            <div className="mt-9 flex flex-col items-center">
              {state.status === "voting_open" ? (
                <>
                  <span className="countdown-digits font-serif text-8xl sm:text-9xl text-antique-gold leading-none drop-shadow-[0_0_24px_rgba(198,161,91,0.4)]">
                    {elapsedLabel}
                  </span>
                  <p className="label-caps text-[#9fd39f] tracking-[0.4em] mt-2">Voting Open</p>
                  <p className="text-parchment/45 text-xs mt-2">Stays open until the crew closes it.</p>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Sparkle size={10} />
                  <span className="label-caps text-parchment/45 tracking-[0.3em]">
                    {state.status === "voting_closed"
                      ? "Voting Closed"
                      : state.status === "completed"
                        ? "Show Completed"
                        : "Ready to Open Voting"}
                  </span>
                  <Sparkle size={10} delay={0.9} />
                </div>
              )}

              {state.audienceVoteUrl && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-sm border border-antique-gold/35 bg-parchment/[0.03] p-4">
                  <p className="label-caps text-antique-gold tracking-[0.3em]">Audience vote link</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(state.audienceVoteUrl)}`}
                    alt="Audience vote QR code"
                    className="w-32 h-32 bg-white p-2 rounded-sm"
                  />
                  <a
                    href={state.audienceVoteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-parchment hover:text-antique-gold transition-colors break-all text-center"
                  >
                    {state.audienceVoteUrl}
                  </a>
                  <p className="text-[11px] text-parchment/45 text-center">No login needed · one vote per performer per device</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 justify-center mt-7">
                {state.status !== "voting_open" ? (
                  <button
                    onClick={() => run(() => api.post("/event/open-voting", {}), "Voting is open. Go!")}
                    disabled={busyAction || !state.activeParticipant}
                    className="btn-gold px-10 py-4 font-semibold tracking-[0.16em] uppercase text-base"
                  >
                    Open Voting
                  </button>
                ) : (
                  <button
                    onClick={() => run(() => api.post("/event/close-voting", {}), "Voting closed.")}
                    disabled={busyAction}
                    className="btn-oxblood px-10 py-4 font-semibold tracking-[0.16em] uppercase text-base"
                  >
                    Close Voting Now
                  </button>
                )}

                <button
                  onClick={() => run(() => api.post("/event/select-participant", { participantId: null }), "Performer cleared.")}
                  disabled={busyAction || !state.activeParticipant}
                  className="btn-outline px-6 py-4 text-sm tracking-wider uppercase"
                >
                  Clear Stage
                </button>

                {nextParticipant && (
                  <button
                    onClick={() =>
                      run(
                        () => api.post("/event/select-participant", { participantId: nextParticipant.id }),
                        `${nextParticipant.name} is now on stage.`
                      )
                    }
                    disabled={busyAction}
                    className="btn-outline px-6 py-4 text-sm tracking-wider uppercase"
                  >
                    Next: {nextParticipant.name} →
                  </button>
                )}
              </div>
            </div>

            {/* Judge scores for active participant */}
            <div className="mt-9">
              <div className="gold-rule mb-4" />
              <p className="label-caps text-antique-gold/80 mb-3">Scores — Active Performer</p>
              {(() => {
                const entry = leaderboard.find((l) => l.participant.id === activeId);
                if (!entry || entry.scores.length === 0) {
                  return <p className="text-parchment/45 text-sm">No scores recorded for this performer yet.</p>;
                }
                return (
                  <div className="flex flex-wrap gap-3">
                    {entry.scores.map((s) => (
                      <div
                        key={s.judgeId}
                        className="gold-frame bg-parchment/[0.05] px-5 py-3 text-center min-w-[130px]"
                      >
                        <p className="label-caps text-parchment/50">{s.judgeName}</p>
                        {s.isMissing || s.score === null ? (
                          <p className="font-serif text-3xl text-muted-rose mt-1">—</p>
                        ) : (
                          <p className="font-serif text-4xl text-antique-gold countdown-digits mt-1">{s.score}</p>
                        )}
                        {s.isCorrected && <p className="label-caps text-muted-rose/80 mt-1">Corrected</p>}
                        {s.judgeId >= 0 && (
                          <button
                            onClick={() => setCorrecting({ id: s.id, judgeName: s.judgeName, score: s.score })}
                            className="btn-outline px-3 py-0.5 text-[10px] tracking-wider uppercase mt-2"
                          >
                            Correct
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Event end controls */}
            <div className="mt-8 flex flex-wrap gap-3 items-center">
              <div className="gold-rule flex-1 min-w-[80px]" />
              {!state.resultsPublished ? (
                <button
                  onClick={() => setConfirm({ kind: "publish" })}
                  disabled={busyAction || leaderboard.every((l) => l.average === null)}
                  className="btn-gold px-6 py-3 text-sm tracking-[0.14em] uppercase font-semibold"
                >
                  Publish Final Results
                </button>
              ) : (
                <>
                  <span className="label-caps text-[#9fd39f] tracking-[0.2em]">Results Published ✓</span>
                  <button onClick={() => setConfirm({ kind: "unpublish" })} className="btn-outline px-5 py-2.5 text-xs tracking-wider uppercase">
                    Hide Results
                  </button>
                </>
              )}
            </div>
          </section>

        </div>

        <JudgesPanel
          judges={state.judges ?? []}
          votingOpen={state.status === "voting_open"}
          show={show}
        />
      </div>

      {showLeaderboard && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="gold-frame bg-dark-plum w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-parchment/10">
              <div>
                <p className="label-caps text-antique-gold mb-1">Leaderboard</p>
                <p className="text-[11px] text-parchment/40">Private · 80% judges / 20% audience · tie-break: avg → total → fewest missing</p>
              </div>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="btn-outline px-3 py-1 text-xs tracking-wider uppercase shrink-0"
              >
                Close
              </button>
            </div>
            <div className="thin-scroll overflow-y-auto flex-1 space-y-2 p-4">
              {leaderboard.length === 0 && (
                <p className="text-parchment/45 text-sm py-6 text-center">Add participants to see rankings.</p>
              )}
              {leaderboard.map((entry) => (
                <div
                  key={entry.participant.id}
                  className={`rounded-sm border p-3 ${
                    entry.participant.id === activeId
                      ? "border-antique-gold bg-oxblood/40"
                      : "border-parchment/12 bg-parchment/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-serif text-2xl w-8 text-center ${
                        entry.rank === 1 ? "text-antique-gold" : entry.rank === 2 || entry.rank === 3 ? "text-muted-rose" : "text-parchment/50"
                      }`}
                    >
                      {entry.rank}
                      {entry.tied && <span className="text-xs align-super">=</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-parchment text-sm font-medium truncate">{entry.participant.name}</p>
                      <p className="label-caps text-parchment/40">
                        No. {String(entry.participant.number).padStart(2, "0")}
                        {entry.missingJudgeNames.length > 0 && (
                          <span className="text-muted-rose"> · missing: {entry.missingJudgeNames.join(", ")}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-2xl text-antique-gold countdown-digits leading-none">
                        {entry.average !== null ? entry.average.toFixed(2) : "—"}
                      </p>
                      <p className="label-caps text-parchment/35 mt-0.5">avg</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirm?.kind === "reset" && (
        <ConfirmDialog
          danger
          title="Reset all scores?"
          body="This permanently deletes every submitted score and clears the active performer and voting state. This cannot be undone."
          confirmLabel="Yes, reset everything"
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => api.post("/event/reset"), "All scores have been reset.")}
        />
      )}
      {confirm?.kind === "delete" && confirm.participant && (
        <ConfirmDialog
          danger
          title={`Delete ${confirm.participant.name}?`}
          body="This removes the participant and all of their scores. This cannot be undone."
          confirmLabel="Delete participant"
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => api.delete(`/participants/${confirm.participant!.id}`), "Participant deleted.")}
        />
      )}
      {confirm?.kind === "publish" && (
        <ConfirmDialog
          title="Publish final results?"
          body="The audience screen and the public results page will reveal all rankings, including the winner. Make sure the show is truly over."
          confirmLabel="Publish results"
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => api.post("/event/publish-results"), "Results are now public.")}
        />
      )}
      {confirm?.kind === "unpublish" && (
        <ConfirmDialog
          title="Hide results again?"
          body="The public results page will stop showing rankings until you publish again."
          confirmLabel="Hide results"
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(() => api.post("/event/unpublish-results"), "Results hidden.")}
        />
      )}
      {correcting && (
        <CorrectScoreDialog
          score={correcting}
          scoringMax={state.scoringMax ?? 10}
          onCancel={() => setCorrecting(null)}
          onDone={(msg) => {
            setCorrecting(null);
            show(msg);
          }}
        />
      )}
    </div>
  );
}
