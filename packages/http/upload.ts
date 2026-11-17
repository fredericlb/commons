// Multipart upload middleware. Its own entry point (@frediverse/http/upload)
// so backends that only need the routing helpers don't pull in multer.

import { randomUUID } from "node:crypto";
import multer from "multer";

const ONE_GIB = 1024 * 1024 * 1024;

/**
 * A memory-storage multer instance with a size ceiling. In memory because every
 * caller so far hands the buffer straight to a store (Grist attachments, a blob
 * dir) rather than keeping a temp file around.
 */
export function memoryUpload(maxBytes: number = ONE_GIB) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
  });
}

/** The default instance — 1 GiB, sized for radiok7's long session recordings. */
export const upload = memoryUpload();

/**
 * The same ceiling, written to `dir` as it arrives instead of held in memory: an hours-long take, or
 * sixty-four stems, must not sit whole in RAM for as long as a slow uplink takes to deliver it. Each
 * file is named `tmp-upload-…`, and the caller removes whatever it did not keep.
 */
export function diskUpload(dir: string, maxBytes: number = ONE_GIB) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, _file, cb) => cb(null, `tmp-upload-${randomUUID()}`),
    }),
    limits: { fileSize: maxBytes },
  });
}
