# Join flow debug trace (local)

This note records how `joinGroupWithInvite` results map to branches in `src/lib/actions/auth.ts`, what the client sends, and how to interpret “server error” vs structured `{ error, code }` responses.

## Reproduction status (2026-04-11)

- **Vitest:** `npm test` — 28 tests passed, including `join-group-with-invite.test.ts` and `auth-login.test.ts` (logic and mocked integration).
- **Dev server:** `npm run dev` — `/join` loads; invite `LEGENDS2026` (from `prisma/seed.ts`) debounces and loads team tiles; hidden `homeTeamId` is set when a tile is selected (`join-form.tsx`).
- **Full browser submit:** Not completed via automated browser (password field did not appear in the accessibility snapshot as a focusable ref). Use DevTools → Network on the server-action POST to capture the real JSON payload and response when debugging a user report.

## Client payload (`submitJoin` → `joinGroupWithInvite`)

| Field | Source | Notes |
| --- | --- | --- |
| `inviteCode` | `FormData` `inviteCode` | Always sent as string. |
| `displayName` | `displayName` | Omitted or `undefined` when empty — **triggers new-user validation** if no session. |
| `password` | `password` | Omitted when empty; new users need ≥ 4 chars (server + `passwordReady` on client). |
| `homeTeamId` | Hidden input `name="homeTeamId"` | Bound to React state `homeTeamId` (team **franchise** `id` from `getEligibleHomeTeams`, e.g. `seed_team_csk`). Empty until a tile is chosen when teams are shown. |

**Session branching:** If `fanbet_session` is present and `verifySessionToken` resolves, the server uses `joinWithExistingSession` and does **not** require `displayName` / `password` in the payload for a new membership (it still requires `homeTeamId` when creating membership).

## `error` / `code` → branch in `auth.ts`

Structured failures return `{ ok: false, error: string, code?: ... }`. Anything that **throws** (e.g. uncaught Prisma error) surfaces as a Next.js server-action error (“Server Components” / digest), not this shape — treat that as infra/exception, not a business `code`.

| `code` (if set) | Typical `error` text | Branch |
| --- | --- | --- |
| `RATE_LIMIT` | `Too many attempts. Try again later.` | `checkInviteRateLimit` false after `getClientRateLimitKey()`. |
| `VALIDATION` | `Invalid input.` | `JoinSchema.safeParse` failed. |
| `INVALID_INVITE` | `That invite code is not valid.` | `findGroupByInviteCode` returned null. |
| `VALIDATION` | `Enter a display name to join.` | New-user path: missing/blank display name. |
| `VALIDATION` | `Choose a password of at least 4 characters.` | New-user path: password missing/short. |
| `VALIDATION` | `This display name is already taken in this group. Sign in on the login page to continue.` | New-user path: name matches existing member in group (not banned). |
| `BANNED` | `You are not allowed to join this league.` | New-user “existing member” branch with league ban, or session user with ban. |
| `NAME_TAKEN` | `That display name is already taken. Sign in or pick another name.` | New user: global password-user name collision. |
| `VALIDATION` | `Choose your home IPL team for this league.` | New-user path: missing `homeTeamId`. |
| `VALIDATION` | (from `validateHomeTeamChoice`) | New-user path: team not allowed for league. |
| `VALIDATION` | `Session expired. Enter your invite code and display name again.` | Session path: user id from JWT not found — cookie cleared. |
| `BANNED` | `You are not allowed to join this league.` | Session path: `leagueBan` present. |
| `ALREADY_IN_LEAGUE` | `You already belong to another group in this league...` | Session path: other group in same league. |
| `NAME_TAKEN` | `Another member in this group already uses that display name.` | Session path: duplicate name vs another member. |
| `VALIDATION` | `Choose your home IPL team for this league.` | Session path: missing `homeTeamId` for new membership. |
| `VALIDATION` | (from `validateHomeTeamChoice`) | Session path: invalid team. |

Success: `{ ok: true, groupId, userId, wasExistingMember }` — `setSessionCookie` runs on success (and when refreshing session for existing member).

**Teams list (separate action):** `getLeagueTeamsForInvite` uses `INVALID_INVITE` | `NO_TEAMS` | `LOAD_FAILED` — surfaced in the join UI as `teamsError`, not as `JoinGroupResult`.

## `router.refresh()` vs cookie / env

- **Cookie:** `setSessionCookie` is awaited before the action returns; the response should carry `Set-Cookie`. In **production**, `secure: true` — joining over plain HTTP drops the cookie. **`AUTH_SECRET`** must be ≥ 32 chars in production (`session-token.ts`); mismatched secrets across instances break verification.
- **Stale UI after redirect:** `join-form.tsx` only calls `router.push(\`/group/${state.groupId}\`)` after success. Elsewhere (`bet-form.tsx`), successful mutations also call `router.refresh()` so RSC trees re-read cookies. If users report “redirected but still looks logged out,” try **`router.refresh()` before or after `router.push`** and confirm whether the shell updates — this is the most likely client-side fix when server actions and tests already succeed.
- **Conclusion:** With all Vitest join/login tests passing, remaining “other” symptoms are likely **transport/env** (HTTPS, `AUTH_SECRET`), **session branch** (unexpected cookie → different code path), **empty `homeTeamId`** (submit race before tile select), or **missing RSC refresh** — not undiscovered logic branches covered by the suite.

## Mobile browser smoke (viewport emulation, 2026-04-11)

These checks used **desktop Chromium** with resized viewports — they approximate layout and JS behavior on phones but are **not** substitutes for real **iOS Safari**, **Chrome Android**, or **WebView** (different engines, touch delays, and cookie/storage quirks).

| Viewport | Size (CSS px) | `/join` | `/login` |
| --- | --- | --- | --- |
| iPhone-class | 390×844 | Page loads; invite field works; debounced `getLeagueTeamsForInvite` returns — all 10 team tiles render and are focusable; **Join group** stays disabled until name/password/home pick (expected). | Page loads; **Sign in** and fields present; form usable. |
| Android-class | 412×915 | Same as iPhone-class for invite + team grid + disabled submit gate. | Not re-run separately; same engine — behavior matches iPhone-class snapshot. |

**What this does *not* prove:** Safari-specific issues (ITP, `SameSite`, date inputs), Samsung Internet, in-app browsers (Instagram, etc.), or gesture/virtual-keyboard overlap with fixed footers. For release confidence on **iPhone** and **Android**, run a manual pass on physical devices or a device lab (BrowserStack, LambdaTest, etc.) against your preview URL over **HTTPS** so `secure` session cookies behave like production.
