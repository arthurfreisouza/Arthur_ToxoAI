import { api, tokenStore } from "../api.js";
import { clearMessages, setLoading, setMessage } from "../ui.js";
import { showDashboard } from "./dashboard.js";

export function initAuthView() {
    document.getElementById("tab-login").addEventListener("click", () => activateTab("login"));
    document.getElementById("tab-register").addEventListener("click", () => activateTab("register"));
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("register-form").addEventListener("submit", handleRegister);
}

function activateTab(name) {
    const isLogin = name === "login";
    document.getElementById("tab-login").classList.toggle("active", isLogin);
    document.getElementById("tab-login").setAttribute("aria-selected", String(isLogin));
    document.getElementById("tab-register").classList.toggle("active", !isLogin);
    document.getElementById("tab-register").setAttribute("aria-selected", String(!isLogin));
    document.getElementById("login-form").classList.toggle("active", isLogin);
    document.getElementById("register-form").classList.toggle("active", !isLogin);
    clearMessages();
}

async function handleLogin(event) {
    event.preventDefault();
    clearMessages();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setLoading(button, true, { loadingText: "Signing in…", defaultText: "Sign in" });

    try {
        const { access_token } = await api.login({ email, password });
        tokenStore.set(access_token);
        const user = await api.me();
        showDashboard(user);
    } catch (err) {
        if (err.status === 403 && /verify/i.test(err.message)) {
            setMessage("login-error", err.message);
            offerResendVerification(email);
        } else {
            setMessage("login-error", err.message || "Sign in failed");
        }
    } finally {
        setLoading(button, false, { loadingText: "Signing in…", defaultText: "Sign in" });
    }
}

async function handleRegister(event) {
    event.preventDefault();
    clearMessages();

    const email = document.getElementById("register-email").value.trim();
    const username = document.getElementById("register-username").value.trim();
    const password = document.getElementById("register-password").value;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setLoading(button, true, { loadingText: "Creating account…", defaultText: "Create account" });

    try {
        await api.register({ email, username, password });
        setMessage(
            "register-success",
            "Account created. Check your inbox for the verification email.",
            "success",
        );
        event.currentTarget.reset();
    } catch (err) {
        setMessage("register-error", err.message || "Registration failed");
    } finally {
        setLoading(button, false, { loadingText: "Creating account…", defaultText: "Create account" });
    }
}

async function offerResendVerification(email) {
    if (!email) return;
    try {
        await api.resendVerification(email);
        setMessage("login-info", "We re-sent the verification email. Check your inbox.", "info");
    } catch {
        // Silent; the backend already returns 202 unconditionally.
    }
}
