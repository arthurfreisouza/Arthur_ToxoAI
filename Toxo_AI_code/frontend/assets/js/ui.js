export function setMessage(elementId, message, variant = "error") {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.dataset.variant = variant;
    el.classList.add("show");
}

export function clearMessages(root = document) {
    root.querySelectorAll(".error-message, .success-message, .info-message").forEach((el) => {
        el.classList.remove("show");
        el.textContent = "";
        delete el.dataset.variant;
    });
}

export function setLoading(button, isLoading, { loadingText, defaultText }) {
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}
