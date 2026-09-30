"use client";
import { useState } from "react";
import { Search, X, Compass } from "lucide-react";
import { useDiscovery } from "@/lib/queries";
import { defaultFilters } from "@/lib/mock-api";
import type { DiscoveryFilters } from "@/lib/models";
import { ProjectCard } from "@/components/project-card";
import { Badge, ErrorState, Loading } from "@/components/ui";
export default function Discover() {
  const [filters, setFilters] = useState<DiscoveryFilters>(defaultFilters);
  const query = useDiscovery(filters);
  const update = <K extends keyof DiscoveryFilters>(
    key: K,
    value: DiscoveryFilters[K],
  ) => setFilters((old) => ({ ...old, [key]: value }));
  const options = [
    {
      key: "type" as const,
      label: "Project type",
      all: "All types",
      values: query.data?.types.map((x) => ({ id: x, name: x })) ?? [],
    },
    {
      key: "skill" as const,
      label: "Skill",
      all: "All skills",
      values: query.data?.skills ?? [],
    },
    {
      key: "role" as const,
      label: "Open role",
      all: "All roles",
      values: query.data?.categories.map((x) => ({ id: x, name: x })) ?? [],
    },
    {
      key: "campus" as const,
      label: "Campus",
      all: "All campuses",
      values: query.data?.campuses.map((x) => ({ id: x, name: x })) ?? [],
    },
  ];
  const active = Boolean(
    filters.search ||
    filters.type ||
    filters.skill ||
    filters.role ||
    filters.campus ||
    filters.openingsOnly,
  );
  return (
    <div className="space-y-6">
      <section className="discover-hero">
        <div>
          <Badge>
            <span className="dot" />
            Inter-campus collaboration hub
          </Badge>
          <h1>Find your next team.</h1>
          <p>
            Discover projects and hackathons looking for your skills. Team up
            with builders across India.
          </p>
        </div>
        <div className="hero-campuses" aria-hidden="true">
          <span>IIT</span>
          <span>NIT</span>
          <span>BITS</span>
        </div>
      </section>
      <section className="panel filter-panel" aria-label="Project filters">
        <div className="search-field">
          <Search size={20} />
          <input
            aria-label="Search projects, skills, or roles"
            placeholder="Search projects, skills, or roles…"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
          />
          {filters.search && (
            <button
              aria-label="Clear search"
              onClick={() => update("search", "")}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="filter-grid">
          {options.map((o) => (
            <label key={o.key}>
              {o.label}
              <select
                aria-label={o.label}
                value={filters[o.key]}
                onChange={(e) => update(o.key, e.target.value)}
              >
                <option value="">{o.all}</option>
                {o.values.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="switch-label">
            Has openings only
            <input
              type="checkbox"
              role="switch"
              checked={filters.openingsOnly}
              onChange={(e) => update("openingsOnly", e.target.checked)}
            />
          </label>
        </div>
        {active && (
          <div className="active-filters">
            <span>Active filters:</span>
            {filters.search && (
              <button
                className="filter-chip"
                onClick={() => update("search", "")}
              >
                Search: {filters.search}
                <X size={13} />
              </button>
            )}
            {options
              .filter((o) => filters[o.key])
              .map((o) => (
                <button
                  key={o.key}
                  className="filter-chip"
                  aria-label={`Remove ${o.label} filter`}
                  onClick={() => update(o.key, "")}
                >
                  {o.label}:{" "}
                  {o.values.find((v) => v.id === filters[o.key])?.name ??
                    filters[o.key]}
                  <X size={13} />
                </button>
              ))}
            {filters.openingsOnly && (
              <button
                className="filter-chip teal"
                onClick={() => update("openingsOnly", false)}
              >
                Has openings
                <X size={13} />
              </button>
            )}
            <button
              className="text-button"
              onClick={() => setFilters(defaultFilters)}
            >
              Reset filters
            </button>
          </div>
        )}
      </section>
      <div className="results-bar">
        <p role="status" aria-live="polite">
          <strong>
            {query.isFetching
              ? "Finding projects…"
              : query.data
                ? `${query.data.projects.length} ${query.data.projects.length === 1 ? "project" : "projects"}`
                : "Finding projects…"}
          </strong>
          {query.data && (
            <span className="muted"> from {query.data.total} total</span>
          )}
        </p>
        <label>
          Sort by
          <select
            aria-label="Sort by"
            value={filters.sort}
            onChange={(e) =>
              update("sort", e.target.value as DiscoveryFilters["sort"])
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
            <option value="openings">Most openings</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <Loading label="Finding your next team…" />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.projects.length ? (
        <div className="project-grid">
          {query.data.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="state-panel">
          <Compass size={32} />
          <h2>No projects match just yet</h2>
          <p>Try another skill, a broader search, or clear your filters.</p>
          <button
            className="button secondary"
            onClick={() => setFilters(defaultFilters)}
          >
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
