"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActor, useCreateSkill } from "@/lib/queries";
import { API_MODE } from "@/lib/app-mode";
import { api } from "@/lib/api-client";
import { mockApi } from "@/lib/mock-api";
import { cleanSkillName, skillKey } from "@/lib/skill-normalization";
import type { Skill } from "@/lib/models";
import { SkillChip } from "./ui";

export function SkillSelector({
  skills,
  selected,
  onChange,
  label,
  selectLabel,
}: {
  skills: Skill[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  selectLabel?: string;
}) {
  const actor = useActor();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const creating = useRef(false);
  const currentActor = useRef(actor);
  const client = useQueryClient();
  useEffect(() => {
    currentActor.current = actor;
  }, [actor]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Skill[]>([]);
  const [notice, setNotice] = useState("");
  const mutation = useCreateSkill();
  let name = "",
    validation = "";
  if (search) {
    try {
      name = cleanSkillName(search);
    } catch (e) {
      validation = (e as Error).message;
    }
  }
  const match = useQuery({
    queryKey: [actor, "skill-match", name],
    enabled: !!name,
    retry: false,
    queryFn: ({ signal }) =>
      API_MODE ? api.resolveSkill(name, signal) : mockApi.resolveSkill(name),
  });
  const catalog = [
    ...new Map(
      [...skills, ...added, ...(match.data ? [match.data] : [])].map((s) => [
        s.id,
        s,
      ]),
    ).values(),
  ];
  const options = catalog.filter(
    (s) =>
      !selected.includes(s.id) &&
      (!name || skillKey(s.name).includes(skillKey(name))),
  );
  const latest = useRef({ selected, onChange });
  useEffect(() => {
    latest.current = { selected, onChange };
  }, [selected, onChange]);
  function select(skill: Skill) {
    const state = latest.current;
    if (!state.selected.includes(skill.id) && state.selected.length < 15)
      state.onChange([...state.selected, skill.id]);
    setAdded((prev) => [...prev.filter((s) => s.id !== skill.id), skill]);
    setNotice(`${skill.name} selected.`);
    input.current?.focus({ preventScroll: true });
  }
  async function create() {
    if (creating.current) return;
    creating.current = true;
    const startedBy = actor;
    setNotice("");
    try {
      const skill = await mutation.mutateAsync(name);
      if (alive.current && currentActor.current === startedBy) {
        client.setQueryData([actor, "skill-match", name], skill);
        select(skill);
      }
    } catch {
      /* Keep the form for retry. */
    } finally {
      creating.current = false;
    }
  }
  return (
    <div className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <label htmlFor={id} className="micro-label">
        {label}
      </label>
      <input
        id={id}
        ref={input}
        value={search}
        maxLength={320}
        placeholder="Search and add skills…"
        aria-describedby={`${id}-help`}
        aria-invalid={!!validation}
        onChange={(e) => {
          setSearch(e.target.value);
          setNotice("");
          if (!creating.current) mutation.reset();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      <p id={`${id}-help`} className="helper">
        Adding a skill makes it available to everyone. Discarding this form
        removes your unsaved selection, not the catalog entry.
      </p>
      <div className="flex flex-wrap gap-2">
        {catalog
          .filter((s) => selected.includes(s.id))
          .map((s) => (
            <SkillChip
              key={s.id}
              name={s.name}
              onRemove={() => onChange(selected.filter((id) => id !== s.id))}
            />
          ))}
      </div>
      {selectLabel ? (
        <select
          aria-label={selectLabel}
          value=""
          disabled={selected.length >= 15}
          onChange={(e) => {
            const skill = catalog.find((s) => s.id === e.target.value);
            if (skill) select(skill);
          }}
        >
          <option value="">+ Add a catalog skill</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="catalog-options" aria-label="Available catalog skills">
          {options.map((s) => (
            <button
              type="button"
              key={s.id}
              disabled={selected.length >= 15}
              aria-label={`Add ${s.name}`}
              onClick={() => select(s)}
            >
              + {s.name}
            </button>
          ))}
        </div>
      )}
      {validation && (
        <p role="alert" className="error-text">
          {validation}
        </p>
      )}
      {name && match.isPending && (
        <p role="status">Checking the shared catalog…</p>
      )}
      {name && match.isError && (
        <p role="alert">
          Could not check the catalog.{" "}
          <button type="button" onClick={() => void match.refetch()}>
            Retry lookup
          </button>
        </p>
      )}
      {name && match.isSuccess && !match.data && (
        <button
          type="button"
          className="button secondary max-w-full"
          disabled={mutation.isPending || selected.length >= 15}
          onClick={() => void create()}
        >
          {mutation.isPending ? "Adding skill…" : `Add “${name}”`}
        </button>
      )}
      {name &&
        match.data &&
        !selected.includes(match.data.id) &&
        !options.some((s) => s.id === match.data?.id) && (
          <button type="button" onClick={() => select(match.data!)}>
            Select {match.data.name}
          </button>
        )}
      {mutation.isError && (
        <p role="alert" className="error-banner">
          {mutation.error.message} You can retry using Add.
        </p>
      )}
      {notice && (
        <p role="status" className="saved-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
