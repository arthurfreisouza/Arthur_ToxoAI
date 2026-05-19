// In production nginx serves this file and proxies API calls to uvicorn on the same origin.
// In local dev the backend runs on a different port, so we point directly to it.
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        loadUserDashboard();
    }
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
});

function showLogin() {
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.remove('active');
    clearMessages();
}

function showRegister() {
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    document.querySelectorAll('.tab-btn')[0].classList.remove('active');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    clearMessages();
}

function clearMessages() {
    document.querySelectorAll('.error-message, .success-message').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
    });
    const rs = document.getElementById('resend-section');
    if (rs) rs.style.display = 'none';
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.add('show');
}

function showSuccess(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = message;
    el.classList.add('show');
}

async function handleLogin(e) {
    e.preventDefault();
    clearMessages();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.access_token);
            await loadUserDashboard();
            loginForm.reset();
        } else {
            showError('login-error', data.detail || 'Login failed. Please try again.');
            // Offer resend option when email is not yet verified
            if (response.status === 403 && data.detail && data.detail.includes('not verified')) {
                document.getElementById('resend-section').style.display = 'block';
            }
        }
    } catch (error) {
        showError('login-error', 'Network error. Please check if the server is running.');
        console.error('Login error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

async function handleResend() {
    const email = document.getElementById('resend-email').value.trim();
    if (!email) { return; }

    try {
        await fetch(`${API_URL}/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        showSuccess('resend-message', 'If that email is registered and unverified, a new link has been sent.');
    } catch {
        showSuccess('resend-message', 'Request sent. Check your inbox.');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    clearMessages();

    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess('register-success', 'Account created! Check your inbox for the verification email.');
            registerForm.reset();
            setTimeout(() => { showLogin(); }, 2000);
        } else {
            showError('register-error', data.detail || 'Registration failed. Please try again.');
        }
    } catch (error) {
        showError('register-error', 'Network error. Please check if the server is running.');
        console.error('Register error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
    }
}

async function loadUserDashboard() {
    const token = localStorage.getItem('token');
    if (!token) { showAuthSection(); return; }

    try {
        const response = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
            const user = await response.json();
            displayUserDashboard(user);
        } else {
            localStorage.removeItem('token');
            showAuthSection();
            showError('login-error', 'Session expired. Please login again.');
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showError('dashboard-error', 'Failed to load user data.');
    }
}

function displayUserDashboard(user) {
    document.getElementById('user-username').textContent = user.username;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-id').textContent = user.id;

    const statusEl = document.getElementById('user-status');
    statusEl.textContent = user.is_active ? 'Active' : 'Inactive';
    statusEl.className = user.is_active ? 'status-active' : 'status-inactive';

    authSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

function showAuthSection() {
    authSection.style.display = 'block';
    dashboardSection.style.display = 'none';
}

function logout() {
    localStorage.removeItem('token');
    showAuthSection();
    showLogin();
    clearMessages();
    loginForm.reset();
    registerForm.reset();
}
