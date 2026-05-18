import { tokenStore } from "../api.js";
import { clearMessages } from "../ui.js";

export function showDashboard(user) {
    document.getElementById("user-username").textContent = user.username;
    document.getElementById("user-email").textContent = user.email;
    document.getElementById("user-id").textContent = String(user.id);

    const statusEl = document.getElementById("user-status");
    statusEl.textContent = user.is_active ? "Active" : "Inactive";
    statusEl.classList.toggle("status-active", user.is_active);
    statusEl.classList.toggle("status-inactive", !user.is_active);

    document.getElementById("auth-section").hidden = true;
    document.getElementById("dashboard-section").hidden = false;
}

export function showAuth() {
    document.getElementById("auth-section").hidden = false;
    document.getElementById("dashboard-section").hidden = true;
    clearMessages();
}

export function bindLogout() {
    document.getElementById("logout-btn").addEventListener("click", () => {
        tokenStore.clear();
        showAuth();
    });
}
