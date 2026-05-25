/**
 * Shared formatting helpers used across UI components.
 */

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1
    ? `${Math.round(mb * 1024)} KB`
    : `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

export function formatDurationMs(ms: number): string {
  return formatTime(ms / 1000);
}
