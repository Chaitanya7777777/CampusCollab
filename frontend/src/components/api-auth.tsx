"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ApiUser } from "@/lib/api-contract";
type State = {
  phase: "loading" | "ready" | "error";
  user: ApiUser | null;
  error?: Error;
};
type Auth = State & {
  busy: boolean;
  restore: () => Promise<void>;
  authenticate: (
    action: "login" | "register",
    values: unknown,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: ApiUser) => void;
};
const Context = createContext<Auth | null>(null);
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("API auth provider required");
  return value;
}
export function ApiProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );
  const [state, setState] = useState<State>({ phase: "loading", user: null });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const operation = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const clear = useCallback(() => {
    api.reset();
    void client.cancelQueries();
    client.clear();
  }, [client]);
  const restore = useCallback(async () => {
    const current = ++generation.current;
    clear();
    setState({ phase: "loading", user: null });
    try {
      const user = await api.me();
      if (current === generation.current) setState({ phase: "ready", user });
    } catch (error) {
      if (current === generation.current)
        setState({ phase: "error", user: null, error: error as Error });
    }
  }, [clear]);
  const dispose = useCallback(() => {
    generation.current++;
    clear();
  }, [clear]);
  useEffect(() => {
    const bootstrap = window.setTimeout(() => void restore(), 0);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("campuscollab-api-session");
      channel.current.onmessage = () => {
        void restore();
      };
    }
    const focus = () => {
      if (!operation.current) void restore();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("campuscollab-session-expired", focus);
    return () => {
      window.clearTimeout(bootstrap);
      dispose();
      channel.current?.close();
      window.removeEventListener("focus", focus);
      window.removeEventListener("campuscollab-session-expired", focus);
    };
  }, [restore, dispose]);
  async function change(
    action: "login" | "register" | "logout",
    values?: unknown,
  ) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    const current = ++generation.current;
    try {
      const user =
        action === "logout"
          ? (await api.logout(), null)
          : await api.authenticate(action, values);
      if (current !== generation.current)
        throw new Error("Session changed. Please try again.");
      clear();
      setState({ phase: "ready", user });
      channel.current?.postMessage("session-changed");
      // Cookie transition has completed; bootstrap for the new session context.
      await api.bootstrap().catch(() => undefined);
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <QueryClientProvider client={client}>
      <Context.Provider
        value={{
          ...state,
          busy,
          restore,
          authenticate: (action, values) => change(action, values),
          logout: () => change("logout"),
          updateUser: (user) =>
            setState((previous) =>
              previous.user?.id === user.id
                ? { phase: "ready", user }
                : previous,
            ),
        }}
      >
        {children}
      </Context.Provider>
    </QueryClientProvider>
  );
}
