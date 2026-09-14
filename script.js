const API_URL = ""; // FIXED: relative path — works on localhost AND wherever this gets deployed
const chat = document.getElementById("chat");
const input = document.getElementById("messageInput");
const welcome = document.getElementById("welcome");
const currentMode = document.getElementById("currentMode");
const sidebar = document.getElementById("sidebar");
const attachmentStatus = document.getElementById("attachmentStatus");

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
  if (!text) return;
  if (welcome) welcome.style.display = "none";
  addMessage(text, "user");
  input.value = "";
  input.style.height = "auto";

  const loading = addMessage("StudentAI is thinking…", "ai");

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: text, mode: currentMode.textContent})
    });
    const data = await response.json();
    loading.remove();
    if (!response.ok) throw new Error(data.error || "Request failed");
    addMessage(data.reply || "No response received.", "ai", data.source ? `Source: ${data.source}` : "");
  } catch (error) {
    loading.remove();
    addMessage("⚠️ Backend se connection nahi ho raha. Check karo ki backend server running hai.", "ai");
    console.error(error);
  }
}

document.getElementById("sendBtn").addEventListener("click", sendMessage);
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
