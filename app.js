// app.js
// Minimal ChatGPT-style UI with true streaming via OpenAI Chat Completions API.
// SECURITY NOTE: Storing API keys in the browser is insecure (demo only).
// Use a minimal server/proxy in production to keep secrets off the client.

const LS_KEYS = {
  theme: 'theme',
  apiKey: 'openai_api_key',
  history: 'chat_history',
};

const THEME_STATES = ['system', 'light', 'dark'];

const DOM = {
  chat: document.getElementById('chat'),
  textarea: document.getElementById('composer-input'),
  form: document.getElementById('composer-form'),
  send: document.getElementById('send-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  newChat: document.getElementById('new-chat'),
  apiKeyToggle: document.getElementById('apikey-toggle'),
  apiKeyForm: document.getElementById('apikey-form'),
  apiKeyInput: document.getElementById('apikey-input'),
  apiKeyCancel: document.getElementById('apikey-cancel'),
  keyWarning: document.getElementById('key-warning'),
  typedSpan: document.getElementById('typed-tagline'),
};

let isStreaming = false;

const TAGLINE_STRINGS = [
  'ChatGPT-style UI',
  'Streaming responses',
  'Dark mode + history',
];

init();

function init() {
  applyTheme(loadTheme());
  initThemeToggle();

  initTypedHeader();

  // API key UI
  DOM.apiKeyToggle.addEventListener('click', toggleApiKeyForm);
  DOM.apiKeyCancel.addEventListener('click', hideApiKeyForm);
  DOM.apiKeyForm.addEventListener('submit', onSaveApiKey);
  updateKeyStateUI();

  // Composer
  DOM.form.addEventListener('submit', onSubmit);
  DOM.textarea.addEventListener('keydown', onKeydownCombo);
  DOM.textarea.addEventListener('input', autoResize);
  autoResize();

  // New chat
  DOM.newChat.addEventListener('click', onNewChat);

  // Render history from localStorage
  renderHistory();

  // On first load, show a tiny assistant hint if no history
  const history = loadHistory();
  if (history.length === 0) {
    appendAssistantBubble(
      "Hi! Set your OpenAI API key to start. I stream responses as they arrive."
    );
  }
  scrollToBottom();
}

// ---------- Theme ----------
function loadTheme() {
  return localStorage.getItem(LS_KEYS.theme) || 'system';
}
function saveTheme(theme) {
  localStorage.setItem(LS_KEYS.theme, theme);
}
function applyTheme(theme) {
  // For 'light' or 'dark', apply data-theme. For 'system', set to 'system' (CSS uses prefers-color-scheme).
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeToggleIcon(theme);
}
function initThemeToggle() {
  DOM.themeToggle.addEventListener('click', () => {
    const current = loadTheme();
    const next = THEME_STATES[(THEME_STATES.indexOf(current) + 1) % THEME_STATES.length];
    saveTheme(next);
    applyTheme(next);
  });
  // Ensure icon reflects stored state
  updateThemeToggleIcon(loadTheme());
}
function updateThemeToggleIcon(theme) {
  // 🖥️ = system, ☀ = light, 🌙 = dark
  DOM.themeToggle.textContent = theme === 'light' ? '☀' : theme === 'dark' ? '🌙' : '🖥️';
  DOM.themeToggle.setAttribute('aria-label', `Theme: ${theme}. Click to change.`);
  DOM.themeToggle.setAttribute('title', `Theme: ${theme} (click to change)`);
}

// ---------- Typed.js ----------
function initTypedHeader() {
  try {
    if (window.Typed) {
      new window.Typed('#typed-tagline', {
        strings: TAGLINE_STRINGS,
        typeSpeed: 48,
        backSpeed: 28,
        backDelay: 1200,
        smartBackspace: true,
        loop: true,
        showCursor: false,
      });
    } else {
      DOM.typedSpan.textContent = TAGLINE_STRINGS[0];
    }
  } catch {
    DOM.typedSpan.textContent = TAGLINE_STRINGS[0];
  }
}

// ---------- API Key ----------
function getApiKey() {
  return localStorage.getItem(LS_KEYS.apiKey) || '';
}
function setApiKey(key) {
  localStorage.setItem(LS_KEYS.apiKey, key.trim());
}
function toggleApiKeyForm() {
  const isHidden = DOM.apiKeyForm.hasAttribute('hidden');
  if (isHidden) {
    DOM.apiKeyInput.value = getApiKey();
    DOM.apiKeyForm.hidden = false;
    DOM.apiKeyToggle.setAttribute('aria-expanded', 'true');
    DOM.apiKeyInput.focus();
  } else {
    hideApiKeyForm();
  }
}
function hideApiKeyForm() {
  DOM.apiKeyForm.hidden = true;
  DOM.apiKeyToggle.setAttribute('aria-expanded', 'false');
  DOM.apiKeyToggle.focus();
}
function onSaveApiKey(e) {
  e.preventDefault();
  const val = DOM.apiKeyInput.value.trim();
  if (val) setApiKey(val);
  hideApiKeyForm();
  updateKeyStateUI();
}
function updateKeyStateUI() {
  const hasKey = !!getApiKey();
  DOM.keyWarning.hidden = hasKey;
  DOM.send.disabled = !hasKey || isStreaming;
  DOM.textarea.readOnly = !hasKey && !isStreaming ? false : false; // keep editable but send blocked
}

// ---------- History ----------
function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveHistory(arr) {
  localStorage.setItem(LS_KEYS.history, JSON.stringify(arr));
}
function appendMessage(role, content) {
  const history = loadHistory();
  history.push({ role, content, ts: Date.now() });
  saveHistory(history);
}
function renderHistory() {
  DOM.chat.innerHTML = '';
  const history = loadHistory();
  for (const m of history) {
    if (m.role === 'user') {
      appendUserBubble(m.content, false);
    } else {
      appendAssistantBubble(m.content, false);
    }
  }
}

// ---------- Chat UI ----------
function createMessageEl(role, text = '') {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
  return div;
}
function appendUserBubble(text, save = true) {
  const el = createMessageEl('user', text);
  DOM.chat.appendChild(el);
  if (save) appendMessage('user', text);
  scrollToBottom();
  return el;
}
function appendAssistantBubble(text = '', save = true) {
  const el = createMessageEl('assistant', text);
  DOM.chat.appendChild(el);
  if (save) appendMessage('assistant', text);
  scrollToBottom();
  return el;
}

function showTypingIndicator(parentEl) {
  const wrap = document.createElement('span');
  wrap.className = 'typing';
  wrap.setAttribute('aria-label', 'Assistant is typing');
  wrap.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
  parentEl.appendChild(document.createTextNode(' '));
  parentEl.appendChild(wrap);
  return wrap;
}

function removeTypingIndicator(indicatorEl) {
  indicatorEl?.remove();
}

function scrollToBottom() {
  // Smooth-ish scroll; keep pinned to bottom for streaming.
  DOM.chat.scrollTop = DOM.chat.scrollHeight;
}

// ---------- Composer / Send ----------
function onKeydownCombo(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    DOM.form.requestSubmit();
  }
}
function autoResize() {
  const el = DOM.textarea;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, parseFloat(getComputedStyle(el).lineHeight) * 6 + 16) + 'px';
}

async function onSubmit(e) {
  e.preventDefault();
  if (isStreaming) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    updateKeyStateUI();
    return;
  }
  const text = DOM.textarea.value.trim();
  if (!text) return;

  isStreaming = true;
  DOM.send.disabled = true;

  // 1) Add user bubble and persist
  appendUserBubble(text, true);

  // 2) Add assistant placeholder (not persisted yet)
  const assistantEl = createMessageEl('assistant', '');
  DOM.chat.appendChild(assistantEl);
  const indicator = showTypingIndicator(assistantEl);
  scrollToBottom();

  DOM.textarea.value = '';
  autoResize();

  try {
    const streamedText = await streamFromOpenAI(apiKey, text, (delta) => {
      // First content received: remove typing indicator
      if (indicator && delta) {
        removeTypingIndicator(indicator);
      }
      assistantEl.textContent += delta;
      scrollToBottom();
    });

    // Persist final assistant message
    appendMessage('assistant', streamedText || assistantEl.textContent || '');

  } catch (err) {
    // Replace placeholder with readable error bubble (do not delete any history)
    assistantEl.textContent = `⚠️ Error: ${err?.message || 'Streaming failed.'}`;
  } finally {
    isStreaming = false;
    updateKeyStateUI();
  }
}

// ---------- OpenAI Streaming ----------
async function streamFromOpenAI(apiKey, userText, onDelta) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const body = {
    model: 'gpt-4.1',
    temperature: 0.7,
    stream: true,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: userText },
    ],
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    let detail = '';
    try { detail = await resp.text(); } catch {}
    throw new Error(`HTTP ${resp.status}: ${detail || resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages separated by double newlines
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;

      const data = line.replace(/^data:\s*/, '');
      if (data === '[DONE]') {
        try { await reader.cancel(); } catch {}
        return fullText;
      }

      try {
        const json = JSON.parse(data);
        // For Chat Completions stream
        const delta = json?.choices?.[0]?.delta;
        const token = delta?.content || '';
        if (token) {
          fullText += token;
          onDelta?.(token);
        }
      } catch {
        // Non-JSON line; ignore
      }
    }
  }
  return fullText;
}

// ---------- New Chat ----------
function onNewChat() {
  if (isStreaming) return;
  const ok = confirm('Start a new chat? This will clear the current conversation history.');
  if (!ok) return;
  localStorage.removeItem(LS_KEYS.history);
  DOM.chat.innerHTML = '';
  appendAssistantBubble('New chat started. How can I help?');
  scrollToBottom();
}

// ---------- Utilities ----------
/* (none additional) */

