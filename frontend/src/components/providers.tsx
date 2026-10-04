"use client";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getActor, loadIdentity, subscribeIdentity } from "@/lib/demo-identity";
import { CURRENT_STUDENT_ID } from "@/lib/seed";
import { STORAGE_KEY } from "@/lib/mock-api";
import { API_MODE } from "@/lib/app-mode";
import { ApiProviders } from "./api-auth";
function StorageSync() {
  const client = useQueryClient();
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null)
        void client.invalidateQueries();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client]);
  return null;
}
function IdentityQueries({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 0, staleTime: 0, refetchOnWindowFocus: true },
        },
      }),
  );
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
    },
    [client],
  );
  return (
    <QueryClientProvider client={client}>
      <StorageSync />
      {children}
    </QueryClientProvider>
  );
}
export function Providers({ children }: { children: ReactNode }) {
  return API_MODE ? (
    <ApiProviders>{children}</ApiProviders>
  ) : (
    <MockProviders>{children}</MockProviders>
  );
}
function MockProviders({ children }: { children: ReactNode }) {
  const actor = useSyncExternalStore(
    subscribeIdentity,
    getActor,
    () => CURRENT_STUDENT_ID,
  );
  useEffect(() => {
    loadIdentity();
  }, []);
  return <IdentityQueries key={actor}>{children}</IdentityQueries>;
}
