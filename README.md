# BrainMix

**Neuro-acoustic matrix + DJ studio, in the browser.**

BrainMix layers brainwave-entrainment audio (binaural beats, isochronic tones, a
40 Hz gamma boost, calm drones, and shaped noise) *underneath your own music* —
and pairs it with a real two-deck DJ studio. It runs entirely in the browser,
installs as a PWA, and keeps your audio on your device until you choose to sync
it to the cloud.

> **Scope note — current intended direction.**
> This README documents the product the codebase is actually building today: the
> literal "BrainMix" brainwave-entrainment + DJ app. That direction is inferred
> from the scaffolding (audio engine, presets, DJ console, share routes, Supabase
> schema, the AI "Engineer" endpoint) rather than from a finished spec. If the
> product intent shifts, update this section first. See **Scope & status** at the
> bottom for the alternatives that were considered and why this one was chosen.

---

## What it actually is

Two interlocking things on one page:

- **A brainwave matrix.** Six presets — Desk Flow, Poolside Chill, Archaic Reset,
  Theta Theater, Sleep / Recovery, Energy Lift — each defined by a carrier Hz, a
  beat Hz, a drone fundamental, a noise color, an LFO shape, an entrainment mode,
  and an optional BPM gate. Every preset is tagged for evidence honesty:
  **strong** (e.g. 40 Hz gamma — MIT Tsai lab, *Nature* 2016+), **mixed**, or
  **vibes** (feels good, not scientifically supported). The engine is pure Web
  Audio with no external dependencies (`lib/audioEngine.ts`).

- **A real DJ studio.** Two decks with 3-band EQ, a low-pass filter,
  pitch-preserving tempo, hot cues, beat-aware loops, BPM detection, a
  crossfader, and live recording you can save and share. A wide desktop layout
  lives at `/console`; the mobile-first experience lives at `/`.

Extra layers the engine can stack: a 0.1 Hz **breath pacer** (~6 breaths/min for
HRV/vagal tone), **EMDR** 0.5 Hz bilateral L/R panning, and a BPM-synced gamma
gate that hides the 40 Hz flutter in your track's off-beats.

## Features

- **Entrainment engine** — binaural (headphones) or isochronic (speakers),
  optional gamma boost, drone pad, brown/pink noise, breath pacer, EMDR panning.
- **DJ studio / console** — two decks, EQ, filter, tempo, hot cues, loops,
  crossfader, live recording (`lib/djBus.ts`, `app/console`).
- **Your music** — bulk import with ID3/metadata parsing and album detection,
  local IndexedDB library when signed out, cloud library when signed in.
- **Pomodoro / ultradian timer** — focus/rest cycles that swap presets and ring a
  synthesized 432 Hz bell between phases (`lib/pomodoro.ts`).
- **Session sequencer** — chain presets (and optional tracks) into a timed plan.
- **The Engineer** — a deterministic tip library plus an optional LLM advisor
  that reads your current mix state and suggests one specific change
  (`app/api/engineer`, Vercel AI SDK + AI Gateway).
- **Cloud sync & sharing** — save tracks, playlists, and recorded mixes to
  Supabase; share mixes and public playlists via tokenized links
  (`/m/[token]`, `/p/[token]`).
- **Live listening rooms** — a host broadcasts audio over WebRTC (mesh topology,
  Supabase Realtime signaling) and friends tune in (`/live`, `lib/liveRoom.ts`).
- **PWA** — installable, offline-capable shell, OS media-session integration
  (lock-screen transport controls), app shortcuts for Music / Studio / Timer.

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | Next.js 16 (App Router), React 19                   |
| Audio          | Web Audio API (no external audio deps)              |
| Styling        | Tailwind CSS v4                                      |
| Auth + data    | Supabase (Auth, Postgres + RLS, Storage, Realtime)  |
| AI             | Vercel AI SDK (`ai`) via Vercel AI Gateway          |
| Realtime audio | WebRTC (mesh) + Supabase Realtime signaling         |
| Monitoring     | Sentry (`@sentry/nextjs`)                           |
| Tests          | Vitest (unit) + Playwright (e2e/smoke)              |
| Hosting        | Vercel                                              |

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The app runs **without any keys** in a local-only mode: the entrainment engine,
DJ studio, timer, and IndexedDB library all work offline. Cloud features (auth,
sync, sharing, live rooms) and the LLM Engineer activate once their environment
variables are present.

### Environment variables

| Variable                                                              | Required for                            |
| --------------------------------------------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`           | Auth, cloud library, sharing, realtime  |
| `AI_GATEWAY_API_KEY`                                                  | The LLM Engineer (auto-provisioned on Vercel when AI Gateway is enabled) |
| `NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`                  | Reliable live rooms behind strict NAT (optional; falls back to public STUN/TURN) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, Sentry DSN                            | Error monitoring + source-map upload    |

Copy the values into `.env.local` for local dev, or run `vercel env pull` after
linking the project.

### Database

The Supabase schema lives in `supabase/migrations/` (profiles, tracks, playlists,
mixes, share tokens, live rooms — all with row-level security). Apply it to a
fresh project with the Supabase CLI:

```bash
supabase db push
```

## Scripts

| Command              | Does                                              |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Start the dev server                              |
| `npm run build`      | Production build (+ source-map upload to Sentry)  |
| `npm start`          | Serve the production build                        |
| `npm test`           | Run unit tests (Vitest)                           |
| `npm run test:watch` | Vitest in watch mode                              |
| `npm run test:e2e`   | Playwright end-to-end + smoke tests               |
| `npm run typecheck`  | `tsc --noEmit`                                     |

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, and a build on every
push and PR; a post-deploy smoke workflow pings the home page and the Engineer
endpoint after a successful deployment.

## Project layout

```
app/
  page.tsx            Mobile-first app: matrix + mixer + player + timer
  console/            Wide desktop DJ console (wired to the same engine)
  live/, m/, p/       Live rooms + shared mix / public playlist routes
  api/engineer/       LLM "Engineer" streaming endpoint (AI SDK)
  components/         UI: MusicHub, MixerSection, modals, primitives
lib/
  audioEngine.ts      Web Audio entrainment engine (the core)
  djBus.ts            Shared audio bus: decks, EQ, filter, crossfader, recording
  presets.ts          The six evidence-graded presets
  engineer.ts         Deterministic tip library + state analysis
  cloudLibrary.ts     Supabase tracks / mixes / playlists
  liveRoom.ts         WebRTC host + listener
  supabase/           Browser + server clients, hand-written DB types
supabase/migrations/  Postgres schema + RLS
test/                 Vitest unit tests + Playwright specs
```

## On the science (honest framing)

The audio engine and presets deliberately avoid overclaiming. 40 Hz gamma
stimulation has real, published neuroscience behind it; binaural/alpha/theta
effects are mixed; and tunings like 432 Hz or 528 Hz are presented as "vibes,"
not medicine. BrainMix is a focus/relaxation tool, **not** a medical device, and
makes no therapeutic claims.

## Scope & status

This repo began from a `create-next-app` template, so the scaffolding alone could
plausibly support several products. Three were considered:

1. **The literal BrainMix product (recommended, and what this README documents).**
   A brainwave-entrainment + DJ studio PWA. Every concrete artifact already points
   here: the Web Audio engine, the six graded presets, the two-deck console, the
   Supabase tracks/mixes/playlists schema with share tokens, the WebRTC live
   rooms, the "Engineer" AI advisor, and the app metadata/manifest
   ("BrainMix · Neuro-Acoustic Matrix"). Picking anything else would mean
   discarding working code.

2. **An "ecosystem dashboard."** Possible given the generic Next.js + Supabase +
   Sentry base, but nothing in `app/` or `lib/` is a dashboard — there are no
   metrics views, no admin tables, no aggregation. This would be a from-scratch
   pivot.

3. **An agent-orchestration UI.** The lone AI surface is a single streaming
   advice endpoint (`/api/engineer`) scoped tightly to mixing guidance — not an
   orchestration layer. Calling this an agent platform would overstate what
   exists.

**Recommendation:** ship option 1. The code, schema, routes, and metadata are
already a coherent v1 of BrainMix; the remaining work is polish, not redirection.

---

*BrainMix is for focus, relaxation, and play. It is not a medical device and
makes no therapeutic claims.*
