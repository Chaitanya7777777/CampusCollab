import { z } from "zod";
export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  createdAt: z.string(),
});
export const apiProfileSchema = userSchema.extend({
  campus: z.string().nullable(),
  department: z.string().nullable(),
  semester: z.string().nullable(),
  bio: z.string().nullable(),
  github: z.string().nullable(),
  linkedin: z.string().nullable(),
  website: z.string().nullable(),
  skillIds: z.array(z.string()),
  updatedAt: z.string(),
});
export const catalogSchema = z.array(
  z.object({ id: z.string(), name: z.string() }),
);
export type ApiUser = z.infer<typeof userSchema>;
export type ApiProfile = z.infer<typeof apiProfileSchema>;
const optionalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => !v || v.length >= min,
      `Use at least ${min} characters or leave blank.`,
    )
    .max(max);
const link = z
  .string()
  .trim()
  .max(300)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return false;
    }
  }, "Enter an HTTP(S) URL without credentials.");
export const apiProfileFormSchema = z.object({
  name: z.string().trim().min(2).max(80),
  campus: optionalText(2, 100),
  department: optionalText(2, 100),
  semester: z.enum(["", "1", "2", "3", "4", "5", "6", "7", "8"]),
  bio: optionalText(20, 300),
  github: link,
  linkedin: link,
  website: link,
  skillIds: z.array(z.string()).max(15),
});
export type ProfileFormValues = z.infer<typeof apiProfileFormSchema>;
export function profileValues(profile: ApiProfile): ProfileFormValues {
  return apiProfileFormSchema.parse(
    Object.fromEntries(
      Object.keys(apiProfileFormSchema.shape).map((key) => [
        key,
        profile[key as keyof ApiProfile] ?? "",
      ]),
    ),
  );
}
export type ProfilePatch = Partial<
  Omit<ApiProfile, "id" | "email" | "createdAt" | "updatedAt">
>;
export function profilePatch(
  values: ProfileFormValues,
  previous: ProfileFormValues,
): ProfilePatch {
  const patch: Record<string, string | string[] | null> = {};
  for (const key of Object.keys(values) as (keyof ProfileFormValues)[]) {
    if (JSON.stringify(values[key]) !== JSON.stringify(previous[key]))
      patch[key] = values[key] === "" ? null : values[key];
  }
  return patch;
}
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1, "Enter your password.").max(128),
});
export const signupSchema = loginSchema
  .extend({
    name: z.string().trim().min(2).max(80),
    password: z.string().min(12, "Use at least 12 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords must match.",
  });
