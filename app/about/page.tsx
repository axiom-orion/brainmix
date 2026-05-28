/**
 * /about — public marketing page for brainmix. Indexable, server-rendered,
 * no auth or dynamic data. The "actual app" lives at /.
 */

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About BrainMix · Layered brainwave entrainment + DJ studio",
  description:
    "BrainMix layers binaural and isochronic tones, drones, and noise under your music — and pairs it with a real two-deck DJ studio. Evidence-graded presets, browser-only, free.",
  openGraph: {
    title: "About BrainMix",
    description:
      "Layered brainwave entrainment over your music, with a real DJ studio underneath.",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link
          href="/"
          className="text-xs uppercase tracking-wider text-zinc-500 hover:text-[#00ffcc]"
        >
          ← brainmix
        </Link>

        {/* Hero */}
        <h1 className="text-4xl md:text-5xl font-light tracking-tight mt-10 mb-3">
          Brain<span style={{ color: "var(--mint)" }}>Mix</span>
        </h1>
        <p className="text-base md:text-lg text-zinc-300 leading-relaxed mb-3">
          Layered brainwave entrainment audio over your own music. With a real
          two-deck DJ studio underneath.
        </p>
        <p className="text-sm text-zinc-500 leading-relaxed mb-12">
          Browser-only. Free. Your music stays on your device. The entrainment
          presets are graded by what the literature actually shows — strong,
          mixed, or honest vibes.
        </p>

        <div className="flex gap-3 mb-16">
          <Link
            href="/"
            className="px-5 py-3 rounded-xl bg-[#00ffcc] text-zinc-950 text-sm uppercase tracking-wider font-medium hover:bg-[#00ffcc]/85"
          >
            Open the app
          </Link>
          <Link
            href="/console"
            className="px-5 py-3 rounded-xl border border-[#a78bfa]/40 text-[#a78bfa] text-sm uppercase tracking-wider hover:bg-[#a78bfa]/10"
          >
            Desktop console
          </Link>
        </div>

        {/* What it actually is */}
        <Section title="What it actually is">
          <p>
            Two interlocking things in one page:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-3 text-zinc-400">
            <li>
              <strong className="text-zinc-200">A brainwave matrix.</strong>{" "}
              Six presets (Desk Flow, Poolside Chill, Archaic Reset, Theta
              Theater, Sleep / Recovery, Energy Lift), each defined by a
              carrier Hz, a beat Hz, a drone, a noise color, an LFO shape, an
              entrainment mode, and an optional BPM gate. Tagged{" "}
              <em>strong / mixed / vibes</em> for evidence honesty.
            </li>
            <li>
              <strong className="text-zinc-200">A real DJ studio.</strong> Two
              decks with EQ, low-pass filter, pitch-preserving tempo, 8 hot
              cues, beat-aware loops, a beat-grid overlay, a crossfader, and
              live recording with cloud sharing.
            </li>
          </ul>
        </Section>

        <Section title="Evidence honesty">
          <p>
            Most brainwave-entrainment apps oversell. We don&apos;t.
          </p>
          <Eviden style={{ color: "var(--evidence-strong)" }}>Strong evidence</Eviden>
          <p className="-mt-2">
            <strong className="text-zinc-200">40 Hz gamma</strong> is the only
            entrainment frequency with strong neuroscience — MIT&apos;s Tsai lab
            showed measurable amyloid clearance in mice (Nature, 2016+), and
            human trials are ongoing.
          </p>
          <Eviden style={{ color: "var(--evidence-mixed)" }}>Mixed evidence</Eviden>
          <p className="-mt-2">
            Alpha (8–13 Hz) for relaxed wakefulness, theta (4–8 Hz) for
            meditative states, delta (1–4 Hz) for sleep onset — these have
            some EEG correlates and small studies, but not robust replications
            yet.
          </p>
          <Eviden style={{ color: "var(--evidence-vibes)" }}>Vibes</Eviden>
          <p className="-mt-2">
            528 Hz &quot;love frequency,&quot; 432 Hz &quot;cosmic tuning,&quot;{" "}
            <em>Solfeggio</em> mythology — feels good for some people, has no
            scientific basis. Labeled as such.
          </p>
        </Section>

        <Section title="What it costs">
          <p>
            $0. No accounts required for the audio engine. Sign-in is optional
            and only unlocks: cloud-synced track library, shareable mixes,
            playlists across devices.
          </p>
        </Section>

        <Section title="Where the audio comes from">
          <p>
            You. Drag in your MP3s / M4As / FLACs. Import a folder at once.
            BrainMix never sends your audio anywhere unless you explicitly
            click <strong className="text-zinc-200">☁ Save to cloud</strong> on
            a finished mix recording.
          </p>
          <p className="mt-3">
            For best results, pair the brainwave matrix with music you already
            love — dopamine from anticipation beats entrainment alone.
          </p>
        </Section>

        <Section title="Built on">
          <p className="text-sm text-zinc-500">
            Next.js 16 · React 19 · Web Audio API · Supabase · Sentry · Vercel ·
            Tailwind 4. Open-source.
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-zinc-900 text-[11px] uppercase tracking-widest text-zinc-600 flex justify-between">
          <span>brainmix.vercel.app</span>
          <Link href="/" className="hover:text-[#00ffcc]">
            Open the app →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xs uppercase tracking-widest text-[#00ffcc] mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Eviden({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="text-[10px] uppercase tracking-widest font-mono mt-3 mb-1"
      style={style}
    >
      {children}
    </div>
  );
}
