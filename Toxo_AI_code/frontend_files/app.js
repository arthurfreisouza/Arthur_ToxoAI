'use strict';

const API_URL = 'https://mychatbotproject.uk';

// ── State ─────────────────────────────────────────────────────────────────────
let conversationHistory = [];
let isWaitingForResponse = false;

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setMsg(elementId, text, type) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = text;
    el.className = `form-msg ${type}`;
}

function clearMsg(elementId) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = '';
    el.className = 'form-msg';
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); }

function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    $('login-form').addEventListener('submit', handleLogin);
    $('register-form').addEventListener('submit', handleRegister);

    if (getToken()) {
        loadApp();
    }
});

// ── Tab switching ─────────────────────────────────────────────────────────────
function showLogin() {
    $('login-form').classList.add('active');
    $('register-form').classList.remove('active');
    $('tab-login').classList.add('active');
    $('tab-register').classList.remove('active');
    clearMsg('login-msg');
    clearMsg('register-msg');
}

function showRegister() {
    $('register-form').classList.add('active');
    $('login-form').classList.remove('active');
    $('tab-register').classList.add('active');
    $('tab-login').classList.remove('active');
    clearMsg('login-msg');
    clearMsg('register-msg');
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    clearMsg('login-msg');
    const btn = $('login-btn');
    const username = $('login-username').value.trim();
    const password = $('login-password').value;

    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok) {
            setToken(data.access_token);
            $('login-form').reset();
            await loadApp();
        } else {
            setMsg('login-msg', data.detail || 'Login failed. Please try again.', 'error');
        }
    } catch {
        setMsg('login-msg', 'Cannot reach the server. Please try again later.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

// ── Register ──────────────────────────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    clearMsg('register-msg');
    const btn = $('register-btn');
    const username = $('reg-username').value.trim();
    const email = $('reg-email').value.trim();
    const password = $('reg-password').value;

    btn.disabled = true;
    btn.textContent = 'Creating account…';
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (res.ok) {
            setMsg('register-msg', 'Account created! You can now sign in.', 'success');
            $('register-form').reset();
            setTimeout(showLogin, 1800);
        } else {
            const detail = Array.isArray(data.detail)
                ? data.detail.map(d => d.msg).join(', ')
                : (data.detail || 'Registration failed.');
            setMsg('register-msg', detail, 'error');
        }
    } catch {
        setMsg('register-msg', 'Cannot reach the server. Please try again later.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

// ── Load app after login ──────────────────────────────────────────────────────
async function loadApp() {
    try {
        const res = await fetch(`${API_URL}/me`, { headers: authHeaders() });
        if (!res.ok) {
            clearToken();
            showAuthPage();
            return;
        }
        const user = await res.json();
        $('header-username').textContent = user.username;
        showAppPage();
        conversationHistory = [];
        await loadDocuments();
    } catch {
        clearToken();
        showAuthPage();
    }
}

function showAuthPage() {
    $('auth-page').style.display = '';
    $('app-page').style.display = 'none';
}

function showAppPage() {
    $('auth-page').style.display = 'none';
    $('app-page').style.display = 'flex';
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
    clearToken();
    conversationHistory = [];
    $('chat-messages').innerHTML = '';
    appendWelcome();
    showAuthPage();
    showLogin();
}

// ── Documents ─────────────────────────────────────────────────────────────────
async function loadDocuments() {
    try {
        const res = await fetch(`${API_URL}/documents`, { headers: authHeaders() });
        if (!res.ok) return;
        const docs = await res.json();
        renderDocList(docs);
    } catch {
        // silently ignore — documents are a bonus feature
    }
}

function renderDocList(docs) {
    const list = $('doc-list');
    if (!docs.length) {
        list.innerHTML = '<p class="doc-empty">No documents yet.</p>';
        return;
    }
    list.innerHTML = docs.map(d => `
        <div class="doc-item" id="doc-${d.id}">
            <span class="doc-icon">${d.content_type === 'application/pdf' ? '📄' : '📝'}</span>
            <span class="doc-name" title="${escapeHtml(d.filename)}">${escapeHtml(d.filename)}</span>
            <button class="btn-doc-delete" onclick="deleteDocument(${d.id}, '${escapeHtml(d.filename)}')" title="Remove">✕</button>
        </div>
    `).join('');
}

async function uploadDocument(input) {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const statusEl = $('upload-msg');
    statusEl.textContent = `Uploading ${file.name}…`;
    statusEl.className = 'upload-msg loading';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
        });
        const data = await res.json();
        if (res.ok) {
            statusEl.textContent = '✓ Uploaded successfully';
            statusEl.className = 'upload-msg ok';
            await loadDocuments();
        } else {
            statusEl.textContent = data.detail || 'Upload failed.';
            statusEl.className = 'upload-msg err';
        }
    } catch {
        statusEl.textContent = 'Upload failed — network error.';
        statusEl.className = 'upload-msg err';
    }

    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'upload-msg'; }, 4000);
}

async function deleteDocument(id, filename) {
    if (!confirm(`Remove "${filename}"?`)) return;
    const el = $(`doc-${id}`);
    if (el) el.style.opacity = '0.4';

    try {
        const res = await fetch(`${API_URL}/documents/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (res.ok) {
            await loadDocuments();
        } else {
            if (el) el.style.opacity = '';
        }
    } catch {
        if (el) el.style.opacity = '';
    }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function appendWelcome() {
    const container = $('chat-messages');
    if (!$('chat-welcome')) {
        container.insertAdjacentHTML('beforeend', `
            <div class="chat-welcome" id="chat-welcome">
                <div class="welcome-icon">🧬</div>
                <h2>Welcome to ToxoAI</h2>
                <p>Ask me anything about HIV testing, prevention, and sexual health.</p>
                <div class="welcome-chips">
                    <button class="chip" onclick="sendChip(this)">What HIV tests are available?</button>
                    <button class="chip" onclick="sendChip(this)">How soon after exposure should I test?</button>
                    <button class="chip" onclick="sendChip(this)">What does a positive result mean?</button>
                    <button class="chip" onclick="sendChip(this)">How accurate are home HIV tests?</button>
                </div>
            </div>
        `);
    }
}

function sendChip(btn) {
    $('chat-input').value = btn.textContent;
    sendMessage();
}

function dismissWelcome() {
    const welcome = $('chat-welcome');
    if (welcome) welcome.remove();
}

function addMessage(role, content) {
    dismissWelcome();
    const container = $('chat-messages');
    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    const avatarEmoji = role === 'user' ? '🧑' : '🧬';
    const bubbleContent = role === 'ai' ? renderMarkdown(content) : escapeHtml(content);

    row.innerHTML = `
        <div class="msg-avatar">${avatarEmoji}</div>
        <div class="msg-bubble">${bubbleContent}</div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return row;
}

function showTyping() {
    dismissWelcome();
    const container = $('chat-messages');
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    row.id = 'typing-indicator';
    row.innerHTML = `
        <div class="msg-avatar">🧬</div>
        <div class="typing-indicator">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        </div>
    `;
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
}

function removeTyping() {
    const el = $('typing-indicator');
    if (el) el.remove();
}

async function sendMessage() {
    if (isWaitingForResponse) return;
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    autoResize(input);
    addMessage('user', text);

    isWaitingForResponse = true;
    $('send-btn').disabled = true;
    showTyping();

    try {
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                message: text,
                history: conversationHistory.slice(-20),
                temperature: 0.7,
                top_p: 0.95,
                max_tokens: 600,
            }),
        });

        removeTyping();

        if (res.status === 401) {
            clearToken();
            showAuthPage();
            return;
        }

        const data = await res.json();
        if (res.ok) {
            const reply = data.response;
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: reply });
            addMessage('ai', reply);
        } else {
            addMessage('ai', `⚠️ ${data.detail || 'Something went wrong. Please try again.'}`);
        }
    } catch {
        removeTyping();
        addMessage('ai', '⚠️ Network error — please check your connection and try again.');
    } finally {
        isWaitingForResponse = false;
        $('send-btn').disabled = false;
        input.focus();
    }
}

// ── UI utilities ──────────────────────────────────────────────────────────────
function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Minimal markdown renderer: bold, inline code, bullet lists, line breaks
function renderMarkdown(text) {
    const lines = text.split('\n');
    const out = [];
    let inList = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`);
        } else {
            if (inList) { out.push('</ul>'); inList = false; }
            if (trimmed === '') {
                out.push('<br>');
            } else {
                out.push(`<p>${inlineMarkdown(trimmed)}</p>`);
            }
        }
    }
    if (inList) out.push('</ul>');
    return out.join('');
}

function inlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
}
