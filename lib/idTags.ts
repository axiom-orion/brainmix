/**
 * Minimal ID3v2 reader + audio duration extractor. Browser-only. Zero deps.
 *
 * Why not jsmediatags / music-metadata? Both ship a React Native code path
 * that breaks Turbopack's static resolver even when behind dynamic guards.
 * The slice of the format we actually need (title / artist / album / year /
 * cover) is small and stable enough to parse directly.
 *
 * Reference: https://id3.org/id3v2.4.0-structure and v2.3 frame layout.
 */

export interface ParsedMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  durationSec: number | null;
  /** Base64 data URL of the cover art, when embedded. */
  coverDataUrl: string | null;
}

interface RawTags {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  picture?: { mime: string; bytes: Uint8Array };
}

function decodeText(buf: Uint8Array, encoding: number): string {
  // 0 = ISO-8859-1, 1 = UTF-16 with BOM, 2 = UTF-16BE, 3 = UTF-8.
  try {
    if (encoding === 0) {
      return new TextDecoder("iso-8859-1").decode(buf);
    } else if (encoding === 1) {
      // BOM-prefixed UTF-16
      if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(buf.subarray(2));
      } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(buf.subarray(2));
      }
      return new TextDecoder("utf-16le").decode(buf);
    } else if (encoding === 2) {
      return new TextDecoder("utf-16be").decode(buf);
    }
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return "";
  }
}

function stripTrailingNulls(s: string): string {
  return s.replace(/[\0﻿\s]+$/g, "").replace(/^[\0﻿\s]+/g, "");
}

/** Read a sync-safe 28-bit big-endian integer used by ID3v2.4 sizes. */
function readSyncSafe(view: DataView, off: number): number {
  return (
    (view.getUint8(off) << 21) |
    (view.getUint8(off + 1) << 14) |
    (view.getUint8(off + 2) << 7) |
    view.getUint8(off + 3)
  );
}

function readUint32BE(view: DataView, off: number): number {
  return (
    (view.getUint8(off) << 24) |
    (view.getUint8(off + 1) << 16) |
    (view.getUint8(off + 2) << 8) |
    view.getUint8(off + 3)
  );
}

function parseTextFrame(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const encoding = bytes[0];
  // Some tags have a trailing terminator and (for COMM/TXXX) language/desc;
  // for simple T??? frames it's just encoding + text.
  return stripTrailingNulls(decodeText(bytes.subarray(1), encoding));
}

function parsePictureFrame(
  bytes: Uint8Array,
  versionMajor: number,
): { mime: string; bytes: Uint8Array } | null {
  if (bytes.length === 0) return null;
  let off = 1; // skip text encoding
  let mime = "image/jpeg";
  if (versionMajor === 2) {
    // 3-byte image format code (JPG / PNG)
    const code = String.fromCharCode(bytes[1], bytes[2], bytes[3]).toUpperCase();
    mime = code === "PNG" ? "image/png" : "image/jpeg";
    off = 4;
  } else {
    // MIME string null-terminated.
    let end = off;
    while (end < bytes.length && bytes[end] !== 0) end++;
    mime = new TextDecoder("ascii").decode(bytes.subarray(off, end)) || mime;
    off = end + 1;
  }
  // 1 byte picture type
  off += 1;
  // Description, terminated by 1-2 nulls depending on encoding.
  const encoding = bytes[0];
  if (encoding === 1 || encoding === 2) {
    // UTF-16: terminator is 00 00
    while (off + 1 < bytes.length && !(bytes[off] === 0 && bytes[off + 1] === 0)) {
      off += 2;
    }
    off += 2;
  } else {
    while (off < bytes.length && bytes[off] !== 0) off++;
    off += 1;
  }
  if (off >= bytes.length) return null;
  return { mime, bytes: bytes.subarray(off) };
}

async function parseID3v2(file: File): Promise<RawTags> {
  // 1 MB is more than enough to capture tags + cover art for typical MP3s.
  const head = await file.slice(0, 1024 * 1024).arrayBuffer();
  if (head.byteLength < 10) return {};
  const view = new DataView(head);
  // "ID3"
  if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
    return {};
  }
  const versionMajor = view.getUint8(3);
  if (versionMajor < 2 || versionMajor > 4) return {};
  const flags = view.getUint8(5);
  const totalSize = readSyncSafe(view, 6);
  const tags: RawTags = {};

  let offset = 10;
  // Skip optional extended header.
  if (versionMajor >= 3 && flags & 0x40) {
    const extSize = readSyncSafe(view, offset);
    offset += extSize;
  }

  const end = Math.min(offset + totalSize, head.byteLength);
  const headerSize = versionMajor === 2 ? 6 : 10;
  const idLen = versionMajor === 2 ? 3 : 4;

  while (offset + headerSize <= end) {
    const idBytes = new Uint8Array(head, offset, idLen);
    if (idBytes[0] === 0) break;
    const id = new TextDecoder("ascii").decode(idBytes);
    let size: number;
    if (versionMajor === 2) {
      size = (view.getUint8(offset + 3) << 16) |
        (view.getUint8(offset + 4) << 8) |
        view.getUint8(offset + 5);
    } else if (versionMajor === 4) {
      size = readSyncSafe(view, offset + 4);
    } else {
      size = readUint32BE(view, offset + 4);
    }
    if (size <= 0 || offset + headerSize + size > end) break;
    const data = new Uint8Array(head, offset + headerSize, size);

    // Map IDs across versions.
    const norm =
      id === "TT2" ? "TIT2" :
      id === "TP1" ? "TPE1" :
      id === "TAL" ? "TALB" :
      id === "TYE" ? "TYER" :
      id === "PIC" ? "APIC" :
      id;

    if (norm === "TIT2") tags.title = parseTextFrame(data);
    else if (norm === "TPE1") tags.artist = parseTextFrame(data);
    else if (norm === "TALB") tags.album = parseTextFrame(data);
    else if (norm === "TYER" || norm === "TDRC") tags.year = parseTextFrame(data);
    else if (norm === "APIC") {
      const pic = parsePictureFrame(data, versionMajor);
      if (pic) tags.picture = pic;
    }

    offset += headerSize + size;
  }
  return tags;
}

function durationFromAudio(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener("loadedmetadata", () => {
      const d = audio.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    });
    audio.addEventListener("error", () => {
      cleanup();
      resolve(null);
    });
  });
}

function pictureToDataUrl(p: { mime: string; bytes: Uint8Array } | undefined): string | null {
  if (!p) return null;
  try {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < p.bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(
        null,
        Array.from(p.bytes.subarray(i, i + chunk)),
      );
    }
    return `data:${p.mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export async function parseMetadata(file: File): Promise<ParsedMetadata> {
  const [tags, dur] = await Promise.all([
    parseID3v2(file).catch(() => ({} as RawTags)),
    durationFromAudio(file),
  ]);
  return {
    title: tags.title || null,
    artist: tags.artist || null,
    album: tags.album || null,
    year: tags.year ? parseInt(tags.year) || null : null,
    durationSec: dur,
    coverDataUrl: pictureToDataUrl(tags.picture),
  };
}

/**
 * Best-effort name guess when ID3 is missing.
 * Splits on " - " patterns common in DJ-style filenames.
 */
export function guessFromFilename(filename: string): {
  artist: string | null;
  title: string;
} {
  const base = filename.replace(/\.[^.]+$/, "");
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: null, title: base.trim() };
}
