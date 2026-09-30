import { z } from "zod";
export const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) =>
      !value ||
      (/^https?:\/\//i.test(value) && z.url().safeParse(value).success),
    "Enter a full http:// or https:// URL.",
  );
export const applicationSchema = z.object({
  motivation: z
    .string()
    .trim()
    .min(50, "Tell us a little more — use at least 50 characters.")
    .max(2000, "Use no more than 2,000 characters."),
  experience: z
    .string()
    .trim()
    .min(20, "Describe your experience in at least 20 characters.")
    .max(2000, "Use no more than 2,000 characters."),
  portfolio: optionalUrl,
});
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
  campus: z.string().trim().min(2, "Enter your university.").max(100),
  department: z.string().trim().min(2, "Enter your department.").max(100),
  semester: z.enum(["1", "2", "3", "4", "5", "6", "7", "8"]),
  bio: z
    .string()
    .trim()
    .min(20, "Write a bio of at least 20 characters.")
    .max(300, "Keep your bio within 300 characters."),
  skillIds: z
    .array(z.string())
    .min(1, "Select at least one skill.")
    .max(15, "Select up to 15 skills."),
  github: optionalUrl,
  linkedin: optionalUrl,
  website: optionalUrl,
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

export const projectTypes = [
  "Hackathon",
  "Personal Project",
  "Research",
  "Startup",
  "Open Source",
] as const;
export const draftRoleSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().max(100),
  responsibilities: z.string().trim().max(600),
  skillIds: z
    .array(z.string())
    .max(15)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Choose each skill only once.",
    ),
  openings: z
    .number()
    .int("Use a whole number.")
    .min(1, "At least one opening is required.")
    .max(100)
    .nullable(),
});
const projectFields = z.object({
  title: z.string().trim().min(1, "Give your project a title.").max(120),
  type: z.union([z.enum(projectTypes), z.literal("")]),
  eventName: z.string().trim().max(120),
  description: z.string().trim().max(1200),
  capacity: z
    .number()
    .int("Use a whole number.")
    .min(2, "Capacity must include you and at least one teammate.")
    .max(100, "Use a capacity of 100 or fewer.")
    .nullable(),
  roles: z.array(draftRoleSchema).max(30, "Use no more than 30 roles."),
});
export const projectDraftSchema = projectFields.superRefine((data, ctx) => {
  if (
    data.capacity !== null &&
    data.roles.reduce((n, r) => n + (r.openings ?? 0), 0) > data.capacity - 1
  )
    ctx.addIssue({
      code: "custom",
      path: ["capacity"],
      message:
        "Role openings exceed capacity. Reserve one place for the owner.",
    });
  if (new Set(data.roles.map((r) => r.id)).size !== data.roles.length)
    ctx.addIssue({
      code: "custom",
      path: ["roles"],
      message: "Role IDs must be unique.",
    });
});
export const projectPublishSchema = projectDraftSchema.superRefine(
  (data, ctx) => {
    if (!data.type)
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: "Select a project type to publish.",
      });
    if (!data.description)
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "Describe your project before publishing.",
      });
    if (data.capacity === null)
      ctx.addIssue({
        code: "custom",
        path: ["capacity"],
        message: "Set the total team capacity.",
      });
    if (!data.roles.length)
      ctx.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Add at least one recruitment role.",
      });
    data.roles.forEach((role, index) => {
      if (!role.title)
        ctx.addIssue({
          code: "custom",
          path: ["roles", index, "title"],
          message: "Give this role a title.",
        });
      if (!role.skillIds.length)
        ctx.addIssue({
          code: "custom",
          path: ["roles", index, "skillIds"],
          message: "Select at least one catalog skill.",
        });
      if (role.openings === null)
        ctx.addIssue({
          code: "custom",
          path: ["roles", index, "openings"],
          message: "Set the number of openings.",
        });
    });
  },
);
export type ProjectInput = z.infer<typeof projectDraftSchema>;
