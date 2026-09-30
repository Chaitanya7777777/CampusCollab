import { describe, expect, it } from "vitest";
import {
  createMockApi,
  defaultFilters,
  filterProjects,
  projectViews,
  STORAGE_KEY,
  type StorageAdapter,
} from "../src/lib/mock-api";
import { createSeed, CURRENT_STUDENT_ID } from "../src/lib/seed";
import { profileSchema } from "../src/lib/validation";
function storage(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}
const application = {
  motivation:
    "I would like to contribute reliable APIs and learn from the team while building useful campus technology.",
  experience:
    "Built a small course project with typed API endpoints and a responsive interface.",
  portfolio: "",
};
describe("discovery", () => {
  const db = createSeed();
  const projects = projectViews(db);
  it("combines search, skills, campus, type, role and recruitment filters", () => {
    expect(
      filterProjects(
        projects,
        {
          ...defaultFilters,
          search: "traffic",
          type: "Hackathon",
          skill: "fastapi",
          campus: "NIT Raipur",
          role: "Backend",
          openingsOnly: true,
        },
        db,
      ).map((p) => p.id),
    ).toEqual(["smart-traffic"]);
    expect(
      filterProjects(
        projects,
        { ...defaultFilters, type: "Hackathon", skill: "react-native" },
        db,
      ),
    ).toEqual([]);
    expect(
      filterProjects(projects, { ...defaultFilters, openingsOnly: true }, db),
    ).toHaveLength(5);
    expect(
      filterProjects(projects, { ...defaultFilters, role: "Robotics" }, db),
    ).toEqual([]);
  });
  it("sorts dates, title and available openings without mutating data", () => {
    expect(
      filterProjects(projects, { ...defaultFilters, sort: "oldest" }, db)[0].id,
    ).toBe("finlit");
    expect(
      filterProjects(projects, { ...defaultFilters, sort: "openings" }, db)[0]
        .id,
    ).toBe("study-planner");
    const titles = filterProjects(
      projects,
      { ...defaultFilters, sort: "title" },
      db,
    ).map((p) => p.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(projects[0].id).toBe("smart-traffic");
  });
  it("derives capacity and openings from memberships including owner", () => {
    for (const p of projects) {
      expect(p.team.filter((m) => m.student.id === p.ownerId)).toHaveLength(1);
      expect(p.memberCount).toBe(
        db.memberships.filter((m) => m.projectId === p.id).length,
      );
      expect(p.memberCount + p.openings).toBeLessThanOrEqual(p.capacity);
    }
  });
});
describe("application boundary", () => {
  it("validates, persists a pending role application and blocks duplicates after reload", async () => {
    const local = storage();
    const api = createMockApi(() => local, 0);
    await expect(
      api.apply("smart-traffic", "traffic-backend", {
        ...application,
        motivation: "short",
      }),
    ).rejects.toThrow();
    const saved = await api.apply(
      "smart-traffic",
      "traffic-backend",
      application,
    );
    expect(saved.status).toBe("pending");
    expect(saved.roleId).toBe("traffic-backend");
    const reloaded = createMockApi(() => local, 0);
    expect((await reloaded.project("smart-traffic"))?.application?.id).toBe(
      saved.id,
    );
    await expect(
      reloaded.apply("smart-traffic", "traffic-vision", application),
    ).rejects.toThrow("Application pending");
  });
  it("blocks closed recruitment, membership, filled roles and mismatched role IDs", async () => {
    const api = createMockApi(() => storage(), 0);
    await expect(
      api.apply("campus-rover", "rover-robotics", application),
    ).rejects.toThrow("Recruitment closed");
    await expect(
      api.apply("lost-and-found", "lost-frontend", application),
    ).rejects.toThrow("already a team member");
    await expect(
      api.apply("smart-traffic", "traffic-frontend", application),
    ).rejects.toThrow("no longer available");
    await expect(
      api.apply("smart-traffic", "finlit-mobile", application),
    ).rejects.toThrow("no longer available");
  });
  it("allows missing skills but serializes simultaneous duplicate submissions", async () => {
    const local = storage();
    const api = createMockApi(() => local, 0);
    const results = await Promise.allSettled([
      api.apply("smart-traffic", "traffic-vision", application),
      api.apply("smart-traffic", "traffic-backend", application),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await api.project("smart-traffic"))?.application?.roleId).toBe(
      "traffic-vision",
    );
  });
  it("does not expose another student’s application through a project query", async () => {
    const api = createMockApi(() => storage(), 0);
    expect((await api.session()).student.id).toBe(CURRENT_STUDENT_ID);
    expect((await api.project("autooxy"))?.application).toBeUndefined();
  });
});
describe("profile persistence and storage errors", () => {
  it("saves validated catalog skills and identity across API instances", async () => {
    const local = storage();
    const api = createMockApi(() => local, 0);
    const profile = profileSchema.parse((await api.session()).student);
    await api.saveProfile({
      ...profile,
      name: "Maya Demo",
      skillIds: ["react", "figma"],
    });
    const next = createMockApi(() => local, 0);
    expect((await next.session()).student.name).toBe("Maya Demo");
    expect((await next.session()).student.skillIds).toEqual(["react", "figma"]);
    expect(
      (await next.project("lost-and-found"))?.team.find(
        (m) => m.student.id === CURRENT_STUDENT_ID,
      )?.student.name,
    ).toBe("Maya Demo");
    await expect(
      api.saveProfile({ ...profile, skillIds: ["invented"] }),
    ).rejects.toThrow("catalog");
    await expect(
      api.saveProfile({ ...profile, website: "javascript:alert(1)" }),
    ).rejects.toThrow();
  });
  it("reports corrupted and unavailable storage instead of silently losing data", async () => {
    const local = storage();
    local.setItem(STORAGE_KEY, "not-json");
    await expect(createMockApi(() => local, 0).session()).rejects.toThrow(
      "could not be read",
    );
    await expect(
      createMockApi(() => {
        throw Error("blocked");
      }, 0).session(),
    ).rejects.toThrow("unavailable");
  });
  it("does not report success when storage cannot save", async () => {
    const local = storage();
    const api = createMockApi(
      () => ({
        ...local,
        setItem: () => {
          throw Error("quota");
        },
      }),
      0,
    );
    await expect(
      api.apply("smart-traffic", "traffic-backend", application),
    ).rejects.toThrow("could not be saved");
  });
});
