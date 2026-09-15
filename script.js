const API_URL = "";
const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");
const welcome = document.getElementById("welcome");
const currentMode = document.getElementById("currentMode");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const attachmentStatus = document.getElementById("attachmentStatus");
const sendBtn = document.getElementById("sendBtn");

const STORAGE_KEYS = {
  name: "studentai_name",
  level: "studentai_level",
  theme: "studentai_theme"
};

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

function applyGreeting(name) {
  const heading = document.getElementById("welcomeTitle");
  if (heading) heading.textContent = name ? `What do you want to learn today, ${name}?` : "What do you want to learn today?";
}

applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || "dark");
applyGreeting(localStorage.getItem(STORAGE_KEYS.name) || "");

function openSidebar() {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.add("open");
  document.body.classList.add("drawer-open");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("open");
  document.body.classList.remove("drawer-open");
}

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

async function sendMessage() {
  const text = input.value.trim();
  if (!text || sendBtn.disabled) return;

  if (welcome) welcome.style.display = "none";
  addMessage(text, "user");
  input.value = "";
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
        educationLevel: localStorage.getItem(STORAGE_KEYS.level) || "General"
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
        if (!cleared) {
          bubble.textContent = "";
          cleared = true;
        }
        full += decoder.decode(value, {stream: true});
        bubble.textContent = full;
        chat.scrollTop = chat.scrollHeight;
      }
      if (!full) bubble.textContent = "No response received.";
    }
  } catch (error) {
    bubble.textContent = "⚠️ AI connection problem. Please check the backend and try again.";
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
  input.style.height = Math.min(input.scrollHeight, 130) + "px";
});

document.getElementById("newChatBtn").addEventListener("click", () => {
  chat.innerHTML = "";
  chat.appendChild(welcome);
  welcome.style.display = "block";
  input.value = "";
  input.style.height = "auto";
  attachmentStatus.textContent = "";
  closeSidebar();
  input.focus();
});

document.getElementById("clearBtn").addEventListener("click", () => {
  document.getElementById("newChatBtn").click();
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

document.getElementById("menuBtn").addEventListener("click", () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});
sidebarBackdrop.addEventListener("click", closeSidebar);

document.getElementById("moreTools").addEventListener("click", e => {
  const extra = document.getElementById("extraTools");
  const open = extra.classList.toggle("open");
  e.currentTarget.innerHTML = open ? 'Less tools <span>⌃</span>' : 'More tools <span>⌄</span>';
});

document.getElementById("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) attachmentStatus.textContent = `📎 ${file.name}`;
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
    input.dispatchEvent(new Event("input"));
    input.focus();
  };
  recognition.start();
});

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

const educationLevelSelect = document.getElementById("educationLevel");
const darkModeToggle = document.getElementById("darkModeToggle");
document.getElementById("settingsBtn").addEventListener("click", () => {
  educationLevelSelect.value = localStorage.getItem(STORAGE_KEYS.level) || "General";
  darkModeToggle.checked = (localStorage.getItem(STORAGE_KEYS.theme) || "dark") === "dark";
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
  if (!confirm("Clear saved name, level and theme from this device?")) return;
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  applyTheme("dark");
  applyGreeting("");
  closeModal("settingsModal");
});

/* Mobile drawer: swipe right from the left edge to open, swipe left to close. */
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener("touchstart", e => {
  if (!e.touches.length) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, {passive:true});

document.addEventListener("touchend", e => {
  if (!e.changedTouches.length) return;
  const endX = e.changedTouches[0].clientX;
  const endY = e.changedTouches[0].clientY;
  const dx = endX - touchStartX;
  const dy = endY - touchStartY;

  if (window.innerWidth > 650 || Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.15) return;

  if (!sidebar.classList.contains("open") && touchStartX < 42 && dx > 0) {
    openSidebar();
  } else if (sidebar.classList.contains("open") && dx < 0) {
    closeSidebar();
  }
}, {passive:true});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeSidebar();
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
  }
});

document.getElementById("bottomHomeBtn").addEventListener("click", () => {
  document.getElementById("newChatBtn").click();
});
document.getElementById("bottomChatBtn").addEventListener("click", () => input.focus());
document.getElementById("bottomStudyBtn").addEventListener("click", () => {
  document.querySelector('[data-mode="Study Mode"]').click();
});
document.getElementById("bottomNewsBtn").addEventListener("click", () => {
  document.querySelector('[data-mode="Current Affairs"]').click();
});
