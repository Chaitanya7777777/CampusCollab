import { expect, it } from "vitest";
import { createMockApi, STORAGE_KEY } from "../src/lib/mock-api";
import { cleanSkillName, skillKey } from "../src/lib/skill-normalization";

it.each([
  [" Python ", "python"],
  ["Straße", "STRASSE"],
  ["é", "e\u0301"],
  ["ΟΣ", "οσ"],
  ["İ", "i\u0307"],
  ["A\u00a0 B", "a b"],
])("normalizes %s consistently", (a, b) => {
  expect(skillKey(a)).toBe(skillKey(b));
});
it("preserves punctuation and rejects control characters", () => {
  expect(
    new Set(["C", "C++", "C#", ".NET", "Node.js"].map(skillKey)).size,
  ).toBe(5);
  expect(() => cleanSkillName("bad\nname")).toThrow();
  expect(() => cleanSkillName("x".repeat(81))).toThrow();
});
it("shares mock creations, persists selections, resolves duplicates and never deletes catalog on removal", async () => {
  let raw: string | null = null;
  let actor = "student-maya";
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const api = createMockApi(
    () => storage,
    0,
    () => actor,
  );
  // Use the seed's actual current identity rather than creating accounts.
  actor = (await createMockApi(() => storage, 0).session()).student.id;
  const [a, b] = await Promise.all([
    api.createSkill(" New Skill "),
    api.createSkill("NEW SKILL"),
  ]);
  expect(a).toEqual(b);
  const student = (await api.session()).student;
  await api.saveProfile({
    ...student,
    semester: "3",
    skillIds: [...student.skillIds, a.id],
  });
  const reloaded = createMockApi(
    () => storage,
    0,
    () => actor,
  );
  expect((await reloaded.session()).student.skillIds).toContain(a.id);
  await reloaded.saveProfile({
    ...student,
    semester: "3",
    skillIds: student.skillIds,
  });
  expect(await reloaded.resolveSkill("new skill")).toEqual(a);
  actor = "sneha";
  expect((await reloaded.session()).skills).toContainEqual(a);
  expect((await reloaded.session()).student.skillIds).not.toContain(a.id);
  expect(JSON.parse(raw!).skills).toHaveLength(1);
  expect(STORAGE_KEY).toContain("prototype");
});
it("failed mock writes preserve the prior catalog and forms", async () => {
  const api = createMockApi(
    () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("disk full");
      },
    }),
    0,
  );
  await expect(api.createSkill("Unsaved catalog skill")).rejects.toThrow(
    "could not be saved",
  );
  expect(await api.resolveSkill("Unsaved catalog skill")).toBeNull();
});
