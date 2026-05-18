import { api } from "./api.js";

const states = {
    loading: {
        cls: "state-loading",
        title: "Verifying your email…",
        message: "Hold on a moment.",
        cta: false,
    },
    success: {
        cls: "state-success",
        title: "Email verified",
        message: "Your account is active. You can sign in now.",
        cta: true,
    },
    error: {
        cls: "state-error",
        title: "Verification failed",
        message: "The link is invalid or has expired. Please request a new one from the sign-in page.",
        cta: true,
    },
};

function render(state) {
    const wrapper = document.getElementById("verify-state");
    wrapper.className = `verify-state ${state.cls}`;
    document.getElementById("verify-title").textContent = state.title;
    document.getElementById("verify-message").textContent = state.message;
    const cta = document.getElementById("verify-cta");
    cta.hidden = !state.cta;
}

async function run() {
    render(states.loading);

    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
        render({ ...states.error, message: "No verification token in the link." });
        return;
    }

    try {
        await api.verify(token);
        render(states.success);
    } catch (err) {
        render({ ...states.error, message: err.message || states.error.message });
    }
}

document.addEventListener("DOMContentLoaded", run);
