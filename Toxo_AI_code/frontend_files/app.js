'use strict';

const API_URL = 'https://mychatbotproject.uk';
const HISTORY_KEY = 'toxoai_history';

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

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fadeout');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem('token'); }
function setToken(t)   { localStorage.setItem('token', t); }
function clearToken()  { localStorage.removeItem('token'); }

function authHeaders() {
    return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    $('login-form').addEventListener('submit', handleLogin);
    $('register-form').addEventListener('submit', handleRegister);

    appendWelcome();

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

    if (!username || !password) {
        setMsg('login-msg', 'Please fill in all fields.', 'error');
        return;
    }

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
    const email    = $('reg-email').value.trim();
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
        restoreHistory();
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
    clearHistory();
    resetChatUI();
    showAuthPage();
    showLogin();
}

// ── New Chat ──────────────────────────────────────────────────────────────────
function newChat() {
    if (conversationHistory.length === 0) return;
    conversationHistory = [];
    clearHistory();
    resetChatUI();
    showToast('New conversation started', 'info', 2000);
}

function resetChatUI() {
    $('chat-messages').innerHTML = '';
    appendWelcome();
}

// ── Sidebar (mobile) ──────────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = $('sidebar');
    const overlay = $('sidebar-overlay');
    const isOpen  = sidebar.classList.contains('open');
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
    }
}

function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('visible');
}

// ── Conversation persistence ──────────────────────────────────────────────────
function saveHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
    } catch {}
}

function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
}

function restoreHistory() {
    try {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (!saved) { appendWelcome(); return; }
        const history = JSON.parse(saved);
        if (!Array.isArray(history) || history.length === 0) { appendWelcome(); return; }
        conversationHistory = history;
        // Re-render the saved messages
        $('chat-messages').innerHTML = '';
        for (const msg of history) {
            if (msg.role === 'user') {
                addMessage('user', msg.content, false);
            } else if (msg.role === 'assistant') {
                addMessage('ai', msg.content, false);
            }
        }
    } catch {
        appendWelcome();
    }
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
            showToast(`"${file.name}" indexed successfully`, 'success');
            await loadDocuments();
        } else {
            statusEl.textContent = data.detail || 'Upload failed.';
            statusEl.className = 'upload-msg err';
            showToast(data.detail || 'Upload failed.', 'error');
        }
    } catch {
        statusEl.textContent = 'Upload failed — network error.';
        statusEl.className = 'upload-msg err';
        showToast('Upload failed — network error.', 'error');
    }

    setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'upload-msg';
    }, 4000);
}

async function deleteDocument(id, filename) {
    const el = $(`doc-${id}`);

    // Inline confirmation — avoid blocking confirm() dialog
    if (el) {
        const confirmed = await confirmAction(el, `Remove "${filename}"?`);
        if (!confirmed) return;
    }

    if (el) el.style.opacity = '0.4';

    try {
        const res = await fetch(`${API_URL}/documents/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (res.ok) {
            showToast(`"${filename}" removed`, 'success', 2500);
            await loadDocuments();
        } else {
            if (el) el.style.opacity = '';
            showToast('Could not remove document.', 'error');
        }
    } catch {
        if (el) el.style.opacity = '';
        showToast('Network error — could not remove document.', 'error');
    }
}

// Lightweight inline confirmation: briefly replaces the delete button with Yes/No
function confirmAction(rowEl, _message) {
    return new Promise(resolve => {
        const btn = rowEl.querySelector('.btn-doc-delete');
        if (!btn) { resolve(window.confirm(_message)); return; }

        const original = btn.innerHTML;
        btn.innerHTML = '✓';
        btn.style.cssText = 'background:#fee2e2;color:#dc2626;width:26px;height:26px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-doc-delete';
        cancelBtn.textContent = '✕';
        cancelBtn.style.cssText = 'background:#f3f4f8;color:#6b7280;width:26px;height:26px;';

        rowEl.appendChild(cancelBtn);

        const cleanup = (result) => {
            btn.innerHTML = original;
            btn.style.cssText = '';
            cancelBtn.remove();
            resolve(result);
        };

        btn.onclick = (e) => { e.stopPropagation(); cleanup(true); };
        cancelBtn.onclick = (e) => { e.stopPropagation(); cleanup(false); };
    });
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function appendWelcome() {
    const container = $('chat-messages');
    if ($('chat-welcome')) return;
    container.insertAdjacentHTML('beforeend', `
        <div class="chat-welcome" id="chat-welcome">
            <div class="welcome-icon">🧬</div>
            <h2>Welcome to ToxoAI</h2>
            <p>Ask me anything about HIV testing, prevention, and sexual health. I'm here to help with clear, accurate, and compassionate information.</p>
            <div class="welcome-chips">
                <button class="chip" onclick="sendChip(this)">What HIV tests are available?</button>
                <button class="chip" onclick="sendChip(this)">How soon after exposure should I test?</button>
                <button class="chip" onclick="sendChip(this)">What does a positive result mean?</button>
                <button class="chip" onclick="sendChip(this)">How accurate are home HIV tests?</button>
            </div>
        </div>
    `);
}

function sendChip(btn) {
    $('chat-input').value = btn.textContent;
    sendMessage();
}

function dismissWelcome() {
    const welcome = $('chat-welcome');
    if (welcome) welcome.remove();
}

function addMessage(role, content, scroll = true) {
    dismissWelcome();
    const container = $('chat-messages');
    const row = document.createElement('div');
    row.className = `msg-row ${role}`;

    const avatarEmoji = role === 'user' ? '🧑' : '🧬';
    const bubbleContent = role === 'ai' ? renderMarkdown(content) : escapeHtml(content);

    const copyBtn = `
        <button class="btn-copy" onclick="copyMessage(this, ${JSON.stringify(content).replace(/</g, '\\u003c')})" title="Copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
        </button>`;

    row.innerHTML = `
        <div class="msg-avatar">${avatarEmoji}</div>
        <div class="msg-bubble-wrap">
            <div class="msg-bubble">${bubbleContent}</div>
            <div class="msg-actions">${copyBtn}</div>
        </div>
    `;

    container.appendChild(row);
    if (scroll) container.scrollTop = container.scrollHeight;
    return row;
}

function copyMessage(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
        </svg> Copied`;
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg> Copy`;
        }, 2000);
    }).catch(() => {
        showToast('Could not copy to clipboard.', 'error', 2000);
    });
}

function showTyping() {
    dismissWelcome();
    const container = $('chat-messages');
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    row.id = 'typing-indicator';
    row.innerHTML = `
        <div class="msg-avatar">🧬</div>
        <div class="msg-bubble-wrap">
            <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
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
    const text  = input.value.trim();
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
                max_tokens: 800,
            }),
        });

        removeTyping();

        if (res.status === 401) {
            showToast('Session expired — please sign in again.', 'error');
            clearToken();
            showAuthPage();
            return;
        }

        if (res.status === 429) {
            addMessage('ai', '⚠️ You are sending messages too quickly. Please wait a moment.');
            return;
        }

        const data = await res.json();
        if (res.ok) {
            const reply = data.response;
            conversationHistory.push({ role: 'user', content: text });
            conversationHistory.push({ role: 'assistant', content: reply });
            saveHistory();
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

function handleInput(el) {
    autoResize(el);
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

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Handles: headings, bullet lists, numbered lists, bold, italic,
//          inline code, fenced code blocks, blockquotes, horizontal rules.
function renderMarkdown(text) {
    const lines  = text.split('\n');
    const out    = [];
    let inUl     = false;
    let inOl     = false;
    let inCode   = false;
    let codeLang = '';
    let codeBuf  = [];

    const closeList = () => {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
    };

    for (let i = 0; i < lines.length; i++) {
        const raw     = lines[i];
        const trimmed = raw.trim();

        // Fenced code block
        if (trimmed.startsWith('```')) {
            if (!inCode) {
                closeList();
                inCode  = true;
                codeLang = trimmed.slice(3).trim();
                codeBuf  = [];
            } else {
                const escaped = codeBuf.map(l => escapeHtml(l)).join('\n');
                out.push(`<pre><code>${escaped}</code></pre>`);
                inCode  = false;
                codeLang = '';
                codeBuf  = [];
            }
            continue;
        }
        if (inCode) { codeBuf.push(raw); continue; }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            closeList();
            out.push('<hr>');
            continue;
        }

        // Headings
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
            closeList();
            const level = headingMatch[1].length;
            out.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
            continue;
        }

        // Blockquote
        if (trimmed.startsWith('> ')) {
            closeList();
            out.push(`<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`);
            continue;
        }

        // Numbered list
        const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (olMatch) {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (!inOl) { out.push('<ol>'); inOl = true; }
            out.push(`<li>${inlineMarkdown(olMatch[2])}</li>`);
            continue;
        }

        // Bullet list
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (inOl) { out.push('</ol>'); inOl = false; }
            if (!inUl) { out.push('<ul>'); inUl = true; }
            out.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`);
            continue;
        }

        // Empty line
        if (trimmed === '') {
            closeList();
            out.push('<br>');
            continue;
        }

        // Paragraph
        closeList();
        out.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    }

    // Close any unclosed lists or code blocks
    closeList();
    if (inCode && codeBuf.length) {
        out.push(`<pre><code>${codeBuf.map(escapeHtml).join('\n')}</code></pre>`);
    }

    return out.join('');
}

function inlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,     '<em>$1</em>')
        .replace(/_(.+?)_/g,       '<em>$1</em>')
        .replace(/`(.+?)`/g,       '<code>$1</code>');
}
