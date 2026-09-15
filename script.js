const API_URL = ""; // relative path — works on localhost AND wherever this gets deployed
const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");
const welcome = document.getElementById("welcome");
const currentMode = document.getElementById("currentMode");
const sidebar = document.getElementById("sidebar");
const attachmentStatus = document.getElementById("attachmentStatus");

// --- Local profile/settings — saved on this device only, no backend account system ---
const STORAGE_KEYS = { name: "studentai_name", level: "studentai_level", theme: "studentai_theme" };

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
}

function applyGreeting(name) {
  const heading = welcome ? welcome.querySelector("h2") : null;
  if (heading) heading.textContent = name ? `What do you want to learn today, ${name}?` : "What do you want to learn today?";
}

applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || "light");
applyGreeting(localStorage.getItem(STORAGE_KEYS.name) || "");

function addMessage(text, type, meta = "") {
  const row = document.createElement("div");
  row.className = type === "user" ? "message-row user" : "message-row";
  const box = document.createElement("div");
  box.className = type === "user" ? "message user-message" : "message ai-message";
  box.textContent = text;
  if (meta) {
    const small = document.createElement("small");
    small.textContent = meta;
    box.appendChild(small);
  }
  row.appendChild(box);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return row;
}

// Streams the reply in as it's generated instead of waiting for the whole thing —
// feels much faster, especially on the free Render tier.
const sendBtn = document.getElementById("sendBtn");

async function sendMessage() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return; // block double-send while a reply is streaming
  if (welcome) welcome.style.display = "none";
  addMessage(text, "user");
  input.value = "";
  input.style.height = "auto";

  const aiRow = addMessage("", "ai");
  const bubble = aiRow.querySelector(".ai-message");
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';

  sendBtn.disabled = true;
  sendBtn.style.opacity = "0.5";

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        message: text,
        mode: currentMode.textContent,
        educationLevel: localStorage.getItem(STORAGE_KEYS.level) || "General"
      })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Request failed");
    }

    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      // Instant, non-streamed replies (e.g. the fixed "who made you" answer)
      const data = await response.json();
      bubble.textContent = data.reply || "No response received.";
    } else {
      // Streamed Gemini reply — append text as chunks arrive
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      let cleared = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!cleared) { bubble.textContent = ""; cleared = true; }
        full += decoder.decode(value, { stream: true });
        bubble.textContent = full;
        chat.scrollTop = chat.scrollHeight;
      }
      if (!full) bubble.textContent = "No response received.";
    }
  } catch (error) {
    bubble.textContent = "⚠️ Backend se connection nahi ho raha. Check karo ki backend server running hai.";
    console.error(error);
  } finally {
    sendBtn.disabled = false;
    sendBtn.style.opacity = "1";
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  chat.innerHTML = "";
  chat.appendChild(welcome);
  welcome.style.display = "block";
  input.value = "";
  attachmentStatus.textContent = "";
});

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("newChatBtn").click();
});

document.querySelectorAll(".mode").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    currentMode.textContent = button.dataset.mode;
    sidebar.classList.remove("open");
  });
});

document.querySelectorAll(".quick-actions button").forEach(button => {
  button.addEventListener("click", () => {
    input.value = button.dataset.message;
    sendMessage();
  });
});

document.getElementById("menuBtn").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) attachmentStatus.textContent = `Selected: ${file.name} — document processing comes in Phase 5.`;
});

document.getElementById("voiceBtn").addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Voice input is not supported by this browser.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.onresult = event => {
    input.value = event.results[0][0].transcript;
  };
  recognition.start();
});

// --- Modal helpers ---
function openModal(id) { document.getElementById(id).classList.remove("hidden"); sidebar.classList.remove("open"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.add("hidden"); });
});

// --- Profile modal ---
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

// --- Settings modal ---
const educationLevelSelect = document.getElementById("educationLevel");
const darkModeToggle = document.getElementById("darkModeToggle");
document.getElementById("settingsBtn").addEventListener("click", () => {
  educationLevelSelect.value = localStorage.getItem(STORAGE_KEYS.level) || "General";
  darkModeToggle.checked = (localStorage.getItem(STORAGE_KEYS.theme) || "light") === "dark";
  openModal("settingsModal");
});
document.getElementById("saveSettingsBtn").addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEYS.level, educationLevelSelect.value);
  const theme = darkModeToggle.checked ? "dark" : "light";
  localStorage.setItem(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
  closeModal("settingsModal");
});
document.getElementById("clearDataBtn").addEventListener("click", () => {
  if (!confirm("Naam, education level aur theme — sab is device se hata dein?")) return;
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  applyTheme("light");
  applyGreeting("");
  closeModal("settingsModal");
});
