/**
 * Cloud-backed track + mix library. Uses Supabase storage + RLS-protected
 * tables. Shape mirrors lib/trackLibrary.ts so the UI can swap libraries
 * based on auth state.
 */

import { getSupabaseClient } from "./supabase/client";
import type { DBTrack, DBMix, DBPlaylist } from "./supabase/types";

export interface CloudTrack {
  id: string;
  name: string;
  bpm: number | null;
  hotCues: (number | null)[];
  loopStart: number | null;
  loopEnd: number | null;
  size: number;
  storagePath: string;
  createdAt: string;
  artist: string | null;
  album: string | null;
  year: number | null;
  durationSec: number | null;
  coverPath: string | null;
}

export interface CloudMix {
  id: string;
  name: string;
  durationMs: number;
  storagePath: string;
  size: number;
  mimeType: string | null;
  isPublic: boolean;
  shareToken: string;
  plays: number;
  createdAt: string;
}

function fromDBTrack(t: DBTrack): CloudTrack {
  return {
    id: t.id,
    name: t.name,
    bpm: t.bpm,
    hotCues: t.hot_cues ?? [null, null, null, null],
    loopStart: t.loop_start,
    loopEnd: t.loop_end,
    size: t.size,
    storagePath: t.storage_path,
    createdAt: t.created_at,
    artist: t.artist,
    album: t.album,
    year: t.year,
    durationSec: t.duration_sec,
    coverPath: t.cover_path,
  };
}

function fromDBMix(m: DBMix): CloudMix {
  return {
    id: m.id,
    name: m.name,
    durationMs: m.duration_ms,
    storagePath: m.storage_path,
    size: m.size,
    mimeType: m.mime_type,
    isPublic: m.is_public,
    shareToken: m.share_token,
    plays: m.plays,
    createdAt: m.created_at,
  };
}

function inferExt(name: string, mime: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return m[1].toLowerCase();
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

// ────────────────────────────────────────────────────────────────────
// Tracks
// ────────────────────────────────────────────────────────────────────

export async function listCloudTracks(): Promise<CloudTrack[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("tracks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DBTrack[]).map(fromDBTrack);
}

export async function uploadTrack(params: {
  userId: string;
  name: string;
  blob: Blob;
  bpm: number | null;
  hotCues: (number | null)[];
  loopStart: number | null;
  loopEnd: number | null;
  artist?: string | null;
  album?: string | null;
  year?: number | null;
  durationSec?: number | null;
  /** Base64 cover art - we upload it to storage as a sibling object. */
  coverDataUrl?: string | null;
}): Promise<CloudTrack> {
  const sb = getSupabaseClient();
  const trackId = crypto.randomUUID();
  const ext = inferExt(params.name, params.blob.type || "");
  const path = `${params.userId}/${trackId}.${ext}`;

  const { error: upErr } = await sb.storage
    .from("tracks")
    .upload(path, params.blob, {
      contentType: params.blob.type || "audio/*",
      upsert: false,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // Optional: upload cover art as a sibling object in the same bucket.
  let coverPath: string | null = null;
  if (params.coverDataUrl) {
    try {
      const fetched = await fetch(params.coverDataUrl);
      const coverBlob = await fetched.blob();
      const coverExt = coverBlob.type.includes("png") ? "png" : "jpg";
      const cPath = `${params.userId}/${trackId}.cover.${coverExt}`;
      const { error: cErr } = await sb.storage
        .from("tracks")
        .upload(cPath, coverBlob, {
          contentType: coverBlob.type || "image/jpeg",
          upsert: false,
        });
      if (!cErr) coverPath = cPath;
    } catch {
      /* cover upload is best-effort */
    }
  }

  const { data, error } = await sb
    .from("tracks")
    .insert({
      id: trackId,
      user_id: params.userId,
      name: params.name,
      bpm: params.bpm,
      hot_cues: params.hotCues,
      loop_start: params.loopStart,
      loop_end: params.loopEnd,
      storage_path: path,
      size: params.blob.size,
      artist: params.artist ?? null,
      album: params.album ?? null,
      year: params.year ?? null,
      duration_sec: params.durationSec ?? null,
      cover_path: coverPath,
    })
    .select()
    .single();
  if (error) {
    await sb.storage.from("tracks").remove([path]);
    if (coverPath) await sb.storage.from("tracks").remove([coverPath]);
    throw new Error(error.message);
  }
  return fromDBTrack(data as DBTrack);
}

export function trackCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  const sb = getSupabaseClient();
  // Cover path is in the private 'tracks' bucket; mint a signed URL.
  // For simplicity we use a long-lived signed URL via createSignedUrl. We'll
  // generate a fresh one each render - it's cheap.
  return null; // populated by signed URL fetch in the page
}

export async function signCoverUrl(coverPath: string): Promise<string | null> {
  const sb = getSupabaseClient();
  const { data } = await sb.storage
    .from("tracks")
    .createSignedUrl(coverPath, 3600);
  return data?.signedUrl ?? null;
}

export async function downloadTrack(storagePath: string): Promise<Blob> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.storage.from("tracks").download(storagePath);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCloudTrack(track: CloudTrack): Promise<void> {
  const sb = getSupabaseClient();
  await sb.storage.from("tracks").remove([track.storagePath]);
  const { error } = await sb.from("tracks").delete().eq("id", track.id);
  if (error) throw new Error(error.message);
}

export async function updateTrackMetadata(
  id: string,
  patch: {
    name?: string;
    artist?: string | null;
    album?: string | null;
    year?: number | null;
  },
): Promise<CloudTrack> {
  const sb = getSupabaseClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.artist !== undefined) dbPatch.artist = patch.artist;
  if (patch.album !== undefined) dbPatch.album = patch.album;
  if (patch.year !== undefined) dbPatch.year = patch.year;
  const { data, error } = await sb
    .from("tracks")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromDBTrack(data as DBTrack);
}

// ────────────────────────────────────────────────────────────────────
// Mixes (always public-share via random path; no service role needed)
// ────────────────────────────────────────────────────────────────────

export async function listCloudMixes(): Promise<CloudMix[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("mixes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DBMix[]).map(fromDBMix);
}

export async function uploadMix(params: {
  userId: string;
  name: string;
  blob: Blob;
  durationMs: number;
  mimeType: string;
  ext: string;
}): Promise<CloudMix> {
  const sb = getSupabaseClient();
  const mixId = crypto.randomUUID();
  const path = `${params.userId}/${mixId}.${params.ext}`;

  const { error: upErr } = await sb.storage
    .from("mixes")
    .upload(path, params.blob, {
      contentType: params.mimeType || "audio/webm",
      upsert: false,
    });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const { data, error } = await sb
    .from("mixes")
    .insert({
      id: mixId,
      user_id: params.userId,
      name: params.name,
      duration_ms: params.durationMs,
      storage_path: path,
      size: params.blob.size,
      mime_type: params.mimeType,
      is_public: true, // public so anyone with share URL can play
    })
    .select()
    .single();
  if (error) {
    await sb.storage.from("mixes").remove([path]);
    throw new Error(error.message);
  }
  return fromDBMix(data as DBMix);
}

export async function deleteCloudMix(mix: CloudMix): Promise<void> {
  const sb = getSupabaseClient();
  await sb.storage.from("mixes").remove([mix.storagePath]);
  const { error } = await sb.from("mixes").delete().eq("id", mix.id);
  if (error) throw new Error(error.message);
}

export function publicMixUrl(storagePath: string): string {
  const sb = getSupabaseClient();
  return sb.storage.from("mixes").getPublicUrl(storagePath).data.publicUrl;
}

// ────────────────────────────────────────────────────────────────────
// Playlists
// ────────────────────────────────────────────────────────────────────

export interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  trackCount: number;
  isPublic: boolean;
  shareToken: string;
}

function fromDBPlaylist(p: DBPlaylist, count = 0): Playlist {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.created_at,
    trackCount: count,
    isPublic: p.is_public,
    shareToken: p.share_token,
  };
}

export async function setPlaylistPublic(
  id: string,
  isPublic: boolean,
): Promise<Playlist> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("playlists")
    .update({ is_public: isPublic })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromDBPlaylist(data as DBPlaylist, 0);
}

export function playlistShareUrl(shareToken: string): string {
  if (typeof window === "undefined") {
    return `https://brainmix.vercel.app/p/${shareToken}`;
  }
  return `${window.location.origin}/p/${shareToken}`;
}

export async function listPlaylists(): Promise<Playlist[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("playlists")
    .select("*, playlist_tracks(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = DBPlaylist & { playlist_tracks?: { count: number }[] };
  return (data as Row[]).map((r) =>
    fromDBPlaylist(r, r.playlist_tracks?.[0]?.count ?? 0),
  );
}

export async function createPlaylist(name: string, userId: string): Promise<Playlist> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("playlists")
    .insert({ name: name.trim() || "Untitled playlist", user_id: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromDBPlaylist(data as DBPlaylist, 0);
}

export async function deletePlaylist(id: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from("playlists").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
): Promise<void> {
  const sb = getSupabaseClient();
  // Determine next position.
  const { data: rows } = await sb
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos =
    Array.isArray(rows) && rows.length > 0 ? (rows[0].position ?? 0) + 1 : 0;
  const { error } = await sb
    .from("playlist_tracks")
    .insert({ playlist_id: playlistId, track_id: trackId, position: nextPos });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from("playlist_tracks")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId);
  if (error) throw new Error(error.message);
}

export async function getPlaylistTracks(playlistId: string): Promise<CloudTrack[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("playlist_tracks")
    .select("position, tracks(*)")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  type Row = { position: number; tracks: DBTrack };
  return (data as Row[]).map((r) => fromDBTrack(r.tracks));
}

export function shareUrl(shareToken: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/m/${shareToken}`;
  }
  return `/m/${shareToken}`;
}
