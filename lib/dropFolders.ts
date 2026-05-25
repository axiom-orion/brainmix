/**
 * Recursive folder walker for HTML5 drag-drop FileSystemEntry API.
 *
 * Used by the bulk-import drop zone so users can drag an entire album folder
 * (or a parent containing many albums) rather than picking files one by one.
 *
 * The DataTransferItem.webkitGetAsEntry() API returns either:
 *   - FileSystemFileEntry — a single file
 *   - FileSystemDirectoryEntry — needs recursion via createReader().readEntries()
 *
 * createReader().readEntries() returns at most ~100 entries at a time; we
 * loop until it returns an empty batch.
 */

interface FileEntryLike extends FileSystemEntry {
  file(success: (f: File) => void, fail?: (e: unknown) => void): void;
}

interface DirEntryLike extends FileSystemEntry {
  createReader(): {
    readEntries(
      success: (entries: FileSystemEntry[]) => void,
      fail?: (e: unknown) => void,
    ): void;
  };
}

function entryToFile(entry: FileEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (f) => resolve(f),
      () => resolve(null),
    );
  });
}

function readAllChildren(entry: DirEntryLike): Promise<FileSystemEntry[]> {
  const reader = entry.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          all.push(...entries);
          readBatch();
        },
        () => resolve(all),
      );
    };
    readBatch();
  });
}

/** Walks a list of entries (files + folders), returns every File found. */
export async function walkEntriesForAudio(
  entries: FileSystemEntry[],
): Promise<File[]> {
  const out: File[] = [];
  for (const ent of entries) {
    if (ent.isFile) {
      const f = await entryToFile(ent as FileEntryLike);
      if (f) out.push(f);
    } else if (ent.isDirectory) {
      const children = await readAllChildren(ent as DirEntryLike);
      const nested = await walkEntriesForAudio(children);
      out.push(...nested);
    }
  }
  return out;
}
