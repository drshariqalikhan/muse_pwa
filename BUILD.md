# muse_pwa — Build Plan

Companion to `SPECIFICATION.md`. Read the spec first.
Build in order. Do not skip a step's acceptance checks.
Commit after each passing step, with a message `step-N: ...`.

**Working rules for every step:**
- One small step at a time, well under tool timeouts (see SPEC §11 / memory: 30s tool limit — chunk long commands, verify after each).
- Verify every result independently (file list, file size, read-back, screenshot, test output) — a tool saying "done" is not proof.
- No secrets in files, prompts, logs, or screenshots. User runs all `supabase secrets set` / login / link commands themselves.
- If a step touches an open question in SPEC §13, stop and ask — do not decide silently.
- If a step fails its acceptance checks twice with the same error, stop, record the error in this file's Notes section, and ask the user — do not loop the same failing command.

**Local paths:**
- Repo on PC: `D:\muse_pwa`
- GitHub: https://github.com/drshariqalikhan/muse_pwa.git

---

## Step 0 — Repo hygiene and project setup

**Goal:** Clean, safe starting point, before any app code.

**Do:**
1. Confirm `D:\muse_pwa` contains only `.git` + `README.md` (`# muse_pwa`).
2. Create `.gitignore` (see SPEC §12.4).
3. Create `README.md` (replace the one-line README, keep the title):
   - What the app is, stack, links to SPECIFICATION.md and BUILD.md
   - How to run locally, how to deploy, where secrets live (and where they do NOT live)
4. Decide and record here: branch strategy — `main` directly, or feature branches per step? Record the decision in Notes, then stick to it.
5. Create the repo folder structure (empty files / placeholders only, no logic yet):
   ```
   index.html, app.js, chat.js, history.js, api.js, auth.js, context.js,
   config.js, styles.css, manifest.json, sw.js, icons/
   supabase/functions/chat/, supabase/functions/health/,
   supabase/functions/_shared/, supabase/migrations/, tests/
   ```

**Acceptance checks:**
- [ ] `git status` shows only intended new files, no secrets, no `.env`.
- [ ] Folder structure matches the list above.
- [ ] README mentions SPECIFICATION.md and BUILD.md.

**Tests:** None yet (structure only).
**Commit:** `step-0: repo hygiene and structure`
**Stop point:** Stop here, confirm structure with the user if unsure.

---

## Step 1 — Frontend scaffold (no backend yet)

**Goal:** A working app shell in the browser, with a fake chat UI that proves layout, Bulma, and PWA basics — before any Supabase/Gemini wiring.

**Do:**
1. `index.html`: Bulma CDN (pinned version, verify at build time), layout from SPEC §3.2 — sidebar + main chat area + composer. Script tags as ES modules.
2. `styles.css`: chat bubbles, message list scrolling, sidebar, mobile drawer only.
3. `app.js` / `chat.js` / `history.js`: in-memory only — New chat, send message (echoes a placeholder reply locally, clearly marked `TODO: replace with Edge Function call`), conversation list in memory, rename/delete with confirm.
4. `manifest.json` + `sw.js` (app-shell cache only, API never cached — SPEC §8.2). Placeholder icons in `icons/` (must exist, even if simple).
5. Serve locally: any static server (e.g. `npx serve .` or VS Code Live Server — user runs it, or Cline runs it in a way that returns quickly; do NOT run a server that blocks the tool for minutes).

**Acceptance checks:**
- [ ] Page loads locally, no console errors, Bulma styles visible.
- [ ] Send a message → placeholder reply appears, message list scrolls.
- [ ] New chat, switch chats, rename, delete (confirm) all work in memory.
- [ ] Sidebar collapses / drawer works at mobile width, no horizontal scroll.
- [ ] Service worker registers, manifest loads (check browser DevTools Application tab).

**Tests:**
- [ ] Manual smoke checklist (SPEC §9.5, frontend parts only).
- [ ] Screenshot of desktop + mobile width, saved for reference (not committed unless user wants it).

**Commit:** `step-1: frontend scaffold, no backend`
**Stop point:** Show a screenshot to the user before proceeding to backend.

---

## Step 2 — Supabase project + database

**Goal:** Real database tables exist, with migrations, and a test conversation can be read/written.

**User does (Muse does NOT do these, and must not ask for keys in chat):**
1. Create a Supabase project in the dashboard (or CLI, if already logged in).
2. Note the project URL and anon key — these go into Vercel env vars later and into local `config.js` for testing only, never the service_role key.
3. Apply migrations (below) via CLI or dashboard SQL editor.

**Muse does (via PC bridge, in `D:\muse_pwa`):**
1. Write migration `supabase/migrations/<timestamp>_create_conversations_messages.sql`:
   - `conversations` and `messages` tables exactly as SPEC §4.1, including indexes, `user_id` nullable, `summary` nullable, FK cascade.
   - RLS enabled + permissive anonymous policy, commented `TODO(auth): replace with per-user policies`.
2. Write `supabase/seed.sql`: one test conversation + 2 messages, clearly marked test data.
3. Write `config.js`: `SUPABASE_URL` and `SUPABASE_ANON_KEY` placeholders, with a comment that real values come from env / local config, never committed with real secrets if the repo is public — if the repo is public, use a local untracked config file instead and document that choice here in Notes.

**Acceptance checks:**
- [ ] Migration applies with no errors (user confirms, or CLI output shows success).
- [ ] Tables + indexes exist (check in Supabase Table Editor).
- [ ] Seed data appears, then is deletable.
- [ ] A direct Supabase query (dashboard or JS console) can list conversations.

**Tests:**
- [ ] Manual: create / read / update / delete a test conversation via dashboard.
- [ ] Record: does `updated_at` move on new message? If not, fix the trigger / Edge Function update now, not later.

**Commit:** `step-2: supabase tables and migrations`
**Stop point:** User confirms project URL + that tables exist, before Edge Functions.

---

## Step 3 — Shared context-window module + unit tests

**Goal:** The core logic from SPEC §7 exists, tested, before it is wired to Gemini or the UI.

**Do:**
1. Create `supabase/functions/_shared/context.ts` (Deno, no Supabase/Gemini imports — pure logic only, so it can be tested without network):
   - `tokens_approx(text)`
   - `buildContext({ systemPrompt, summary, history, newMessage, config })` returning `{ contents, messages_used, tokens_approx, summarised }`
   - Config defaults: `MAX_CONTEXT_TOKENS=8000`, `MAX_HISTORY_MESSAGES=40`, `SUMMARISE_AT=0.8` (env-overridable in the caller, not inside this module).
   - Algorithm exactly as SPEC §7.3, including dropping leading model messages.
2. Create tests in `tests/` (or colocated, pick one and record it):
   - `context.test.ts` covering every case in SPEC §7.5 + §9.1.
   - Run with `deno test`.
3. Do NOT write summarisation Gemini calls yet — summarisation trigger logic (flag only) is in this step; the actual Gemini summarise call is Step 5.

**Acceptance checks:**
- [ ] `deno test` passes, all context cases green.
- [ ] Empty history, over-budget history, single over-budget message, summary+recent, leading model message — all covered by a named test each.
- [ ] No network calls in these tests (mock nothing, need nothing).

**Tests:** This step IS tests. Do not proceed if any context test fails.
**Commit:** `step-3: context window module and unit tests`
**Stop point:** Show test output to the user.

---

## Step 4 — Edge Function `chat` (without Gemini first, then with)

**Goal:** Frontend → Edge Function → Supabase works, before Gemini is involved, then Gemini is added in a controlled second half.

**Part A — without Gemini (mock reply):**
1. Create `supabase/functions/chat/index.ts` (Deno):
   - Validate input (§5.2), auth placeholder stub (§10), load/create conversation, save user message, load history, build context (Step 3 module), return a mock reply `"[mock] Echo: <first 100 chars>"` with `context_messages_used` and `tokens_approx`.
   - Save the mock model message to DB, update `conversations.updated_at` + title if default.
   - CORS + OPTIONS handling (§5.3), error JSON shape (§5.2), no secrets in logs/responses.
2. Create `supabase/functions/health/index.ts`: GET, returns `{ ok, supabase: "ok"/"fail", gemini_configured: true/false }` — gemini_configured is just "is the secret name present?", never the value.
3. Deploy functions via Supabase CLI (user runs deploy if CLI login is required; Muse prepares the files and commands, user runs any login step).

**Part B — with Gemini:**
1. Add Gemini call to `chat` exactly as SPEC §6: system prompt, contents from context builder, `gemini-2.5-flash` (verify model name), `x-goog-api-key` from `Deno.env.get("GEMINI_API_KEY")`, temperature 0.7, maxOutputTokens 1024.
2. User sets the secret: `supabase secrets set GEMINI_API_KEY=...` (user only, never in chat).
3. Replace mock reply with real Gemini reply parsing + usageMetadata handling. Keep mock mode behind an env flag for tests only, clearly marked, never on in production.

**Acceptance checks — Part A:**
- [ ] POST to `chat` with a test message returns mock reply, and both messages appear in Supabase.
- [ ] Invalid input (empty, >10,000 chars) returns 400 JSON, no DB write for the invalid message.
- [ ] Unknown conversation_id returns 404.
- [ ] `health` returns ok, no secrets.

**Acceptance checks — Part B:**
- [ ] POST to `chat` with a real prompt returns a real Gemini reply, saved to DB.
- [ ] Gemini 401 (wrong key, test only if user wants to test it) returns a clean 500, no key leak.
- [ ] Frontend (Step 5) can call this function from localhost.

**Tests:**
- [ ] Deno Edge Function tests with mocked fetch + mocked Supabase (SPEC §9.2): happy path, Gemini 401/429/500, DB failure, invalid input, 404.
- [ ] Assert no secret in any test response/log output.

**Commit:** `step-4a: edge function chat, mock reply` then `step-4b: edge function chat, Gemini`
**Stop point:** Show one real Gemini reply (from a test conversation) to the user before UI wiring.

---

## Step 5 — Connect frontend to Supabase + Edge Function

**Goal:** The Step 1 UI now talks to real backend, not in-memory data.

**Do:**
1. `api.js`: single place for all calls —
   - Supabase JS client (anon key, public) for conversations/messages CRUD: list, get, create, rename, delete.
   - Edge Function `chat` POST for sending messages.
   - `health` GET for diagnostics.
   - All errors normalised to `{ error: "human message" }`.
2. `auth.js`: placeholder only (§10) — `getCurrentUser()` returns null, with TODO comments. No login UI.
3. `app.js` / `chat.js` / `history.js`: replace in-memory store with Supabase-backed store. Keep the same UI behaviour as Step 1, plus:
   - Loading / thinking indicator, Send disabled while sending.
   - Failed send → Retry button, message not lost.
   - Title update from first user message (if title is still default).
   - Sidebar ordered by `updated_at` DESC, reloaded after each send.
4. `context.js` (frontend): display helpers only — do NOT duplicate the Edge Function context algorithm here. If a helper is needed for display (e.g. approx tokens for a message), reuse the same estimate formula and comment that the authoritative logic is in the Edge Function.

**Acceptance checks:**
- [ ] Send → Gemini reply appears, both messages in Supabase, reload page → history persists.
- [ ] New chat, switch chats, rename, delete (confirm) all persist in Supabase, not just in memory.
- [ ] Reloading a conversation shows messages in correct order, user/model styling correct, HTML escaped (test with `<script>` in a message — it must show as text, not run).
- [ ] Offline / backend down → human error + Retry, no crash, no lost typed message (composer keeps the text).

**Tests:**
- [ ] Manual smoke checklist (SPEC §9.5, full).
- [ ] Integration test (SPEC §9.3): test conversation end-to-end, then delete test data.

**Commit:** `step-5: frontend connected to supabase and edge function`
**Stop point:** User tests a real chat in the browser before PWA/Vercel work.

---

## Step 6 — Context window + summarisation (real)

**Goal:** Long conversations keep working, with summarisation, not just truncation.

**Do:**
1. Wire the summarisation trigger from SPEC §7.4 into `chat`:
   - Trigger at 80% budget or over message limit.
   - Gemini summarise call (separate prompt, see SPEC §7.4), save to `conversations.summary`, rebuild window, set `summarised=true`.
   - Summarisation failure → log, proceed with truncated history, chat still replies.
2. Frontend: show a small, non-intrusive note when a reply was summarised (e.g. "Context summarised" tag on that AI message, or in diagnostics — pick one, document it). Do not show the summary text itself to the user in v1 unless the user asks for it — it is internal context, not chat history.
3. Add unit + Edge Function tests for summarisation trigger, summarisation success, and summarisation failure (SPEC §9.1/9.2).

**Acceptance checks:**
- [ ] A conversation with >40 messages, or past the token budget, still gets a coherent reply (not "context too long" error).
- [ ] After summarisation triggers once, `conversations.summary` is non-empty in Supabase.
- [ ] A later message in the same conversation still references earlier facts that were in the summary (manual check with a distinctive fact early in the chat).
- [ ] Summarisation failure (mocked in test) does not block the chat reply.

**Tests:** All new summarisation tests pass, plus all previous tests still pass (no regression).
**Commit:** `step-6: context window summarisation`
**Stop point:** Show a long-conversation test to the user.

---

## Step 7 — Diagnostics / connectivity page

**Goal:** The template proves its own connections, visibly, in the app.

**Do:**
1. Add a "Connection tests" view (sidebar link, or a separate route/page in v1 — pick one, keep it simple):
   - Check 1: Frontend loaded
   - Check 2: Supabase DB read (list conversations)
   - Check 3: Edge Function `health`
   - Check 4: Gemini via Edge Function (tiny test prompt, does NOT create a chat message — use a dedicated health path or a test flag, document which)
   - Each check: loading → pass/fail, time taken, short error category on fail, no secrets.
2. Add tests for the diagnostics page itself: mocked failure for each check shows fail, not a crash (SPEC §9.4).

**Acceptance checks:**
- [ ] All 4 checks pass on localhost with real services.
- [ ] Turning off / breaking one link (e.g. wrong Gemini secret, test only) shows that check as fail, others as pass, with no crash.
- [ ] Diagnostics page does not create junk chat conversations in history.

**Tests:** Diagnostics tests pass.
**Commit:** `step-7: diagnostics connectivity page`
**Stop point:** User sees all-green diagnostics before deploy.

---

## Step 8 — PWA polish + icons

**Goal:** Installable, offline-shell PWA, not just a manifest file.

**Do:**
1. Generate proper PWA icons (192 + 512 PNG) — simple, on-brand for a chat app, not the Muse/Bender icon from the desktop shortcut project (different project). Save to `icons/`, update `manifest.json` if needed.
2. Review `sw.js`: app-shell cache-first, API network-only, Bulma CDN cache-first with network fallback, cache version `muse-pwa-v1`, old caches deleted on activate.
3. Test installability: Chrome/Edge "Install app" on desktop, Add to Home Screen on mobile if available. Record result in Notes.
4. Test offline: open app offline → app shell + offline notice, no fake reply. Online again → chat works without reload issues (or with a documented reload step).

**Acceptance checks:**
- [ ] Manifest valid, icons present, service worker registered (DevTools).
- [ ] Install prompt / install option appears (or a documented reason why not, e.g. browser policy).
- [ ] Offline shell works, online chat works after reconnect.

**Tests:** Manual PWA checklist (SPEC §9.5, PWA parts).
**Commit:** `step-8: pwa icons and offline shell`
**Stop point:** Screenshot of installed app (if install works) to the user.

---

## Step 9 — Vercel deploy + production smoke test

**Goal:** The app works from a public Vercel URL, not just localhost.

**User does:**
1. Connect the GitHub repo to Vercel, import as static site (preset None, build none, output root — or `public/` if Step 1 decided that, record it here).
2. Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `EDGE_FUNCTION_URL` if used (public values only).

**Muse does:**
1. Ensure `config.js` reads env / config correctly for Vercel (no hardcoded localhost URLs in production code — localhost only as a dev fallback, clearly commented).
2. Push the repo, trigger a Vercel deploy, check the deploy log for errors.
3. Run the full manual smoke checklist (§9.5) against the production URL, plus diagnostics page all-green.

**Acceptance checks:**
- [ ] Production URL loads, no console errors.
- [ ] Full smoke checklist passes on production, not just localhost.
- [ ] Diagnostics page all-green on production.
- [ ] No secrets in Vercel logs, repo, or production JS bundle (anon key + URL only, by design).

**Tests:** Production smoke checklist, recorded with date + URL in Notes.
**Commit:** `step-9: vercel deploy` (or a deploy note commit, if code did not change)
**Stop point:** User confirms the production URL works from their phone / another device.

---

## Step 10 — Tests suite + CI (consolidation)

**Goal:** All tests from Steps 3–7 run together, in one command / workflow, with a clear pass/fail.

**Do:**
1. Consolidate test commands into README + a simple script (e.g. `deno test` + Node test runner, documented in order).
2. Create `.github/workflows/test.yml` (simple CI): on push/PR, run unit + Edge Function tests. Integration tests are manual only (need real secrets) — document that split in the workflow file and in README.
3. If CI cannot be set up in this step (e.g. permissions), record it as a TODO here, with the workflow file drafted but not enabled — do not claim CI exists if it does not.
4. Re-run the full suite, fix any regressions, and record the final test output in Notes.

**Acceptance checks:**
- [ ] One documented command runs the fast test suite, all green.
- [ ] CI workflow exists (or TODO recorded with reason).
- [ ] No test depends on a real login (auth placeholder still in place).

**Tests:** Full suite, all green, or failures recorded as blockers.
**Commit:** `step-10: test suite and ci`
**Stop point:** User sees the full test output before the template is called done.

---

## Step 11 — Template packaging + handover

**Goal:** Someone else (or future Shariq) can reuse this repo as a template without asking Muse what to do.

**Do:**
1. Update `README.md`: what the template is, stack, how to clone, how to set up Supabase + Vercel + Gemini (step-by-step, with links, no secrets), how to run tests, how to add auth (link to SPEC §10 future step), how to add a new feature.
2. Update `SPECIFICATION.md` if anything changed during building — spec and code must match at handover, or the difference must be listed here in Notes as a known deviation.
3. Clean up: remove test conversations / seed data from production Supabase if they are junk, remove placeholder icons if real ones replaced them, check `.gitignore` again, check no secrets in git history (if a secret was ever committed, rotate it now and record that it was rotated — do not just delete the file and hope).
4. Final git push, Vercel production smoke check one last time.

**Acceptance checks:**
- [ ] README alone is enough for a new clone to get to a working chat (tested by reading it, not by assuming).
- [ ] SPECIFICATION.md matches the built code, or deviations are listed.
- [ ] Production URL + diagnostics all-green, final time.
- [ ] No secrets in repo history (checked via `git log` / search for key patterns, as far as can be checked locally).

**Tests:** Final full suite + production smoke checklist.
**Commit:** `step-11: template packaging`
**Stop point:** Handover message to the user with: production URL, repo URL, test output summary, and next steps (auth, streaming, Markdown — SPEC §13).

---

## Future milestones (NOT v1, do not build now)

These are named here so they are not forgotten, and so v1 code does not block them. Do not start them in v1 without a new user go-ahead.

- **F-Auth:** Supabase Auth (email/password or magic link — decide then), `auth.js` real implementation, RLS per-user migration, test: user A cannot read user B's chats. See SPEC §10.3.
- **F-Streaming:** Token-by-token Gemini streaming, instead of single reply.
- **F-Markdown:** Safe Markdown rendering for AI replies, with sanitisation.
- **F-Export:** Export a conversation as text / Markdown.
- **F-Cost:** Gemini usage caps, per-user limits, usage display.
- **F-Model:** User picks Flash vs Pro, model configurable in UI.

---

## Notes

_Use this section during building. Record decisions, deviations from SPEC, test outputs, URLs, and blockers here, with dates. Do not delete earlier notes — append._

- 1 Nov 2026 — Planning: SPECIFICATION.md v0.1 and BUILD.md created before any code, at user's request. Repo at that point: only `.git` + `README.md` (`# muse_pwa`).
- Branch strategy: _to be decided in Step 0, record here._
- Vercel output directory: _to be decided in Step 1/9, record here._
- Test location (colocated vs `tests/`): _to be decided in Step 3, record here._
- Diagnostics Gemini check method (dedicated health path vs test flag): _to be decided in Step 7, record here._
