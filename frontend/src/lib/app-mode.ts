const mode = process.env.NEXT_PUBLIC_APP_MODE ?? "mock";
if (mode !== "mock" && mode !== "api")
  throw new Error("NEXT_PUBLIC_APP_MODE must be mock or api");
export const API_MODE = mode === "api";
