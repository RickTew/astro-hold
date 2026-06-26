# Online 2-Player (PvP) - Handoff & Architecture

Single source of truth for AstroHold's online multiplayer. Read this first
when resuming. Built in Session 25 (2026-06-26).

AstroHold is human-vs-human across **two devices over the internet** (one
player per side). That is why it needs a backend (live board-state sync).
It is NOT same-screen hot-seat.

---

## TL;DR status

- **Backend: DONE and proven end-to-end** (real anonymous logins over the
  live API: create -> join -> read, RLS isolation verified).
- **Lobby: DONE and proven live in a real browser** on production
  (`astro-hold.vercel.app/?online`): create match -> share 6-char code ->
  Supabase Realtime fires when the opponent joins -> both connected.
- **NOT built yet: the actual gameplay sync** (in-game BUILD + REVEAL). The
  lobby connects two players; nothing syncs the game itself yet.

### RESUME HERE (next session, in order)
1. **In-game BUILD + REVEAL sync** (the big one) - see "Netcode plan" below.
2. **"Play Online" button in the side picker** - the real entry point
   (currently gated behind `?online`). Do this LAST so the frozen HUD is
   never destabilized mid-build.

---

## The hub

- Shared Supabase project **"TewBit Games"**, org "Rick Tew Apps".
  - `project_id` / ref: `guwquufbifuzmphcdsdt`, region `ap-southeast-1`.
- AstroHold lives ENTIRELY in its own **`astro_hold`** schema. It never
  touches `public` (where the sibling game "Dungeon King" and others live).
- Shared `auth.users` is the player pool (AstroHold uses anonymous sign-in;
  Dungeon King doesn't use auth at all).
- Access via the Supabase MCP against that `project_id`.

## Data model (`astro_hold` schema)

- **`profiles`** - one row per player. `id` FK -> `auth.users(id)`;
  `username` (unique), `display_name`, `is_guest` (true for anon),
  `elo_rating`, `matches_played`, `matches_won`.
- **`matches`** - the shared game session. `attacker_id` / `defender_id`
  (FK -> profiles, nullable until both seated), `status`
  (`waiting`/`active`/`complete`/`abandoned`), `invite_token` (unique,
  6-char code), `current_turn`, `current_phase`, `winner_side`,
  `attacker_credits` / `defender_credits` (default 1000), `state` jsonb
  (optional authoritative snapshot). **Realtime-published.**
- **`rounds`** - one row per turn. `match_id` FK (cascade), `turn_number`,
  `attacker_ready` / `defender_ready`, `attacker_actions` /
  `defender_actions` jsonb, `replay_seed` bigint, `replay_events` jsonb,
  `winner_side`. **Realtime-published.** `unique(match_id, turn_number)`.
- **RPC `join_match(p_invite_token)`** - SECURITY DEFINER, row-locked.
  Seats the 2nd player into the open slot, flips status to `active`,
  auto-creates their guest profile. Needed because the joiner is not yet a
  participant, so a direct UPDATE is blocked by RLS.
- **Helper `is_match_participant(match_id)`** - SECURITY DEFINER, used by
  rounds RLS.

### RLS (deny-by-default, keyed on `auth.uid()`)
All policies are `to authenticated` (so `anon` is denied), no DELETE
policies anywhere. Proven via impersonation tests:
- `profiles`: read any (need opponent name/elo), write only your own row.
- `matches`: a player reads/updates only matches they're seated in; an open
  `waiting` lobby is also readable (so it can be discovered to join). A
  player can only INSERT a match seating themselves.
- `rounds`: access only via a match you're a participant in.
- Create-match = a plain client-side INSERT (RLS allows it); only JOIN
  needed the RPC.

## Prerequisites (ALL DONE - don't redo)
1. **Exposed schemas** - `astro_hold` added to the Data API. Set via SQL
   (`alter role authenticator set pgrst.db_schemas = 'public,
   graphql_public, astro_hold'` + `notify pgrst, 'reload config'` +
   `notify pgrst, 'reload schema'`). Verified live over REST. This is a
   PROJECT-WIDE setting but additive (public/Dungeon King untouched).
   NOTE: it's now an in-db override on the `authenticator` role - if anyone
   later changes Exposed Schemas in the dashboard it won't take effect
   unless they also update/remove that role setting.
2. **Anonymous sign-ins** - enabled (Authentication > Sign In / Providers).
   Project-wide but additive.
3. **Vercel env vars** - `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   set for Production + Preview (values are public; also in `.env.example`).

## Client code (all in `src/net/`)
- **`supabaseClient.ts`** - lazy `getSupabase()`, scoped to the
  `astro_hold` schema (`{ db: { schema: 'astro_hold' } }`). Reads
  `VITE_SUPABASE_*`.
- **`onlineMatch.ts`** - typed API over the proven ops:
  `ensureSignedIn()` (anonymous), `ensureProfile()`, `createMatch(side)`,
  `joinMatch(code)` (via the RPC), `getMatch(id)`, `mySideIn(match)`,
  `subscribeToMatch(id, cb)` (realtime).
- **`lobbyUI.ts`** - self-contained overlay (own DOM + scoped `.ah-lobby-*`
  styles), INDEPENDENT of HUD.ts and the game flow. `mountLobby(onReady)`;
  `onReady(match, mySide)` is THE seam where online gameplay begins.
- **`main.ts`** mounts the lobby only when the URL has `?online` (dynamic
  import, so normal players never load it - the live game is unchanged).

## Netcode plan (the next build) - host records the event stream

AstroHold's REVEAL is NON-deterministic (`Math.random` for hit/miss etc.),
so lockstep is out. Instead use the **Dungeon King pattern** (the sibling
game already does this): the host simulates and records an event log; the
guest plays it back. No determinism needed on the guest.

What already exists to build on (in `src/game/RevealPhase.ts`):
- A typed **`PieceEvent`** stream (`RevealPhase.ts:51`) emitted via
  `emit()` (`:218`): damage/kill/hit/miss/move/hack/grenade_throw(with
  coords)/... - ~80% of a recordable log.
- The reveal is precomputed into **`PlannedStep[]`** in `buildSteps()`
  (`:879`), then animated.

Proposed steps:
1. **Branch the start flow for online.** Offline path is
   `Game.onSidePicked()` (`Game.ts:386`) which sets `playerSide` and spins
   up `OpponentAI`. For online, set `playerSide` from the match seat
   (`mySideIn`) and do NOT create `OpponentAI` (the opponent is a human).
   Hook this off `lobbyUI`'s `onReady(match, mySide)`.
2. **BUILD sync.** Each player builds their own side locally; serialize
   their placements to `rounds.attacker_actions` / `defender_actions` +
   set their ready flag. Realtime tells both when both are ready.
3. **REVEAL sync (the core).** Designate the host (e.g. match creator) as
   authority. The authority has both sides' placements, runs the existing
   `RevealPhase`, captures the `PieceEvent`/step stream into a serializable
   log -> writes `rounds.replay_events` (+ `winner_side`). The guest reads
   the log and plays it back as an animation (NO re-simulation). Both see
   the same battle.
4. **End / rematch.** Write winner to `matches`, bump `profiles` W/L + elo,
   offer rematch.

Known risks / decisions to make:
- **Event capture layer.** `RevealPhase` mutates scene objects directly;
  the main work is a capture + playback layer so a battle can be recorded
  and replayed. The whole battle auto-resolves in one go, so it's one log
  per match.
- **Fairness.** With a *player* as authority, that player receives the
  opponent's placements to simulate (could peek). Fine for friendly v1; a
  neutral authority (Supabase Edge Function) would need a headless,
  deterministic resolve core - a bigger v2 refactor.
- **Hidden builds.** Both `*_actions` columns are readable by both
  participants; if builds should be secret until reveal, gate display
  client-side (or resolve server-side in v2).
- `matchmaking_queue` (random quickplay) was intentionally omitted; invite
  code covers two friends. Add when quickplay is wanted.

## Gotchas (learned the hard way)
- **HUD is FROZEN** (CLAUDE.md hard lock). The lobby is a standalone
  overlay specifically to avoid touching HUD.ts. The eventual "Play Online"
  button goes into `#side-picker` (in HUD.ts) - do it carefully, last.
- **Vercel env vars must have VALUES.** They were created empty once, so
  Vite inlined `""` and the client threw "env vars missing". The CLI
  `vercel env add` via piped stdin created EMPTY vars (CLI 53.x quirk,
  "branch undefined"). Fix that worked: Vercel REST API DELETE then POST
  fresh with `{"type":"encrypted","value":...}`, verify with
  `vercel env pull`, then REDEPLOY (env changes don't auto-rebuild; an
  empty commit triggers it).
- **Testing with two clients:** two tabs in the same browser share the
  anonymous session (= same user), so the join is blocked as "your own
  match". Use two devices, or one normal + one incognito window. For
  automated tests, drive ONE browser and act as the 2nd player via the
  Supabase MCP or a curl anonymous sign-in + `join_match`.
- **Cleaning up test data:** `delete from astro_hold.matches where
  invite_token = '...'; delete from auth.users where id in (...);` (the
  user delete cascades the profile).
- **Security:** a `vca_` Vercel CLI token was leaked to chat once via a bad
  shell expansion; Rick was asked to rotate it. Never echo `$TOKEN`.

## Deploy / test ritual
- `git push` to `main` auto-deploys (Vercel GitHub integration). Never run
  `vercel --prod`. After a push, verify the deploy is READY and test on the
  live URL (Rick tests live, not a local dev server).
- Online feature is gated behind `?online`; test at
  `astro-hold.vercel.app/?online`.
