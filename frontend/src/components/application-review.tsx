"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import type { OwnerApplication, ProjectView, Skill } from "@/lib/models";
import { useReviewApplication } from "@/lib/queries";
import { displayDate } from "@/lib/dates";
import { Badge, Skills, StudentSummary } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";
export function ApplicationReview({
  entry,
  project,
  skills,
  onClose,
  onCloseFocus,
}: {
  entry: OwnerApplication;
  project: ProjectView;
  skills: Skill[];
  onClose: () => void;
  onCloseFocus: () => void;
}) {
  const { application, applicant, role, sharedSkills, missingSkills } = entry;
  const mutation = useReviewApplication(project.id);
  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const lock = useRef(false);
  const readOnly =
    application.status !== "pending" || project.status === "archived";
  const acceptReason =
    project.recruitment !== "open"
      ? "Recruitment is closed. Reopen it before accepting."
      : project.memberCount >= project.capacity
        ? "The team is full."
        : role.openings === 0
          ? "This role is full."
          : project.team.some((m) => m.student.id === applicant.id)
            ? "This applicant is already a team member."
            : null;
  const confirm = async () => {
    if (!decision || lock.current) return;
    lock.current = true;
    try {
      await mutation.mutateAsync({ id: application.id, decision });
      setDecision(null);
    } catch {
      /* Mutation error stays visible for retry. */
    } finally {
      lock.current = false;
    }
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content review-panel"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onCloseFocus();
          }}
        >
          <div className="review-heading">
            <div>
              <p className="eyebrow">Application review</p>
              <Dialog.Title>{applicant.name}</Dialog.Title>
            </div>
            <Dialog.Close
              className="icon-button"
              disabled={mutation.isPending}
              aria-label="Close application review"
            >
              <X size={22} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {role.title} · Submitted {displayDate(application.createdAt)}
          </Dialog.Description>
          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                application.status === "pending"
                  ? "amber"
                  : application.status === "accepted"
                    ? "teal"
                    : "muted"
              }
            >
              {application.status}
            </Badge>
            {application.decidedAt && (
              <span className="helper">
                Decision recorded {displayDate(application.decidedAt)}
              </span>
            )}
          </div>
          <section className="inset-panel space-y-4">
            <StudentSummary student={applicant} />
            <p className="body-copy">{applicant.bio}</p>
            <p className="eyebrow">Self-declared skills</p>
            <Skills
              skills={skills.filter((s) => applicant.skillIds.includes(s.id))}
            />
            <div className="profile-links">
              {[
                ["GitHub", applicant.github],
                ["LinkedIn", applicant.linkedin],
                ["Website", applicant.website],
              ]
                .filter(([, url]) => url)
                .map(([label, url]) => (
                  <a
                    key={label}
                    href={url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {label} ↗
                  </a>
                ))}
            </div>
          </section>
          <section className="space-y-3">
            <h3>Role skill alignment</h3>
            <p className="helper">Required for {role.title}</p>
            <Skills
              skills={skills.filter((s) => role.skillIds.includes(s.id))}
            />
            <div className="skill-alignment">
              <div>
                <h3>Shared skills ({sharedSkills.length})</h3>
                {sharedSkills.length ? (
                  <Skills skills={sharedSkills} />
                ) : (
                  <p className="helper">No shared skills listed.</p>
                )}
              </div>
              <div>
                <h3>Missing role skills ({missingSkills.length})</h3>
                {missingSkills.length ? (
                  <Skills skills={missingSkills} />
                ) : (
                  <p className="helper">All role skills are listed.</p>
                )}
              </div>
            </div>
            <p className="helper">
              Skills are self-declared. Missing skills do not disqualify this
              applicant.
            </p>
          </section>
          <section>
            <h3 className="mb-2">Statement of motivation</h3>
            <p className="inset-panel application-copy">
              {application.motivation}
            </p>
          </section>
          <section>
            <h3 className="mb-2">Relevant experience & projects</h3>
            <p className="inset-panel application-copy">
              {application.experience}
            </p>
          </section>
          {application.portfolio && (
            <a
              className="portfolio-link"
              href={application.portfolio}
              target="_blank"
              rel="noopener noreferrer"
            >
              View submitted portfolio ↗
            </a>
          )}
          {mutation.isSuccess && (
            <p className="saved-notice" role="status">
              <CheckCircle2 size={18} />
              Application {mutation.data.status}. Team and application records
              are updated.
            </p>
          )}
          {mutation.isError && (
            <p className="error-banner" role="alert">
              {mutation.error.message}
            </p>
          )}
          {readOnly ? (
            <p className="info-banner">
              {project.status === "archived"
                ? "Archived project. All decisions are read-only."
                : `This application is ${application.status} and is read-only.`}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="helper">
                {acceptReason ??
                  `Accepting adds one ${role.title} membership. Team size becomes ${project.memberCount + 1} of ${project.capacity}.`}
              </p>
              <div className="form-actions">
                <button
                  className="button danger-secondary"
                  disabled={mutation.isPending}
                  onClick={() => {
                    mutation.reset();
                    setDecision("reject");
                  }}
                >
                  Reject
                </button>
                <button
                  className="button"
                  disabled={mutation.isPending || !!acceptReason}
                  onClick={() => {
                    mutation.reset();
                    setDecision("accept");
                  }}
                >
                  Accept Teammate
                </button>
              </div>
            </div>
          )}
          <ConfirmationDialog
            open={
              decision !== null &&
              !readOnly &&
              (decision === "reject" || !acceptReason)
            }
            onOpenChange={(open) => {
              if (!open) setDecision(null);
            }}
            title={
              decision === "accept"
                ? "Accept this applicant?"
                : "Reject this application?"
            }
            description={
              decision === "accept"
                ? `${applicant.name} will join as ${role.title}. This decision cannot be undone in this prototype.`
                : `Reject ${applicant.name}’s application for ${role.title}? No membership will be created.`
            }
            confirmLabel={
              decision === "accept" ? "Confirm acceptance" : "Confirm rejection"
            }
            onConfirm={() => void confirm()}
            pending={mutation.isPending}
            error={mutation.isError ? mutation.error.message : undefined}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
