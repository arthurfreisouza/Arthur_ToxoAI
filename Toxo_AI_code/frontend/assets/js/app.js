import { api, tokenStore } from "./api.js";
import { initAuthView } from "./views/auth.js";
import { bindLogout, showAuth, showDashboard } from "./views/dashboard.js";

async function bootstrap() {
    initAuthView();
    bindLogout();

    const token = tokenStore.get();
    if (!token) {
        showAuth();
        return;
    }

    try {
        const user = await api.me();
        showDashboard(user);
    } catch (err) {
        tokenStore.clear();
        showAuth();
        if (err.status && err.status !== 401) {
            console.warn("Failed to restore session:", err);
        }
    }
}

document.addEventListener("DOMContentLoaded", bootstrap);
