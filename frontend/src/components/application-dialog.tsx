"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info, Send, X } from "lucide-react";
import type {
  ProjectView,
  RecruitmentRole,
  Skill,
  Student,
} from "@/lib/models";
import { applicationSchema, type ApplicationInput } from "@/lib/validation";
import { useApply } from "@/lib/queries";
import { Badge, FieldError, SkillChip, Skills, StudentSummary } from "./ui";
export function ApplicationDialog({
  project,
  role,
  student,
  skills,
  open,
  onOpenChange,
  onCloseFocus,
}: {
  project: ProjectView;
  role: RecruitmentRole;
  student: Student;
  skills: Skill[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseFocus: () => void;
}) {
  const mutation = useApply(project.id, role.id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: { motivation: "", experience: "", portfolio: "" },
  });
  const matching = student.skillIds.filter((id) => role.skillIds.includes(id));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseFocus();
          }}
        >
          <div className="dialog-heading">
            <Badge>Application form</Badge>
            <Dialog.Close
              className="icon-button"
              aria-label="Close application dialog"
            >
              <X size={22} />
            </Dialog.Close>
            <Dialog.Title>Apply for Role: {role.title}</Dialog.Title>
            <Dialog.Description>Project: {project.title}</Dialog.Description>
          </div>
          {mutation.isSuccess ? (
            <div className="success-card" role="status">
              <CheckCircle2 size={36} />
              <h2>Application submitted!</h2>
              <p>
                Your application for <strong>{role.title}</strong> is pending.
                You can check its status on this project page.
              </p>
              <Dialog.Close className="button">Back to project</Dialog.Close>
            </div>
          ) : (
            <>
              <section className="inset-panel space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>Required role skills reference</strong>
                  <span className="muted text-sm">
                    {role.skillIds.length} skills
                  </span>
                </div>
                <Skills
                  skills={skills.filter((s) => role.skillIds.includes(s.id))}
                />
              </section>
              <section className="applicant-summary space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <StudentSummary student={student} compact />
                  <Badge tone="teal">
                    {matching.length} matching{" "}
                    {matching.length === 1 ? "skill" : "skills"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {skills
                    .filter((s) => student.skillIds.includes(s.id))
                    .map((s) => (
                      <SkillChip
                        key={s.id}
                        name={s.name}
                        matched={matching.includes(s.id)}
                      />
                    ))}
                </div>
                <p className="helper">
                  <Info size={16} />
                  Skills are self-declared. You can apply even if you don’t
                  match every skill.
                </p>
              </section>
              <form
                noValidate
                onSubmit={handleSubmit((values) => mutation.mutate(values))}
                className="space-y-5"
              >
                <fieldset disabled={mutation.isPending} className="space-y-5">
                  <div className="form-field">
                    <label htmlFor="motivation">
                      Why would you like to join this project?{" "}
                      <span className="required">*</span>
                    </label>
                    <span id="motivation-hint" className="helper">
                      50–2,000 characters
                    </span>
                    <textarea
                      id="motivation"
                      rows={4}
                      {...register("motivation")}
                      aria-required="true"
                      aria-invalid={!!errors.motivation}
                      aria-describedby="motivation-hint motivation-error"
                      placeholder="Tell the team what interests you and how you would contribute."
                    />
                    <FieldError
                      id="motivation-error"
                      message={errors.motivation?.message}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="experience">
                      Relevant experience & projects{" "}
                      <span className="required">*</span>
                    </label>
                    <span id="experience-hint" className="helper">
                      20–2,000 characters. Coursework and learning projects
                      count.
                    </span>
                    <textarea
                      id="experience"
                      rows={3}
                      {...register("experience")}
                      aria-required="true"
                      aria-invalid={!!errors.experience}
                      aria-describedby="experience-hint experience-error"
                      placeholder="Share a project, course, or experience relevant to this role."
                    />
                    <FieldError
                      id="experience-error"
                      message={errors.experience?.message}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="portfolio">
                      Portfolio or demo URL{" "}
                      <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="portfolio"
                      type="url"
                      {...register("portfolio")}
                      placeholder="https://example.com/my-project"
                      aria-invalid={!!errors.portfolio}
                      aria-describedby="portfolio-error"
                    />
                    <FieldError
                      id="portfolio-error"
                      message={errors.portfolio?.message}
                    />
                  </div>
                </fieldset>
                <p className="helper">
                  <Info size={16} />
                  Your profile and this application are intended for the project
                  owner’s review.
                </p>
                {mutation.isError && (
                  <p className="error-banner" role="alert">
                    {mutation.error.message}
                  </p>
                )}
                <div className="form-actions">
                  <Dialog.Close
                    className="button secondary"
                    disabled={mutation.isPending}
                  >
                    Cancel
                  </Dialog.Close>
                  <button
                    className="button"
                    type="submit"
                    disabled={mutation.isPending}
                  >
                    <Send size={16} />
                    {mutation.isPending ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
