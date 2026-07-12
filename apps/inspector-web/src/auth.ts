const TOKEN_KEY = "goodmemory.inspector.token";

export function initializeInspectorToken(): string | null {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get("token")?.trim();
  const query = new URLSearchParams(window.location.search);
  const hadQueryToken = query.has("token");
  query.delete("token");
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  }
  if (window.location.hash || hadQueryToken) {
    const search = query.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }
  return token || window.sessionStorage.getItem(TOKEN_KEY);
}

export function clearInspectorToken(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
}
