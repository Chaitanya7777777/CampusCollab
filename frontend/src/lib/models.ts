export interface Skill {
  id: string;
  name: string;
}
export interface Student {
  id: string;
  name: string;
  campus: string;
  department: string;
  semester: string;
  bio: string;
  email: string;
  skillIds: string[];
  github: string;
  linkedin: string;
  website: string;
}
export interface Project {
  status?: "published" | "archived";
  archivedAt?: string;
  publishedAt?: string;
  id: string;
  title: string;
  summary: string;
  description: string;
  type: string;
  tag: string;
  campus: string;
  ownerId: string;
  capacity: number;
  recruitment: "open" | "closed";
  createdAt: string;
  deadline?: string;
  skillIds: string[];
  deliverables: { title: string; description: string }[];
}
export interface RecruitmentRole {
  id: string;
  projectId: string;
  title: string;
  category: string;
  description: string;
  positions: number;
  skillIds: string[];
}
export interface Membership {
  joinedAt?: string;
  id: string;
  projectId: string;
  studentId: string;
  roleId?: string;
  contribution: string;
}
export interface Application {
  id: string;
  projectId: string;
  roleId: string;
  studentId: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  decidedAt?: string;
  motivation: string;
  experience: string;
  portfolio: string;
  createdAt: string;
}
export interface Database {
  drafts: ProjectDraft[];
  students: Student[];
  skills: Skill[];
  projects: Project[];
  roles: RecruitmentRole[];
  memberships: Membership[];
  applications: Application[];
}
export interface ProjectDraft {
  id: string;
  ownerId: string;
  status: "draft";
  recruitment: "closed";
  createdAt: string;
  updatedAt: string;
  values: import("./validation").ProjectInput;
}
export interface ProjectView extends Project {
  owner: Student;
  team: { membership: Membership; student: Student }[];
  roles: (RecruitmentRole & { openings: number })[];
  memberCount: number;
  openings: number;
  skills: Skill[];
  application?: Application;
  eligibility: string | null;
}
export interface DiscoveryFilters {
  search: string;
  type: string;
  skill: string;
  role: string;
  campus: string;
  openingsOnly: boolean;
  sort: "newest" | "oldest" | "title" | "openings";
}
export interface OwnerApplication {
  application: Application;
  applicant: Student;
  role: RecruitmentRole & { openings: number };
  sharedSkills: Skill[];
  missingSkills: Skill[];
}
export interface OwnerDashboard {
  project: ProjectView;
  applications: OwnerApplication[];
  skills: Skill[];
  pendingCount: number;
}
export interface MyProjectSummary {
  id: string;
  title: string;
  summary: string;
  type: string;
  status: "draft" | "published" | "archived";
  recruitment: "open" | "closed";
  capacity: number | null;
  memberCount: number;
  openings: number;
  roles: { id: string; title: string; openings: number }[];
  pendingCount?: number;
  updatedAt: string;
}
