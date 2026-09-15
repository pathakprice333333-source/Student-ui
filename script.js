const API_URL = "";

const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");
const welcome = document.getElementById("welcome");
const currentMode = document.getElementById("currentMode");
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("sidebarBackdrop");
const attachmentStatus = document.getElementById("attachmentStatus");
const fileInput = document.getElementById("fileInput");
const fileChip = document.getElementById("fileChip");
const fileName = document.getElementById("fileName");
const removeFile = document.getElementById("removeFile");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const headerModelSelect = document.getElementById("headerModelSelect");

const STORAGE_KEYS = {
  name: "studentai_name",
  level: "studentai_level",
  theme: "studentai_theme",
  model: "studentai_model"
};

let attachedFile = null;
let recognition = null;
let isListening = false;

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}
function applyGreeting(name) {
  const heading = welcome?.querySelector("h2");
  if (heading) heading.textContent = name ? `What do you want to learn today, ${name}?` : "What do you want to learn today?";
}
function addMessage(text, type) {
  const row = document.createElement("div");
  row.className = type === "user" ? "message-row user" : "message-row";
  const box = document.createElement("div");
  box.className = type === "user" ? "message user-message" : "message ai-message";
  box.textContent = text;
  row.appendChild(box);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return row;
}

applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || "light");
applyGreeting(localStorage.getItem(STORAGE_KEYS.name) || "");


function isHelloMessage(text) {
  const t = text.trim().toLowerCase()
    .replace(/[!?,.。！？]+$/g, "")
    .replace(/\s+/g, " ");
  return /^(hello|hi|hey|helo|hii|hiii|namaste|namaskar|ram ram|हेलो|हाय|नमस्ते)$/.test(t);
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;

  if (welcome) welcome.style.display = "none";
  addMessage(text, "user");
  input.value = "";

  // Instant fixed greeting — no AI/API call needed.
  if (isHelloMessage(text)) {
    addMessage("RAM RAM SAHEB", "ai");
    sendBtn.disabled = false;
    sendBtn.style.opacity = "1";
    return;
  }
  input.style.height = "auto";

  const aiRow = addMessage("", "ai");
  const bubble = aiRow.querySelector(".ai-message");
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

  sendBtn.disabled = true;
  sendBtn.style.opacity = ".5";

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        message: text,
        mode: currentMode.textContent,
        educationLevel: localStorage.getItem(STORAGE_KEYS.level) || "General",
        model: headerModelSelect?.value || localStorage.getItem(STORAGE_KEYS.model) || "gemini-3.8-flash",
        fileUri: attachedFile?.uri || "",
        fileMimeType: attachedFile?.mimeType || ""
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Request failed");
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      bubble.textContent = data.reply || "No response received.";
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let cleared = false;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (!cleared) { bubble.textContent = ""; cleared = true; }
        full += decoder.decode(value, {stream:true});
        bubble.textContent = full;
        chat.scrollTop = chat.scrollHeight;
      }
      if (!full) bubble.textContent = "No response received.";
    }
  } catch (error) {
    bubble.textContent = `⚠️ ${error.message || "Backend connection problem."}`;
    console.error(error);
  } finally {
    sendBtn.disabled = false;
    sendBtn.style.opacity = "1";
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

// ---------------- FILE UPLOAD ----------------
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  if (file.size > 50 * 1024 * 1024) {
    attachmentStatus.textContent = "File 50 MB se chhoti honi chahiye.";
    fileInput.value = "";
    return;
  }

  fileName.textContent = file.name;
  fileChip.classList.remove("hidden");
  attachmentStatus.textContent = "Uploading file…";
  fileInput.disabled = true;

  try {
    const form = new FormData();
    form.append("file", file);

    const response = await fetch(`${API_URL}/api/documents/upload`, {
      method: "POST",
      body: form
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.error || "File upload failed.");
    }

    attachedFile = data.file;
    attachmentStatus.textContent = data.processing
      ? "File uploaded. Thoda wait karke question bhejo."
      : "File ready — ab is file ke baare mein question pucho.";
  } catch (error) {
    attachedFile = null;
    fileChip.classList.add("hidden");
    attachmentStatus.textContent = `⚠️ ${error.message}`;
    fileInput.value = "";
  } finally {
    fileInput.disabled = false;
  }
});

removeFile.addEventListener("click", () => {
  attachedFile = null;
  fileInput.value = "";
  fileChip.classList.add("hidden");
  attachmentStatus.textContent = "";
});

// ---------------- VOICE TYPING ONLY ----------------
function stopVoiceTyping() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  isListening = false;
  voiceBtn.classList.remove("voice-listening");
  voiceBtn.textContent = "🎤";
  voiceBtn.title = "Voice typing";
}

voiceBtn.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Is browser me voice typing available nahi hai. Chrome/Edge try karo.");
    return;
  }

  if (isListening) {
    stopVoiceTyping();
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "hi-IN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    voiceBtn.classList.add("voice-listening");
    voiceBtn.textContent = "⏹️";
    voiceBtn.title = "Stop voice typing";
  };

  recognition.onresult = event => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    input.value = transcript;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  };

  recognition.onerror = event => {
    console.warn("Speech recognition:", event.error);
    attachmentStatus.textContent =
      event.error === "not-allowed"
        ? "Microphone permission allow karo."
        : "Voice typing start nahi ho payi.";
    stopVoiceTyping();
  };

  recognition.onend = () => stopVoiceTyping();

  try {
    recognition.start();
  } catch (e) {
    stopVoiceTyping();
  }
});

// ---------------- SIDEBAR ----------------
function openSidebar() {
  sidebar.classList.add("open");
  backdrop.classList.add("show");
}
function closeSidebar() {
  sidebar.classList.remove("open");
  backdrop.classList.remove("show");
}
document.getElementById("menuBtn").addEventListener("click", () => {
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});
backdrop.addEventListener("click", closeSidebar);

let touchStartX = 0;
let touchStartY = 0;
document.addEventListener("touchstart", e => {
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, {passive:true});

document.addEventListener("touchend", e => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

  if (!sidebar.classList.contains("open") && touchStartX < 45 && dx > 55) {
    openSidebar(); // left -> right
  } else if (sidebar.classList.contains("open") && dx < -55) {
    closeSidebar(); // right -> left
  }
}, {passive:true});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeSidebar();
});

// ---------------- TOOLS ----------------
document.getElementById("moreTools").addEventListener("click", () => {
  const extra = document.getElementById("extraTools");
  extra.classList.toggle("show");
  document.getElementById("moreTools").querySelector("span").textContent =
    extra.classList.contains("show") ? "⌃" : "⌄";
});

document.querySelectorAll(".mode").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentMode.textContent = button.dataset.mode;
    closeSidebar();
  });
});

document.querySelectorAll(".quick-actions button").forEach(button => {
  button.addEventListener("click", () => {
    input.value = button.dataset.message;
    sendMessage();
  });
});

// ---------------- NEW CHAT ----------------
function newChat() {
  chat.innerHTML = "";
  chat.appendChild(welcome);
  welcome.style.display = "block";
  input.value = "";
  input.style.height = "auto";
  attachedFile = null;
  fileInput.value = "";
  fileChip.classList.add("hidden");
  attachmentStatus.textContent = "";
}
document.getElementById("newChatBtn").addEventListener("click", newChat);
document.getElementById("clearBtn").addEventListener("click", newChat);

// ---------------- MODALS ----------------
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
  closeSidebar();
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// Profile
const profileNameInput = document.getElementById("profileName");
function openProfile() {
  profileNameInput.value = localStorage.getItem(STORAGE_KEYS.name) || "";
  openModal("profileModal");
}
document.getElementById("profileBtn").addEventListener("click", openProfile);
document.getElementById("bottomProfileBtn").addEventListener("click", openProfile);
document.getElementById("saveProfileBtn").addEventListener("click", () => {
  const name = profileNameInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.name, name);
  applyGreeting(name);
  closeModal("profileModal");
});

// Fast model switcher in the header
if (headerModelSelect) {
  headerModelSelect.value = localStorage.getItem(STORAGE_KEYS.model) || "gemini-3.8-flash";
  headerModelSelect.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEYS.model, headerModelSelect.value);
  });
}

// Settings + model selection
const educationLevelSelect = document.getElementById("educationLevel");
const modelSelect = document.getElementById("modelSelect");
const darkModeToggle = document.getElementById("darkModeToggle");

document.getElementById("settingsBtn").addEventListener("click", () => {
  educationLevelSelect.value = localStorage.getItem(STORAGE_KEYS.level) || "General";
  modelSelect.value = localStorage.getItem(STORAGE_KEYS.model) || "gemini-3.8-flash";
  darkModeToggle.checked = (localStorage.getItem(STORAGE_KEYS.theme) || "light") === "dark";
  openModal("settingsModal");
});

document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEYS.level, educationLevelSelect.value);
  localStorage.setItem(STORAGE_KEYS.model, modelSelect.value);
  if (headerModelSelect) headerModelSelect.value = modelSelect.value;
  const theme = darkModeToggle.checked ? "dark" : "light";
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
  closeModal("settingsModal");
});

document.getElementById("clearDataBtn").addEventListener("click", () => {
  if (!confirm("Naam, level, model aur theme clear kar dein?")) return;
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  applyTheme("light");
  applyGreeting("");
  if (headerModelSelect) headerModelSelect.value = "gemini-3.8-flash";
  closeModal("settingsModal");
});

// Bottom nav placeholders kept friendly.
document.getElementById("bottomHomeBtn").addEventListener("click", newChat);
document.getElementById("bottomChatBtn").addEventListener("click", () => input.focus());
document.getElementById("bottomStudyBtn").addEventListener("click", () => {
  document.querySelector('[data-mode="Study Mode"]').click();
});
document.getElementById("bottomNewsBtn").addEventListener("click", () => {
  document.querySelector('[data-mode="Current Affairs"]').click();
});
