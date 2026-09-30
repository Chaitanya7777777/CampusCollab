"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Code2,
  Lightbulb,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useProject, useSession } from "@/lib/queries";
import type { ProjectView, Skill } from "@/lib/models";
import { ApplicationDialog } from "./application-dialog";
import {
  Avatar,
  Badge,
  ErrorState,
  Loading,
  Skills,
  StudentSummary,
  TeamCapacity,
} from "./ui";
export function RecruitmentRoleCard({
  role,
  skills,
  disabledReason,
  onApply,
}: {
  role: ProjectView["roles"][number];
  skills: Skill[];
  disabledReason: string | null;
  onApply: (element: HTMLButtonElement) => void;
}) {
  return (
    <article className={`role-card ${role.openings === 0 ? "filled" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <h3>{role.title}</h3>
        <Code2 size={19} className="shrink-0 muted" />
      </div>
      {role.openings > 0 ? (
        <span className="slots">
          ● {role.openings} {role.openings === 1 ? "opening" : "openings"}
        </span>
      ) : (
        <Badge tone="muted">Role filled</Badge>
      )}
      <p>{role.description}</p>
      <Skills skills={skills.filter((s) => role.skillIds.includes(s.id))} />
      {role.openings > 0 && (
        <button
          className="button w-full"
          disabled={!!disabledReason}
          onClick={(e) => onApply(e.currentTarget)}
        >
          {disabledReason ? "Applications unavailable" : "Apply for this role"}
        </button>
      )}
    </article>
  );
}
function date(value: string) {
  return new Date(
    value.includes("T") ? value : `${value}T12:00:00Z`,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function ProjectDetails({ projectId }: { projectId: string }) {
  const query = useProject(projectId);
  const session = useSession();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInstance, setDialogInstance] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  if (query.isPending || session.isPending)
    return <Loading label="Loading project details…" />;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  if (session.isError)
    return (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  const project = query.data;
  if (!project)
    return (
      <div className="state-panel">
        <h1>Project not found</h1>
        <p>This project isn’t in the current campus collection.</p>
        <Link className="button" href="/discover">
          Back to Discover
        </Link>
      </div>
    );
  const role = project.roles.find((r) => r.id === roleId);
  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/discover">Discover</Link>
        <ChevronRight size={13} />
        <span>{project.type}</span>
        <ChevronRight size={13} />
        <span>Project details</span>
      </nav>
      {project.ownerId === session.data.student.id && (
        <Link className="button" href={`/projects/${project.id}/manage`}>
          Manage Project
        </Link>
      )}
      {project.status === "archived" && (
        <p className="info-banner">
          This project is archived. Recruitment is closed.
        </p>
      )}
      <div className="details-grid">
        <div className="space-y-6">
          <section className="panel project-hero">
            <div className="flex flex-wrap gap-2">
              <Badge tone={project.openings ? "teal" : "muted"}>
                {project.openings
                  ? `Open for applications (${project.openings} positions)`
                  : "Recruitment closed"}
              </Badge>
              <Badge>{project.type}</Badge>
              <Badge tone="amber">{project.tag}</Badge>
              <Badge>{project.campus}</Badge>
            </div>
            <h1>{project.title}</h1>
            <p className="lead">{project.summary}</p>
            <div className="project-facts">
              <div>
                <small>Team size target</small>
                <strong>
                  {project.memberCount} / {project.capacity} members
                </strong>
              </div>
              <div>
                <small>Published</small>
                <strong>
                  {date(project.publishedAt ?? project.createdAt)}
                </strong>
              </div>
              {project.deadline && (
                <div>
                  <small>Application deadline</small>
                  <strong>{date(project.deadline)}</strong>
                </div>
              )}
            </div>
          </section>
          <section className="panel space-y-6">
            <h2 className="section-title">
              <Lightbulb size={21} />
              Problem Statement & Solution Scope
            </h2>
            <p className="body-copy">{project.description}</p>
            <div>
              <p className="eyebrow mb-3">Core project deliverables</p>
              <div className="deliverables-grid">
                {project.deliverables.map((d) => (
                  <div key={d.title} className="inset-panel">
                    <h3>
                      <CheckCircle2 size={17} />
                      {d.title}
                    </h3>
                    <p>{d.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-3">Project skills</p>
              <Skills skills={project.skills} />
            </div>
          </section>
          <section className="panel space-y-5">
            <h2 className="section-title">
              <Users size={21} />
              Team Roster & Capacity
            </h2>
            <TeamCapacity
              count={project.memberCount}
              capacity={project.capacity}
            />
            <p className="helper">Capacity includes the project owner.</p>
            <div className="roster-grid">
              {project.team.map(({ student, membership }) => (
                <div key={membership.id} className="inset-panel roster-person">
                  <Avatar name={student.name} />
                  <strong>{student.name}</strong>
                  <span
                    className={
                      student.id === project.ownerId ? "owner-label" : "slots"
                    }
                  >
                    {student.id === project.ownerId
                      ? "Project owner"
                      : "Team member"}
                  </span>
                  <p>{membership.contribution}</p>
                  <small>{student.campus}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <div className="panel status-panel" tabIndex={-1} ref={statusRef}>
            <h2 className="section-title">
              <ShieldCheck size={18} />
              Your status
            </h2>
            <Badge
              tone={
                project.application
                  ? "amber"
                  : project.eligibility
                    ? "muted"
                    : "teal"
              }
            >
              {project.eligibility ?? "Open to apply"}
            </Badge>
            {project.application &&
              project.eligibility !==
                `Application ${project.application.status}` && (
                <Badge
                  tone={
                    project.application.status === "accepted" ? "teal" : "amber"
                  }
                >
                  Application {project.application.status}
                </Badge>
              )}
            <p>
              {project.application
                ? `You applied for ${project.roles.find((r) => r.id === project.application?.roleId)?.title} on ${new Date(project.application.createdAt).toLocaleDateString("en-GB")}. One application per project is allowed.`
                : project.eligibility
                  ? "You can explore the project and its team below."
                  : "Choose a contribution role below. You do not need to match every listed skill to apply."}
            </p>
          </div>
          <section className="panel recruitment-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <h2>Recruitment Roles</h2>
              <Badge>{project.openings} openings</Badge>
            </div>
            <div className="space-y-4">
              {project.roles.map((r) => (
                <RecruitmentRoleCard
                  key={r.id}
                  role={r}
                  skills={session.data.skills}
                  disabledReason={project.eligibility}
                  onApply={(element) => {
                    trigger.current = element;
                    setRoleId(r.id);
                    setDialogInstance((value) => value + 1);
                    setDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </section>
          <section className="panel space-y-4">
            <p className="eyebrow">Project lead</p>
            <StudentSummary student={project.owner} compact />
            <p className="body-copy text-sm">{project.owner.bio}</p>
          </section>
        </aside>
      </div>
      {role && (
        <ApplicationDialog
          key={`${role.id}-${dialogInstance}`}
          project={project}
          role={role}
          student={session.data.student}
          skills={session.data.skills}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCloseFocus={() => {
            if (trigger.current && !trigger.current.disabled)
              trigger.current.focus();
            else statusRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
