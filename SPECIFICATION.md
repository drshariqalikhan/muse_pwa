# muse_pwa — Specification

Version: 0.1 — Planning draft, 1 Nov 2026
Status: Planning only. No code has been built from this spec yet.
Repo: https://github.com/drshariqalikhan/muse_pwa.git
Local checkout: `D:\muse_pwa`

> This document is the single source of truth for what the app is.
> `BUILD.md` in the same repo is the step-by-step plan for building it.
> If the two disagree, this spec wins, and `BUILD.md` must be updated.

---

## 1. Project overview

### 1.1 What this is

A **Chat with AI** web app, built as a **test app / reusable template**.

Its first purpose is to prove, end to end, that all of these platforms
connect and work together:

```
Browser (Vercel frontend)
  -> Supabase Edge Function (backend)
    -> Supabase Database (chat history)
    -> Google Gemini API (AI replies)
```

Its second purpose is to be a clean starting template for later apps:
same stack, same patterns, new features on top, without re-solving
frontend / backend / database / AI wiring every time.

### 1.2 What this is not (v1)

- Not a multi-user production product yet. See §10 Auth placeholder.
- Not a general AI agent with tools, file uploads, image generation,
  voice, or web search. Those are later features, not v1.
- Not a native mobile app. It is a PWA (installable web app), §8.
- Not a replacement for an existing chat product. It is a learning /
  template project first, a usable chat app second.

### 1.3 Success definition (v1)

A user can, from a Vercel URL, with no login:

1. Open the app, see a chat UI, and start a new conversation.
2. Send a message, get a Gemini reply, and see both saved.
3. Reload the page, reopen that conversation from history, and see
   the full history again.
4. Start a second conversation, and switch between conversations
   without losing either history.
5. Open the diagnostics view and see a pass/fail for each link:
   frontend, Supabase DB, Edge Function, Gemini.
6. Install the app as a PWA, and open the app shell offline
   (chat history and new AI replies still require network — see §8.4).

If any of 1–5 fails, v1 is not done, even if the UI looks finished.

---

## 2. Stack — locked for v1

| Layer | Choice | Notes |
|---|---|---|
| Frontend language | Vanilla JavaScript, ES modules, no framework, no build step | Keep the template readable. No React, Vue, Svelte, or bundler in v1. |
| CSS | Bulma CSS via CDN | Version pinned in `index.html` (see §3.4). Custom CSS only in `styles.css` for chat-specific layout. |
| Hosting (frontend) | Vercel, static site | Framework preset: None / Static. No server code on Vercel in v1. |
| Database | Supabase Postgres | Tables in §5. SQL migrations live in `supabase/migrations/`. |
| Backend | Supabase Edge Functions (Deno) | One function in v1: `chat`. See §6. |
| AI | Google Gemini API | Model: `gemini-2.5-flash` by default, configurable. Verify the model name at build time; fall back to the current Flash model if it has changed. |
| Auth | None in v1, placeholder code only | See §10. Final app WILL have Supabase Auth. |
| Tests | Deno test (Edge Functions + shared logic) + Node test runner (frontend pure logic) + manual smoke checklist | See §9. No heavy test framework in v1. |
| Version control | Git + GitHub | Repo above. Commit after each BUILD.md step that passes its checks. |

### 2.1 Key rule — secrets

- **Never in the frontend, never in the repo, never in a chat prompt or log:**
  - Gemini API key
  - Supabase service_role key
  - Any personal access token
- **Allowed in the frontend (public by design):**
  - Supabase project URL
  - Supabase anon (public) key
- **Where secrets live:**
  - Gemini key: Supabase Edge Function secret `GEMINI_API_KEY`
    (`supabase secrets set GEMINI_API_KEY=...` — run by the user, once)
  - Service role key: Edge Function environment only, if the function
    needs it. Frontend must never receive it.
- If a key is ever pasted into a file, a prompt, or a screenshot,
  rotate it and remove it from git history before proceeding.

---

## 3. Frontend specification

### 3.1 Files

```
index.html          App shell, Bulma CDN, layout, script tags
app.js              Main UI logic (ES module)
chat.js             Chat rendering + message sending logic
history.js          Conversation list, create / rename / delete
api.js              All calls to Supabase + Edge Function (single place)
auth.js             PLACEHOLDER — see §10. getCurrentUser() only.
context.js          Frontend-side helpers only (display, truncation preview).
                    The authoritative context-window logic lives in the
                    Edge Function shared module, §7.
styles.css          Chat-specific CSS only (bubbles, sidebar, layout)
manifest.json       PWA manifest, §8
sw.js               Service worker, §8
icons/              PWA icons (placeholder in v1, generated later)
```

No build step. `app.js` is loaded as `<script type="module">`.
All API URLs and public keys come from a single `config.js`
(or the top of `api.js` in v1), clearly marked, with no secrets.

### 3.2 Layout (desktop + mobile)

- Left sidebar (collapsible on mobile):
  - "New chat" button
  - Conversation list, newest first, showing title + last-updated time
  - Each item: open on click, rename (inline or prompt in v1),
    delete (with confirm dialog in v1)
  - Diagnostics link: "Connection tests" — opens §9.4 view
- Main area:
  - Header: app name "muse_pwa — Chat with AI", conversation title
  - Message list: scrollable, newest at bottom, auto-scroll on new message
    unless the user has scrolled up (then show a "Jump to latest" button)
  - Composer: textarea (Enter to send, Shift+Enter for newline),
    Send button, disabled while a reply is loading
  - Loading state: "AI is thinking…" indicator in the message list
  - Empty state: when no conversation is selected, show a welcome
    message + 3 example prompts (clicking one fills the composer)
- Responsive: sidebar becomes an overlay / drawer on narrow screens.
  Bulma columns + a small amount of custom CSS. No separate mobile app.

### 3.3 Message rendering

- Roles: `user` (right-aligned, primary colour) and `model`
  (left-aligned, neutral colour).
- Content in v1: **plain text, HTML-escaped**. No raw HTML from the
  model or the user is ever inserted with `innerHTML` unescaped.
  Code blocks: render as `<pre><code>` with escaped text in v1.
  Full Markdown rendering is a later feature, not v1.
- Each message shows: role label (You / AI), timestamp (local time),
  and, for AI messages in v1, a small "tokens (approx.)" note if the
  Edge Function returns it. No token display is required for v1 pass,
  but the data must be available from the Edge Function response.
- Failed send: show the failed user message with a "Retry" button,
  and a human error message (see §11). Do not silently drop messages.

### 3.4 Bulma

- Load Bulma from CDN in `index.html`, version pinned, e.g.
  `https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css`
  (verify the exact latest 1.x version at build time).
- Use Bulma classes for layout, buttons, inputs, and notifications.
  Do not write a custom CSS framework. `styles.css` is only for:
  chat bubbles, message list scrolling, sidebar width, and
  mobile drawer behaviour.

### 3.5 Frontend state (in-memory, v1)

```js
state = {
  currentConversationId: string | null,
  conversations: Conversation[],
  messages: Message[],
  isSending: boolean,
  // TODO(auth): currentUser, set by auth.js when login is added
}
```

- State is reloaded from Supabase on conversation open and on page load.
- No localStorage caching of messages in v1, except PWA app-shell
  caching in §8. History truth lives in Supabase, not in the browser.

---

## 4. Data model — Supabase

### 4.1 Tables

#### `conversations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `user_id` | uuid, nullable | PLACEHOLDER for auth, §10. Null in v1. Indexed. |
| `title` | text, not null, default `'New chat'` | Updated from first user message (first 50 chars, trimmed) if title is still the default. |
| `summary` | text, nullable | Context-window summary, §7.4. Null until summarisation first runs. |
| `created_at` | timestamptz, default `now()` | |
| `updated_at` | timestamptz, default `now()` | Updated on every new message in the conversation (trigger or Edge Function update — pick one, document it). |

#### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK, default `gen_random_uuid()` | |
| `conversation_id` | uuid, FK -> `conversations.id` ON DELETE CASCADE, not null | Indexed. |
| `role` | text, not null, check `role in ('user', 'model')` | No other roles in v1. System prompt is NOT stored as a message. |
| `content` | text, not null | Full message text. |
| `tokens_approx` | int, nullable | Frontend / Edge Function estimate (chars / 4, §7.2). For display and budgeting only, not billing. |
| `created_at` | timestamptz, default `now()` | Ordering key: `created_at ASC, id ASC`. |

### 4.2 Indexes and constraints

- `messages(conversation_id, created_at)` — history loading.
- `conversations(user_id, updated_at DESC)` — history sidebar.
- `conversations.updated_at` must move on new messages, or the
  sidebar order will be wrong. Test this explicitly (§9).

### 4.3 Row Level Security (RLS) — v1 vs final

- **v1 (no login):** RLS enabled, with a permissive policy for
  anonymous access to conversations/messages, clearly commented as
  `TODO(auth): replace with per-user policies`. This is a test app
  only — do not put private data in v1.
- **Final (with login):** RLS policies restrict rows to
  `auth.uid() = user_id`. The migration for this is a named future
  step in BUILD.md, not v1. Do not enable per-user RLS in v1 and
  then break the no-login flow; do it as its own step, with tests.

### 4.4 Migrations

- Every schema change is a new file in `supabase/migrations/`,
  named `YYYYMMDDHHMMSS_description.sql`, never an edit to an
  already-applied migration.
- A `supabase/seed.sql` (or seed step in BUILD.md) creates one test
  conversation + 2 messages for local smoke testing, clearly marked
  as test data, deletable.

---

## 5. Edge Functions specification

### 5.1 Functions in v1

| Function | Method | Purpose |
|---|---|---|
| `chat` | POST | Main chat completion. See §5.2. |
| `health` | GET | Diagnostics only. Returns `{ ok: true, supabase: "ok"/"fail", gemini_configured: true/false }`. Must NOT return any secret, key, or full error stack. |

No other functions in v1. A future `summarise` function is NOT
separate in v1 — summarisation happens inside `chat`, §7.4.

### 5.2 `POST /functions/v1/chat` — contract

**Request (JSON):**

```json
{
  "conversation_id": "uuid-or-null",
  "message": "user message text"
}
```

- If `conversation_id` is null, create a new conversation first,
  then proceed.
- `message` must be a non-empty string, max 10,000 chars in v1.
  Longer input returns 400 with a clear error, it is not truncated
  silently.

**Success response (JSON, 200):**

```json
{
  "conversation_id": "uuid",
  "reply": "AI reply text",
  "tokens_approx": 1234,
  "context_messages_used": 12,
  "summarised": false
}
```

**Error responses (JSON, always):**

```json
{ "error": "human-readable message, no secrets, no stack" }
```

Status codes: 400 bad input, 401/403 auth placeholder (see §10,
not enforced in v1), 500 Gemini or DB failure, 502 Gemini
unreachable, 429 rate limit (placeholder, see §11.3).

**Steps inside `chat` (in order, no step skipped):**

1. Validate input. Reject empty / over-long messages (400).
2. Auth placeholder: call `auth.js` stub (§10). In v1 it allows
   the request and records `user_id = null`.
3. Load or create the conversation. If the ID does not exist, 404.
4. Save the user message to `messages` (role `user`).
5. Load history for that conversation, ordered oldest first.
6. Build the context window (§7). Record how many messages were
   used, and whether summarisation ran.
7. Call Gemini (§6) with system prompt + context + new message.
8. On Gemini success: save the model message (role `model`),
   update `conversations.updated_at` (and title if still default),
   return the success response above.
9. On Gemini failure: do NOT save a fake model message. Return
   the error response. The user message stays saved, so Retry
   can re-use it without re-typing (frontend Retry uses the
   same conversation + a "retry last" path — see BUILD.md Step 4).
10. Never log the Gemini key, the service_role key, or full
    request headers. Log only: conversation_id, message count,
    context size, Gemini status code, and error category.

### 5.3 CORS

- Allow the Vercel frontend origin + `http://localhost:*` for
  local testing in v1. Do not use `*` in the final app without
  revisiting it — note it as a TODO in the function code.
- Handle `OPTIONS` preflight correctly, or the browser will block
  every chat call and the failure will look like a Gemini failure.

---

## 6. Gemini API specification

- Endpoint (v1): `POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent`
  with header `x-goog-api-key: <GEMINI_API_KEY>` (from Edge Function
  secret, never from the frontend).
- Model: `gemini-2.5-flash` by default, overridable by Edge Function
  env `GEMINI_MODEL`. Verify the model name at build time.
- Request body (v1, simplified):

```json
{
  "system_instruction": { "parts": [{ "text": "You are a helpful chat assistant in the muse_pwa test app. Answer clearly and concisely." }] },
  "contents": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] }
  ],
  "generationConfig": { "temperature": 0.7, "maxOutputTokens": 1024 }
}
```

- Role mapping: Supabase `user` -> Gemini `user`, Supabase `model`
  -> Gemini `model`. The first content item must be a `user` role
  for Gemini — if history starts with a model message after
  truncation, drop leading model messages until the first is `user`.
- Response parsing: read `candidates[0].content.parts[].text`
  joined, and `usageMetadata` if present (for display / budgeting,
  not required for v1 pass).
- Failure handling: Gemini 400 (bad request) -> 500 to frontend with
  "AI request was invalid"; 401/403 -> 500 with "AI key / permission
  problem — check the Edge Function secret"; 429 -> 429 with
  "AI rate limit, try again shortly"; 500/503 -> 502 with
  "AI service temporarily unavailable". Never forward Gemini's raw
  error body to the frontend if it could contain key material.

---

## 7. Context window specification

This is the core logic of the app, and it must be testable in
isolation (§9.1). It lives in a shared module used by the Edge
Function, e.g. `supabase/functions/_shared/context.ts`, with the
same algorithm documented here and in code comments.

### 7.1 Inputs

- `systemPrompt`: string, fixed in v1 (see §6).
- `summary`: string | null, from `conversations.summary`.
- `history`: Message[] ordered oldest first, excluding the new
  user message (which is appended last by the caller).
- `newMessage`: string.
- Config (env-overridable, defaults in code):
  - `MAX_CONTEXT_TOKENS = 8000` (input budget for history + new message, excluding system prompt in v1 — document if this changes)
  - `MAX_HISTORY_MESSAGES = 40`
  - `SUMMARISE_AT = 0.8` (80% of budget)

### 7.2 Token estimation (v1)

- `tokens_approx(text) = ceil(charCount / 4)`.
- This is an estimate, not a billing count. Document it as such
  everywhere it is shown. If Gemini returns `usageMetadata`,
  prefer that for display, but keep the estimate for budgeting
  before the call.

### 7.3 Building the window (algorithm, in order)

1. Start with an empty list.
2. If `summary` exists, it counts as context first (not as a
   chat message — it is prepended as a separate user-role note
   to Gemini, clearly labelled "Previous conversation summary:").
3. Walk history newest-first, adding messages until either
   `MAX_HISTORY_MESSAGES` or `MAX_CONTEXT_TOKENS` (including
   the new message) would be exceeded. Stop before exceeding.
4. Reverse the kept messages back to oldest-first order.
5. Drop leading `model` messages, so the first content item is
   `user` (Gemini requirement, §6).
6. Append the new user message last.
7. Return: `contents`, `messages_used`, `tokens_approx`,
   `summarised` (false at this stage).

### 7.4 Summarisation trigger

- If, before building, the full history estimate exceeds
  `SUMMARISE_AT * MAX_CONTEXT_TOKENS`, OR history length exceeds
  `MAX_HISTORY_MESSAGES` by a large margin, then:
  1. Take the oldest messages that would otherwise be dropped.
  2. Call Gemini once with a summarisation prompt:
     "Summarise this conversation history concisely, preserving
     facts, decisions, names, and open questions."
  3. Save the resulting summary to `conversations.summary`,
     overwriting the previous summary (or appending, if the
     previous summary exists — pick one in code and document it;
     v1 default: replace with a new summary that includes the
     old summary as input).
  4. Rebuild the window using the new summary + recent messages.
  5. Set `summarised = true` in the response.
- Summarisation failure must NOT block the chat: log it, keep
  the old summary (or null), and proceed with truncated history.
  The user still gets a reply.
- Summarisation is NOT a separate user-visible message in history.
  It is stored only in `conversations.summary`.

### 7.5 Edge cases (must be tested, §9)

- Empty history (first message in a conversation).
- History of exactly 1 user message.
- A single message longer than the whole budget (send it alone,
  do not crash, do not silently drop it).
- History starting with a model message after truncation.
- Summary present + recent history, both together.
- Gemini returns no candidates (treat as 502, no fake message saved).

---

## 8. PWA specification

### 8.1 Manifest (`manifest.json`)

- `name`: "muse_pwa — Chat with AI"
- `short_name`: "muse_pwa"
- `start_url`: "/"
- `display`: "standalone"
- `background_color` / `theme_color`: pick one dark neutral pair
  and document it (Bulma-compatible, no bright clash).
- `icons`: 192x192 and 512x512, PNG, in `icons/`. Placeholder
  icons in v1 are acceptable, but they must exist or installability
  checks will fail. Generating proper icons is a named BUILD.md step.

### 8.2 Service worker (`sw.js`)

- Cache strategy v1:
  - App shell (`/`, `index.html`, `app.js`, `chat.js`, `history.js`,
    `api.js`, `styles.css`, `manifest.json`): cache-first, update
    on new service worker version.
  - API calls (Supabase, Edge Functions, Gemini via Edge Function):
    **never cached** — network-only, always.
  - Bulma CDN CSS: cache-first, with a network fallback.
- Version the cache (e.g. `muse-pwa-v1`) and delete old caches
  on `activate`.
- Offline: if the user opens the app offline, show the app shell
  + an offline notice. Do not fake a chat reply offline. Chat
  requires network — say so in the UI, do not hide it.

### 8.3 Installability checklist (v1 pass)

- Manifest valid, icons present, service worker registered,
  served over HTTPS (Vercel provides this in production).
- Test on desktop Chrome/Edge "Install app" and on mobile
  "Add to Home Screen" if available. Record the result in BUILD.md.

### 8.4 What offline does NOT do (v1)

- No offline chat, no queued messages, no offline history sync.
  Those are later features. Offline = app shell only, with a
  clear notice.

---

## 9. Tests specification — included in the design

Tests are not a later phase. Every BUILD.md step that adds logic
also adds or updates tests for that logic, and the step does not
pass until its tests pass.

### 9.1 Unit tests (pure logic, no network)

Location: `tests/` + colocated `*.test.ts` / `*.test.js` for the
shared module, as decided at build time — pick one location and
stick to it.

Must cover, at minimum:

- `tokens_approx`: empty string, short text, long text.
- Context builder: empty history, 1 message, exactly at budget,
  over budget (oldest dropped first), summary + recent messages,
  leading model message dropped, single over-budget message.
- Summarisation trigger: below threshold (no summarise),
  above threshold (summarise flag), summarisation failure
  (chat still proceeds).
- Message validation: empty, whitespace-only, over 10,000 chars,
  valid message.

Run with: `deno test` for Deno/shared code, and Node's built-in
test runner for frontend pure JS if the same logic is duplicated
— preferably, share the module, do not duplicate the algorithm
in two places with two test suites that can drift.

### 9.2 Edge Function tests (Deno, mocked)

- Mock `fetch` for Gemini, mock Supabase client (in-memory
  conversations/messages).
- Cases: happy path (save user, call Gemini, save model, return
  reply); Gemini 401; Gemini 429; Gemini 500; DB write failure;
  invalid input (empty, too long); conversation not found (404);
  auth placeholder allows v1 request (and is marked TODO).
- Assert: no secret appears in any response body, log, or error
  message in the test output.

### 9.3 Integration tests (real services, test data only)

- Run against a Supabase test project / test tables if available,
  otherwise against the dev project with a clearly-marked test
  conversation that is deleted afterwards.
- Cases: create conversation -> send message -> reply saved ->
  reload history -> both messages present -> second conversation
  does not leak into the first.
- Gemini integration test: one real Gemini call with a tiny
  prompt ("Say hello"), assert a non-empty reply and no secret leak.
  This test is allowed to be slow and is marked as integration-only,
  not part of the fast unit suite.

### 9.4 Diagnostics / connectivity page (in-app test)

- A view in the app (link in sidebar: "Connection tests") that runs:
  1. Frontend loaded (always pass if the page loaded)
  2. Supabase DB read (list conversations, or a `health` query)
  3. Edge Function `health` endpoint
  4. Gemini via Edge Function (tiny test prompt, or a dedicated
     `health` path that does NOT consume a full chat message)
- Each check shows: pass / fail, time taken, and a short error
  category if it failed. No secrets shown.
- This page IS the template's connectivity proof, and it must
  be tested itself (mocked failure for each check shows fail,
  not a crash).

### 9.5 Manual smoke checklist (every milestone)

- Send a message, get a reply, reload, history persists.
- New chat, switch chats, rename, delete (with confirm).
- Long conversation (>40 messages, or past the token budget):
  context still works, summary appears if triggered, reply still arrives.
- Offline: open app shell offline, see offline notice, no fake reply.
- Mobile width: sidebar drawer works, composer usable, no horizontal scroll.
- Vercel production URL: same smoke checklist, not just localhost.

### 9.6 CI (GitHub Actions, v1 — simple)

- On push / pull request: run unit tests + Edge Function tests.
  Integration tests run manually, not on every push (they need
  real secrets). Document this split in the workflow file.
- If CI is not set up in v1, record it as a TODO in BUILD.md with
  the workflow file as a named future step — do not claim CI exists
  if it does not.

---

## 10. Auth placeholder specification

Final app WILL have login (Supabase Auth). v1 will NOT, but v1
must not make login hard to add later.

### 10.1 What must exist in v1

- `auth.js` with:
  ```js
  // TODO(auth): replace with Supabase Auth
  export async function getCurrentUser() { return null; }
  export async function requireUser() { return null; }
  ```
  All other code calls `getCurrentUser()`, never assumes a user
  object shape beyond `{ id: string | null }`.
- `conversations.user_id` nullable (see §4.1), and every query
  that will later filter by user is written with a comment:
  `// TODO(auth): filter by user_id when login is added`.
- Edge Function `chat`: an `authCheck()` stub at the top, which
  in v1 allows the request, with a comment showing where JWT
  verification will go.
- RLS: permissive anonymous policy in v1, with a comment and a
  named migration task for per-user policies (§4.3).

### 10.2 What must NOT exist in v1

- No login UI, no signup form, no password handling, no session
  storage. A fake login form that does nothing is worse than no
  form — do not add one.
- No `user_id` assumed to be non-null anywhere. If code breaks
  on `user_id = null`, that code is wrong for v1.

### 10.3 Future auth step (not v1, named in BUILD.md)

- Enable Supabase Auth (email + password, or magic link — decide
  then, do not decide now in code).
- Replace `auth.js` stubs with real Supabase Auth calls.
- Add RLS migration: `auth.uid() = user_id`.
- Backfill / delete test conversations with `user_id = null`,
  or assign them to a test user — decide then, document then.
- Re-run all tests, including a new test: user A cannot read
  user B's conversations.

---

## 11. Errors, limits, and non-functional requirements

### 11.1 Error handling — user-facing

- Every failure shows a short, human message in the chat UI,
  plus a Retry button where retry makes sense. Never show a raw
  stack trace, a secret, or a full API error body to the user.
- Categories (frontend must distinguish these, even if the
  wording is simple):
  - Network offline / Supabase unreachable
  - Edge Function error
  - Gemini error (key, quota, service down — without leaking which)
  - Input error (empty, too long)

### 11.2 Loading and empty states

- Sending state disables Send, shows thinking indicator.
- No conversations: sidebar shows "No chats yet — start a new chat".
- No messages in a conversation: main area shows welcome + examples.
- Diagnostics page: each check shows loading, then pass/fail.

### 11.3 Rate limiting (v1 — placeholder)

- No hard rate limiting in v1, except Gemini's own limits and
  the 10,000-char input limit (§5.2).
- Add a TODO in the Edge Function for a simple per-conversation /
  per-IP limit later. Do not build a full rate limiter in v1.

### 11.4 Performance targets (v1, soft)

- First page load (Vercel, cached): under 2 seconds on a normal
  broadband connection, excluding AI reply time.
- AI reply: whatever Gemini takes, with a visible thinking
  indicator — do not fake a fast reply, do not timeout the UI
  before 60 seconds. If Gemini takes longer than 60s, show a
  timeout message and allow Retry.
- History load for a normal conversation (<100 messages):
  under 1 second after the DB query returns.

### 11.5 Accessibility (v1, basic)

- All buttons have text labels or aria-labels. Composer is
  keyboard-accessible (Tab, Enter to send). Colour is not the
  only signal for user vs AI messages (also alignment + label).
- Full WCAG audit is out of scope for v1, but basic keyboard
  and label work must not be broken.

---

## 12. Deployment specification

### 12.1 Vercel (frontend)

- Connect the GitHub repo to Vercel, import as a static site.
- Root directory: repo root. Build command: none. Output: repo root
  (or `public/` if the build step moves files there — decide at
  build time and document it, do not have two truths).
- Environment variables (public, safe in Vercel):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `EDGE_FUNCTION_URL` (or derive it from `SUPABASE_URL` +
    `/functions/v1/chat` — pick one, document it)
- Every push to `main` deploys. Verify the production URL with
  the §9.5 smoke checklist, not just localhost.

### 12.2 Supabase (backend + DB)

- Project created by the user in the Supabase dashboard (or CLI).
- Apply migrations in order, via CLI or dashboard SQL editor.
- Deploy Edge Functions via CLI: `supabase functions deploy chat`
  and `supabase functions deploy health` (if health is separate).
- Set secrets via CLI (user runs this, Muse never sees the values):
  `supabase secrets set GEMINI_API_KEY=...`
- Record the Supabase project URL and function URLs in a local
  (not committed) notes file or in Vercel env vars only — never
  commit a service_role key or Gemini key to the repo.

### 12.3 Git workflow

- Branch: work on `main` for v1 template, or a short-lived
  feature branch per BUILD.md step — pick one at Step 0 and
  stick to it. Do not mix both without saying so.
- Commit message style: `step-N: short description` matching
  BUILD.md step numbers, so history maps to the plan.
- Push after each passing step. Do not push a step that fails
  its acceptance checks, and do not push secrets (see §2.1 —
  check `.gitignore` before the first push).

### 12.4 `.gitignore` (must exist before first push)

```
node_modules/
.DS_Store
.env
.env.local
supabase/.temp/
*.log
```

Plus any local Supabase CLI config that contains keys. If in doubt,
do not commit it — ask, or leave it out and document it.

---

## 13. Open questions — decided later, not in v1 code

These are intentionally NOT decided in v1. Do not guess them in code.

1. Supabase Auth method: email+password vs magic link vs OAuth?
2. Full Markdown rendering: which library, if any, and how to
   sanitise it safely?
3. Streaming replies (token-by-token) vs single reply: v1 is
   single reply only. Streaming is a later feature.
4. Conversation sharing / export: later.
5. Cost controls: Gemini usage caps, per-user limits: later, with auth.
6. Multi-model choice (user picks Flash vs Pro): later, model is
   fixed in v1 config.

If a BUILD.md step touches one of these, it must stop and ask,
not decide silently.

---

## 14. Glossary

- **Context window:** the set of messages (plus summary, plus
  system prompt) actually sent to Gemini for one reply. See §7.
- **Edge Function:** server-side code running on Supabase (Deno),
  not in the browser, where secrets can live safely.
- **Template:** this repo, intended to be copied / reused for
  later apps with the same stack.
- **Placeholder (auth):** code that exists so a future feature
  has a place to plug in, but does not implement that feature yet.
