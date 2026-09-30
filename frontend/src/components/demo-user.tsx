"use client";
import { useState, useSyncExternalStore } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { DEMO_USERS, selectIdentity } from "@/lib/demo-identity";
import { useActor } from "@/lib/queries";
const subscribeHydration = () => () => {};
export function DemoUser() {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const actor = useActor();
  const pending = useIsMutating();
  const [error, setError] = useState("");
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <div className="demo-control">
      <label>
        Demo user
        <select
          aria-label="Demo user"
          value={actor}
          disabled={!hydrated || pending > 0}
          onChange={(e) => {
            try {
              selectIdentity(e.target.value);
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          {DEMO_USERS.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
