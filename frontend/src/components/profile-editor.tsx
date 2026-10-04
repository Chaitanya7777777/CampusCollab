"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  apiProfileFormSchema,
  type ProfileFormValues,
} from "@/lib/api-contract";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  Check,
  Code2,
  Info,
  Search,
  Shapes,
  Users,
  UserRoundPen,
} from "lucide-react";
import { useSaveProfile, useSession } from "@/lib/queries";
import { profileSchema } from "@/lib/validation";
import type { ProjectView, Skill, Student } from "@/lib/models";
import {
  Badge,
  ErrorState,
  FieldError,
  Loading,
  SkillChip,
  Skills,
  StudentSummary,
} from "./ui";
function ProfileSummary({
  student,
  skills,
  projects,
}: {
  student: Student;
  skills: Skill[];
  projects: ProjectView[];
}) {
  return (
    <div className="space-y-6">
      <section className="panel profile-summary">
        <Badge tone="teal">Student profile</Badge>
        <StudentSummary student={student} />
        <p className="profile-bio">“{student.bio}”</p>
        <div className="profile-stats">
          <div>
            <strong>{projects.length}</strong>
            <span>Teams</span>
          </div>
          <div>
            <strong>{student.skillIds.length}</strong>
            <span>Tagged skills</span>
          </div>
        </div>
        <p className="eyebrow mt-5 mb-2">Contact & portfolio</p>
        <div className="profile-links">
          <span>{student.email}</span>
          {[
            ["GitHub", student.github],
            ["LinkedIn", student.linkedin],
            ["Website", student.website],
          ]
            .filter(([, url]) => url)
            .map(([label, url]) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
        </div>
        <p className="helper mt-3">
          Fictional demo student · Self-declared information
        </p>
      </section>
      <section className="panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">
            <Shapes size={21} />
            Skills
          </h2>
          <span className="muted text-sm">
            {student.skillIds.length} selected
          </span>
        </div>
        <Skills
          skills={skills.filter((s) => student.skillIds.includes(s.id))}
        />
      </section>
      <section className="panel space-y-4">
        <h2 className="section-title">
          <Users size={21} />
          Projects & Teams
        </h2>
        {projects.length ? (
          projects.map((project) => (
            <Link
              className="profile-project"
              key={project.id}
              href={`/projects/${project.id}`}
            >
              <h3>{project.title}</h3>
              <p>
                <Code2 size={16} />
                {
                  project.team.find((t) => t.student.id === student.id)
                    ?.membership.contribution
                }
              </p>
              <span>View project →</span>
            </Link>
          ))
        ) : (
          <p className="muted">You haven’t joined a team yet.</p>
        )}
      </section>
    </div>
  );
}
export function ProfileForm({
  initialValues,
  skills,
  onSave,
  real = false,
}: {
  initialValues: ProfileFormValues;
  skills: Skill[];
  onSave: (values: ProfileFormValues) => Promise<ProfileFormValues>;
  real?: boolean;
}) {
  const mutation = useMutation({ mutationFn: onSave });
  const schema: z.ZodType<ProfileFormValues, ProfileFormValues> = real
    ? apiProfileFormSchema
    : profileSchema;
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });
  const selected = useWatch({ control, name: "skillIds" });
  const bio = useWatch({ control, name: "bio" });
  const toggle = (id: string) => {
    setNotice("");
    setValue(
      "skillIds",
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
      { shouldDirty: true, shouldValidate: true },
    );
  };
  const save = handleSubmit((values) => {
    setNotice("");
    mutation.mutate(values, {
      onSuccess: (saved) => {
        reset(saved);
        setNotice(
          "Profile saved. Your changes are now available across CampusCollab.",
        );
      },
    });
  });
  return (
    <section className="panel editor-panel">
      <h2 className="section-title">
        <UserRoundPen size={25} />
        Edit Student Information & Skills
      </h2>
      <p className="info-banner">
        <Info size={20} />
        <span>
          Colleges, departments, and skills are self-declared. Keep your profile
          accurate to help teams get to know you.
        </span>
      </p>
      <form
        noValidate
        onSubmit={save}
        onChange={() => {
          setNotice("");
          mutation.reset();
        }}
      >
        <fieldset disabled={mutation.isPending} className="space-y-6">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                {...register("name")}
                autoComplete="name"
                aria-invalid={!!errors.name}
                aria-describedby="name-error"
              />
              <FieldError id="name-error" message={errors.name?.message} />
            </div>
            <div className="form-field">
              <label htmlFor="campus">College / university</label>
              <input
                id="campus"
                {...register("campus")}
                aria-invalid={!!errors.campus}
                aria-describedby="campus-error"
              />
              <FieldError id="campus-error" message={errors.campus?.message} />
            </div>
            <div className="form-field">
              <label htmlFor="department">Department / major</label>
              <input
                id="department"
                {...register("department")}
                aria-invalid={!!errors.department}
                aria-describedby="department-error"
              />
              <FieldError
                id="department-error"
                message={errors.department?.message}
              />
            </div>
            <div className="form-field">
              <label htmlFor="semester">Current semester</label>
              <select
                id="semester"
                {...register("semester")}
                aria-invalid={!!errors.semester}
                aria-describedby="semester-error"
              >
                {real && <option value="">Not specified</option>}
                {Array.from({ length: 8 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Semester {i + 1}
                  </option>
                ))}
              </select>
              <FieldError
                id="semester-error"
                message={errors.semester?.message}
              />
            </div>
          </div>
          <div className="form-field">
            <div className="flex justify-between gap-2">
              <label htmlFor="bio">Academic & project bio</label>
              <span className="helper">{bio.length} / 300</span>
            </div>
            <textarea
              id="bio"
              {...register("bio")}
              rows={5}
              aria-invalid={!!errors.bio}
              aria-describedby="bio-error"
            />
            <FieldError id="bio-error" message={errors.bio?.message} />
            <p className="helper">
              Keep it concise. Share your interests and what you would like to
              build.
            </p>
          </div>
          <section
            className="inset-panel space-y-4"
            aria-labelledby="skills-title"
          >
            <div>
              <h3 id="skills-title">Skills</h3>
              <p className="helper mt-1">
                Select up to 15 tools and skills from the catalog.
              </p>
            </div>
            <div className="search-field">
              <Search size={18} />
              <input
                aria-label="Search skill catalog"
                placeholder="Search and add skills…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <p className="eyebrow mb-2">
                Selected skills · {selected.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {skills
                  .filter((s) => selected.includes(s.id))
                  .map((s) => (
                    <SkillChip
                      key={s.id}
                      name={s.name}
                      onRemove={() => toggle(s.id)}
                    />
                  ))}
              </div>
              <FieldError
                id="skills-error"
                message={errors.skillIds?.message}
              />
            </div>
            <div
              className="catalog-options"
              aria-label="Available catalog skills"
            >
              {skills
                .filter(
                  (s) =>
                    !selected.includes(s.id) &&
                    s.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={selected.length >= 15}
                    onClick={() => toggle(s.id)}
                    aria-label={`Add ${s.name}`}
                  >
                    + {s.name}
                  </button>
                ))}
              {!skills.some(
                (s) =>
                  !selected.includes(s.id) &&
                  s.name.toLowerCase().includes(search.toLowerCase()),
              ) && (
                <p className="helper">
                  No additional skills match this search.
                </p>
              )}
            </div>
          </section>
          <div className="space-y-3">
            <h3>Social & portfolio links</h3>
            <div className="link-fields">
              {(
                [
                  { key: "github", label: "GitHub URL" },
                  { key: "linkedin", label: "LinkedIn URL" },
                  { key: "website", label: "Personal website" },
                ] as const
              ).map(({ key, label }) => (
                <div className="form-field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type="url"
                    {...register(key)}
                    placeholder="https://…"
                    aria-invalid={!!errors[key]}
                    aria-describedby={`${key}-error`}
                  />
                  <FieldError
                    id={`${key}-error`}
                    message={errors[key]?.message}
                  />
                </div>
              ))}
            </div>
          </div>
        </fieldset>
        {mutation.isError && (
          <p className="error-banner mt-4" role="alert">
            {mutation.error.message}
          </p>
        )}
        {notice && (
          <p className="saved-notice mt-4" role="status">
            <Check size={18} />
            {notice}
          </p>
        )}
        <div className="profile-actions">
          <span className="helper">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex flex-wrap gap-3">
            <button
              className="button secondary"
              type="button"
              disabled={!isDirty || mutation.isPending}
              onClick={() => {
                reset(initialValues);
                mutation.reset();
                setSearch("");
                setNotice("Changes discarded.");
              }}
            >
              Discard changes
            </button>
            <button
              className="button"
              type="submit"
              disabled={mutation.isPending || !isDirty}
            >
              <Check size={18} />
              {mutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
export function ProfileEditor() {
  const query = useSession();
  const saveProfile = useSaveProfile();
  if (query.isPending) return <Loading label="Loading your student profile…" />;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">My profile / Information & skills</p>
        <h1>Student Profile Workspace</h1>
      </div>
      <div className="profile-grid">
        <ProfileSummary {...query.data} />
        <ProfileForm
          initialValues={profileSchema.parse(query.data.student)}
          skills={query.data.skills}
          onSave={async (values) =>
            profileSchema.parse(
              await saveProfile.mutateAsync(profileSchema.parse(values)),
            )
          }
        />
      </div>
    </div>
  );
}
