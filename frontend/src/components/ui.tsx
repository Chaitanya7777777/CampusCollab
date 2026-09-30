import type { ReactNode } from "react";
import { AlertCircle, GraduationCap, LoaderCircle, X } from "lucide-react";
import type { Skill, Student } from "@/lib/models";
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`avatar ${large ? "avatar-large" : ""}`}
    >
      {name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
export function SkillChip({
  name,
  onRemove,
  matched = false,
}: {
  name: string;
  onRemove?: () => void;
  matched?: boolean;
}) {
  return (
    <span className={`skill-chip ${matched ? "matched" : ""}`}>
      {name}
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove}>
          <X size={14} />
        </button>
      )}
    </span>
  );
}
export function Skills({ skills }: { skills: Skill[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <SkillChip key={s.id} name={s.name} />
      ))}
    </div>
  );
}
export function Badge({
  children,
  tone = "lavender",
}: {
  children: ReactNode;
  tone?: "lavender" | "teal" | "amber" | "muted";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function TeamCapacity({
  count,
  capacity,
}: {
  count: number;
  capacity: number;
}) {
  return (
    <div className="capacity">
      <div className="flex justify-between gap-3">
        <span>Team capacity</span>
        <span>
          {count} of {capacity} members
        </span>
      </div>
      <progress
        aria-label="Team capacity including owner"
        max={capacity}
        value={count}
      />
    </div>
  );
}
export function StudentSummary({
  student,
  compact = false,
}: {
  student: Student;
  compact?: boolean;
}) {
  return (
    <div className={`student-summary ${compact ? "compact" : ""}`}>
      <Avatar name={student.name} large={!compact} />
      <div className="min-w-0">
        <strong>{student.name}</strong>
        <p>
          <GraduationCap size={14} />
          {student.campus}
        </p>
        {!compact && (
          <p>
            {student.department} · Semester {student.semester}
          </p>
        )}
      </div>
    </div>
  );
}
export function Loading({
  label = "Loading your campus…",
}: {
  label?: string;
}) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="animate-spin" />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="state-panel" role="alert">
      <AlertCircle />
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button className="button secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="field-error" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
