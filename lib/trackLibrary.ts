/**
 * Track Library: IndexedDB persistence for imported audio.
 *
 * Songs stay on the user's device. We store the Blob + metadata (name, BPM,
 * hot cues, loop points). Reload the page → tracks come back.
 *
 * Quota: most browsers give 50% of disk or several GB. A typical reggae-rock
 * MP3 is 5-10 MB, so dozens of tracks fit comfortably.
 */

const DB_NAME = "brainmix";
const DB_VERSION = 1;
const STORE = "tracks";

export interface LibraryTrack {
  id: string;
  name: string;
  blob: Blob;
  /** Inferred or detected BPM. */
  bpm: number | null;
  /** Up to 4 cues in seconds. */
  hotCues: (number | null)[];
  /** Optional loop region. */
  loopStart: number | null;
  loopEnd: number | null;
  /** Added timestamp (ms epoch). */
  addedAt: number;
  /** Convenience: file size in bytes. */
  size: number;
}

interface PutPayload {
  name: string;
  blob: Blob;
  bpm: number | null;
  hotCues: (number | null)[];
  loopStart: number | null;
  loopEnd: number | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("addedAt", "addedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function id(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function listTracks(): Promise<LibraryTrack[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const arr = req.result as LibraryTrack[];
      arr.sort((a, b) => b.addedAt - a.addedAt);
      resolve(arr);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveTrack(payload: PutPayload): Promise<LibraryTrack> {
  const db = await openDB();
  const record: LibraryTrack = {
    id: id(),
    name: payload.name,
    blob: payload.blob,
    bpm: payload.bpm,
    hotCues: payload.hotCues,
    loopStart: payload.loopStart,
    loopEnd: payload.loopEnd,
    addedAt: Date.now(),
    size: payload.blob.size,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTrack(trackId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Convert a stored track into a File-equivalent so it can be loaded into a
 * slot just like a fresh import.
 */
export function trackToFile(t: LibraryTrack): File {
  return new File([t.blob], t.name, { type: t.blob.type || "audio/*" });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
