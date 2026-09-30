import { z } from "zod";
import {
  applicationSchema,
  profileSchema,
  projectDraftSchema,
  projectPublishSchema,
} from "./validation";
import { createSeed, CURRENT_STUDENT_ID } from "./seed";
import type { Database } from "./models";

const applicationRecord = applicationSchema.extend({
  id: z.string(),
  projectId: z.string(),
  roleId: z.string(),
  studentId: z.string(),
  status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
  decidedAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
});
const legacySchema = z.object({
  version: z.literal(1),
  profile: profileSchema,
  applications: z.array(
    applicationRecord.extend({ studentId: z.literal(CURRENT_STUDENT_ID) }),
  ),
});
const projectRecord = z.object({
  id: z.string(),
  status: z.enum(["published", "archived"]),
  archivedAt: z.iso.datetime().optional(),
  publishedAt: z.iso.datetime(),
  title: z.string().min(1),
  summary: z.string(),
  description: z.string().min(1),
  type: z.string().min(1),
  tag: z.string(),
  campus: z.string(),
  ownerId: z.string(),
  capacity: z.number().int().min(2).max(100),
  recruitment: z.enum(["open", "closed"]),
  createdAt: z.string(),
  deadline: z.string().optional(),
  skillIds: z.array(z.string()),
  deliverables: z.array(
    z.object({ title: z.string(), description: z.string() }),
  ),
});
const roleRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  category: z.string(),
  description: z.string(),
  positions: z.number().int().positive(),
  skillIds: z.array(z.string()).min(1),
});
const memberRecord = z.object({
  joinedAt: z.iso.datetime().optional(),
  id: z.string(),
  projectId: z.string(),
  studentId: z.string(),
  roleId: z.string().optional(),
  contribution: z.string(),
});
const draftRecord = z.object({
  id: z.string(),
  ownerId: z.string(),
  status: z.literal("draft"),
  recruitment: z.literal("closed"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  values: projectDraftSchema,
});
const storageSchema = z.object({
  version: z.union([z.literal(2), z.literal(3)]),
  seedProjectChanges: z
    .record(
      z.string(),
      z.object({
        status: z.enum(["published", "archived"]),
        recruitment: z.enum(["open", "closed"]),
        archivedAt: z.iso.datetime().optional(),
      }),
    )
    .default({}),
  profiles: z.record(z.string(), profileSchema),
  applications: z.array(applicationRecord),
  projects: z.array(projectRecord),
  roles: z.array(roleRecord),
  memberships: z.array(memberRecord),
  drafts: z.array(draftRecord),
});

export function decodeStorage(raw: string | null): Database {
  const db = createSeed();
  if (!raw) return db;
  try {
    const json: unknown = JSON.parse(raw);
    const legacy = legacySchema.safeParse(json);
    const saved = legacy.success
      ? {
          version: 2 as const,
          seedProjectChanges: {},
          profiles: { [CURRENT_STUDENT_ID]: legacy.data.profile },
          applications: legacy.data.applications,
          projects: [],
          roles: [],
          memberships: [],
          drafts: [],
        }
      : storageSchema.parse(json);
    if (
      Object.keys(saved.profiles).some(
        (id) => !db.students.some((s) => s.id === id),
      )
    )
      throw Error("Unknown student");
    db.students = db.students.map((s) => ({ ...s, ...saved.profiles[s.id] }));
    for (const [id, change] of Object.entries(saved.seedProjectChanges)) {
      const project = db.projects.find((p) => p.id === id);
      if (!project) throw Error("Unknown seed project override");
      Object.assign(project, change);
    }
    db.projects.push(...saved.projects);
    db.roles.push(...saved.roles);
    db.memberships.push(...saved.memberships);
    db.drafts = saved.drafts;
    db.applications = saved.applications;
    validateDatabase(db);
    return db;
  } catch {
    throw new Error(
      "Saved prototype data could not be read. Your stored data has been preserved. Restore a valid backup or contact the developer; no changes were written.",
    );
  }
}
function validateDatabase(db: Database) {
  const unique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw Error("Duplicate record");
  };
  unique([...db.projects, ...db.drafts].map((p) => p.id));
  unique(db.roles.map((r) => r.id));
  unique(db.memberships.map((m) => m.id));
  unique(db.applications.map((a) => a.id));
  unique(db.applications.map((a) => `${a.studentId}/${a.projectId}`));
  unique(db.memberships.map((m) => `${m.studentId}/${m.projectId}`));
  const skills = (ids: string[]) => {
    unique(ids);
    if (ids.some((id) => !db.skills.some((s) => s.id === id)))
      throw Error("Unknown skill");
  };
  const student = (id: string) => {
    if (!db.students.some((s) => s.id === id)) throw Error("Unknown student");
  };
  db.students.forEach((s) => skills(s.skillIds));
  for (const p of [...db.projects, ...db.drafts]) {
    student(p.ownerId);
    const team = db.memberships.filter((m) => m.projectId === p.id);
    if (!team.some((m) => m.studentId === p.ownerId))
      throw Error("Missing owner");
    if (p.status === "draft") {
      projectDraftSchema.parse(p.values);
      if (team.length !== 1 || team[0].studentId !== p.ownerId)
        throw Error("Invalid draft team");
      p.values.roles.forEach((r) => skills(r.skillIds));
    } else {
      skills(p.skillIds);
      if (p.status === "archived" && p.recruitment !== "closed")
        throw Error("Archived recruitment must be closed");
      if (team.length > p.capacity) throw Error("Capacity exceeded");
    }
  }
  db.roles.forEach((r) => {
    skills(r.skillIds);
    if (!db.projects.some((p) => p.id === r.projectId))
      throw Error("Unknown project");
    if (db.memberships.filter((m) => m.roleId === r.id).length > r.positions)
      throw Error("Role capacity exceeded");
  });
  db.memberships.forEach((m) => {
    student(m.studentId);
    if (
      ![...db.projects, ...db.drafts].some((p) => p.id === m.projectId) ||
      (m.roleId &&
        !db.roles.some((r) => r.id === m.roleId && r.projectId === m.projectId))
    )
      throw Error("Invalid membership");
  });
  db.applications.forEach((a) => {
    student(a.studentId);
    if (!db.roles.some((r) => r.id === a.roleId && r.projectId === a.projectId))
      throw Error("Invalid application");
  });
  // Persisted published projects must remain valid even when storage was edited outside the app.
  const seedIds = new Set(createSeed().projects.map((p) => p.id));
  db.projects
    .filter((p) => !seedIds.has(p.id))
    .forEach((p) =>
      projectPublishSchema.parse({
        title: p.title,
        type: p.type,
        eventName: p.tag,
        description: p.description,
        capacity: p.capacity,
        roles: db.roles
          .filter((r) => r.projectId === p.id)
          .map((r) => ({
            id: r.id,
            title: r.title,
            responsibilities: r.description,
            skillIds: r.skillIds,
            openings: r.positions,
          })),
      }),
    );
}
export function encodeStorage(db: Database) {
  validateDatabase(db);
  const seed = createSeed();
  return JSON.stringify(
    storageSchema.parse({
      version: 3,
      seedProjectChanges: Object.fromEntries(
        db.projects
          .filter(
            (p) =>
              seed.projects.some((s) => s.id === p.id) &&
              (p.status === "archived" ||
                p.recruitment !==
                  seed.projects.find((s) => s.id === p.id)!.recruitment),
          )
          .map((p) => [
            p.id,
            {
              status: p.status ?? "published",
              recruitment: p.recruitment,
              archivedAt: p.archivedAt,
            },
          ]),
      ),
      profiles: Object.fromEntries(
        db.students.map((s) => [s.id, profileSchema.parse(s)]),
      ),
      applications: db.applications,
      drafts: db.drafts,
      projects: db.projects.filter(
        (p) => !seed.projects.some((s) => s.id === p.id),
      ),
      roles: db.roles.filter((r) => !seed.roles.some((s) => s.id === r.id)),
      memberships: db.memberships.filter(
        (m) => !seed.memberships.some((s) => s.id === m.id),
      ),
    }),
  );
}
