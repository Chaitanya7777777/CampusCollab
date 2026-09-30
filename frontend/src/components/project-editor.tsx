"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Eye,
  Info,
  Plus,
  Rocket,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useDraft, useDrafts, useSaveProject, useSession } from "@/lib/queries";
import {
  projectDraftSchema,
  projectPublishSchema,
  projectTypes,
  type ProjectInput,
} from "@/lib/validation";
import type { Skill, Student } from "@/lib/models";
import {
  Avatar,
  Badge,
  ErrorState,
  FieldError,
  Loading,
  SkillChip,
  Skills,
  StudentSummary,
  TeamCapacity,
} from "./ui";

const emptyProject: ProjectInput = {
  title: "",
  type: "",
  eventName: "",
  description: "",
  capacity: 5,
  roles: [],
};
function SectionHeading({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="creation-section-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p className="helper">{description}</p>
      </div>
    </div>
  );
}
function RoleSkills({
  skills,
  selected,
  onChange,
  index,
  error,
}: {
  skills: Skill[];
  selected: string[];
  onChange: (ids: string[]) => void;
  index: number;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  return (
    <div className="space-y-3">
      <p className="micro-label" id={`role-skills-label-${index}`}>
        Required skills
      </p>
      <div className="flex flex-wrap gap-2">
        {skills
          .filter((s) => selected.includes(s.id))
          .map((s) => (
            <SkillChip
              key={s.id}
              name={s.name}
              onRemove={() => onChange(selected.filter((id) => id !== s.id))}
            />
          ))}
      </div>
      <select
        aria-label={`Add skill to role ${index + 1}`}
        value=""
        onChange={(e) => onChange([...selected, e.target.value])}
        disabled={selected.length >= 15}
        aria-invalid={!!error}
        aria-describedby={`role-skills-error-${index}`}
      >
        <option value="">+ Add a catalog skill</option>
        {skills
          .filter(
            (s) =>
              !selected.includes(s.id) &&
              s.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
      <input
        aria-label={`Search skills for role ${index + 1}`}
        placeholder="Search skill catalog…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <FieldError id={`role-skills-error-${index}`} message={error} />
    </div>
  );
}
function ProjectPreview({
  values,
  student,
  skills,
}: {
  values: ProjectInput;
  student: Student;
  skills: Skill[];
}) {
  const total = values.roles.reduce(
    (sum, r) => sum + (Number.isFinite(r.openings) ? (r.openings ?? 0) : 0),
    0,
  );
  return (
    <aside className="creation-preview">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="section-title">
          <Eye size={18} />
          Live Project Preview
        </h2>
        <Badge>Live</Badge>
      </div>
      <div className="panel space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone="teal">{values.type || "Project type"}</Badge>
          {values.eventName && <Badge>{values.eventName}</Badge>}
        </div>
        <h2>{values.title || "Your next big idea"}</h2>
        <p className="body-copy preview-description">
          {values.description ||
            "Describe the idea, what you want to build, and what your teammates will contribute."}
        </p>
        <StudentSummary student={student} compact />
        <div className="inset-panel">
          <TeamCapacity
            count={1}
            capacity={Math.max(2, values.capacity ?? 2)}
          />
          <p className="helper mt-2">1 owner · {total} planned openings</p>
        </div>
        <div className="space-y-2">
          <p className="eyebrow">Recruitment roles</p>
          {values.roles.length ? (
            values.roles.map((r, i) => (
              <div key={r.id} className="preview-role">
                <span>{r.title || `Role ${i + 1}`}</span>
                <Badge tone="teal">
                  {r.openings ?? "—"} {r.openings === 1 ? "slot" : "slots"}
                </Badge>
              </div>
            ))
          ) : (
            <p className="helper">Your recruitment roles will appear here.</p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-2">Combined skills</p>
          <Skills
            skills={skills.filter((s) =>
              values.roles.some((r) => r.skillIds.includes(s.id)),
            )}
          />
        </div>
        <p className="preview-footer">
          Draft · Recruitment opens when you publish
        </p>
      </div>
      <div className="inset-panel helper mt-4">
        <Eye size={18} />
        <span>
          Your project will appear in Discover after publishing. This preview
          updates as you edit.
        </span>
      </div>
    </aside>
  );
}
function ProjectForm({
  student,
  skills,
  initial,
  id,
  saved,
}: {
  student: Student;
  skills: Skill[];
  initial: ProjectInput;
  id?: string;
  saved: boolean;
}) {
  const router = useRouter();
  const mutation = useSaveProject();
  const [feedback, setFeedback] = useState<"draft" | "published" | null>(
    saved ? "draft" : null,
  );
  const [savedId, setSavedId] = useState(id);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const submitting = useRef(false);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    setFocus,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProjectInput>({
    resolver: zodResolver(projectDraftSchema),
    defaultValues: initial,
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "roles",
    keyName: "fieldKey",
  });
  const values = useWatch({ control }) as ProjectInput;
  const openings = values.roles.reduce((sum, r) => sum + (r.openings ?? 0), 0);
  const remaining = (values.capacity ?? 0) - 1 - openings;
  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const navigation = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a");
      if (
        !link ||
        link.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.button !== 0
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin === location.origin &&
        url.pathname !== location.pathname
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (!submitting.current) setLeaveTo(url.pathname + url.search);
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", navigation, true);
    };
  }, [isDirty]);
  const submit = (action: "draft" | "publish") => {
    if (submitting.current) return;
    clearErrors();
    void handleSubmit(async (data) => {
      if (submitting.current) return;
      if (action === "publish") {
        const parsed = projectPublishSchema.safeParse(data);
        if (!parsed.success) {
          parsed.error.issues.forEach((issue) =>
            setError(issue.path.join(".") as FieldPath<ProjectInput>, {
              message: issue.message,
            }),
          );
          const first = parsed.error.issues[0].path.join(
            ".",
          ) as FieldPath<ProjectInput>;
          if (!first.includes("skillIds") && first !== "roles") setFocus(first);
          return;
        }
      }
      submitting.current = true;
      try {
        const result = await mutation.mutateAsync({
          values: data,
          action,
          id: savedId,
        });
        reset(result.values);
        setSavedId(result.id);
        if (action === "draft" && !id) {
          router.replace(`/projects/${result.id}/edit?saved=1`);
        } else {
          setFeedback(result.status);
        }
      } catch {
        /* The mutation error remains visible; the form retains its values. */
      } finally {
        submitting.current = false;
      }
    })();
  };
  const title = register("title");
  return (
    <>
      <div className="creation-grid">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit("publish");
          }}
          className="space-y-5"
        >
          <fieldset disabled={mutation.isPending} className="space-y-5">
            <section className="panel space-y-5">
              <SectionHeading
                number={1}
                title="Project Basics"
                description="Core details that define your collaborative mission."
              />
              <div className="form-field">
                <label htmlFor="project-title">
                  Project title{" "}
                  <span className="required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="project-title"
                  aria-label="Project title"
                  aria-required="true"
                  {...title}
                  ref={(el) => {
                    title.ref(el);
                    firstInput.current = el;
                  }}
                  placeholder="Give your next big idea a name"
                  aria-invalid={!!errors.title}
                  aria-describedby="project-title-error"
                />
                <FieldError
                  id="project-title-error"
                  message={errors.title?.message}
                />
                <p className="helper">
                  Give your initiative a clear, descriptive name.
                </p>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="project-type">Project type</label>
                  <select
                    id="project-type"
                    {...register("type")}
                    aria-invalid={!!errors.type}
                    aria-describedby="project-type-error"
                  >
                    <option value="">Select a type</option>
                    {projectTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <FieldError
                    id="project-type-error"
                    message={errors.type?.message}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="event-name">
                    Event name <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="event-name"
                    {...register("eventName")}
                    placeholder="e.g. Campus Innovation Challenge"
                    aria-invalid={!!errors.eventName}
                    aria-describedby="event-error"
                  />
                  <FieldError
                    id="event-error"
                    message={errors.eventName?.message}
                  />
                </div>
              </div>
              <div className="form-field">
                <div className="flex flex-wrap justify-between gap-2">
                  <label htmlFor="project-description">Description</label>
                  <span className="helper">
                    {values.description.length} / 1,200
                  </span>
                </div>
                <textarea
                  id="project-description"
                  rows={6}
                  {...register("description")}
                  placeholder="What will you build together? Share the problem, your approach, and what teammates will learn."
                  aria-invalid={!!errors.description}
                  aria-describedby="description-error"
                />
                <FieldError
                  id="description-error"
                  message={errors.description?.message}
                />
              </div>
            </section>
            <section className="panel space-y-5">
              <SectionHeading
                number={2}
                title="Team Capacity & Roster Sizing"
                description="Set the overall team size. You automatically hold one place as owner."
              />
              <div className="capacity-input-row inset-panel">
                <div>
                  <label htmlFor="project-capacity">Total team capacity</label>
                  <p className="helper">
                    Includes you and your future teammates.
                  </p>
                </div>
                <input
                  id="project-capacity"
                  type="number"
                  min={2}
                  max={100}
                  {...register("capacity", {
                    setValueAs: (v) => (v === "" ? null : Number(v)),
                  })}
                  aria-invalid={!!errors.capacity}
                  aria-describedby="capacity-error"
                />
              </div>
              <FieldError
                id="capacity-error"
                message={errors.capacity?.message}
              />
              <div className="allocation-panel">
                <p className="eyebrow mb-3">Visual slot allocation</p>
                <div className="allocation-slots">
                  <div className="allocation-slot owner">
                    <Avatar name={student.name} />
                    <strong>You (owner)</strong>
                    <Badge>1 member</Badge>
                  </div>
                  {values.roles.slice(0, 5).map((role, i) => (
                    <div className="allocation-slot" key={role.id}>
                      <Users size={22} />
                      <strong>{role.title || `Role ${i + 1}`}</strong>
                      <Badge tone="teal">{role.openings ?? "—"} openings</Badge>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <div className="allocation-slot reserve">
                      <Plus size={22} />
                      <strong>Unassigned</strong>
                      <span>{remaining} places</span>
                    </div>
                  )}
                </div>
                <p
                  className={remaining < 0 ? "field-error mt-3" : "helper mt-3"}
                >
                  <Info size={15} />
                  {openings} role openings · {(values.capacity ?? 1) - 1}{" "}
                  teammate places
                  {remaining >= 0
                    ? ` · ${remaining} unassigned`
                    : " · Exceeds capacity"}
                </p>
              </div>
            </section>
            <section className="panel space-y-5">
              <SectionHeading
                number={3}
                title="Recruitment Roles"
                description="Define contributions and skills. These roles do not grant owner permissions."
              />
              <Badge>{openings} total openings defined</Badge>
              <FieldError
                id="roles-error"
                message={errors.roles?.message ?? errors.roles?.root?.message}
              />
              {fields.map((field, index) => (
                <article
                  key={field.fieldKey}
                  className="creation-role space-y-4"
                >
                  <div className="flex justify-between items-center gap-3">
                    <h3>Role {index + 1}</h3>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove role ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="role-title-grid">
                    <div className="form-field">
                      <label htmlFor={`role-title-${index}`}>Role title</label>
                      <input
                        id={`role-title-${index}`}
                        {...register(`roles.${index}.title`)}
                        placeholder="e.g. Backend Developer"
                        aria-invalid={!!errors.roles?.[index]?.title}
                        aria-describedby={`role-title-error-${index}`}
                      />
                      <FieldError
                        id={`role-title-error-${index}`}
                        message={errors.roles?.[index]?.title?.message}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`role-openings-${index}`}>Openings</label>
                      <input
                        id={`role-openings-${index}`}
                        type="number"
                        min={1}
                        {...register(`roles.${index}.openings`, {
                          setValueAs: (v) => (v === "" ? null : Number(v)),
                        })}
                        aria-invalid={!!errors.roles?.[index]?.openings}
                        aria-describedby={`role-openings-error-${index}`}
                      />
                      <FieldError
                        id={`role-openings-error-${index}`}
                        message={errors.roles?.[index]?.openings?.message}
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <label htmlFor={`role-description-${index}`}>
                      Responsibilities <span className="muted">(optional)</span>
                    </label>
                    <textarea
                      id={`role-description-${index}`}
                      rows={2}
                      {...register(`roles.${index}.responsibilities`)}
                      placeholder="What will this teammate work on?"
                      aria-invalid={!!errors.roles?.[index]?.responsibilities}
                      aria-describedby={`role-description-error-${index}`}
                    />
                    <FieldError
                      id={`role-description-error-${index}`}
                      message={errors.roles?.[index]?.responsibilities?.message}
                    />
                  </div>
                  <RoleSkills
                    skills={skills}
                    selected={values.roles[index]?.skillIds ?? []}
                    onChange={(ids) =>
                      setValue(`roles.${index}.skillIds`, ids, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    index={index}
                    error={errors.roles?.[index]?.skillIds?.message}
                  />
                </article>
              ))}
              <button
                className="add-role-button"
                type="button"
                disabled={fields.length >= 30}
                onClick={() =>
                  append({
                    id: crypto.randomUUID(),
                    title: "",
                    responsibilities: "",
                    skillIds: [],
                    openings: 1,
                  })
                }
              >
                <Plus size={18} />
                Add recruitment role
              </button>
            </section>
          </fieldset>
          {mutation.isError && (
            <p className="error-banner" role="alert">
              {mutation.error.message} Your edits are still here; try saving
              again.
            </p>
          )}
          <div className="panel creation-actions">
            <p className="helper">
              Drafts stay private. Publishing opens recruitment to other
              students.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() =>
                  isDirty ? setLeaveTo("/discover") : router.push("/discover")
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => submit("draft")}
              >
                <Save size={16} />
                {mutation.isPending ? "Saving…" : "Save Draft"}
              </button>
              <button
                type="submit"
                className="button"
                disabled={mutation.isPending}
              >
                <Rocket size={16} />
                {mutation.isPending ? "Saving…" : "Publish Project"}
              </button>
            </div>
          </div>
        </form>
        <ProjectPreview values={values} student={student} skills={skills} />
      </div>
      <Dialog.Root
        open={leaveTo !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveTo(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content feedback-dialog">
            <Dialog.Title>Discard unsaved changes?</Dialog.Title>
            <Dialog.Description>
              Your latest edits have not been saved. Any previously saved draft
              will remain.
            </Dialog.Description>
            <div className="form-actions">
              <Dialog.Close className="button secondary">
                Keep Editing
              </Dialog.Close>
              <button
                className="button"
                onClick={() => {
                  const target = leaveTo!;
                  reset();
                  setLeaveTo(null);
                  router.push(target);
                }}
              >
                Discard & Leave
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={feedback !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (feedback === "published") router.push(`/projects/${savedId}`);
            else {
              setFeedback(null);
              if (saved)
                router.replace(`/projects/${savedId}/edit`, { scroll: false });
            }
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content feedback-dialog"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              firstInput.current?.focus();
            }}
          >
            <CheckCircle2 size={38} className="text-teal-700" />
            <Dialog.Title>
              {feedback === "published" ? "Project published!" : "Draft saved"}
            </Dialog.Title>
            <Dialog.Description>
              {feedback === "published"
                ? "Your project is now in Discover and ready for role applications."
                : "Your draft is saved privately. Continue editing whenever you are ready."}
            </Dialog.Description>
            <div className="form-actions">
              {feedback === "published" ? (
                <>
                  <Link className="button secondary" href="/discover">
                    Discover Projects
                  </Link>
                  <Link className="button" href={`/projects/${savedId}`}>
                    View Project
                  </Link>
                </>
              ) : (
                <Dialog.Close className="button">Continue Editing</Dialog.Close>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
function DraftLinks() {
  const query = useDrafts();
  if (query.isPending) return null;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  if (!query.data.length) return null;
  return (
    <section className="panel saved-drafts">
      <h2>Your saved drafts</h2>
      <p className="helper">Only you can see and edit these drafts.</p>
      <div className="flex flex-wrap gap-3 mt-3">
        {query.data.map((d) => (
          <Link
            className="button secondary"
            key={d.id}
            href={`/projects/${d.id}/edit`}
          >
            {d.values.title} →
          </Link>
        ))}
      </div>
    </section>
  );
}
export function ProjectEditor({
  projectId,
  saved = false,
}: {
  projectId?: string;
  saved?: boolean;
}) {
  const session = useSession();
  const draft = useDraft(projectId);
  if (session.isPending || (projectId && draft.isPending))
    return <Loading label="Loading project workspace…" />;
  if (session.isError)
    return (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  if (projectId && draft.isError)
    return (
      <>
        <ErrorState error={draft.error} retry={() => void draft.refetch()} />
        <Link href="/discover" className="button mt-4">
          Back to Discover
        </Link>
      </>
    );
  return (
    <div className="space-y-6">
      <div className="creation-intro">
        <p className="eyebrow mb-2">
          Projects / {projectId ? "Edit draft" : "Create project"}
        </p>
        <h1>
          Build something
          <br />
          together.
        </h1>
        <p>
          Share your idea, specify the talent needed,
          <br className="hidden sm:block" /> and assemble your collegiate team.
        </p>
      </div>
      {!projectId && <DraftLinks />}
      <ProjectForm
        key={projectId ?? "new"}
        student={session.data.student}
        skills={session.data.skills}
        initial={draft.data?.values ?? emptyProject}
        id={projectId}
        saved={saved}
      />
    </div>
  );
}
