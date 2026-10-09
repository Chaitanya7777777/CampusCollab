import {
  applicationSchema,
  applicantEntrySchema,
  applicantPageSchema,
  ownerEntrySchema,
  ownerPageSchema,
} from "./application-contract";
import type { ApplicationFilters } from "./models";
import type { ApplicationInput } from "./validation";
import { z } from "zod";
import {
  projectViewSchema,
  savedProjectSchema,
  draftSchema,
  discoverySchema,
  myProjectsSchema,
  managementSchema,
} from "./project-contract";
import type { DiscoveryFilters } from "./models";
import type { ProjectInput } from "./validation";
import {
  apiProfileSchema,
  pendingRegistrationSchema,
  catalogSchema,
  userSchema,
  type ProfilePatch,
} from "./api-contract";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public detail = "",
  ) {
    super(message);
  }
}
export class ApiClient {
  private token: string | null = null;
  private epoch = 0;
  constructor(
    private base = process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:8000/api/v1",
  ) {}
  reset() {
    this.epoch++;
    this.token = null;
  }
  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const epoch = this.epoch;
    let response: Response;
    const timeout = AbortSignal.timeout(25000);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    try {
      response = await fetch(`${this.base.replace(/\/$/, "")}${path}`, {
        ...init,
        signal,
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new ApiError(
        "Cannot reach CampusCollab. Check your connection and that the backend is running.",
      );
    }
    if (epoch !== this.epoch)
      throw new ApiError("Session changed. Please try again.");
    if (response.status === 204) return undefined;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "The backend returned an unexpected response.",
        response.status,
      );
    }
    if (epoch !== this.epoch)
      throw new ApiError("Session changed. Please try again.");
    if (!response.ok) {
      if (
        response.status === 401 &&
        !path.startsWith("/auth/") &&
        typeof window !== "undefined"
      )
        window.dispatchEvent(new Event("campuscollab-session-expired"));
      const parsed = z.object({ detail: z.unknown() }).safeParse(data);
      const detail =
        parsed.success && typeof parsed.data.detail === "string"
          ? parsed.data.detail
          : "";
      const registrationMessages: Record<string, string> = {
        incorrect_code:
          "That code is incorrect. Enter the latest six-digit code from your email.",
        registration_expired:
          "This registration has expired. Start again to get a new code.",
        registration_exhausted:
          "Too many incorrect codes. Start again; request limits still apply.",
        registration_closed:
          "This registration was replaced or already used. Start again or log in.",
        registration_unavailable:
          "Registration cannot be completed. Try logging in or recovering your password.",
      };
      const message =
        registrationMessages[detail] ??
        (response.status === 429
          ? `Too many attempts. Try again in ${Math.max(1, Math.ceil(Number(response.headers.get("Retry-After") || 900) / 60))} minute(s).`
          : detail === "email_verification_required"
            ? "Verify your email from your profile before publishing or applying. You can still save a draft."
            : detail === "invalid_or_expired_link"
              ? "This link is invalid, expired, or already used. Request a new email and use its latest link."
              : response.status === 401
                ? "Invalid email or password, or your session has expired."
                : response.status === 409
                  ? path.startsWith("/projects") ||
                    path.startsWith("/applications")
                    ? detail || "This project changed. Refresh and try again."
                    : "An account with this email already exists. Sign in instead."
                  : response.status === 422
                    ? "Some fields were rejected. Check their format and length, then try again."
                    : response.status === 503 &&
                        detail.startsWith("Backend is waking up")
                      ? "The backend may be waking up. Wait a moment and try again. Before repeating a save or application, refresh to check whether it completed."
                      : response.status >= 500
                        ? "The backend is temporarily unavailable. Please try again."
                        : "The request was not permitted. Please refresh your session and try again.");
      throw new ApiError(message, response.status, detail);
    }
    return data;
  }
  private parse<T>(schema: z.ZodType<T>, data: unknown): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ApiError("The backend returned an unexpected response.");
    return parsed.data;
  }
  async bootstrap() {
    const data = this.parse(
      z.object({ csrfToken: z.string().min(1) }),
      await this.request("/auth/csrf"),
    );
    this.token = data.csrfToken;
    return this.token;
  }
  private async mutate(path: string, method: string, body?: unknown) {
    const token = this.token ?? (await this.bootstrap());
    try {
      return await this.request(path, {
        method,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        error.detail === "Invalid or expired CSRF token"
      ) {
        this.token = null;
        await this.bootstrap();
        // The backend rejected this request before mutation. Require an explicit retry,
        // which also gives session synchronization time to detect another tab's identity.
        throw new ApiError(
          "Security token refreshed. Please try again.",
          403,
          error.detail,
        );
      }
      throw error;
    }
  }
  async me(signal?: AbortSignal) {
    try {
      return this.parse(userSchema, await this.request("/auth/me", { signal }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  }
  async startRegistration(values: unknown) {
    return this.parse(
      pendingRegistrationSchema,
      await this.mutate("/auth/register", "POST", values),
    );
  }
  async resendRegistration(registrationId: string) {
    return this.parse(
      pendingRegistrationSchema,
      await this.mutate("/auth/register/resend", "POST", { registrationId }),
    );
  }
  async authenticate(action: "login" | "register/confirm", values: unknown) {
    const user = this.parse(
      userSchema,
      await this.mutate(`/auth/${action}`, "POST", values),
    );
    this.reset();
    // Session is already established even if this additional bootstrap fails.
    // A later mutation will bootstrap again and report any continuing failure.
    await this.bootstrap().catch(() => undefined);
    return user;
  }
  async logout() {
    await this.mutate("/auth/logout", "POST");
    this.reset();
    await this.bootstrap().catch(() => undefined);
  }
  async requestEmail(
    purpose: "password-reset" | "verification",
    email: string,
  ) {
    return this.parse(
      z.object({ message: z.string() }),
      await this.mutate(`/auth/${purpose}/request`, "POST", { email }),
    );
  }
  async confirmEmailToken(
    purpose: "password-reset" | "verification",
    token: string,
    password?: string,
  ) {
    return this.parse(
      z.object({ message: z.string() }),
      await this.mutate(`/auth/${purpose}/confirm`, "POST", {
        token,
        ...(password === undefined ? {} : { password }),
      }),
    );
  }
  async profile(signal?: AbortSignal) {
    return this.parse(
      apiProfileSchema,
      await this.request("/profiles/me", { signal }),
    );
  }
  async skills(signal?: AbortSignal) {
    return this.parse(catalogSchema, await this.request("/skills", { signal }));
  }
  async projectSession(signal?: AbortSignal) {
    const [profile, skills] = await Promise.all([
      this.profile(signal),
      this.skills(signal),
    ]);
    return {
      student: {
        ...profile,
        campus: profile.campus ?? "",
        department: profile.department ?? "",
        semester: profile.semester ?? "",
        bio: profile.bio ?? "",
        github: profile.github ?? "",
        linkedin: profile.linkedin ?? "",
        website: profile.website ?? "",
      },
      skills,
      projects: [],
    };
  }
  async discover(filters: DiscoveryFilters, page = 1, signal?: AbortSignal) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page, pageSize: 12 }).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
    return this.parse(
      discoverySchema,
      await this.request(`/projects?${params}`, { signal }),
    );
  }
  async project(id: string, signal?: AbortSignal) {
    return this.parse(
      projectViewSchema,
      await this.request(`/projects/${id}`, { signal }),
    );
  }
  async drafts(signal?: AbortSignal) {
    return this.parse(
      z.array(draftSchema),
      await this.request("/projects/drafts", { signal }),
    );
  }
  async draft(id: string, signal?: AbortSignal) {
    return this.parse(
      draftSchema,
      await this.request(`/projects/${id}/draft`, { signal }),
    );
  }
  async myProjects(signal?: AbortSignal) {
    return this.parse(
      myProjectsSchema,
      await this.request("/projects/mine", { signal }),
    );
  }
  async ownerDashboard(id: string, signal?: AbortSignal) {
    const [dashboard, inbox] = await Promise.all([
      this.request(`/projects/${id}/manage`, { signal }),
      this.ownerInbox(
        id,
        { status: "pending", roleId: "", search: "", sort: "newest" },
        1,
        signal,
      ),
    ]);
    return {
      ...this.parse(managementSchema, dashboard),
      applications: inbox.applications,
    };
  }
  async saveProject(
    values: ProjectInput,
    action: "draft" | "publish",
    id?: string,
  ) {
    const path = id
      ? `/projects/${id}/${action === "publish" ? "publish" : "draft"}`
      : `/projects?publish=${action === "publish"}`;
    return this.parse(
      savedProjectSchema,
      await this.mutate(
        path,
        id && action === "draft" ? "PATCH" : "POST",
        values,
      ),
    );
  }
  async setRecruitment(id: string, recruitment: "open" | "closed") {
    return this.parse(
      projectViewSchema,
      await this.mutate(`/projects/${id}/recruitment`, "PATCH", {
        recruitment,
      }),
    );
  }
  async archiveProject(id: string) {
    return this.parse(
      projectViewSchema,
      await this.mutate(`/projects/${id}/archive`, "POST"),
    );
  }
  async apply(projectId: string, roleId: string, values: ApplicationInput) {
    return this.parse(
      applicationSchema,
      await this.mutate(`/projects/${projectId}/applications`, "POST", {
        ...values,
        roleId,
      }),
    );
  }
  async myApplications(
    filters: ApplicationFilters,
    page = 1,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      ...filters,
      page: String(page),
      pageSize: "12",
    });
    return this.parse(
      applicantPageSchema,
      await this.request(`/applications?${params}`, { signal }),
    );
  }
  async myApplication(id: string, signal?: AbortSignal) {
    return this.parse(
      applicantEntrySchema,
      await this.request(`/applications/${id}`, { signal }),
    );
  }
  async withdrawApplication(id: string) {
    return this.parse(
      applicationSchema,
      await this.mutate(`/applications/${id}/withdraw`, "POST"),
    );
  }
  async ownerInbox(
    projectId: string,
    filters: { status: string; search: string; roleId: string; sort: string },
    page = 1,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      ...filters,
      page: String(page),
      pageSize: "12",
    });
    if (!filters.roleId) params.delete("roleId");
    return this.parse(
      ownerPageSchema,
      await this.request(`/projects/${projectId}/applications?${params}`, {
        signal,
      }),
    );
  }
  async ownerApplication(projectId: string, id: string, signal?: AbortSignal) {
    return this.parse(
      ownerEntrySchema,
      await this.request(`/projects/${projectId}/applications/${id}`, {
        signal,
      }),
    );
  }
  async reviewApplication(
    projectId: string,
    id: string,
    decision: "accept" | "reject",
  ) {
    return this.parse(
      applicationSchema,
      await this.mutate(
        `/projects/${projectId}/applications/${id}/${decision}`,
        "POST",
      ),
    );
  }
  async saveProfile(patch: ProfilePatch) {
    return this.parse(
      apiProfileSchema,
      await this.mutate("/profiles/me", "PATCH", patch),
    );
  }
}
export const api = new ApiClient();
