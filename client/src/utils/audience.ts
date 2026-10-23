const AUDIENCE_ID_KEY = "sts_audience_id";

function createAudienceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getAudienceVoterId(): string {
  try {
    const existing = localStorage.getItem(AUDIENCE_ID_KEY);
    if (existing) return existing;
    const created = createAudienceId();
    localStorage.setItem(AUDIENCE_ID_KEY, created);
    return created;
  } catch {
    return createAudienceId();
  }
}
