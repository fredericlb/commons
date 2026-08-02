// @frediverse/http — the Express layer shared by frediverse backends: route
// wrapping/validation, Range-aware file streaming, and per-request origin
// derivation. Importing this also declares `req.user`.
// Multipart uploads live at @frediverse/http/upload (keeps multer optional).

export { type AuthUser, sub } from "./express.ts";
export { publicOrigin, redirectUriFor } from "./origin.ts";
export { ownerGuard } from "./ownership.ts";
export { validate, wrap } from "./route.ts";
export { streamFile } from "./stream.ts";
