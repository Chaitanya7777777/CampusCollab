"use client";
import Link from "next/link";
import { API_MODE } from "@/lib/app-mode";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import {
  Send,
  Hourglass,
  CheckCircle2,
  Archive,
  Search,
  Compass,
  X,
  Eye,
} from "lucide-react";
import {
  useMyApplications,
  useMyApplication,
  useWithdrawApplication,
} from "@/lib/queries";
import { defaultApplicationFilters } from "@/lib/mock-api";
import type { Application, ApplicantApplication } from "@/lib/models";
import { displayDate } from "@/lib/dates";
import { Badge, ErrorState, Loading } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";

const label = (status: string) => status[0].toUpperCase() + status.slice(1);
function Status({ status }: { status: Application["status"] }) {
  return (
    <Badge
      tone={
        status === "pending"
          ? "amber"
          : status === "accepted"
            ? "teal"
            : "muted"
      }
    >
      {label(status)}
    </Badge>
  );
}
function ProjectAccess({ entry }: { entry: ApplicantApplication }) {
  return (
    <>
      {entry.projectHref && (
        <Link className="button secondary" href={entry.projectHref}>
          {entry.isMember ? "View Team" : "View Project"}
        </Link>
      )}
      {!entry.projectHref && (
        <p className="helper">Project details are unavailable.</p>
      )}
    </>
  );
}
function MembershipNote({ entry }: { entry: ApplicantApplication }) {
  return entry.application.status === "accepted" && !entry.isMember ? (
    <p className="helper membership-note">
      Your application was accepted, but you are not currently a member of this
      team.
    </p>
  ) : null;
}
function ApplicationDetails({
  id,
  confirmInitially,
  onClose,
  restoreFocus,
}: {
  id: string;
  confirmInitially: boolean;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const query = useMyApplication(id);
  const mutation = useWithdrawApplication();
  const [confirm, setConfirm] = useState(confirmInitially);
  const lock = useRef(false);
  const entry = query.isError ? undefined : query.data;
  const app = entry?.application;
  const withdraw = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      await mutation.mutateAsync(id);
      setConfirm(false);
    } catch {
      /* Keep the error and supplied history visible for retry. */
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
            restoreFocus();
          }}
        >
          <div className="review-heading">
            <div>
              <p className="eyebrow">My Applications</p>
              <Dialog.Title>Application details</Dialog.Title>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Close application details"
              disabled={mutation.isPending}
            >
              <X size={22} />
            </Dialog.Close>
          </div>
          <Dialog.Description>
            Your submitted application is read-only. Status reflects the latest
            saved record.
          </Dialog.Description>
          {query.isPending ? (
            <Loading label="Loading your application…" />
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            entry &&
            app && (
              <>
                <section className="inset-panel space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{entry.projectType}</Badge>
                    <Status status={app.status} />
                    {entry.projectStatus === "archived" && (
                      <Badge tone="muted">Project archived</Badge>
                    )}
                  </div>
                  <h2>{entry.projectTitle}</h2>
                  <p>{entry.roleTitle}</p>
                  <MembershipNote entry={entry} />
                </section>
                <dl className="application-dates">
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      <time dateTime={app.createdAt}>
                        {new Date(app.createdAt).toLocaleString("en-GB")}
                      </time>
                    </dd>
                  </div>
                  {app.decidedAt &&
                    (app.status === "accepted" ||
                      app.status === "rejected") && (
                      <div>
                        <dt>{label(app.status)}</dt>
                        <dd>
                          <time dateTime={app.decidedAt}>
                            {new Date(app.decidedAt).toLocaleString("en-GB")}
                          </time>
                        </dd>
                      </div>
                    )}
                  {app.status === "withdrawn" && (
                    <div>
                      <dt>Withdrawn</dt>
                      <dd>
                        {app.withdrawnAt ? (
                          <time dateTime={app.withdrawnAt}>
                            {new Date(app.withdrawnAt).toLocaleString("en-GB")}
                          </time>
                        ) : (
                          "Time not recorded"
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
                <section>
                  <h3 className="mb-2">Motivation</h3>
                  <p className="inset-panel application-copy">
                    {app.motivation}
                  </p>
                </section>
                <section>
                  <h3 className="mb-2">Experience & projects</h3>
                  <p className="inset-panel application-copy">
                    {app.experience}
                  </p>
                </section>
                {app.portfolio && (
                  <a
                    className="portfolio-link"
                    href={app.portfolio}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View submitted portfolio ↗
                  </a>
                )}
                {mutation.isSuccess && (
                  <p role="status" className="saved-notice">
                    Application withdrawn. Reapplication to this project is
                    unavailable.
                  </p>
                )}
                {mutation.isError && (
                  <p role="alert" className="error-banner">
                    {mutation.error.message}
                  </p>
                )}
                {app.status !== "pending" && (
                  <p className="info-banner">
                    This application is {app.status} and cannot be withdrawn.
                  </p>
                )}
                <div className="form-actions">
                  <ProjectAccess entry={entry} />
                  {app.status === "pending" && (
                    <button
                      className="button danger-secondary"
                      disabled={mutation.isPending}
                      onClick={() => {
                        mutation.reset();
                        setConfirm(true);
                      }}
                    >
                      Withdraw application
                    </button>
                  )}
                </div>
                <ConfirmationDialog
                  open={confirm && app.status === "pending"}
                  onOpenChange={setConfirm}
                  title="Withdraw this application?"
                  description="The owner will no longer be able to accept this request. You cannot reapply to this project under the current one-application-per-project rule."
                  confirmLabel="Confirm withdrawal"
                  pending={mutation.isPending}
                  error={mutation.isError ? mutation.error.message : undefined}
                  onConfirm={() => void withdraw()}
                />
              </>
            )
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function MyApplications() {
  const [filters, updateFilters] = useState(defaultApplicationFilters);
  const [page, setPage] = useState(1);
  const setFilters = (value: typeof filters) => {
    updateFilters(value);
    setPage(1);
  };
  const query = useMyApplications(filters, page);
  const [selected, setSelected] = useState<{
    id: string;
    withdraw: boolean;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const open = (id: string, withdraw: boolean, element: HTMLButtonElement) => {
    trigger.current = element;
    setSelected({ id, withdraw });
  };
  if (query.isPending) return <Loading label="Loading your applications…" />;
  if (query.isError)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const { applications, counts } = query.data;
  const actions = (entry: ApplicantApplication) => (
    <div className="application-actions">
      <button
        className="button secondary"
        onClick={(e) => open(entry.application.id, false, e.currentTarget)}
      >
        <Eye size={16} />
        View Application
      </button>
      {entry.application.status === "pending" && (
        <button
          className="button danger-secondary"
          onClick={(e) => open(entry.application.id, true, e.currentTarget)}
        >
          Withdraw
        </button>
      )}
      <ProjectAccess entry={entry} />
    </div>
  );
  const project = (entry: ApplicantApplication) => (
    <div className="application-project">
      <div className="flex flex-wrap gap-2">
        <Badge>{entry.projectType}</Badge>
        {entry.projectStatus === "archived" && (
          <Badge tone="muted">Project archived</Badge>
        )}
      </div>
      <h2>{entry.projectTitle}</h2>
      <p className="applicant-role">{entry.roleTitle}</p>
      <MembershipNote entry={entry} />
    </div>
  );
  return (
    <div className="space-y-6">
      <header className="dashboard-heading">
        <div>
          <p className="eyebrow mb-2">My Applications</p>
          <h1 ref={heading} tabIndex={-1}>
            Your next team starts here.
          </h1>
          <p className="lead mt-2">
            Track your applications and see where you stand across campus
            initiatives.
          </p>
        </div>
        <Link className="button secondary" href="/discover">
          <Compass size={18} />
          Explore projects
        </Link>
      </header>
      <div className="application-stats">
        {[
          { title: "Total submissions", value: counts.all, Icon: Send },
          { title: "Under review", value: counts.pending, Icon: Hourglass },
          { title: "Accepted", value: counts.accepted, Icon: CheckCircle2 },
          { title: "Withdrawn", value: counts.withdrawn, Icon: Archive },
        ].map(({ title, value, Icon }) => (
          <section className="panel" key={title}>
            <div>
              <p className="eyebrow">{title}</p>
              <strong>{value}</strong>
              <span className="helper">
                {value === 1 ? "application" : "applications"}
              </span>
            </div>
            <span className="application-stat-icon">
              <Icon size={24} />
            </span>
          </section>
        ))}
      </div>
      <section className="panel space-y-4">
        <div className="status-filters" aria-label="Filter application status">
          {(
            ["all", "pending", "accepted", "rejected", "withdrawn"] as const
          ).map((status) => (
            <button
              key={status}
              aria-pressed={filters.status === status}
              onClick={() => setFilters({ ...filters, status })}
            >
              {label(status)} ({counts[status]})
            </button>
          ))}
        </div>
        <div className="application-filter-inputs">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search applications by project or role"
              placeholder="Search by project title or applied role…"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </div>
          <label className="application-sort">
            Sort
            <select
              aria-label="Sort applications"
              value={filters.sort}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  sort: e.target.value as "newest" | "oldest",
                })
              }
            >
              <option value="newest">Newest submission</option>
              <option value="oldest">Oldest submission</option>
            </select>
          </label>
        </div>
      </section>
      <p className="helper" role="status">
        {query.isFetching
          ? "Updating results…"
          : API_MODE
            ? `${query.data.total} of ${counts.all} applications match · Page ${page}`
            : `${applications.length} of ${counts.all} applications shown`}
      </p>
      {applications.length ? (
        <div aria-busy={query.isFetching}>
          <table className="applications-table">
            <caption className="sr-only">Your submitted applications</caption>
            <thead>
              <tr>
                <th scope="col">Project & role</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((entry) => (
                <tr key={entry.application.id} data-testid="application-row">
                  <td>{project(entry)}</td>
                  <td>
                    <time dateTime={entry.application.createdAt}>
                      {displayDate(entry.application.createdAt)}
                    </time>
                  </td>
                  <td>
                    <Status status={entry.application.status} />
                  </td>
                  <td>{actions(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="application-mobile-cards">
            {applications.map((entry) => (
              <article
                className="panel space-y-4"
                key={entry.application.id}
                data-testid="application-card"
              >
                {project(entry)}
                <div className="flex flex-wrap justify-between gap-3">
                  <Status status={entry.application.status} />
                  <p className="helper">
                    Submitted {displayDate(entry.application.createdAt)}
                  </p>
                </div>
                {actions(entry)}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="state-panel">
          <Send size={32} />
          <h2>
            {counts.all
              ? "No matching applications"
              : "Your next collaboration awaits"}
          </h2>
          <p>
            {counts.all
              ? "Try another project title, role or status."
              : "Apply for a recruitment role to track your application here."}
          </p>
          {counts.all ? (
            <button
              className="button secondary"
              onClick={() => setFilters(defaultApplicationFilters)}
            >
              Reset filters
            </button>
          ) : (
            <Link className="button" href="/discover">
              Discover Projects
            </Link>
          )}
        </div>
      )}
      {API_MODE && (page > 1 || query.data.total > query.data.pageSize) && (
        <nav aria-label="Application pages" className="flex gap-3">
          <button
            className="button secondary"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="button secondary"
            disabled={
              page * query.data.pageSize >= query.data.total || query.isFetching
            }
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {selected && (
        <ApplicationDetails
          key={selected.id}
          id={selected.id}
          confirmInitially={selected.withdraw}
          onClose={() => setSelected(null)}
          restoreFocus={() => {
            if (trigger.current?.isConnected) trigger.current.focus();
            else heading.current?.focus();
          }}
        />
      )}
    </div>
  );
}
