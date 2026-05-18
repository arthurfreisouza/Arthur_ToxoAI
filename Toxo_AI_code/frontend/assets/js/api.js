import { API_BASE, TOKEN_STORAGE_KEY } from "./config.js";

export const tokenStore = {
    get: () => localStorage.getItem(TOKEN_STORAGE_KEY),
    set: (value) => localStorage.setItem(TOKEN_STORAGE_KEY, value),
    clear: () => localStorage.removeItem(TOKEN_STORAGE_KEY),
};

export class ApiError extends Error {
    constructor(message, { status, data } = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

async function request(path, { method = "GET", body, auth = false } = {}) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (auth) {
        const token = tokenStore.get();
        if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch (networkError) {
        throw new ApiError("Network error. Please check your connection.", {
            status: 0,
            data: { cause: networkError.message },
        });
    }

    const text = await response.text();
    const data = text ? safeJson(text) : null;

    if (!response.ok) {
        const detail = (data && (data.detail || data.message)) || `Request failed (${response.status})`;
        throw new ApiError(typeof detail === "string" ? detail : "Request failed", {
            status: response.status,
            data,
        });
    }
    return data;
}

function safeJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

export const api = {
    register: (payload) => request("/auth/register", { method: "POST", body: payload }),
    login: (payload) => request("/auth/login", { method: "POST", body: payload }),
    verify: (token) => request("/auth/verify", { method: "POST", body: { token } }),
    resendVerification: (email) =>
        request("/auth/resend-verification", { method: "POST", body: { email } }),
    me: () => request("/users/me", { auth: true }),
};
