import { applicationSchema } from "./application-contract";
import { z } from "zod";
import { projectDraftSchema } from "./validation";
import type { ProjectView, Student } from "./models";
const skill = z.object({ id: z.string(), name: z.string() });
const person = z
  .object({
    id: z.uuid(),
    name: z.string(),
    campus: z.string(),
    department: z.string(),
    bio: z.string(),
  })
  .transform((p): Student => ({
    ...p,
    email: "",
    semester: "",
    github: "",
    linkedin: "",
    website: "",
    skillIds: [],
  }));
const role = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  positions: z.number().int(),
  skillIds: z.array(z.string()),
  openings: z.number().int(),
});
const member = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  studentId: z.uuid(),
  roleId: z
    .uuid()
    .nullable()
    .transform((v) => v ?? undefined),
  joinedAt: z.string(),
  contribution: z.string(),
});
export const projectViewSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    title: z.string(),
    isSample: z.boolean().default(false),
    summary: z.string(),
    description: z.string(),
    type: z.string(),
    tag: z.string(),
    campus: z.string(),
    capacity: z.number().int().min(2),
    status: z.enum(["published", "archived"]),
    recruitment: z.enum(["open", "closed"]),
    createdAt: z.string(),
    publishedAt: z
      .string()
      .nullable()
      .transform((v) => v ?? undefined),
    archivedAt: z
      .string()
      .nullable()
      .transform((v) => v ?? undefined),
    skillIds: z.array(z.string()),
    skills: z.array(skill),
    owner: person,
    team: z.array(z.object({ membership: member, student: person })),
    roles: z.array(role),
    memberCount: z.number().int(),
    openings: z.number().int(),
    application: applicationSchema.nullable().transform((v) => v ?? undefined),
    eligibility: z.string().nullable(),
  })
  .transform((p): ProjectView => ({ ...p, deliverables: [] }));
export const savedProjectSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  status: z.enum(["draft", "published"]),
  recruitment: z.enum(["open", "closed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  values: projectDraftSchema,
});
export const draftSchema = savedProjectSchema.extend({
  status: z.literal("draft"),
  recruitment: z.literal("closed"),
});
export const discoverySchema = z.object({
  projects: z.array(projectViewSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  types: z.array(z.string()),
  categories: z.array(z.string()),
  campuses: z.array(z.string()),
  skills: z.array(skill),
});
const summary = z.object({
  pendingCount: z.number().int(),
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  type: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  recruitment: z.enum(["open", "closed"]),
  capacity: z.number().nullable(),
  memberCount: z.number().int(),
  openings: z.number().int(),
  roles: z.array(
    z.object({ id: z.uuid(), title: z.string(), openings: z.number().int() }),
  ),
  updatedAt: z.string(),
});
export const myProjectsSchema = z.object({
  owned: z.array(summary),
  joined: z.array(summary),
});
export const managementSchema = z
  .object({
    project: projectViewSchema,
    skills: z.array(skill),
    pendingCount: z.number().int(),
  })
  .transform((p) => ({ ...p, applications: [] }));
