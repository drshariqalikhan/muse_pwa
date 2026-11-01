# muse_pwa — Chat with AI

A Chat with AI web app, built as a test app / reusable template.

Its purpose is to prove, end to end, that Vercel (frontend), Supabase
(database + Edge Functions), and Google Gemini (AI) all connect and work
together — and to be a clean starting template for later apps on the same stack.

## Stack

- Frontend: vanilla JavaScript (ES modules, no framework, no build step), Bulma CSS, hosted on Vercel as a static site
- Database: Supabase Postgres
- Backend: Supabase Edge Functions (Deno)
- AI: Google Gemini API, called server-side only from an Edge Function
- Auth: none in v1, placeholder code only — final app will have Supabase Auth (see SPECIFICATION.md §10)

## Documents

- `SPECIFICATION.md` — granular specification, the single source of truth for what the app is
- `BUILD.md` — step-by-step build plan, with acceptance checks, tests, and commit messages per step

Read the spec first. Build in BUILD.md order. Do not skip a step's acceptance checks.

## Run locally (after Step 1)

Serve the repo root as a static site, for example with a static server, then open it in a browser. No build step in v1.

## Secrets — read this first

Never commit, paste into a prompt, or screenshot:
- Gemini API key
- Supabase service_role key
- Any personal access token

Allowed in the frontend (public by design):
- Supabase project URL
- Supabase anon (public) key

Gemini key lives only as a Supabase Edge Function secret, set by the project owner with:
`supabase secrets set GEMINI_API_KEY=...`

See SPECIFICATION.md §2.1 for the full rule.
