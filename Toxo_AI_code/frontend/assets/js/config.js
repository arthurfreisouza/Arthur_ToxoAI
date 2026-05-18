// API base. Defaults to same-origin /api/v1 (nginx proxies to uvicorn).
// Override at runtime by setting window.__IA_TOXO_API_BASE__ before this module loads.
export const API_BASE = window.__IA_TOXO_API_BASE__ || "/api/v1";
export const TOKEN_STORAGE_KEY = "ia_toxo_access_token";
