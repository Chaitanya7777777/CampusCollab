import { expect, it, vi } from "vitest";
import { forwardApi, proxyConfig } from "../src/lib/api-proxy";
const env = {
  API_BACKEND_ORIGIN: "https://campus.onrender.com",
  APP_ORIGIN: "https://campus.vercel.app",
  API_PROXY_SECRET: "test-only-private-proxy-key-000000000",
  VERCEL: "1",
};
function request(path = "auth/login", method = "POST", extra = {}) {
  return new Request(`${env.APP_ORIGIN}/api/v1/${path}?page=2`, {
    method,
    headers: {
      Origin: env.APP_ORIGIN,
      "x-forwarded-for": "203.0.113.4",
      cookie: "session=test",
      "x-csrf-token": "test-csrf",
      "content-type": "application/json",
      ...extra,
    },
    body: method === "GET" ? undefined : '{"test":true}',
  });
}
it("local forwarding ignores spoofed IPs and bootstraps only same-origin GETs", async () => {
  const local = {
    ...env,
    VERCEL: "",
    API_PROXY_LOCAL: "true",
    APP_ORIGIN: "http://localhost:3100",
    API_BACKEND_ORIGIN: "http://localhost:8100",
  };
  const send = vi
    .fn()
    .mockResolvedValue(Response.json({ csrfToken: "test-only" }));
  const req = new Request(`${local.APP_ORIGIN}/api/v1/auth/csrf`, {
    headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": "8.8.8.8" },
  });
  expect((await forwardApi(req, ["auth", "csrf"], local, send)).status).toBe(
    200,
  );
  expect(send.mock.calls[0][1].headers.get("Origin")).toBe(local.APP_ORIGIN);
  expect(send.mock.calls[0][1].headers.get("x-campuscollab-client-ip")).toBe(
    "127.0.0.1",
  );
  expect(() => proxyConfig({ ...local, VERCEL: "1" })).toThrow();
});
it("preserves methods, body, query, status, CSRF and separate host-only cookies without caching", async () => {
  const headers = new Headers({
    "content-type": "application/json",
    "x-request-id": "test-request",
  });
  headers.append(
    "Set-Cookie",
    "session=test; Path=/; Secure; HttpOnly; SameSite=lax",
  );
  headers.append(
    "Set-Cookie",
    "csrf=test; Path=/; Secure; HttpOnly; SameSite=lax",
  );
  const send = vi
    .fn()
    .mockResolvedValue(new Response('{"ok":true}', { status: 201, headers }));
  const response = await forwardApi(request(), ["auth", "login"], env, send);
  expect(response.status).toBe(201);
  expect(response.headers.getSetCookie()).toHaveLength(2);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(send.mock.calls[0][0]).toBe(
    `${env.API_BACKEND_ORIGIN}/api/v1/auth/login?page=2`,
  );
  const init = send.mock.calls[0][1];
  expect(init.method).toBe("POST");
  expect(new TextDecoder().decode(init.body)).toBe('{"test":true}');
  expect(init.headers.get("x-csrf-token")).toBe("test-csrf");
  expect(init.headers.get("x-campuscollab-client-ip")).toBe("203.0.113.4");
  expect(
    init.headers.get("x-campuscollab-proxy") === env.API_PROXY_SECRET,
  ).toBe(true);
  expect(init.headers.has("x-forwarded-for")).toBe(false);
  expect(init.cache).toBe("no-store");
  expect(init.redirect).toBe("manual");
});
it.each([
  "http://evil.test",
  "https://evil.test",
  "https://user:pass@campus.onrender.com",
  "https://campus.onrender.com/path",
  "https://campus.onrender.com?target=evil",
])("rejects unsafe target %s", (target) => {
  expect(() => proxyConfig({ ...env, API_BACKEND_ORIGIN: target })).toThrow();
});
it("rejects traversal, foreign origins and missing trusted IP without fetching", async () => {
  const send = vi.fn();
  expect((await forwardApi(request(), ["auth", ".."], env, send)).status).toBe(
    404,
  );
  expect(
    (
      await forwardApi(
        request("auth/login", "POST", { Origin: "https://evil.test" }),
        ["auth", "login"],
        env,
        send,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await forwardApi(
        request("skills", "GET", { "x-forwarded-for": "1.1.1.1, 2.2.2.2" }),
        ["skills"],
        env,
        send,
      )
    ).status,
  ).toBe(503);
  expect(send).not.toHaveBeenCalled();
});
it("does not forward attacker proxy credentials or follow redirects/retry failures", async () => {
  const send = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { Location: "https://evil.test" },
    }),
  );
  const response = await forwardApi(
    request("auth/login", "POST", {
      "x-campuscollab-proxy": "evil",
      "x-campuscollab-client-ip": "8.8.8.8",
      authorization: "evil",
    }),
    ["auth", "login"],
    env,
    send,
  );
  expect(response.status).toBe(502);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1].headers.has("authorization")).toBe(false);
  expect(send.mock.calls[0][1].headers.get("x-campuscollab-client-ip")).toBe(
    "203.0.113.4",
  );
  send.mockRejectedValue(new Error("private upstream error"));
  const failed = await forwardApi(request(), ["auth", "login"], env, send);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private upstream");
  expect(send).toHaveBeenCalledTimes(2);
});
it("preserves both logout deletions and does not share account responses", async () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "session=; Max-Age=0; Path=/; Secure; HttpOnly");
  headers.append("Set-Cookie", "csrf=; Max-Age=0; Path=/; Secure; HttpOnly");
  const send = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204, headers }));
  const response = await forwardApi(
    request("auth/logout"),
    ["auth", "logout"],
    env,
    send,
  );
  expect(response.status).toBe(204);
  expect(response.headers.getSetCookie()).toHaveLength(2);
  send.mockImplementation(async (_url, init) =>
    Response.json({ account: init.headers.get("cookie") }),
  );
  const a = await forwardApi(
    request("profiles/me", "GET"),
    ["profiles", "me"],
    env,
    send,
  );
  const b = await forwardApi(
    request("profiles/me", "GET", { cookie: "session=other" }),
    ["profiles", "me"],
    env,
    send,
  );
  expect(await a.json()).not.toEqual(await b.json());
  expect(b.headers.get("cache-control")).toContain("no-store");
});
