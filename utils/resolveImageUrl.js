export const resolveImageUrl = (value, baseUrl) => {
  if (!value) return null;
  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\\/g, "/");

  const fallbackBase =
    baseUrl ||
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined) ||
    (typeof window !== "undefined" && window.location ? window.location.origin : undefined) ||
    "";

  try {
    const url = new URL(trimmed.replace(/\\/g, "/"), fallbackBase || undefined);
    return url.href;
  } catch (error) {
    if (!trimmed.startsWith("/")) {
      return `/${trimmed.replace(/^\.\//, "")}`;
    }
    return trimmed;
  }
};
