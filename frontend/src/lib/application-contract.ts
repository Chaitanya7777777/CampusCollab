import { z } from "zod";
import type { Application, Student } from "./models";
export const applicationSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    roleId: z.uuid(),
    studentId: z.uuid(),
    status: z.enum(["pending", "accepted", "rejected", "withdrawn"]),
    motivation: z.string(),
    experience: z.string(),
    portfolio: z.string(),
    createdAt: z.string(),
    decidedAt: z
      .string()
      .nullable()
      .transform((v) => v ?? undefined),
    withdrawnAt: z
      .string()
      .nullable()
      .transform((v) => v ?? undefined),
  })
  .transform((value): Application => value);
export const applicantEntrySchema = z.object({
  application: applicationSchema,
  projectTitle: z.string(),
  projectType: z.string(),
  roleTitle: z.string(),
  projectStatus: z.enum(["published", "archived", "unavailable"]),
  projectHref: z.string().nullable(),
  isMember: z.boolean(),
});
const skill = z.object({ id: z.string(), name: z.string() });
export const ownerEntrySchema = z.object({
  application: applicationSchema,
  applicant: z
    .object({
      id: z.uuid(),
      name: z.string(),
      campus: z.string(),
      department: z.string(),
      bio: z.string(),
      skillIds: z.array(z.string()),
    })
    .transform((p): Student => ({
      ...p,
      email: "",
      semester: "",
      github: "",
      linkedin: "",
      website: "",
    })),
  role: z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    title: z.string(),
    category: z.string(),
    description: z.string(),
    positions: z.number().int(),
    skillIds: z.array(z.string()),
    openings: z.number().int(),
  }),
  sharedSkills: z.array(skill),
  missingSkills: z.array(skill),
});
const page = z.object({
  counts: z.object({
    all: z.number(),
    pending: z.number(),
    accepted: z.number(),
    rejected: z.number(),
    withdrawn: z.number(),
  }),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const applicantPageSchema = page.extend({
  applications: z.array(applicantEntrySchema),
});
export const ownerPageSchema = page.extend({
  applications: z.array(ownerEntrySchema),
});
