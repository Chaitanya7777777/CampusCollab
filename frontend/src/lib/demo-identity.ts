import { CURRENT_STUDENT_ID } from "./seed";
export const DEMO_USERS = [
  { id: CURRENT_STUDENT_ID, name: "Maya Rao" },
  { id: "aarav", name: "Aarav Sharma" },
  { id: "sneha", name: "Sneha Patel" },
];
export const DEMO_KEY = "campuscollab.demo-user";
let actor = CURRENT_STUDENT_ID;
const listeners = new Set<() => void>();
export const getActor = () => actor;
export const subscribeIdentity = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function loadIdentity() {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const saved = sessionStorage.getItem(DEMO_KEY);
    if (DEMO_USERS.some((u) => u.id === saved)) {
      actor = saved!;
      listeners.forEach((fn) => fn());
    }
  } catch {
    /* Keep the default identity if session storage is blocked. */
  }
}
export function selectIdentity(id: string) {
  if (
    process.env.NODE_ENV !== "development" ||
    !DEMO_USERS.some((u) => u.id === id)
  )
    throw new Error("Demo identity is unavailable.");
  try {
    sessionStorage.setItem(DEMO_KEY, id);
  } catch {
    throw new Error("Allow tab storage to switch demo users.");
  }
  actor = id;
  listeners.forEach((fn) => fn());
}
