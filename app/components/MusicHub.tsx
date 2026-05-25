/**
 * MusicHub - the home view of the Music tab.
 *
 * Empty state: prominent + Import many CTA + sign-in nudge.
 * Populated: a 2-col grid of HubCards routing to Library / Playlists / Mixes.
 */

import type { User } from "@supabase/supabase-js";

interface Props {
  user: User | null;
  authConfigured: boolean;
  libraryCount: number;
  playlistsCount: number;
  mixesCount: number;
  playerActive: boolean;
  onOpenLibrary: () => void;
  onOpenPlaylists: () => void;
  onOpenMixes: () => void;
  onSignIn: () => void;
  onBulkImport: () => void;
}

export function MusicHub({
  user,
  authConfigured,
  libraryCount,
  playlistsCount,
  mixesCount,
  playerActive,
  onOpenLibrary,
  onOpenPlaylists,
  onOpenMixes,
  onSignIn,
  onBulkImport,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="pt-2">
        <h2 className="text-xl text-zinc-100 font-light mb-1">Your music</h2>
        <p className="text-xs text-zinc-500">
          Drop audio anywhere on this page to import. Stays on your device until
          you sign in to sync.
        </p>
      </div>

      {libraryCount === 0 && (
        <div className="p-5 rounded-xl border border-dashed border-[#00ffcc]/40 bg-[#00ffcc]/[0.02]">
          <div className="text-sm text-zinc-200 font-medium mb-1">
            Start with one of these
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed mb-3">
            Get your own music in — drag a folder of MP3s, or use the picker.
            Need a brain-state layer underneath? Open Studio.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={onBulkImport}
              className="h-11 rounded-lg bg-[#00ffcc] text-zinc-950 text-sm font-medium uppercase tracking-wider hover:bg-[#00ffcc]/85"
            >
              + Import many
            </button>
            {!authConfigured || !user ? (
              <button
                onClick={onSignIn}
                disabled={!authConfigured}
                className="h-10 rounded-lg border border-zinc-700 text-zinc-300 text-xs uppercase tracking-wider hover:bg-zinc-900 disabled:opacity-30"
              >
                Sign in to sync across devices
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <HubCard
          label="Library"
          count={libraryCount}
          accent="#00ffcc"
          onClick={onOpenLibrary}
          subtitle="Tracks · Albums"
        />
        {user ? (
          <HubCard
            label="Playlists"
            count={playlistsCount}
            accent="#a78bfa"
            onClick={onOpenPlaylists}
            subtitle="Yours, cloud-synced"
          />
        ) : (
          <HubCard
            label="Sign in"
            accent="#a78bfa"
            onClick={onSignIn}
            subtitle="For playlists + sharing"
          />
        )}
        {user && (
          <HubCard
            label="My Mixes"
            count={mixesCount}
            accent="#00ffcc"
            onClick={onOpenMixes}
            subtitle="Saved + shared"
          />
        )}
        <HubCard
          label="Import"
          accent="#fb7185"
          onClick={onBulkImport}
          subtitle="Add music"
        />
      </div>

      {!playerActive && libraryCount > 0 && (
        <p className="text-xs text-zinc-500 text-center pt-2">
          Open Library to pick something to play.
        </p>
      )}
    </div>
  );
}

function HubCard({
  label,
  count,
  subtitle,
  accent,
  onClick,
}: {
  label: string;
  count?: number;
  subtitle?: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border bg-zinc-900/40 hover:bg-zinc-900 transition-colors"
      style={{ borderColor: `${accent}55` }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium" style={{ color: accent }}>
          {label}
        </span>
        {count != null && (
          <span className="text-[11px] font-mono text-zinc-500">{count}</span>
        )}
      </div>
      {subtitle && (
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          {subtitle}
        </div>
      )}
    </button>
  );
}
