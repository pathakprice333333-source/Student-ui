require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 5000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname)); // NEW: serves index.html, style.css, script.js from this same folder

const ai = process.env.GEMINI_API_KEY &&
           !process.env.GEMINI_API_KEY.startsWith("PASTE_")
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const modeInstructions = {
  "Study Mode": "Teach clearly and encourage understanding. Use simple examples.",
  "Teacher Mode": "Act like a patient teacher. Explain step by step and check understanding.",
  "Homework Helper": "Help the student learn how to solve the problem. Do not simply dump an answer.",
  "Notes Generator": "Create structured, concise revision notes with headings and key points.",
  "Question Solver": "Solve step by step. For math/science use Given, Formula, Calculation, Final Answer, Explanation.",
  "Concept Explainer": "Explain the concept from beginner level, then add examples.",
  "Current Affairs": "For current facts, say that web search is required if fresh information is needed. Do not pretend old knowledge is current.",
  "Web Research": "Clearly distinguish known information from information that would require live web research.",
  "Science Helper": "Explain scientific ideas accurately, with formulas or examples when useful.",
  "Mathematics Helper": "Show the mathematical reasoning step by step and verify the result.",
  "Coding Tutor": "Teach code clearly, explain errors, and provide safe runnable examples.",
  "Competitive Exam": "Focus on exam-oriented concepts, practice, shortcuts only when reliable, and explanations."
};

app.get("/api/status", (req, res) => {
  res.json({ success: true, message: "StudentAI backend is running 🚀" });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "StudentAI Backend",
    aiConfigured: Boolean(ai),
    model: MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  const { message, mode = "Study Mode", educationLevel = "General" } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message is required." });
  }

  if (!ai) {
    return res.status(503).json({
      success: false,
      error: "Gemini API is not configured. Put a NEW Gemini API key in backend/.env as GEMINI_API_KEY."
    });
  }

  const instruction = modeInstructions[mode] || modeInstructions["Study Mode"];

  const prompt = `
You are StudentAI, an educational assistant for students.

Education level: ${educationLevel}
Selected mode: ${mode}

Mode instructions:
${instruction}

Rules:
- Understand Hindi, English, and Hinglish.
- Match the user's language where practical.
- Explain rather than encouraging cheating.
- Do not claim live/current information unless it has actually been retrieved through a web tool.
- Be honest about uncertainty.
- Keep answers useful and student-friendly.

Student question:
${message}
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.5,
        maxOutputTokens: 1200
      }
    });

    const reply = response.text || "I could not generate a response.";

    res.json({
      success: true,
      mode,
      reply,
      source: "Google Gemini"
    });
  } catch (error) {
    console.error("Gemini error:", error);

    res.status(502).json({
      success: false,
      error: "Gemini service is temporarily unavailable. Check your API key, model, quota, and internet connection."
    });
  }
});

app.post("/api/search", (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ success: false, error: "Search query is required." });
  }
  res.json({
    success: true,
    query,
    results: [],
    message: "Live web search is planned for Phase 4."
  });
});

app.post("/api/documents/upload", (req, res) => {
  res.json({
    success: true,
    message: "Upload endpoint is ready. Document RAG is planned for Phase 5."
  });
});

app.post("/api/documents/query", (req, res) => {
  res.json({ success: true, message: "Document RAG is planned for Phase 5." });
});

app.post("/api/notes/generate", (req, res) => {
  res.json({ success: true, message: "Notes generator is planned for a later phase." });
});

app.post("/api/quiz/generate", (req, res) => {
  res.json({ success: true, message: "Quiz generator is planned for a later phase." });
});

app.post("/api/study-plan", (req, res) => {
  res.json({ success: true, message: "Study planner is planned for a later phase." });
});

app.get("/api/news", (req, res) => {
  res.json({
    success: true,
    articles: [],
    message: "Current affairs/web retrieval is planned for Phase 4."
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🎓 StudentAI Backend");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Gemini model: ${MODEL}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
  console.log("=================================");
});
