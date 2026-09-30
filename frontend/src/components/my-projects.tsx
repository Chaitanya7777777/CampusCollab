"use client";
import Link from "next/link";
import { useState } from "react";
import { FolderOpen, Search } from "lucide-react";
import { useMyProjects } from "@/lib/queries";
import type { MyProjectSummary } from "@/lib/models";
import { Badge, ErrorState, Loading, TeamCapacity } from "./ui";
function MyProjectCard({
  project,
  owned,
}: {
  project: MyProjectSummary;
  owned: boolean;
}) {
  const draft = project.status === "draft";
  const destination = draft
    ? `/projects/${project.id}/edit`
    : owned
      ? `/projects/${project.id}/manage`
      : `/projects/${project.id}`;
  return (
    <article className="panel my-project-card">
      <div className="flex flex-wrap gap-2">
        <Badge>{project.type || "Project"}</Badge>
        <Badge
          tone={
            draft
              ? "amber"
              : project.status === "archived"
                ? "muted"
                : "lavender"
          }
        >
          {project.status}
        </Badge>
        <Badge tone={project.recruitment === "open" ? "teal" : "muted"}>
          Recruitment {project.recruitment}
        </Badge>
      </div>
      <h2>
        <Link href={destination}>{project.title}</Link>
      </h2>
      <p className="body-copy">
        {project.summary ||
          "Your project is taking shape. Continue editing to add the details."}
      </p>
      <div className="project-management-stats">
        <div>
          {project.capacity ? (
            <TeamCapacity
              count={project.memberCount}
              capacity={project.capacity}
            />
          ) : (
            <p>{project.memberCount} member · Capacity not set</p>
          )}
        </div>
        <div>
          <strong>
            {project.openings} {draft ? "planned openings" : "openings"}
          </strong>
          <p className="helper">
            {project.roles
              .filter((r) => r.openings > 0)
              .map((r) => `${r.title || "Untitled role"}: ${r.openings}`)
              .join(" · ") || "No unfilled roles"}
          </p>
        </div>
        {owned && (
          <div>
            <Badge tone={project.pendingCount ? "amber" : "muted"}>
              {project.pendingCount} pending applications
            </Badge>
          </div>
        )}
      </div>
      <div className="my-project-actions">
        <p className="helper">
          {draft
            ? "Private draft"
            : project.status === "archived"
              ? "Archived · Read-only"
              : "Capacity includes the owner"}
        </p>
        <div className="flex flex-wrap gap-3">
          {owned && !draft && (
            <Link
              className="button secondary"
              href={`/projects/${project.id}/manage?tab=applications`}
            >
              Applicants ({project.pendingCount})
            </Link>
          )}
          <Link
            className={`button ${draft ? "secondary" : ""}`}
            href={destination}
          >
            {draft
              ? "Continue Editing"
              : owned
                ? "Manage Project"
                : "View Project"}
          </Link>
        </div>
      </div>
    </article>
  );
}
export function MyProjects() {
  const query = useMyProjects();
  const [tab, setTab] = useState<"owned" | "joined">("owned");
  const [search, setSearch] = useState("");
  if (query.isPending)
    return <Loading label="Loading your projects and teams…" />;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const projects = query.data[tab].filter((p) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1>Your projects and teams</h1>
        <p className="lead mt-2">
          Manage your ideas and the teams you’re building with.
        </p>
      </div>
      <section className="panel my-project-filters">
        <div className="segmented-control" aria-label="Project ownership">
          {(["owned", "joined"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {value === "owned" ? "Owned by me" : "Joined projects"}
              <Badge>{query.data[value].length}</Badge>
            </button>
          ))}
        </div>
        <div className="search-field">
          <Search size={19} />
          <input
            aria-label="Search my projects by title"
            placeholder="Search by project title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>
      <p className="helper" role="status">
        {projects.length} {projects.length === 1 ? "project" : "projects"}
      </p>
      {projects.length ? (
        projects.map((p) => (
          <MyProjectCard key={p.id} project={p} owned={tab === "owned"} />
        ))
      ) : (
        <div className="state-panel">
          <FolderOpen size={32} />
          <h2>
            {search
              ? "No matching projects"
              : tab === "owned"
                ? "Your next idea starts here"
                : "Find your next team"}
          </h2>
          <p>
            {search
              ? "Try another title or clear your search."
              : tab === "owned"
                ? "Create a project or save a private draft to start building."
                : "Projects you join will appear here. Projects you own are in the other tab."}
          </p>
          {search ? (
            <button className="button secondary" onClick={() => setSearch("")}>
              Clear search
            </button>
          ) : (
            <Link
              className="button"
              href={tab === "owned" ? "/projects/new" : "/discover"}
            >
              {tab === "owned" ? "Create Project" : "Discover Projects"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
