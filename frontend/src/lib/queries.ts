"use client";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { mockApi } from "./mock-api";
import { getActor, subscribeIdentity } from "./demo-identity";
import { CURRENT_STUDENT_ID } from "./seed";
import { useSyncExternalStore } from "react";
import type { DiscoveryFilters, ApplicationFilters } from "./models";
import type {
  ApplicationInput,
  ProfileInput,
  ProjectInput,
} from "./validation";
export const useActor = () =>
  useSyncExternalStore(subscribeIdentity, getActor, () => CURRENT_STUDENT_ID);
export const useSession = () =>
  useQuery({
    queryKey: [useActor(), "session"],
    queryFn: () => mockApi.session(),
  });
export const useDiscovery = (filters: DiscoveryFilters) =>
  useQuery({
    queryKey: [useActor(), "projects", filters],
    queryFn: () => mockApi.discover(filters),
    placeholderData: keepPreviousData,
  });
export const useProject = (id: string) =>
  useQuery({
    queryKey: [useActor(), "project", id],
    queryFn: () => mockApi.project(id),
  });
export const useDrafts = () =>
  useQuery({
    queryKey: [useActor(), "drafts"],
    queryFn: () => mockApi.drafts(),
  });
export const useDraft = (id?: string) =>
  useQuery({
    queryKey: [useActor(), "draft", id],
    queryFn: () => mockApi.draft(id!),
    enabled: !!id,
  });
export function useSaveProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      values,
      action,
      id,
    }: {
      values: ProjectInput;
      action: "draft" | "publish";
      id?: string;
    }) => mockApi.saveProject(values, action, id),
    onSuccess: (result) =>
      client.invalidateQueries({
        predicate: (query) =>
          result.status !== "published" || query.queryKey[1] !== "draft",
      }),
  });
}
export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileInput) => mockApi.saveProfile(data),
    onSuccess: () => client.invalidateQueries(),
  });
}
export function useApply(projectId: string, roleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: ApplicationInput) =>
      mockApi.apply(projectId, roleId, data),
    onSuccess: () => client.invalidateQueries(),
  });
}
export const useMyProjects = () =>
  useQuery({
    queryKey: [useActor(), "my-projects"],
    queryFn: () => mockApi.myProjects(),
  });
export const useMyApplications = (filters: ApplicationFilters) =>
  useQuery({
    queryKey: [useActor(), "my-applications", filters],
    queryFn: () => mockApi.myApplications(filters),
    placeholderData: keepPreviousData,
  });
export const useMyApplication = (id: string) =>
  useQuery({
    queryKey: [useActor(), "my-application", id],
    queryFn: () => mockApi.myApplication(id),
  });
export function useWithdrawApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockApi.withdrawApplication(id),
    onSettled: () => client.invalidateQueries(),
  });
}
export const useOwnerDashboard = (id: string) =>
  useQuery({
    queryKey: [useActor(), "owner-dashboard", id],
    queryFn: () => mockApi.ownerDashboard(id),
  });
export function useReviewApplication(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "accept" | "reject";
    }) => mockApi.reviewApplication(projectId, id, decision),
    onSettled: () => client.invalidateQueries(),
  });
}
export function useRecruitment(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (state: "open" | "closed") =>
      mockApi.setRecruitment(projectId, state),
    onSettled: () => client.invalidateQueries(),
  });
}
export function useArchiveProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => mockApi.archiveProject(projectId),
    onSettled: () => client.invalidateQueries(),
  });
}
