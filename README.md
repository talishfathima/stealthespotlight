# Authorcraft: Steal the Spotlight

A real-time event scoring website for live talent shows. Features admin control, judge scoring, audience display, and live leaderboard management.

## Architecture

- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Node.js + Express + Socket.IO
- Database: PostgreSQL
- Authentication: Express Session with secure cookies plus signed per-tab tokens
  (admin and judge can stay signed in in separate tabs of the same browser)

## Features

### Admin Dashboard
- Participant management (add, edit, delete, reorder)
- Judge management (add, remove, reset a judge's password)
- Select current performer
- Open voting
- Close voting manually when the crew is ready (no auto-close timer)
- View scores, averages, and private leaderboard
- Publish final results
- Move to next participant

### Judge Interface
- View current participant
- Submit score (0-10) while voting is open
- See voting status
- One score per participant

### Audience Display
- Theatrical stage view for projection (16:9)
- Voting status display
- Shows a plain `/vote` link instead of a QR code
- Final winners reveal
- Hidden private data (scores, leaderboard)

### Audience Voting
- No login needed — each phone/device gets an anonymous ballot
- One vote per performer per device, reset automatically for every new round
- Votes are averaged into a single audience score worth 20% of the final result
  (judges are worth 80%)

## Quick Start

1. Install dependencies:
   `ash
   npm install
   `

2. Set up environment variables:
   `ash
   cp .env.example .env
   # Update with your PostgreSQL credentials
   `

3. Initialize database:
   `ash
   npm run migrate
   `

4. Start development servers:
   `ash
   npm run dev
   `

5. Access the interfaces:
  - Admin: http://localhost:5173/admin/login
  - Judge: http://localhost:5173/judge
  - Audience display: http://localhost:5173/audience
  - Audience voting: http://localhost:5173/vote (no login needed)

  Each tab keeps its own login, so you can run the admin and judge views side by
  side in the same browser. If you were already signed in before this change,
  sign in once more in the judge tab.
   - Home: http://localhost:5173/

For phones on the same Wi-Fi, set `CLIENT_URL` in `.env` to this computer's LAN
address (for example `http://192.168.1.20:5173`) so the vote link shown on the
audience screen is reachable from audience phones.

## Development

- Client: http://localhost:5173
- Server: http://localhost:3001
- Socket.IO: ws://localhost:3001

## Adding more judges

The show ships with one judge account (`judge01`). To add more:

1. Sign in at http://localhost:5173/admin/login
2. Scroll to **Judges' Panel** at the bottom of the dashboard
3. Click **+ Add Judge**, fill in a username / display name / password
   (the **Generate** button creates a random password you can copy)
4. Copy the credentials shown in the green panel and hand them to the judge —
   they sign in at http://localhost:5173/judge

Rules the server enforces:

- Usernames are lowercase, 3-32 characters (letters, numbers, `.`, `-`, `_`)
- Passwords must be at least 8 characters
- Judges can only be added or removed while voting is **closed**, so every
  judge scores exactly the same rounds
- A judge who already has scores on record cannot be removed (it would change
  the averages). Use **Reset Password** instead
- Judges appear on the leaderboard as *missing* if they do not score a
  performer before voting closes

## Testing

### Automated

With the server running on port 3001 and the database seeded:

```bash
npm test
```

This runs `docs/test-workflow.ps1`, which exercises the API end to end:
auth, access control, data-leak checks on the public state, the voting
lifecycle, score validation, anonymous audience voting and 80/20 weighting,
manual close, missing-score marking, admin
corrections, the publish gate, reset, the audit trail, participant
reordering and multi-judge management.

### Manual browser check

Run `npm run dev`, then open these in separate windows:

| Window | URL | What to check |
| --- | --- | --- |
| Admin | http://localhost:5173/admin/login | `admin` / `admin-spotlight-2026` |
| Judge | http://localhost:5173/judge | `judge01` / `judge-spotlight-2026` |
| Audience display | http://localhost:5173/audience | no login needed |
| Audience vote | http://localhost:5173/vote | no login needed |

1. **Add judges** — in the admin window, add two more judges in the Judges'
   Panel and copy the credentials.
2. **Sign in as judge 2** — open a second browser profile (or a private
   window) at `/judge` and sign in with the new credentials. Both judge
   windows should now be live.
3. **Put someone on stage** — in the admin window, click **Set Active** on a
   participant. The audience window and both judge windows should show the
   name immediately.
4. **Open voting** — click **Open Voting**. The audience window should show
   the `/vote` link and that voting is open; both judge windows should show
   the score pad.
5. **Score from both judges and the audience** — submit a score in each judge
   window, then open the `/vote` link on a phone and vote. A second vote from
   the same device in the same round should be rejected, but the same device
   can vote again when the next performer is on stage.
6. **Check privacy** — the audience window must never show scores, averages
   or the leaderboard. Only the admin window shows them.
7. **Manual close** — click **Close Voting Now** when the round is over. The
   audience window should show *Voting Closed*, and the admin leaderboard
   should list any judge who did not score as *missing*.
8. **Correct a score** — in the admin window, click **Correct** on a judge's
   score, change it, and give a reason. The judge's window updates to show
   the corrected score and a *"Corrected by admin"* note.
9. **Publish** — click **Publish Final Results**. The audience window shows a
   link to the results, and http://localhost:5173/results reveals the winner.
10. **Reset** — click **Reset All Scores** to clear everything and start over.

## Notes

- The leaderboard, individual scores, and averages are only visible to authenticated admins.
- Final scores are weighted 80% judges / 20% audience. If one side has no votes,
  the other side is used alone.
- All voting logic is enforced on the server.
- Audience display shows no private scoring data until results are published.
- Change the seeded passwords before a real event: `POST /api/auth/change-password`.
