"use client";
import Link from "next/link";
import { useMyProjects } from "@/lib/queries";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { profilePatch, profileValues } from "@/lib/api-contract";
import { useAuth } from "./api-auth";
import { ProfileForm } from "./profile-editor";
import { Avatar, Badge, ErrorState, Loading, Skills } from "./ui";
export function ApiProfileEditor() {
  const auth = useAuth();
  const memberships = useMyProjects();
  const client = useQueryClient();
  const id = auth.user?.id;
  const profile = useQuery({
    queryKey: ["api", id, "profile"],
    enabled: !!id,
    queryFn: async ({ signal }) => {
      const result = await api.profile(signal);
      if (result.id !== id)
        throw new ApiError(
          "Your account changed. Refreshing your session.",
          401,
        );
      return result;
    },
  });
  const skills = useQuery({
    queryKey: ["api", "skills"],
    enabled: !!id,
    queryFn: ({ signal }) => api.skills(signal),
  });
  const expired =
    profile.error instanceof ApiError && profile.error.status === 401;
  const restore = auth.restore;
  useEffect(() => {
    if (expired) void restore();
  }, [expired, restore]);
  if (!id || expired || profile.isPending || skills.isPending)
    return <Loading label="Loading your profile…" />;
  if (profile.isError || skills.isError)
    return (
      <ErrorState
        error={(profile.error ?? skills.error)!}
        retry={() => {
          void profile.refetch();
          void skills.refetch();
        }}
      />
    );
  const saved = profile.data;
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow mb-2">My profile / Information & skills</p>
        <h1>Student Profile Workspace</h1>
      </div>
      <p className="info-banner">
        Your profile uses your real account only. Explore Discover or My
        Projects to create and manage teams, or track requests in My
        Applications.
      </p>
      <div className="profile-grid">
        <section className="panel profile-summary space-y-5">
          <Badge tone="teal">Student profile</Badge>
          <div className="student-summary">
            <Avatar name={saved.name} large />
            <div className="min-w-0">
              <strong>{saved.name}</strong>
              <p>{saved.campus ?? "Add your university"}</p>
              <p>{saved.email}</p>
            </div>
          </div>
          <p>
            {saved.bio ??
              "Tell others about your interests when you are ready."}
          </p>
          <h2>Skills · {saved.skillIds.length}</h2>
          <Skills
            skills={skills.data.filter((skill) =>
              saved.skillIds.includes(skill.id),
            )}
          />
          {!saved.skillIds.length && (
            <p className="helper">No skills selected yet.</p>
          )}
          <p className="helper">Self-declared information</p>
          {memberships.isPending ? (
            <p className="helper">Loading team memberships…</p>
          ) : memberships.isError ? (
            <ErrorState
              error={memberships.error}
              retry={() => void memberships.refetch()}
            />
          ) : (
            <div>
              <h2>
                Teams ·{" "}
                {memberships.data.owned.length + memberships.data.joined.length}
              </h2>
              <Link className="text-button" href="/my-projects">
                View My Projects
              </Link>
            </div>
          )}
        </section>
        <ProfileForm
          real
          initialValues={profileValues(saved)}
          skills={skills.data}
          onSave={async (values) => {
            if (auth.busy)
              throw new Error(
                "Wait for the account action to finish before saving.",
              );
            const current = await api.me();
            if (current?.id !== id) {
              void auth.restore();
              throw new Error("Your session changed. Please sign in again.");
            }
            try {
              const result = await api.saveProfile(
                profilePatch(values, profileValues(saved)),
              );
              if (result.id !== id) {
                void auth.restore();
                throw new Error("Your session changed. Please try again.");
              }
              client.setQueryData(["api", id, "profile"], result);
              auth.updateUser(result);
              return profileValues(result);
            } catch (error) {
              if (error instanceof ApiError && error.status === 401)
                void auth.restore();
              throw error;
            }
          }}
        />
      </div>
    </div>
  );
}
