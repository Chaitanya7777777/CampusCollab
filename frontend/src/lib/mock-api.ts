import { decodeStorage, encodeStorage } from "./mock-storage";
import { getActor } from "./demo-identity";
import { CURRENT_STUDENT_ID } from "./seed";
import {
  projectDraftSchema,
  projectPublishSchema,
  type ProjectInput,
  applicationSchema,
  profileSchema,
  type ApplicationInput,
  type ProfileInput,
} from "./validation";
import type {
  Database,
  DiscoveryFilters,
  ProjectView,
  OwnerDashboard,
  MyProjectSummary,
} from "./models";

export const STORAGE_KEY = "campuscollab.prototype.v1";
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function requireOwner(db: Database, projectId: string, actor: string) {
  const project = db.projects.find(
    (p) => p.id === projectId && p.ownerId === actor,
  );
  if (!project)
    throw new Error("Project not found or you do not have owner permission.");
  return project;
}
export const defaultFilters: DiscoveryFilters = {
  search: "",
  type: "",
  skill: "",
  role: "",
  campus: "",
  openingsOnly: false,
  sort: "newest",
};

export function projectViews(
  db: Database,
  actor = CURRENT_STUDENT_ID,
): ProjectView[] {
  return db.projects.map((project) => {
    const team = db.memberships
      .filter((m) => m.projectId === project.id)
      .map((membership) => ({
        membership,
        student: db.students.find((s) => s.id === membership.studentId)!,
      }));
    const roles = db.roles
      .filter((r) => r.projectId === project.id)
      .map((role) => ({
        ...role,
        openings: Math.max(
          0,
          role.positions -
            team.filter((m) => m.membership.roleId === role.id).length,
        ),
      }));
    const openings =
      project.recruitment === "closed"
        ? 0
        : Math.min(
            project.capacity - team.length,
            roles.reduce((sum, r) => sum + r.openings, 0),
          );
    const application = db.applications.find(
      (a) => a.projectId === project.id && a.studentId === actor,
    );
    const eligibility =
      project.status === "archived"
        ? "Project archived"
        : team.some((m) => m.student.id === actor)
          ? "You are already a team member."
          : application
            ? `Application ${application.status}`
            : project.recruitment === "closed" || openings <= 0
              ? "Recruitment closed"
              : null;
    return {
      ...project,
      owner: db.students.find((s) => s.id === project.ownerId)!,
      team,
      roles,
      memberCount: team.length,
      openings,
      skills: db.skills.filter((s) => project.skillIds.includes(s.id)),
      application,
      eligibility,
    };
  });
}
export function filterProjects(
  projects: ProjectView[],
  filters: DiscoveryFilters,
  db: Database,
) {
  const search = filters.search.trim().toLowerCase();
  return projects
    .filter((p) => {
      if (p.status === "archived") return false;
      const searchableSkills = db.skills
        .filter(
          (s) =>
            p.skillIds.includes(s.id) ||
            p.roles.some((r) => r.skillIds.includes(s.id)),
        )
        .map((s) => s.name);
      return (
        (!search ||
          [
            p.title,
            p.summary,
            p.tag,
            p.campus,
            ...searchableSkills,
            ...p.roles.map((r) => r.title),
          ]
            .join(" ")
            .toLowerCase()
            .includes(search)) &&
        (!filters.type || p.type === filters.type) &&
        (!filters.skill ||
          p.skillIds.includes(filters.skill) ||
          p.roles.some((r) => r.skillIds.includes(filters.skill))) &&
        (!filters.role ||
          (p.recruitment === "open" &&
            p.openings > 0 &&
            p.roles.some(
              (r) => r.category === filters.role && r.openings > 0,
            ))) &&
        (!filters.campus || p.campus === filters.campus) &&
        (!filters.openingsOnly || p.openings > 0)
      );
    })
    .sort((a, b) =>
      filters.sort === "title"
        ? a.title.localeCompare(b.title)
        : filters.sort === "openings"
          ? b.openings - a.openings
          : filters.sort === "oldest"
            ? (a.publishedAt ?? a.createdAt).localeCompare(
                b.publishedAt ?? b.createdAt,
              )
            : (b.publishedAt ?? b.createdAt).localeCompare(
                a.publishedAt ?? a.createdAt,
              ),
    );
}

// All browser storage access happens inside asynchronous client queries, never at import/render time.
export function createMockApi(
  getStorage: () => StorageAdapter,
  latency = 180,
  actorSource: () => string = () => CURRENT_STUDENT_ID,
) {
  const delay = () => new Promise((resolve) => setTimeout(resolve, latency));
  function read() {
    let raw: string | null;
    try {
      raw = getStorage().getItem(STORAGE_KEY);
    } catch {
      throw new Error(
        "Browser storage is unavailable. Allow site storage and retry to load your saved profile and applications.",
      );
    }
    return decodeStorage(raw);
  }
  function write(db: Database) {
    const encoded = encodeStorage(db);
    try {
      getStorage().setItem(STORAGE_KEY, encoded);
    } catch {
      throw new Error(
        "Your changes could not be saved. Check browser storage space and permissions, then try again.",
      );
    }
  }
  async function mutate<T>(operation: () => T) {
    const actor = actorSource();
    const guarded = () => {
      if (actorSource() !== actor)
        throw new Error("Demo user changed. Please try again.");
      return operation();
    };
    await delay();
    if (typeof window !== "undefined" && navigator.locks)
      return navigator.locks.request(STORAGE_KEY, guarded);
    return guarded(); // Synchronous read/validate/write also serializes calls within one tab.
  }
  return {
    async myProjects(): Promise<{
      owned: MyProjectSummary[];
      joined: MyProjectSummary[];
    }> {
      const actor = actorSource();
      await delay();
      const db = read();
      const summarize = (p: ProjectView, owned: boolean): MyProjectSummary => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        type: p.type,
        status: p.status ?? "published",
        recruitment: p.recruitment,
        capacity: p.capacity,
        memberCount: p.memberCount,
        openings: p.openings,
        roles: p.roles.map((r) => ({
          id: r.id,
          title: r.title,
          openings: r.openings,
        })),
        pendingCount: owned
          ? db.applications.filter(
              (a) => a.projectId === p.id && a.status === "pending",
            ).length
          : undefined,
        updatedAt: p.archivedAt ?? p.publishedAt ?? p.createdAt,
      });
      const projects = projectViews(db, actor);
      const owned = projects
        .filter((p) => p.ownerId === actor)
        .map((p) => summarize(p, true));
      owned.push(
        ...db.drafts
          .filter((d) => d.ownerId === actor)
          .map((d) => ({
            id: d.id,
            title: d.values.title,
            summary: d.values.description,
            type: d.values.type,
            status: "draft" as const,
            recruitment: "closed" as const,
            capacity: d.values.capacity,
            memberCount: db.memberships.filter((m) => m.projectId === d.id)
              .length,
            openings: d.values.roles.reduce(
              (sum, r) => sum + (r.openings ?? 0),
              0,
            ),
            roles: d.values.roles.map((r) => ({
              id: r.id,
              title: r.title,
              openings: r.openings ?? 0,
            })),
            pendingCount: 0,
            updatedAt: d.updatedAt,
          })),
      );
      return {
        owned: owned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        joined: projects
          .filter(
            (p) =>
              p.ownerId !== actor && p.team.some((m) => m.student.id === actor),
          )
          .map((p) => summarize(p, false)),
      };
    },
    async ownerDashboard(projectId: string): Promise<OwnerDashboard> {
      const actor = actorSource();
      await delay();
      const db = read();
      requireOwner(db, projectId, actor);
      const project = projectViews(db, actor).find((p) => p.id === projectId)!;
      const applications = db.applications
        .filter((a) => a.projectId === projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((application) => {
          const applicant = db.students.find(
            (s) => s.id === application.studentId,
          )!;
          const role = project.roles.find((r) => r.id === application.roleId);
          if (!role)
            throw new Error(
              "Application role does not belong to this project.",
            );
          return {
            application,
            applicant,
            role,
            sharedSkills: db.skills.filter(
              (s) =>
                role.skillIds.includes(s.id) &&
                applicant.skillIds.includes(s.id),
            ),
            missingSkills: db.skills.filter(
              (s) =>
                role.skillIds.includes(s.id) &&
                !applicant.skillIds.includes(s.id),
            ),
          };
        });
      return {
        project,
        applications,
        skills: db.skills,
        pendingCount: applications.filter(
          (a) => a.application.status === "pending",
        ).length,
      };
    },
    async reviewApplication(
      projectId: string,
      applicationId: string,
      decision: "accept" | "reject",
    ) {
      const actor = actorSource();
      return mutate(() => {
        const db = read();
        const project = requireOwner(db, projectId, actor);
        if (project.status === "archived")
          throw new Error("Archived projects are read-only.");
        if (decision !== "accept" && decision !== "reject")
          throw new Error("Unknown decision.");
        const application = db.applications.find(
          (a) => a.id === applicationId && a.projectId === projectId,
        );
        if (!application)
          throw new Error("Application not found for this project.");
        const role = db.roles.find(
          (r) => r.id === application.roleId && r.projectId === projectId,
        );
        if (!role)
          throw new Error("Application role does not belong to this project.");
        if (application.status !== "pending")
          throw new Error(
            `Application already processed (${application.status}). Refresh to see the latest status.`,
          );
        const now = new Date().toISOString();
        if (decision === "accept") {
          if (project.recruitment !== "open")
            throw new Error(
              "Recruitment is closed. Reopen recruitment before accepting.",
            );
          const team = db.memberships.filter((m) => m.projectId === projectId);
          if (team.some((m) => m.studentId === application.studentId))
            throw new Error("Applicant is already a team member.");
          if (team.length >= project.capacity)
            throw new Error("The team is full.");
          if (team.filter((m) => m.roleId === role.id).length >= role.positions)
            throw new Error("This role is full.");
          db.memberships.push({
            id: `member-${crypto.randomUUID()}`,
            projectId,
            studentId: application.studentId,
            roleId: role.id,
            contribution: role.title,
            joinedAt: now,
          });
          application.status = "accepted";
        } else application.status = "rejected";
        application.decidedAt = now;
        write(db);
        return application;
      });
    },
    async setRecruitment(projectId: string, recruitment: "open" | "closed") {
      const actor = actorSource();
      return mutate(() => {
        const db = read();
        const project = requireOwner(db, projectId, actor);
        if (project.status === "archived")
          throw new Error("Archived projects are read-only.");
        if (recruitment !== "open" && recruitment !== "closed")
          throw new Error("Invalid recruitment status.");
        project.recruitment = recruitment;
        write(db);
        return { recruitment };
      });
    },
    async archiveProject(projectId: string) {
      const actor = actorSource();
      return mutate(() => {
        const db = read();
        const project = requireOwner(db, projectId, actor);
        if (project.status === "archived")
          throw new Error("Archived projects are read-only.");
        project.status = "archived";
        project.recruitment = "closed";
        project.archivedAt = new Date().toISOString();
        write(db);
        return { status: "archived" as const };
      });
    },
    async drafts() {
      const actor = actorSource();
      await delay();
      return read().drafts.filter((d) => d.ownerId === actor);
    },
    async draft(id: string) {
      const actor = actorSource();
      await delay();
      const draft = read().drafts.find(
        (d) => d.id === id && d.ownerId === actor,
      );
      if (!draft)
        throw new Error(
          "Draft not found or you do not have permission to edit it.",
        );
      return draft;
    },
    async saveProject(
      input: ProjectInput,
      action: "draft" | "publish",
      projectId?: string,
    ) {
      const actor = actorSource();
      return mutate(() => {
        if (action !== "draft" && action !== "publish")
          throw new Error("Unknown project action.");
        const values = (
          action === "publish" ? projectPublishSchema : projectDraftSchema
        ).parse(input);
        const db = read();
        const owner = db.students.find((s) => s.id === actor);
        if (!owner) throw new Error("Unknown demo user.");
        const existing = projectId
          ? db.drafts.find((d) => d.id === projectId && d.ownerId === actor)
          : undefined;
        if (projectId && !existing)
          throw new Error(
            "Draft not found or you do not have permission to edit it.",
          );
        if (
          values.roles.some((r) =>
            r.skillIds.some((id) => !db.skills.some((s) => s.id === id)),
          )
        )
          throw new Error("Choose skills from the catalog.");
        const id = existing?.id ?? `project-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        if (!existing)
          db.memberships.push({
            id: `member-${crypto.randomUUID()}`,
            projectId: id,
            studentId: actor,
            contribution: "Project owner",
            joinedAt: now,
          });
        const draft = {
          id,
          ownerId: actor,
          status: "draft" as const,
          recruitment: "closed" as const,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          values,
        };
        db.drafts = db.drafts.filter((d) => d.id !== id);
        if (action === "draft") db.drafts.push(draft);
        else {
          const roles = values.roles.map((r) => ({
            id: `${id}/${r.id}`,
            projectId: id,
            title: r.title,
            category: r.title,
            description: r.responsibilities,
            positions: r.openings!,
            skillIds: r.skillIds,
          }));
          db.roles.push(...roles);
          db.projects.push({
            id,
            ownerId: actor,
            status: "published",
            publishedAt: now,
            createdAt: draft.createdAt,
            title: values.title,
            type: values.type,
            description: values.description,
            summary:
              values.description.length > 180
                ? `${values.description.slice(0, 177)}…`
                : values.description,
            tag: values.eventName,
            campus: owner.campus,
            capacity: values.capacity!,
            recruitment: "open",
            skillIds: [...new Set(roles.flatMap((r) => r.skillIds))],
            deliverables: [],
          });
        }
        write(db);
        return {
          id,
          status:
            action === "draft" ? ("draft" as const) : ("published" as const),
          values,
        };
      });
    },
    async session() {
      const actor = actorSource();
      await delay();
      const db = read();
      return {
        student: db.students.find((s) => s.id === actor)!,
        skills: db.skills,
        projects: projectViews(db, actor).filter((p) =>
          p.team.some((m) => m.student.id === actor),
        ),
      };
    },
    async discover(filters: DiscoveryFilters) {
      const actor = actorSource();
      await delay();
      const db = read();
      return {
        projects: filterProjects(projectViews(db, actor), filters, db),
        total: db.projects.filter((p) => p.status !== "archived").length,
        skills: db.skills,
        types: [...new Set(db.projects.map((p) => p.type))],
        campuses: [...new Set(db.projects.map((p) => p.campus))],
        categories: [...new Set(db.roles.map((r) => r.category))],
      };
    },
    async project(id: string) {
      const actor = actorSource();
      await delay();
      return projectViews(read(), actor).find((p) => p.id === id) ?? null;
    },
    async saveProfile(input: ProfileInput) {
      const actor = actorSource();
      return mutate(() => {
        const profile = profileSchema.parse(input);
        const db = read();
        if (
          profile.skillIds.some((id) => !db.skills.some((s) => s.id === id)) ||
          new Set(profile.skillIds).size !== profile.skillIds.length
        )
          throw new Error("Choose unique skills from the catalog.");
        const student = {
          ...db.students.find((s) => s.id === actor)!,
          ...profile,
        };
        db.students = db.students.map((s) =>
          s.id === student.id ? student : s,
        );
        write(db);
        return student;
      });
    },
    async apply(projectId: string, roleId: string, input: ApplicationInput) {
      const actor = actorSource();
      return mutate(() => {
        const fields = applicationSchema.parse(input);
        const db = read();
        const project = projectViews(db, actor).find((p) => p.id === projectId);
        if (!project) throw new Error("This project no longer exists.");
        if (project.eligibility) throw new Error(project.eligibility);
        const role = project.roles.find((r) => r.id === roleId);
        if (!role || role.openings < 1)
          throw new Error("This recruitment role is no longer available.");
        const application = {
          ...fields,
          id: crypto.randomUUID(),
          projectId,
          roleId,
          studentId: actor,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
        };
        db.applications.push(application);
        write(db);
        return application;
      });
    },
  };
}
export const mockApi = createMockApi(() => window.localStorage, 180, getActor);
