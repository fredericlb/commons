// droppedEntries.ts — reading a drop that may contain FOLDERS. `dataTransfer.files` cannot:
// it is a flat FileList, and a dropped directory arrives in it as an unreadable entry (or
// not at all). The directory structure is only reachable through `webkitGetAsEntry`, whose
// two traps are documented below because both fail silently.
// See packages/ui/docs/file-tree.md.

/** One dropped file and where it sat, relative to what was dropped ("audio/reverb/module.yaml"). */
export interface DroppedFile {
  path: string;
  file: File;
}

// The bits of the File System Access drag API we use. Typed here rather than pulled from
// lib.dom: the entry types are still prefixed and partially specified across browsers.
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (ok: (es: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
}

type ItemWithEntry = DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null };

/**
 * The entries a drop carries, taken SYNCHRONOUSLY.
 *
 * First trap: `dataTransfer.items` is emptied the moment the drop handler yields, so the
 * entries have to be claimed before any `await`. Everything after this point is async and
 * works on what this returned.
 */
export function dropEntries(dt: DataTransfer | null): FsEntry[] {
  if (!dt) return [];
  const out: FsEntry[] = [];
  for (const item of Array.from(dt.items ?? []) as ItemWithEntry[]) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) out.push(entry);
  }
  return out;
}

/** One directory's children. Second trap: `readEntries` yields a BATCH (100 in Chrome) and
 *  must be called until it answers an empty one, or a big folder arrives truncated. */
function readAll(dir: FsEntry): Promise<FsEntry[]> {
  const reader = dir.createReader?.();
  if (!reader) return Promise.resolve([]);
  return new Promise((resolve) => {
    const found: FsEntry[] = [];
    const next = (): void =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(found);
        found.push(...batch);
        next();
      }, () => resolve(found)); // an unreadable folder yields what was read, not a rejection
    next();
  });
}

const fileOf = (entry: FsEntry): Promise<File | null> =>
  new Promise((resolve) =>
    entry.file
      ? entry.file(resolve, () => resolve(null))
      : resolve(null),
  );

/**
 * Flatten a drop into files that remember where they sat.
 *
 * A file dropped on its own has a bare name; one inside a folder carries the folder in its
 * path, so a whole `audio/reverb/` lands as `audio/reverb/module.yaml` and its siblings —
 * which is what makes dropping a MODULE (a folder of three files) work at all.
 *
 * Unreadable entries are skipped rather than thrown: a drop of forty files with one the
 * browser will not hand over should still put thirty-nine of them down.
 */
export async function readDroppedFiles(
  entries: FsEntry[],
): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const walk = async (entry: FsEntry, prefix: string): Promise<void> => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await fileOf(entry);
      if (file) out.push({ path, file });
      return;
    }
    if (!entry.isDirectory) return;
    for (const child of await readAll(entry)) await walk(child, path);
  };
  for (const entry of entries) await walk(entry, "");
  return out;
}
