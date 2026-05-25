/**
 * Hand-written types matching the public schema. We could auto-generate via
 * the Supabase MCP but hand-writing keeps the file small and easy to grep.
 */

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface DBTrack {
  id: string;
  user_id: string;
  name: string;
  bpm: number | null;
  hot_cues: (number | null)[];
  loop_start: number | null;
  loop_end: number | null;
  storage_path: string;
  size: number;
  created_at: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  duration_sec: number | null;
  cover_path: string | null;
}

export interface DBPlaylist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface DBPlaylistTrack {
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: string;
}

export interface DBMix {
  id: string;
  user_id: string;
  name: string;
  duration_ms: number;
  storage_path: string;
  size: number;
  mime_type: string | null;
  is_public: boolean;
  share_token: string;
  plays: number;
  created_at: string;
}
