"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Archive, Inbox, Search, Settings } from "lucide-react";
import {
  useArchiveProject,
  useOwnerDashboard,
  useRecruitment,
} from "@/lib/queries";
import type {
  OwnerApplication,
  OwnerDashboard as DashboardData,
  ProjectView,
} from "@/lib/models";
import { displayDate } from "@/lib/dates";
import { Avatar, Badge, ErrorState, Loading, TeamCapacity } from "./ui";
import { ApplicationReview } from "./application-review";
import { ConfirmationDialog } from "./confirmation-dialog";
export type DashboardTab = "overview" | "applications" | "team" | "settings";
export function dashboardTab(value?: string): DashboardTab {
  return value === "applications" || value === "team" || value === "settings"
    ? value
    : "overview";
}
function RecruitmentControl({ project }: { project: ProjectView }) {
  const mutation = useRecruitment(project.id);
  return (
    <div className="space-y-3">
      <div className="recruitment-control">
        <div>
          <h3>Recruitment</h3>
          <p className="helper">
            {project.status === "archived"
              ? "Archived projects are read-only."
              : "Closing preserves pending applications and allows rejection, but prevents new applications and acceptance."}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={project.status === "archived" || mutation.isPending}
          onClick={() =>
            mutation.mutate(project.recruitment === "open" ? "closed" : "open")
          }
        >
          {mutation.isPending
            ? "Saving…"
            : project.recruitment === "open"
              ? "Close recruitment"
              : "Open recruitment"}
        </button>
      </div>
      {mutation.isError && (
        <p className="error-banner" role="alert">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p className="helper" role="status">
          Recruitment is {project.recruitment}.
        </p>
      )}
    </div>
  );
}
function RoleOccupancy({ project }: { project: ProjectView }) {
  return (
    <section className="panel space-y-4">
      <h2>Role occupancy</h2>
      <p className="helper">
        Contribution roles describe the work, not administrative permissions.
      </p>
      {project.roles.map((role) => (
        <div className="occupancy-row" key={role.id}>
          <div>
            <h3>{role.title}</h3>
            <p className="helper">
              {role.positions - role.openings} of {role.positions} positions
              filled
            </p>
          </div>
          <Badge tone={role.openings ? "teal" : "muted"}>
            {role.openings} unfilled
          </Badge>
        </div>
      ))}
    </section>
  );
}
function SummaryStats({ data }: { data: DashboardData }) {
  return (
    <div className="dashboard-stats">
      <div className="panel">
        <p className="eyebrow">Team capacity</p>
        <p>
          <strong>{data.project.memberCount}</strong> / {data.project.capacity}{" "}
          members
        </p>
        <TeamCapacity
          count={data.project.memberCount}
          capacity={data.project.capacity}
        />
      </div>
      <Link
        className="panel"
        href={`/projects/${data.project.id}/manage?tab=applications`}
      >
        <p className="eyebrow">Pending inbox</p>
        <p>
          <strong>{data.pendingCount}</strong>{" "}
          {data.pendingCount === 1 ? "application" : "applications"}
        </p>
        <span className="helper">Review applicants →</span>
      </Link>
      <div className="panel">
        <p className="eyebrow">Recruitment</p>
        <p>
          <strong>{data.project.openings}</strong> active openings
        </p>
        <Badge tone={data.project.recruitment === "open" ? "teal" : "muted"}>
          {data.project.recruitment === "open"
            ? "Open to applications"
            : "Recruitment closed"}
        </Badge>
      </div>
    </div>
  );
}
function ApplicantRow({
  entry,
  onReview,
}: {
  entry: OwnerApplication;
  onReview: (element: HTMLButtonElement) => void;
}) {
  return (
    <article className="panel applicant-row">
      <Avatar name={entry.applicant.name} />
      <div className="applicant-info">
        <h3>{entry.applicant.name}</h3>
        <p className="helper">
          {entry.applicant.campus} · {entry.applicant.department}
        </p>
        <p className="applicant-role">{entry.role.title}</p>
        <Badge tone="teal">{entry.sharedSkills.length} shared skills</Badge>
      </div>
      <div className="applicant-row-actions">
        <Badge
          tone={
            entry.application.status === "pending"
              ? "amber"
              : entry.application.status === "accepted"
                ? "teal"
                : "muted"
          }
        >
          {entry.application.status}
        </Badge>
        <span className="helper">
          {displayDate(entry.application.createdAt)}
        </span>
        <button
          className="button secondary"
          aria-label={`Review ${entry.applicant.name}`}
          onClick={(e) => onReview(e.currentTarget)}
        >
          Review →
        </button>
      </div>
    </article>
  );
}
function ApplicationInbox({
  data,
  onReview,
}: {
  data: DashboardData;
  onReview: (id: string, element: HTMLButtonElement) => void;
}) {
  const [status, setStatus] = useState("pending");
  const [roleId, setRoleId] = useState("");
  const [search, setSearch] = useState("");
  const filtered = data.applications.filter(
    (a) =>
      (status === "all" || a.application.status === status) &&
      (!roleId || a.role.id === roleId) &&
      a.applicant.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <section className="panel space-y-4">
        <div className="status-filters" aria-label="Application status">
          {["pending", "accepted", "rejected", "withdrawn", "all"].map((s) => (
            <button
              key={s}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {s[0].toUpperCase() + s.slice(1)} (
              {s === "all"
                ? data.applications.length
                : data.applications.filter((a) => a.application.status === s)
                    .length}
              )
            </button>
          ))}
        </div>
        <div className="inbox-filters">
          <select
            aria-label="Filter applications by role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">All roles</option>
            {data.project.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search applicant by name"
              placeholder="Search applicant by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>
      <p className="helper" role="status">
        {filtered.length}{" "}
        {filtered.length === 1 ? "application" : "applications"} shown
      </p>
      {filtered.map((entry) => (
        <ApplicantRow
          key={entry.application.id}
          entry={entry}
          onReview={(el) => onReview(entry.application.id, el)}
        />
      ))}
      {!filtered.length && (
        <div className="state-panel">
          <Inbox size={32} />
          <h2>
            {data.applications.length
              ? "No applications match these filters"
              : "No applications yet"}
          </h2>
          <p>
            {data.applications.length
              ? "Try another role, applicant name, or status."
              : "Applications to this project will appear here when students apply."}
          </p>
          {data.applications.length > 0 && (
            <button
              className="button secondary"
              onClick={() => {
                setStatus("all");
                setRoleId("");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
function Team({ project }: { project: ProjectView }) {
  return (
    <div className="space-y-5">
      <section className="panel space-y-5">
        <h2>
          Team members ({project.memberCount} / {project.capacity})
        </h2>
        <TeamCapacity count={project.memberCount} capacity={project.capacity} />
        <div className="team-list">
          {project.team.map(({ student, membership }) => (
            <article className="team-member" key={membership.id}>
              <Avatar name={student.name} />
              <div>
                <h3>{student.name}</h3>
                <p className="helper">{student.campus}</p>
                <p>{membership.contribution}</p>
              </div>
              <div>
                <Badge
                  tone={student.id === project.ownerId ? "lavender" : "teal"}
                >
                  {student.id === project.ownerId ? "Owner" : "Member"}
                </Badge>
                <p className="helper">
                  Joined {displayDate(membership.joinedAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <RoleOccupancy project={project} />
    </div>
  );
}
function ProjectSettings({ project }: { project: ProjectView }) {
  const archive = useArchiveProject(project.id);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  return (
    <div className="space-y-5">
      <section className="panel space-y-5">
        <h2 className="section-title">
          <Settings size={21} />
          Project Settings
        </h2>
        <RecruitmentControl project={project} />
      </section>
      <section className="panel archive-section space-y-4">
        <h2 className="section-title">
          <Archive size={21} />
          Archive project
        </h2>
        <p className="body-copy">
          Archiving removes the project from discovery and closes recruitment.
          Applications, roles, and memberships stay available in this read-only
          dashboard. Restoration is not available in this milestone.
        </p>
        <button
          className="button danger-secondary"
          disabled={project.status === "archived" || archive.isPending}
          onClick={() => {
            archive.reset();
            setConfirm(true);
          }}
        >
          Archive Project
        </button>
        {archive.isSuccess && (
          <p className="saved-notice" role="status">
            Project archived. All dashboard actions are now read-only.
          </p>
        )}
        {archive.isError && (
          <p className="error-banner" role="alert">
            {archive.error.message}
          </p>
        )}
      </section>
      <ConfirmationDialog
        open={confirm && project.status !== "archived"}
        onOpenChange={setConfirm}
        title="Archive this project?"
        description="The project will disappear from discovery. Recruitment and application decisions will be disabled. This cannot be undone in this prototype."
        confirmLabel="Confirm archive"
        pending={archive.isPending}
        error={archive.isError ? archive.error.message : undefined}
        onConfirm={() => {
          if (lock.current) return;
          lock.current = true;
          archive.mutate(undefined, {
            onSuccess: () => setConfirm(false),
            onSettled: () => {
              lock.current = false;
            },
          });
        }}
      />
    </div>
  );
}
export function OwnerDashboard({
  projectId,
  tab,
}: {
  projectId: string;
  tab: DashboardTab;
}) {
  const query = useOwnerDashboard(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  if (query.isPending)
    return <Loading label="Loading your project dashboard…" />;
  if (query.isError)
    return (
      <>
        <ErrorState error={query.error} retry={() => void query.refetch()} />
        <Link className="button mt-4" href="/my-projects">
          Back to My Projects
        </Link>
      </>
    );
  const data = query.data;
  const project = data.project;
  const selected = data.applications.find(
    (a) => a.application.id === selectedId,
  );
  const review = (id: string, el: HTMLButtonElement) => {
    trigger.current = el;
    setSelectedId(id);
  };
  return (
    <div className="space-y-6">
      <Link className="breadcrumb" href="/my-projects">
        <ArrowLeft size={16} />
        Back to My Projects
      </Link>
      <header className="dashboard-heading">
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge>{project.status ?? "published"}</Badge>
            <Badge tone={project.recruitment === "open" ? "teal" : "muted"}>
              Recruitment {project.recruitment}
            </Badge>
            {project.tag && <Badge tone="amber">{project.tag}</Badge>}
          </div>
          <h1 tabIndex={-1} ref={heading}>
            {project.title}
          </h1>
          <p className="lead mt-2">{project.campus} · Owner dashboard</p>
        </div>
        <Link href={`/projects/${projectId}`} className="button secondary">
          View Project
        </Link>
      </header>
      {project.status === "archived" && (
        <p className="info-banner">
          Archived project. The dashboard is readable; all mutations are
          disabled.
        </p>
      )}
      <nav className="dashboard-tabs" aria-label="Project dashboard tabs">
        {(["overview", "applications", "team", "settings"] as const).map(
          (value) => (
            <Link
              key={value}
              href={`/projects/${projectId}/manage?tab=${value}`}
              aria-current={tab === value ? "page" : undefined}
            >
              {value[0].toUpperCase() + value.slice(1)}
              {value === "applications" && <Badge>{data.pendingCount}</Badge>}
              {value === "team" && (
                <Badge>
                  {project.memberCount}/{project.capacity}
                </Badge>
              )}
            </Link>
          ),
        )}
      </nav>
      <SummaryStats data={data} />
      {tab === "applications" ? (
        <ApplicationInbox data={data} onReview={review} />
      ) : tab === "team" ? (
        <Team project={project} />
      ) : tab === "settings" ? (
        <ProjectSettings project={project} />
      ) : (
        <div className="overview-grid">
          <div className="space-y-5">
            <section className="panel space-y-4">
              <h2>Project Overview</h2>
              <p className="body-copy application-copy">
                {project.description}
              </p>
              <RecruitmentControl project={project} />
            </section>
            <section className="space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <h2>Recent pending applicants</h2>
                <Link
                  className="text-button"
                  href={`/projects/${projectId}/manage?tab=applications`}
                >
                  View inbox →
                </Link>
              </div>
              {data.pendingCount ? (
                data.applications
                  .filter((a) => a.application.status === "pending")
                  .slice(0, 3)
                  .map((entry) => (
                    <ApplicantRow
                      key={entry.application.id}
                      entry={entry}
                      onReview={(el) => review(entry.application.id, el)}
                    />
                  ))
              ) : (
                <div className="panel helper">
                  No pending applications to review.
                </div>
              )}
            </section>
          </div>
          <RoleOccupancy project={project} />
        </div>
      )}
      {selected && (
        <ApplicationReview
          key={selected.application.id}
          entry={selected}
          project={project}
          skills={data.skills}
          onClose={() => setSelectedId(null)}
          onCloseFocus={() => {
            if (trigger.current?.isConnected) trigger.current.focus();
            else heading.current?.focus();
          }}
        />
      )}
    </div>
  );
}
