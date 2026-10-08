import { afterEach, expect, it, vi } from "vitest";
import { ApiClient } from "../src/lib/api-client";
import {
  apiProfileFormSchema,
  profilePatch,
  signupSchema,
} from "../src/lib/api-contract";
afterEach(() => vi.unstubAllGlobals());
it("registration start returns pending metadata without a session transition", async () => {
  const pending = {
    registrationId: "b09b54a7-eeb1-42da-8c21-4508b0fa8f0b",
    maskedEmail: "s***@example.com",
    expiresAt: "2026-10-07T12:10:00Z",
    resendAt: "2026-10-07T12:01:00Z",
    serverTime: "2026-10-07T12:00:00Z",
    deliveryStatus: "unavailable",
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "test-only" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(pending), { status: 202 }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await new ApiClient().startRegistration({})).toEqual(pending);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("incorrect signup code is actionable and never automatically retried", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "test-only" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "incorrect_code" }), {
        status: 400,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new ApiClient().authenticate("register/confirm", {}),
  ).rejects.toThrow("code is incorrect");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("shows rate-limit retry guidance without replaying the mutation", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "test-only" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "rate_limited" }), {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new ApiClient().requestEmail("password-reset", "fictional@example.com"),
  ).rejects.toThrow("2 minute(s)");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("maps verification and invalid-link errors without treating them as CSRF expiry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "test-only" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "invalid_or_expired_link" }), {
        status: 400,
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "email_verification_required" }), {
        status: 403,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  const api = new ApiClient();
  await expect(
    api.confirmEmailToken("verification", "test-only"),
  ).rejects.toThrow("invalid, expired");
  await expect(api.saveProfile({ name: "Fictional Student" })).rejects.toThrow(
    "Verify your email",
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
it("preserves application conflicts and never replays an ambiguous acceptance", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ csrfToken: "test-only" }))
    .mockResolvedValueOnce(
      response(
        { detail: "Application already processed; refresh its current status" },
        409,
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const api = new ApiClient();
  await expect(api.withdrawApplication("application-id")).rejects.toThrow(
    "already processed",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockRejectedValueOnce(new Error("connection lost after write"));
  await expect(
    api.reviewApplication("project-id", "application-id", "accept"),
  ).rejects.toThrow("Cannot reach");
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("sends credentials and bootstraps CSRF, refreshes only the exact expired-token error without replay", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ csrfToken: "first" }))
    .mockResolvedValueOnce(
      response({ detail: "Invalid or expired CSRF token" }, 403),
    )
    .mockResolvedValueOnce(response({ csrfToken: "fresh" }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new ApiClient("http://example.test/api/v1").saveProfile({
      name: "Student",
    }),
  ).rejects.toThrow("Security token refreshed");
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "include",
    method: "PATCH",
    headers: { "X-CSRF-Token": "first" },
  });
});
it("does not refresh or retry other forbidden requests or network failures", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ csrfToken: "first" }))
    .mockResolvedValueOnce(
      response({ detail: "Untrusted or missing request origin" }, 403),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new ApiClient().saveProfile({ name: "Student" }),
  ).rejects.toThrow("not permitted");
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockRejectedValue(new Error("offline"));
  await expect(new ApiClient().me()).rejects.toThrow("Cannot reach");
});
it("distinguishes signed out from broken and malformed backends", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        response({ detail: "Authentication required" }, 401),
      )
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ name: "Mock Student" })),
  );
  const api = new ApiClient();
  expect(await api.me()).toBeNull();
  await expect(api.me()).rejects.toThrow("temporarily unavailable");
  await expect(api.me()).rejects.toThrow("unexpected response");
});
it("rejects responses from an earlier session generation", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const api = new ApiClient();
  const pending = api.me();
  api.reset();
  finish(response({}));
  await expect(pending).rejects.toThrow("Session changed");
});
it("supports incomplete profiles and emits only changed fields with explicit clears", () => {
  const original = apiProfileFormSchema.parse({
    name: "Student",
    campus: "University",
    department: "",
    semester: "",
    bio: "",
    github: "",
    linkedin: "",
    website: "",
    skillIds: [],
  });
  expect(profilePatch(original, original)).toEqual({});
  expect(
    profilePatch({ ...original, campus: "", skillIds: ["react"] }, original),
  ).toEqual({ campus: null, skillIds: ["react"] });
  expect(
    signupSchema.safeParse({
      name: "Student",
      email: "student@example.com",
      password: "too short",
      confirmPassword: "different",
    }).success,
  ).toBe(false);
});
