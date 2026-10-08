"use client";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api-client";
import { API_MODE } from "./app-mode";
import { useAuth } from "@/components/api-auth";
import { mockApi } from "./mock-api";
import { getActor, subscribeIdentity } from "./demo-identity";
import { CURRENT_STUDENT_ID } from "./seed";
import { useSyncExternalStore } from "react";
import type {
  DiscoveryFilters,
  ApplicationFilters,
  Application,
  ApplicantApplication,
} from "./models";
import type {
  ApplicationInput,
  ProfileInput,
  ProjectInput,
} from "./validation";
const useMockActor = () =>
  useSyncExternalStore(subscribeIdentity, getActor, () => CURRENT_STUDENT_ID);
export const useActor = API_MODE
  ? function useApiActor() {
      return useAuth().user?.id ?? "signed-out";
    }
  : useMockActor;
export const useSession = () =>
  useQuery({
    queryKey: [useActor(), "session"],
    queryFn: ({ signal }) =>
      API_MODE ? api.projectSession(signal) : mockApi.session(),
  });
export const useDiscovery = (filters: DiscoveryFilters, page = 1) =>
  useQuery({
    queryKey: [useActor(), "projects", filters, page],
    queryFn: ({ signal }) =>
      API_MODE
        ? api.discover(filters, page, signal)
        : mockApi.discover(filters),
    placeholderData: keepPreviousData,
  });
export const useProject = (id: string) =>
  useQuery({
    queryKey: [useActor(), "project", id],
    queryFn: ({ signal }) =>
      API_MODE ? api.project(id, signal) : mockApi.project(id),
  });
export const useDrafts = () =>
  useQuery({
    queryKey: [useActor(), "drafts"],
    queryFn: ({ signal }) => (API_MODE ? api.drafts(signal) : mockApi.drafts()),
  });
export const useDraft = (id?: string) =>
  useQuery({
    queryKey: [useActor(), "draft", id],
    queryFn: ({ signal }) =>
      API_MODE ? api.draft(id!, signal) : mockApi.draft(id!),
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
    }) =>
      API_MODE
        ? api.saveProject(values, action, id)
        : mockApi.saveProject(values, action, id),
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
      API_MODE
        ? api.apply(projectId, roleId, data)
        : mockApi.apply(projectId, roleId, data),
    onSettled: () => client.invalidateQueries(),
  });
}
export const useMyProjects = () =>
  useQuery({
    queryKey: [useActor(), "my-projects"],
    queryFn: ({ signal }) =>
      API_MODE ? api.myProjects(signal) : mockApi.myProjects(),
  });
interface ApplicationPage {
  applications: ApplicantApplication[];
  counts: Record<"all" | Application["status"], number>;
  total: number;
  page: number;
  pageSize: number;
}
export const useMyApplications = (filters: ApplicationFilters, page = 1) =>
  useQuery<ApplicationPage>({
    queryKey: [useActor(), "my-applications", filters, page],
    queryFn: async ({ signal }) =>
      API_MODE
        ? api.myApplications(filters, page, signal)
        : (() =>
            mockApi.myApplications(filters).then((result) => ({
              ...result,
              total: result.applications.length,
              page: 1,
              pageSize: result.applications.length,
            })))(),
    placeholderData: keepPreviousData,
  });
export const useMyApplication = (id: string) =>
  useQuery({
    queryKey: [useActor(), "my-application", id],
    queryFn: ({ signal }) =>
      API_MODE ? api.myApplication(id, signal) : mockApi.myApplication(id),
  });
export function useWithdrawApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      API_MODE ? api.withdrawApplication(id) : mockApi.withdrawApplication(id),
    onSettled: () => client.invalidateQueries(),
  });
}
export const useOwnerDashboard = (id: string) =>
  useQuery({
    queryKey: [useActor(), "owner-dashboard", id],
    queryFn: ({ signal }) =>
      API_MODE ? api.ownerDashboard(id, signal) : mockApi.ownerDashboard(id),
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
    }) =>
      API_MODE
        ? api.reviewApplication(projectId, id, decision)
        : mockApi.reviewApplication(projectId, id, decision),
    onSettled: () => client.invalidateQueries(),
  });
}
export function useRecruitment(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (state: "open" | "closed") =>
      API_MODE
        ? api.setRecruitment(projectId, state)
        : mockApi.setRecruitment(projectId, state),
    onSettled: () => client.invalidateQueries(),
  });
}
export function useArchiveProject(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (API_MODE) {
        await api.archiveProject(projectId);
        return { status: "archived" as const };
      }
      return mockApi.archiveProject(projectId);
    },
    onSettled: () => client.invalidateQueries(),
  });
}

export const useOwnerInbox = (
  id: string,
  filters: { status: string; search: string; roleId: string; sort: string },
  page: number,
) =>
  useQuery({
    queryKey: [useActor(), "owner-inbox", id, filters, page],
    queryFn: ({ signal }) => api.ownerInbox(id, filters, page, signal),
    enabled: API_MODE,
  });
export const useOwnerApplication = (projectId: string, id: string | null) =>
  useQuery({
    queryKey: [useActor(), "owner-application", projectId, id],
    queryFn: ({ signal }) => api.ownerApplication(projectId, id!, signal),
    enabled: API_MODE && !!id,
  });
