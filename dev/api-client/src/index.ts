// The fetch wrapper every SPA in this monorepo grew its own copy of: prefix the
// API base, always send the session cookie, parse JSON, and turn a non-2xx into
// a typed error carrying the server's message.
//
//   const api = createApiClient();          // same-origin: SPA at /, API at /api
//   const songs = await api.get<Song[]>("/api/songs");
//
// Framework-agnostic on purpose: the app reads its own env and passes baseUrl in,
// so this package never touches import.meta.env.

/** A non-2xx response. `body` is the server's (plain-text) message, if any. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(body.trim() || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiClientOptions {
  /**
   * Origin the API lives on. Empty (the default) means same-origin relative
   * paths — the convention for these apps, where nginx proxies /api locally.
   */
  baseUrl?: string;
  /**
   * Path prefix the app is mounted under (e.g. "/f/"). Mirrors Vite's
   * import.meta.env.BASE_URL, so pass that through when the SPA isn't at root.
   */
  basePath?: string;
  /** Defaults to "include" so the session cookie rides along. */
  credentials?: RequestCredentials;
  /** Swappable for tests. */
  fetch?: typeof globalThis.fetch;
}

export interface ApiClient {
  /** Resolve a path to its full URL, applying baseUrl + basePath. */
  url(path: string): string;
  /** Raw Response — for streams, blobs, or when you want the status yourself. */
  raw(path: string, init?: RequestInit): Promise<Response>;
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T>;
  del<T>(path: string, init?: RequestInit): Promise<T>;
}

function joinPath(basePath: string, path: string): string {
  if (!basePath) return path;
  return `${basePath.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const basePath = options.basePath ?? "";
  const credentials = options.credentials ?? "include";
  const doFetch = options.fetch ?? globalThis.fetch;

  const url = (path: string) => `${baseUrl}${joinPath(basePath, path)}`;

  const raw = (path: string, init?: RequestInit) =>
    doFetch(url(path), { credentials, ...init });

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await raw(path, init);
    if (!res.ok) {
      // The backends answer errors as plain text; keep it on the error so
      // callers can branch on status *and* show the message.
      throw new ApiError(res.status, await res.text().catch(() => ""));
    }
    // 204 (and an empty body) carry nothing to parse.
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  const withBody =
    (method: string) =>
    <T>(path: string, body?: unknown, init?: RequestInit): Promise<T> => {
      const hasBody = body !== undefined;
      return request<T>(path, {
        method,
        ...init,
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
    };

  return {
    url,
    raw,
    get: <T>(path: string, init?: RequestInit) =>
      request<T>(path, { method: "GET", ...init }),
    post: withBody("POST"),
    put: withBody("PUT"),
    del: <T>(path: string, init?: RequestInit) =>
      request<T>(path, { method: "DELETE", ...init }),
  };
}
