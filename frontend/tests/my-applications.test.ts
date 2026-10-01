import { describe, it, expect } from "vitest";
import {
  createMockApi,
  defaultApplicationFilters,
  STORAGE_KEY,
  type StorageAdapter,
} from "../src/lib/mock-api";
import { createSeed, CURRENT_STUDENT_ID } from "../src/lib/seed";
import { encodeStorage, decodeStorage } from "../src/lib/mock-storage";
import type { Application } from "../src/lib/models";
const note = {
  motivation:
    "I want to help build reliable and accessible campus tools with this project team.",
  experience:
    "I built a coursework project with accessible forms and typed APIs.",
  portfolio: "https://example.com/portfolio",
};
function setup() {
  let raw: string | null = null;
  let fail = false;
  let writes = 0;
  const storage: StorageAdapter = {
    getItem: () => raw,
    setItem: (_, value) => {
      if (fail) throw Error("quota");
      raw = value;
      writes++;
    },
  };
  const api = (user = CURRENT_STUDENT_ID) =>
    createMockApi(
      () => storage,
      0,
      () => user,
    );
  return {
    api,
    storage,
    setFailure: (v: boolean) => {
      fail = v;
    },
    writes: () => writes,
  };
}
async function pending(env: ReturnType<typeof setup>) {
  return env.api().apply("smart-traffic", "traffic-backend", note);
}
describe("applicant application history", () => {
  it("lists and reads only the actor, preserving separate owner-scoped access", async () => {
    const env = setup();
    const app = await pending(env);
    expect(
      (await env.api().myApplications()).applications[0].application.id,
    ).toBe(app.id);
    expect((await env.api("aarav").myApplications()).counts.all).toBe(0);
    await expect(env.api("aarav").myApplication(app.id)).rejects.toThrow(
      "permission",
    );
    expect(
      (await env.api("aarav").ownerDashboard("smart-traffic")).applications[0]
        .application.id,
    ).toBe(app.id);
    await expect(env.api("sneha").withdrawApplication(app.id)).rejects.toThrow(
      "permission",
    );
    await expect(env.api("aarav").withdrawApplication(app.id)).rejects.toThrow(
      "permission",
    );
  });
  it("searches titles and roles, filters statuses, sorts dates, and keeps global counts", async () => {
    const env = setup();
    const db = createSeed();
    const statuses: Application["status"][] = [
      "pending",
      "accepted",
      "rejected",
      "withdrawn",
      "pending",
    ];
    db.applications = db.projects
      .slice(0, 5)
      .map((p, i) => ({
        ...note,
        id: `app${i}`,
        studentId: CURRENT_STUDENT_ID,
        projectId: p.id,
        roleId: db.roles.find((r) => r.projectId === p.id)!.id,
        status: statuses[i],
        createdAt: `2026-09-0${i + 1}T00:00:00.000Z`,
      }));
    env.storage.setItem(STORAGE_KEY, encodeStorage(db));
    const newest = await env.api().myApplications();
    expect(newest.applications.map((a) => a.application.id)).toEqual([
      "app4",
      "app3",
      "app2",
      "app1",
      "app0",
    ]);
    expect(newest.counts).toEqual({
      all: 5,
      pending: 2,
      accepted: 1,
      rejected: 1,
      withdrawn: 1,
    });
    const oldest = await env
      .api()
      .myApplications({ ...defaultApplicationFilters, sort: "oldest" });
    expect(oldest.applications[0].application.id).toBe("app0");
    const role = await env
      .api()
      .myApplications({
        ...defaultApplicationFilters,
        search: newest.applications[0].roleTitle,
      });
    expect(role.applications.some((a) => a.application.id === "app4")).toBe(
      true,
    );
    const filtered = await env
      .api()
      .myApplications({
        ...defaultApplicationFilters,
        search: "TRAFFIC",
        status: "pending",
      });
    expect(filtered.applications).toHaveLength(1);
    expect(filtered.counts).toEqual(newest.counts);
    expect(
      (
        await env
          .api()
          .myApplications({ ...defaultApplicationFilters, search: "no match" })
      ).applications,
    ).toHaveLength(0);
  });
  it("withdraws once, persists timestamp/content and blocks reapplication and owner acceptance", async () => {
    const env = setup();
    const app = await pending(env);
    const before = env.writes();
    await env.api().withdrawApplication(app.id);
    expect(env.writes()).toBe(before + 1);
    const entry = await env.api().myApplication(app.id);
    expect(entry.application).toMatchObject({ ...note, status: "withdrawn" });
    expect(entry.application.withdrawnAt).toBeTruthy();
    expect(entry.application.decidedAt).toBeUndefined();
    expect(
      (await env.api("aarav").ownerDashboard("smart-traffic")).pendingCount,
    ).toBe(0);
    expect((await env.api().project("smart-traffic"))?.memberCount).toBe(3);
    await expect(
      env.api().apply("smart-traffic", "traffic-backend", note),
    ).rejects.toThrow("Application withdrawn");
    await expect(
      env.api("aarav").reviewApplication("smart-traffic", app.id, "accept"),
    ).rejects.toThrow("already processed");
    await expect(env.api().withdrawApplication(app.id)).rejects.toThrow(
      "already processed",
    );
  });
  it.each(["accept", "reject"] as const)(
    "refuses withdrawal after owner %s without changing decision time",
    async (decision) => {
      const env = setup();
      const app = await pending(env);
      await env
        .api("aarav")
        .reviewApplication("smart-traffic", app.id, decision);
      const before = env.storage.getItem(STORAGE_KEY);
      await expect(env.api().withdrawApplication(app.id)).rejects.toThrow(
        "already processed",
      );
      expect(env.storage.getItem(STORAGE_KEY)).toBe(before);
      expect(
        (await env.api().myApplication(app.id)).application.decidedAt,
      ).toBeTruthy();
      expect(
        (await env.api().myApplication(app.id)).application.withdrawnAt,
      ).toBeUndefined();
    },
  );
  it.each(["closed", "archived"] as const)(
    "allows applicant withdrawal for %s recruitment/project",
    async (state) => {
      const env = setup();
      const app = await pending(env);
      if (state === "closed")
        await env.api("aarav").setRecruitment("smart-traffic", "closed");
      else await env.api("aarav").archiveProject("smart-traffic");
      await env.api().withdrawApplication(app.id);
      expect((await env.api().myApplication(app.id)).application.status).toBe(
        "withdrawn",
      );
    },
  );
  it.each([true, false])(
    "competing acceptance and withdrawal produce one terminal state (accept first: %s)",
    async (acceptFirst) => {
      const env = setup();
      const app = await pending(env);
      const accept = () =>
        env.api("aarav").reviewApplication("smart-traffic", app.id, "accept");
      const withdraw = () => env.api().withdrawApplication(app.id);
      const result = await Promise.allSettled(
        acceptFirst ? [accept(), withdraw()] : [withdraw(), accept()],
      );
      expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const entry = await env.api().myApplication(app.id);
      expect(["accepted", "withdrawn"]).toContain(entry.application.status);
      expect(entry.isMember).toBe(entry.application.status === "accepted");
      expect(!!entry.application.decidedAt).toBe(
        entry.application.status === "accepted",
      );
      expect(!!entry.application.withdrawnAt).toBe(
        entry.application.status === "withdrawn",
      );
    },
  );
  it("distinguishes accepted history from actual membership and retains archived access", async () => {
    const env = setup();
    const app = await pending(env);
    await env.api("aarav").reviewApplication("smart-traffic", app.id, "accept");
    const db = decodeStorage(env.storage.getItem(STORAGE_KEY));
    db.memberships = db.memberships.filter(
      (m) =>
        !(
          m.projectId === "smart-traffic" && m.studentId === CURRENT_STUDENT_ID
        ),
    );
    env.storage.setItem(STORAGE_KEY, encodeStorage(db));
    await env.api("aarav").archiveProject("smart-traffic");
    const entry = await env.api().myApplication(app.id);
    expect(entry.application.status).toBe("accepted");
    expect(entry.isMember).toBe(false);
    expect(entry.projectStatus).toBe("archived");
    expect(entry.projectHref).toBe("/projects/smart-traffic");
  });
  it("preserves unavailable history with safe labels, no draft details or broken project links", async () => {
    const env = setup();
    const draft = await env
      .api("aarav")
      .saveProject(
        {
          title: "Private secret draft",
          type: "",
          eventName: "",
          description: "",
          capacity: null,
          roles: [],
        },
        "draft",
      );
    const db = decodeStorage(env.storage.getItem(STORAGE_KEY));
    db.applications.push({
      ...note,
      id: "unavailable",
      projectId: draft.id,
      roleId: "missing-role",
      studentId: CURRENT_STUDENT_ID,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    env.storage.setItem(STORAGE_KEY, encodeStorage(db));
    const entry = await env.api().myApplication("unavailable");
    expect(entry).toMatchObject({
      projectTitle: "Project unavailable",
      roleTitle: "Role unavailable",
      projectHref: null,
      isMember: false,
    });
    expect(JSON.stringify(entry)).not.toContain("Private secret draft");
    await env.api().withdrawApplication("unavailable");
    expect((await env.api().myApplications()).counts.withdrawn).toBe(1);
  });
  it("fails writes without partial updates and preserves existing version 3 records on retry", async () => {
    const env = setup();
    const app = await pending(env);
    const before = env.storage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(before).applications[0]).not.toHaveProperty(
      "withdrawnAt",
    );
    env.setFailure(true);
    await expect(env.api().withdrawApplication(app.id)).rejects.toThrow(
      "could not be saved",
    );
    expect(env.storage.getItem(STORAGE_KEY)).toBe(before);
    expect((await env.api().myApplication(app.id)).application.status).toBe(
      "pending",
    );
    env.setFailure(false);
    await env.api().withdrawApplication(app.id);
    const after = JSON.parse(env.storage.getItem(STORAGE_KEY)!);
    const original = JSON.parse(before);
    expect(after.profiles).toEqual(original.profiles);
    expect(after.memberships).toEqual(original.memberships);
    expect(after.projects).toEqual(original.projects);
  });
});
