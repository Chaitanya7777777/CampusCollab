import { describe, expect, it } from "vitest";
import {
  createMockApi,
  defaultFilters,
  STORAGE_KEY,
  type StorageAdapter,
} from "../src/lib/mock-api";
import { createSeed, CURRENT_STUDENT_ID } from "../src/lib/seed";
import { profileSchema, type ProjectInput } from "../src/lib/validation";
function setup() {
  const data = new Map<string, string>();
  let fail = false;
  const storage: StorageAdapter = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw Error("quota");
      data.set(k, v);
    },
  };
  let actor = CURRENT_STUDENT_ID;
  return {
    storage,
    fail: (v: boolean) => {
      fail = v;
    },
    actor: (v: string) => {
      actor = v;
    },
    api: createMockApi(
      () => storage,
      0,
      () => actor,
    ),
  };
}
const note = {
  motivation:
    "I would like to contribute thoughtful design and learn from teammates while we build useful campus tools.",
  experience:
    "I have completed a small engineering course project with a student team.",
  portfolio: "",
};
const projectInput: ProjectInput = {
  title: "Campus Library",
  type: "Open Source",
  eventName: "",
  description: "Build an accessible directory of campus learning resources.",
  capacity: 2,
  roles: [
    {
      id: "r",
      title: "Designer",
      responsibilities: "",
      skillIds: ["figma"],
      openings: 1,
    },
  ],
};
async function pending(
  env: ReturnType<typeof setup>,
  id: string,
  user = "aarav",
) {
  env.actor(user);
  const p = await env.api.project(id);
  return env.api.apply(id, p!.roles[0].id, note);
}
describe("owner application review", () => {
  it("reads previously saved pending applications from the shared v1 records", async () => {
    const env = setup();
    env.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        profile: profileSchema.parse(createSeed().students[0]),
        applications: [
          {
            ...note,
            id: "legacy-app",
            projectId: "smart-traffic",
            roleId: "traffic-backend",
            studentId: CURRENT_STUDENT_ID,
            status: "pending",
            createdAt: "2026-09-30T00:00:00.000Z",
          },
        ],
      }),
    );
    env.actor("aarav");
    const inbox = await env.api.ownerDashboard("smart-traffic");
    expect(inbox.pendingCount).toBe(1);
    expect(inbox.applications[0].application.id).toBe("legacy-app");
    await env.api.reviewApplication("smart-traffic", "legacy-app", "accept");
    expect(
      (await env.api.ownerDashboard("smart-traffic")).project.memberCount,
    ).toBe(4);
    expect(JSON.parse(env.storage.getItem(STORAGE_KEY)!).version).toBe(3);
  });
  it("denies direct inbox and mutation calls from nonowners, including mismatched applications", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    await expect(env.api.ownerDashboard(p.id)).rejects.toThrow(
      "owner permission",
    );
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("owner permission");
    await expect(
      env.api.reviewApplication(p.id, app.id, "reject"),
    ).rejects.toThrow("owner permission");
    await expect(env.api.setRecruitment(p.id, "closed")).rejects.toThrow(
      "owner permission",
    );
    await expect(env.api.archiveProject(p.id)).rejects.toThrow(
      "owner permission",
    );
    env.actor(CURRENT_STUDENT_ID);
    await expect(
      env.api.reviewApplication(p.id, "unrelated", "accept"),
    ).rejects.toThrow("not found");
  });
  it("accepts once, records a decision and membership, and exposes only the applicant’s own status", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    env.actor(CURRENT_STUDENT_ID);
    await env.api.reviewApplication(p.id, app.id, "accept");
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("already processed");
    const owner = await env.api.ownerDashboard(p.id);
    expect(owner.pendingCount).toBe(0);
    expect(owner.project.memberCount).toBe(2);
    expect(owner.project.roles[0].openings).toBe(0);
    expect(owner.applications[0].application.decidedAt).toBeTruthy();
    expect(owner.applications[0].missingSkills).toHaveLength(1);
    expect(owner.applications[0]).not.toHaveProperty("applications");
    env.actor("aarav");
    const own = await env.api.project(p.id);
    expect(own?.application?.status).toBe("accepted");
    expect(own?.team.filter((m) => m.student.id === "aarav")).toHaveLength(1);
    expect((await env.api.myProjects()).joined.some((x) => x.id === p.id)).toBe(
      true,
    );
    const reloaded = createMockApi(
      () => env.storage,
      0,
      () => "aarav",
    );
    expect((await reloaded.project(p.id))?.application?.status).toBe(
      "accepted",
    );
  });
  it("serializes competing acceptances for the final place", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const a = await pending(env, p.id);
    const b = await pending(env, p.id, "sneha");
    env.actor(CURRENT_STUDENT_ID);
    const results = await Promise.allSettled([
      env.api.reviewApplication(p.id, a.id, "accept"),
      env.api.reviewApplication(p.id, b.id, "accept"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const data = await env.api.ownerDashboard(p.id);
    expect(data.project.memberCount).toBe(2);
    expect(
      data.applications.filter((a) => a.application.status === "accepted"),
    ).toHaveLength(1);
    expect(data.pendingCount).toBe(1);
  });
  it("blocks acceptance when the role is full even with team room", async () => {
    const env = setup();
    const p = await env.api.saveProject(
      { ...projectInput, capacity: 4 },
      "publish",
    );
    const a = await pending(env, p.id);
    const b = await pending(env, p.id, "sneha");
    env.actor(CURRENT_STUDENT_ID);
    await env.api.reviewApplication(p.id, a.id, "accept");
    await expect(
      env.api.reviewApplication(p.id, b.id, "accept"),
    ).rejects.toThrow("role is full");
  });
  it("blocks team-full acceptance even when the target role has space", async () => {
    const env = setup();
    const p = await env.api.saveProject(
      {
        ...projectInput,
        capacity: 3,
        roles: [
          ...projectInput.roles,
          { ...projectInput.roles[0], id: "second", title: "Writer" },
        ],
      },
      "publish",
    );
    const app = await pending(env, p.id);
    const stored = JSON.parse(env.storage.getItem(STORAGE_KEY)!);
    stored.memberships.push(
      {
        id: "extra1",
        projectId: p.id,
        studentId: "sneha",
        contribution: "Existing contributor",
      },
      {
        id: "extra2",
        projectId: p.id,
        studentId: "dev",
        contribution: "Existing contributor",
      },
    );
    env.storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    env.actor(CURRENT_STUDENT_ID);
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("team is full");
  });
  it("preserves pending records while closed, blocks new applications/acceptance, and permits rejection", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    env.actor(CURRENT_STUDENT_ID);
    await env.api.setRecruitment(p.id, "closed");
    expect((await env.api.ownerDashboard(p.id)).pendingCount).toBe(1);
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("Recruitment is closed");
    env.actor("sneha");
    await expect(
      env.api.apply(p.id, (await env.api.project(p.id))!.roles[0].id, note),
    ).rejects.toThrow("Recruitment closed");
    env.actor(CURRENT_STUDENT_ID);
    await env.api.reviewApplication(p.id, app.id, "reject");
    expect((await env.api.ownerDashboard(p.id)).project.memberCount).toBe(1);
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("already processed (rejected)");
  });
  it("never accepts a withdrawn application", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    const stored = JSON.parse(env.storage.getItem(STORAGE_KEY)!);
    stored.applications[0].status = "withdrawn";
    env.storage.setItem(STORAGE_KEY, JSON.stringify(stored));
    env.actor(CURRENT_STUDENT_ID);
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("already processed (withdrawn)");
  });
  it("archives without losing records and disables every project mutation", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    env.actor(CURRENT_STUDENT_ID);
    await env.api.archiveProject(p.id);
    const dashboard = await env.api.ownerDashboard(p.id);
    expect(dashboard.project.status).toBe("archived");
    expect(dashboard.project.recruitment).toBe("closed");
    expect(dashboard.pendingCount).toBe(1);
    expect(
      (await env.api.discover(defaultFilters)).projects.some(
        (x) => x.id === p.id,
      ),
    ).toBe(false);
    await expect(
      env.api.reviewApplication(p.id, app.id, "reject"),
    ).rejects.toThrow("read-only");
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("read-only");
    await expect(env.api.setRecruitment(p.id, "open")).rejects.toThrow(
      "read-only",
    );
    await expect(env.api.archiveProject(p.id)).rejects.toThrow("read-only");
    const fresh = createMockApi(() => env.storage, 0);
    expect((await fresh.project(p.id))?.status).toBe("archived");
  });
  it("persists seed recruitment/archive overrides without duplicating or altering seed content", async () => {
    const env = setup();
    env.actor("aarav");
    await env.api.setRecruitment("smart-traffic", "closed");
    expect((await env.api.project("smart-traffic"))?.recruitment).toBe(
      "closed",
    );
    await env.api.archiveProject("smart-traffic");
    const raw = JSON.parse(env.storage.getItem(STORAGE_KEY)!);
    expect(raw.projects).toHaveLength(0);
    expect(Object.keys(raw.seedProjectChanges)).toEqual(["smart-traffic"]);
    expect((await env.api.discover(defaultFilters)).total).toBe(5);
    expect(createSeed().projects[0].recruitment).toBe("open");
    expect(
      (await env.api.ownerDashboard("smart-traffic")).project.roles,
    ).toHaveLength(3);
  });
  it("failed writes leave both status and membership unchanged and can be retried", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    env.actor(CURRENT_STUDENT_ID);
    const before = env.storage.getItem(STORAGE_KEY);
    env.fail(true);
    await expect(
      env.api.reviewApplication(p.id, app.id, "accept"),
    ).rejects.toThrow("could not be saved");
    expect(env.storage.getItem(STORAGE_KEY)).toBe(before);
    const state = await env.api.ownerDashboard(p.id);
    expect(state.project.memberCount).toBe(1);
    expect(state.applications[0].application.status).toBe("pending");
    env.fail(false);
    await env.api.reviewApplication(p.id, app.id, "accept");
    expect((await env.api.ownerDashboard(p.id)).project.memberCount).toBe(2);
  });
  it("migrates a version 2 created project and pending application unchanged", async () => {
    const env = setup();
    const p = await env.api.saveProject(projectInput, "publish");
    const app = await pending(env, p.id);
    const v2 = JSON.parse(env.storage.getItem(STORAGE_KEY)!);
    v2.version = 2;
    delete v2.seedProjectChanges;
    env.storage.setItem(STORAGE_KEY, JSON.stringify(v2));
    env.actor(CURRENT_STUDENT_ID);
    expect(
      (await env.api.ownerDashboard(p.id)).applications[0].application.id,
    ).toBe(app.id);
    await env.api.reviewApplication(p.id, app.id, "reject");
    expect((await env.api.project(p.id))?.title).toBe(projectInput.title);
    expect(JSON.parse(env.storage.getItem(STORAGE_KEY)!).version).toBe(3);
  });
});
