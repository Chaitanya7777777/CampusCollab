import { describe, expect, it } from "vitest";
import {
  createMockApi,
  defaultFilters,
  STORAGE_KEY,
  type StorageAdapter,
} from "../src/lib/mock-api";
import { createSeed, CURRENT_STUDENT_ID } from "../src/lib/seed";
import { profileSchema, type ProjectInput } from "../src/lib/validation";
function setup(latency = 0) {
  const data = new Map<string, string>();
  const storage: StorageAdapter = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  let actor = CURRENT_STUDENT_ID;
  return {
    data,
    storage,
    actor: (id: string) => {
      actor = id;
    },
    api: createMockApi(
      () => storage,
      latency,
      () => actor,
    ),
  };
}
const draft: ProjectInput = {
  title: "Campus Energy Grid",
  type: "",
  eventName: "",
  description: "",
  capacity: null,
  roles: [],
};
const complete: ProjectInput = {
  ...draft,
  type: "Hackathon",
  description:
    "Build a small campus energy dashboard with clear sensor readings.",
  capacity: 5,
  roles: [
    {
      id: "backend",
      title: "Backend Developer",
      responsibilities: "Connect sensor data.",
      skillIds: ["fastapi"],
      openings: 2,
    },
  ],
};
const application = {
  motivation:
    "I would like to help build a reliable campus energy dashboard and learn alongside the team.",
  experience: "I built a small sensor dashboard in a recent university course.",
  portfolio: "",
};
describe("create and publish projects", () => {
  it("saves an incomplete draft, reloads and publishes the same ID with one owner membership", async () => {
    const env = setup();
    const saved = await env.api.saveProject(draft, "draft");
    expect((await env.api.draft(saved.id)).recruitment).toBe("closed");
    expect((await env.api.discover(defaultFilters)).total).toBe(6);
    const reloaded = createMockApi(() => env.storage, 0);
    await reloaded.saveProject(
      { ...draft, title: "Updated draft" },
      "draft",
      saved.id,
    );
    expect(await reloaded.drafts()).toHaveLength(1);
    const published = await reloaded.saveProject(complete, "publish", saved.id);
    expect(published.id).toBe(saved.id);
    const project = await reloaded.project(saved.id);
    expect(project?.status).toBe("published");
    expect(project?.publishedAt).toBeTruthy();
    expect(project?.recruitment).toBe("open");
    expect(project?.memberCount).toBe(1);
    expect(project?.team[0].student.id).toBe(CURRENT_STUDENT_ID);
    expect(project?.openings).toBe(2);
    expect((await reloaded.discover(defaultFilters)).total).toBe(7);
    expect(await reloaded.drafts()).toHaveLength(0);
    expect(
      JSON.parse(env.storage.getItem(STORAGE_KEY)!).memberships,
    ).toHaveLength(1);
    await expect(
      reloaded.saveProject(complete, "draft", saved.id),
    ).rejects.toThrow("permission");
  });
  it("blocks non-owner draft access and edits through direct API calls", async () => {
    const env = setup();
    const saved = await env.api.saveProject(draft, "draft");
    env.actor("aarav");
    expect(await env.api.drafts()).toHaveLength(0);
    expect(await env.api.project(saved.id)).toBeNull();
    await expect(env.api.draft(saved.id)).rejects.toThrow("permission");
    await expect(
      env.api.saveProject(complete, "publish", saved.id),
    ).rejects.toThrow("permission");
    await expect(env.api.saveProject(draft, "draft", saved.id)).rejects.toThrow(
      "permission",
    );
  });
  it("derives ownership from the actor, never from supplied fields or role titles", async () => {
    const env = setup();
    env.actor("sneha");
    const saved = await env.api.saveProject(
      { ...complete, ownerId: "aarav" } as ProjectInput,
      "publish",
    );
    const project = await env.api.project(saved.id);
    expect(project?.ownerId).toBe("sneha");
    expect(project?.team[0].student.id).toBe("sneha");
    env.actor("aarav");
    await expect(env.api.saveProject(draft, "draft", saved.id)).rejects.toThrow(
      "permission",
    );
  });
  it("validates publishing separately and permits incomplete valid draft values", async () => {
    const env = setup();
    await env.api.saveProject(
      {
        ...draft,
        roles: [
          {
            id: "r",
            title: "",
            responsibilities: "",
            skillIds: [],
            openings: null,
          },
        ],
      },
      "draft",
    );
    await expect(env.api.saveProject(draft, "publish")).rejects.toThrow();
    for (const values of [
      { ...complete, type: "" as const },
      { ...complete, description: "" },
      { ...complete, roles: [] },
      { ...complete, roles: [{ ...complete.roles[0], skillIds: [] }] },
      { ...complete, roles: [{ ...complete.roles[0], title: "" }] },
    ])
      await expect(env.api.saveProject(values, "publish")).rejects.toThrow();
    expect(await env.api.drafts()).toHaveLength(1);
  });
  it("rejects overflow, nonpositive/fractional openings, low capacity, and noncatalog skills", async () => {
    const env = setup();
    for (const values of [
      { ...complete, capacity: 2 },
      { ...complete, capacity: 1 },
      { ...complete, roles: [{ ...complete.roles[0], openings: 0 }] },
      { ...complete, roles: [{ ...complete.roles[0], openings: 1.5 }] },
      { ...complete, roles: [{ ...complete.roles[0], skillIds: ["fake"] }] },
    ])
      await expect(env.api.saveProject(values, "draft")).rejects.toThrow();
    expect(env.storage.getItem(STORAGE_KEY)).toBeNull();
  });
  it("allows another demo student to apply, isolates applications, and preserves both profiles", async () => {
    const env = setup();
    const saved = await env.api.saveProject(complete, "publish");
    env.actor("aarav");
    const project = await env.api.project(saved.id);
    await env.api.apply(saved.id, project!.roles[0].id, application);
    const profile = profileSchema.parse((await env.api.session()).student);
    await env.api.saveProfile({ ...profile, name: "Aarav Demo" });
    expect((await env.api.project(saved.id))?.application?.studentId).toBe(
      "aarav",
    );
    env.actor(CURRENT_STUDENT_ID);
    expect((await env.api.project(saved.id))?.application).toBeUndefined();
    expect((await env.api.session()).student.name).toBe("Maya Rao");
    env.actor("aarav");
    expect((await env.api.session()).student.name).toBe("Aarav Demo");
  });
  it("cancels a delayed mutation when the actor changes before it writes", async () => {
    const env = setup(15);
    const pending = env.api.saveProject(complete, "publish");
    env.actor("sneha");
    await expect(pending).rejects.toThrow("Demo user changed");
    expect(env.storage.getItem(STORAGE_KEY)).toBeNull();
  });
});
describe("storage migration and atomicity", () => {
  it("preserves v1 profile and application data when another user writes v2", async () => {
    const env = setup();
    const profile = profileSchema.parse(createSeed().students[0]);
    const legacy = {
      version: 1,
      profile: { ...profile, name: "Maya Legacy" },
      applications: [
        {
          ...application,
          id: "old-app",
          studentId: CURRENT_STUDENT_ID,
          projectId: "smart-traffic",
          roleId: "traffic-backend",
          status: "pending",
          createdAt: "2026-09-30T00:00:00.000Z",
        },
      ],
    };
    env.storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect((await env.api.session()).student.name).toBe("Maya Legacy");
    expect(JSON.parse(env.storage.getItem(STORAGE_KEY)!).version).toBe(1);
    env.actor("aarav");
    await env.api.saveProject(complete, "publish");
    env.actor(CURRENT_STUDENT_ID);
    expect((await env.api.session()).student.name).toBe("Maya Legacy");
    expect((await env.api.project("smart-traffic"))?.application?.id).toBe(
      "old-app",
    );
    expect(JSON.parse(env.storage.getItem(STORAGE_KEY)!).version).toBe(3);
  });
  it("does not replace unknown or corrupt storage on reads or mutations", async () => {
    const env = setup();
    const raw = JSON.stringify({ version: 99, important: "Keep me" });
    env.storage.setItem(STORAGE_KEY, raw);
    await expect(env.api.session()).rejects.toThrow("preserved");
    await expect(env.api.saveProject(complete, "publish")).rejects.toThrow(
      "preserved",
    );
    expect(env.storage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it("failed creation or publication writes leave no partial projects, roles or memberships", async () => {
    const env = setup();
    let fail = false;
    const api = createMockApi(
      () => ({
        ...env.storage,
        setItem: (key, value) => {
          if (fail) throw Error("quota");
          env.storage.setItem(key, value);
        },
      }),
      0,
    );
    fail = true;
    await expect(api.saveProject(complete, "publish")).rejects.toThrow(
      "could not be saved",
    );
    expect(env.storage.getItem(STORAGE_KEY)).toBeNull();
    fail = false;
    const saved = await api.saveProject(draft, "draft");
    const before = env.storage.getItem(STORAGE_KEY);
    fail = true;
    await expect(
      api.saveProject(complete, "publish", saved.id),
    ).rejects.toThrow("could not be saved");
    expect(env.storage.getItem(STORAGE_KEY)).toBe(before);
    expect((await api.draft(saved.id)).values).toEqual(draft);
    expect(await api.project(saved.id)).toBeNull();
  });
});
