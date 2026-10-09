// Server-only: imported exclusively by the API route and its Node tests.
import { isIP } from "node:net";

type Environment = Record<string, string | undefined>;
export function proxyConfig(env: Environment) {
  const target = new URL(env.API_BACKEND_ORIGIN ?? "");
  const origin = new URL(env.APP_ORIGIN ?? "");
  const local = env.API_PROXY_LOCAL === "true" && env.VERCEL !== "1";
  for (const url of [target, origin]) {
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid proxy configuration");
    if (local) {
      if (
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.protocol !== "http:"
      )
        throw new Error("Local proxy requires loopback HTTP origins");
    } else if (url.protocol !== "https:") throw new Error("HTTPS required");
  }
  if (
    !local &&
    (target.port ||
      origin.port ||
      !target.hostname.endsWith(".onrender.com") ||
      !origin.hostname.endsWith(".vercel.app"))
  )
    throw new Error("Explicit Render/Vercel origins required");
  const secret = env.API_PROXY_SECRET ?? "";
  if (
    secret.length < 32 ||
    /[^\x21-\x7e]/.test(secret) ||
    secret.startsWith("replace-")
  )
    throw new Error("Configure private proxy secret");
  if (!local && env.VERCEL !== "1")
    throw new Error("Trusted Vercel ingress required");
  return { target: target.origin, origin: origin.origin, secret, local };
}

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};
function failure(status: number, detail: string) {
  return Response.json({ detail }, { status, headers: responseHeaders });
}

export async function forwardApi(
  request: Request,
  segments: string[],
  env: Environment = process.env,
  send: typeof fetch = fetch,
) {
  let config;
  try {
    config = proxyConfig(env);
  } catch {
    return failure(
      503,
      "API forwarding is not configured. Please try again later.",
    );
  }
  if (
    !segments.length ||
    !["auth", "profiles", "skills", "projects", "applications"].includes(
      segments[0],
    ) ||
    segments.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))
  )
    return failure(404, "Not found");
  if (!["GET", "POST", "PATCH"].includes(request.method))
    return failure(405, "Method not allowed");
  const incoming = new URL(request.url);
  if (incoming.origin !== config.origin)
    return failure(403, "Untrusted request origin");
  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin && suppliedOrigin !== config.origin)
    return failure(403, "Untrusted request origin");
  if (request.method !== "GET" && suppliedOrigin !== config.origin)
    return failure(403, "Missing request origin");
  // Vercel overwrites x-forwarded-for at its ingress. Never trust it locally.
  const ip = config.local
    ? "127.0.0.1"
    : (request.headers.get("x-forwarded-for") ?? "");
  if (!isIP(ip))
    return failure(
      503,
      "Client network information unavailable. Please try again.",
    );
  const headers = new Headers({
    Accept: "application/json",
    "X-CampusCollab-Proxy": config.secret,
    "X-CampusCollab-Client-IP": ip,
  });
  for (const name of ["cookie", "content-type", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Same-origin GET fetches may omit Origin. Only bootstrap it for browser
  // same-origin fetches; never invent an Origin for an unsafe request.
  if (suppliedOrigin) headers.set("Origin", suppliedOrigin);
  else if (request.headers.get("sec-fetch-site") === "same-origin")
    headers.set("Origin", config.origin);
  try {
    let body: Uint8Array | undefined;
    if (request.method !== "GET") {
      const limit = segments[0] === "auth" ? 8192 : 65536;
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > limit) {
            await reader.cancel();
            return failure(413, "Request too large");
          }
          chunks.push(chunk.value);
        }
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const upstream = await send(
      `${config.target}/api/v1/${segments.join("/")}${incoming.search}`,
      {
        method: request.method,
        headers,
        body: body as BodyInit | undefined,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    if (upstream.status >= 300 && upstream.status < 400)
      return failure(
        502,
        "Unexpected backend redirect. Please try again later.",
      );
    if (
      upstream.status !== 204 &&
      !upstream.headers.get("content-type")?.includes("application/json")
    )
      return failure(
        503,
        "Backend is waking up or unavailable. Please wait and try again; check state before repeating a save.",
      );
    const resultHeaders = new Headers(responseHeaders);
    for (const name of ["content-type", "retry-after", "x-request-id"]) {
      const value = upstream.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    // getSetCookie preserves separate cookies, including Expires commas.
    for (const cookie of upstream.headers.getSetCookie()) {
      if (/;\s*domain=/i.test(cookie))
        return failure(502, "Unexpected cookie configuration");
      if (
        !config.local &&
        (!/;\s*secure(?:;|$)/i.test(cookie) ||
          !/;\s*httponly(?:;|$)/i.test(cookie))
      )
        return failure(502, "Unexpected cookie configuration");
      resultHeaders.append("Set-Cookie", cookie);
    }
    return new Response(
      upstream.status === 204 ? null : await upstream.arrayBuffer(),
      { status: upstream.status, headers: resultHeaders },
    );
  } catch {
    // No raw fetch error: may contain headers or operational details.
    return failure(
      503,
      "Backend is waking up or unavailable. Please wait and try again; check state before repeating a save.",
    );
  }
}
