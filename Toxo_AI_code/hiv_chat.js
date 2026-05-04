// HIV Chat JavaScript
const API_URL = 'http://localhost:8000';
let chatMessages = [];

// Get token from URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

// DOM Elements
const chatMessagesDiv = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const chatForm = document.getElementById('chatForm');
const sendBtn = document.getElementById('sendBtn');
const loadingIndicator = document.getElementById('loadingIndicator');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        alert('No authentication token found. Please login first.');
        window.close();
        return;
    }
    
    // Add welcome message
    displayBotMessage('Hello! I\'m your HIV Testing Assistant. I\'m here to help you with information about HIV testing, symptoms, prevention, and general health questions. Feel free to ask me anything!');
    
    // Load documents
    loadDocuments();
});

// Send Message
async function sendMessage(event) {
    event.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Get custom parameters from settings
    const systemPrompt = document.getElementById('systemPrompt').value || null;
    const temperature = parseFloat(document.getElementById('temperature').value);
    const topP = parseFloat(document.getElementById('topP').value);
    const maxTokens = parseInt(document.getElementById('maxTokens').value);
    
    // Display user message
    displayUserMessage(message);
    messageInput.value = '';
    
    // Disable send button
    sendBtn.disabled = true;
    loadingIndicator.style.display = 'flex';
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: message,
                context: 'HIV Testing Assistant',
                system_prompt: systemPrompt,
                temperature: temperature,
                top_p: topP,
                max_tokens: maxTokens
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            displayBotMessage(data.response);
        } else {
            const error = await response.json();
            displayBotMessage(`Sorry, I encountered an error: ${error.detail || 'Unknown error'}. Please try again.`);
        }
    } catch (error) {
        console.error('Chat error:', error);
        displayBotMessage('Sorry, I couldn\'t connect to the server. Please check if the backend is running.');
    } finally {
        sendBtn.disabled = false;
        loadingIndicator.style.display = 'none';
        messageInput.focus();
    }
}

// Display User Message
function displayUserMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    
    // Simple block layout without avatar
    messageDiv.innerHTML = `
        <div class="message-inner">
            <div class="message-content">
                ${escapeHtml(message)}
            </div>
        </div>
    `;
    
    chatMessagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

// Display Bot Message
function displayBotMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    // Formatting new lines as html line breaks
    const formattedMessage = escapeHtml(message).replace(/\n/g, '<br>');
    
    messageDiv.innerHTML = `
        <div class="message-inner">
            <div class="message-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 7v10M7 12h10" stroke="white" stroke-width="2" fill="none"/>
                </svg>
            </div>
            <div class="message-content">
                ${formattedMessage}
            </div>
        </div>
    `;
    
    chatMessagesDiv.appendChild(messageDiv);
    scrollToBottom();
}

// Scroll to Bottom
function scrollToBottom() {
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Toggle Settings Panel
function toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    if (settingsPanel.style.display === 'none') {
        settingsPanel.style.display = 'block';
        loadDocuments(); // Load documents when opening panel
    } else {
        settingsPanel.style.display = 'none';
    }
}

// Load Documents
async function loadDocuments() {
    const docList = document.getElementById('documentList');
    if (!docList) return;
    
    try {
        const response = await fetch(`${API_URL}/documents`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const docs = await response.json();
            if (docs.length === 0) {
                docList.innerHTML = '<li style="padding: 5px 0; color: #888;">No documents uploaded yet.</li>';
            } else {
                docList.innerHTML = docs.map(doc => `
                    <li style="padding: 8px 0; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">📄 ${escapeHtml(doc.filename)}</span>
                        <button onclick="deleteDocument(${doc.id})" style="background: transparent; border: none; color: #ff6b6b; cursor: pointer; padding: 4px; font-size: 16px;" title="Delete Document">
                            <span>&times;</span>
                        </button>
                    </li>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading documents', error);
        docList.innerHTML = '<li style="color: red;">Error loading documents.</li>';
    }
}

// Upload Document
async function uploadDocument(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const uploadBtn = document.getElementById('uploadBtn');
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading & Indexing...';
    uploadBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }, // Cannot set Content-Type with FormData
            body: formData
        });
        
        if (response.ok) {
            alert('Document uploaded and indexed successfully!');
            loadDocuments();
        } else {
            const err = await response.json();
            alert(`Upload failed: ${err.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Upload Error:', error);
        alert('Upload failed due to network error.');
    } finally {
        uploadBtn.textContent = originalText;
        uploadBtn.disabled = false;
        event.target.value = ''; // Reset input
    }
}

// Reset Settings to Defaults
function resetSettings() {
    document.getElementById('systemPrompt').value = '';
    document.getElementById('temperature').value = 0.7;
    document.getElementById('topP').value = 0.95;
    document.getElementById('maxTokens').value = 500;
    
    document.getElementById('tempValue').textContent = '0.7';
    document.getElementById('topPValue').textContent = '0.95';
    document.getElementById('maxTokensValue').textContent = '500';
}

// Delete Document
async function deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document? It will be removed from your context.')) return;
    
    try {
        const response = await fetch(`${API_URL}/documents/${docId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            loadDocuments();
        } else {
            const error = await response.json();
            alert(`Failed to delete document: ${error.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to connect to the server while deleting document.');
    }
}
