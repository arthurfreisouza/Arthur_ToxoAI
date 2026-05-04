// API Configuration
const API_URL = 'http://localhost:8000';

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        loadUserDashboard();
    }

    // Setup form handlers
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
});

// Toggle between login and register forms
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

// Clear all error/success messages
function clearMessages() {
    document.querySelectorAll('.error-message, .success-message').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
    });
}

// Show error message
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

// Show success message
function showSuccess(elementId, message) {
    const successElement = document.getElementById(elementId);
    successElement.textContent = message;
    successElement.classList.add('show');
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    clearMessages();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Save token to localStorage
            localStorage.setItem('token', data.access_token);
            
            // Load dashboard
            await loadUserDashboard();
            
            // Clear form
            loginForm.reset();
        } else {
            showError('login-error', data.detail || 'Login failed. Please try again.');
        }
    } catch (error) {
        showError('login-error', 'Network error. Please check if the server is running.');
        console.error('Login error:', error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

// Handle Register
async function handleRegister(e) {
    e.preventDefault();
    clearMessages();

    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const submitBtn = registerForm.querySelector('button[type="submit"]');

    // Disable button during request
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess('register-success', 'Account created successfully! Please login.');
            registerForm.reset();
            
            // Switch to login form after 1.5 seconds
            setTimeout(() => {
                showLogin();
            }, 1500);
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

// Load User Dashboard
async function loadUserDashboard() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        showAuthSection();
        return;
    }

    try {
        const response = await fetch(`${API_URL}/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const user = await response.json();
            displayUserDashboard(user);
        } else {
            // Token is invalid or expired
            localStorage.removeItem('token');
            showAuthSection();
            showError('login-error', 'Session expired. Please login again.');
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showError('dashboard-error', 'Failed to load user data.');
    }
}

// Display User Dashboard
function displayUserDashboard(user) {
    document.getElementById('user-username').textContent = user.username;
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('user-id').textContent = user.id;
    
    const statusElement = document.getElementById('user-status');
    statusElement.textContent = user.is_active ? 'Active' : 'Inactive';
    statusElement.className = user.is_active ? 'status-active' : 'status-inactive';

    // Hide auth section, show dashboard
    authSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

// Show Auth Section
function showAuthSection() {
    authSection.style.display = 'block';
    dashboardSection.style.display = 'none';
}

// Logout
function logout() {
    localStorage.removeItem('token');
    showAuthSection();
    showLogin();
    clearMessages();
    
    // Clear forms
    loginForm.reset();
    registerForm.reset();
}
