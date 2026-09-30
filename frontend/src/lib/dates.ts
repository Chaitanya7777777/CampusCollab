export function displayDate(value?: string) {
  if (!value) return "Not recorded";
  return new Date(
    value.includes("T") ? value : `${value}T12:00:00Z`,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
