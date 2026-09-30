import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProjectView } from "@/lib/models";
import { Badge, Skills, StudentSummary, TeamCapacity } from "./ui";
export function ProjectCard({ project }: { project: ProjectView }) {
  return (
    <article className="project-card" data-testid="project-card">
      <div className="project-card-body">
        <div className="flex flex-wrap gap-1.5">
          <Badge
            tone={project.type === "Personal Project" ? "teal" : "lavender"}
          >
            {project.type}
          </Badge>
          <Badge tone={project.type === "Hackathon" ? "amber" : "lavender"}>
            {project.tag}
          </Badge>
        </div>
        <h2>
          <Link href={`/projects/${project.id}`}>{project.title}</Link>
        </h2>
        <p className="project-description">{project.summary}</p>
        <StudentSummary student={project.owner} compact />
        <TeamCapacity count={project.memberCount} capacity={project.capacity} />
        <div className="open-positions">
          <p className="micro-label">Open positions</p>
          {project.openings > 0 ? (
            project.roles
              .filter((r) => r.openings > 0)
              .map((r) => (
                <div className="role-strip" key={r.id}>
                  <span>• {r.title}</span>
                  <span>
                    {r.openings} {r.openings === 1 ? "slot" : "slots"}
                  </span>
                </div>
              ))
          ) : (
            <p className="muted text-sm">Recruitment is closed</p>
          )}
        </div>
        <Skills skills={project.skills} />
      </div>
      <div className="project-card-footer">
        <span className={`slots ${project.openings === 0 ? "closed" : ""}`}>
          ● {project.openings > 0 ? `${project.openings} slots open` : "Closed"}
        </span>
        <Link
          href={`/projects/${project.id}`}
          className="button small"
          aria-label={`View project: ${project.title}`}
        >
          View Project
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
