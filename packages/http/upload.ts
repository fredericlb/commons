// Multipart upload middleware. Its own entry point (@frediverse/http/upload)
// so backends that only need the routing helpers don't pull in multer.

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
