require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 5000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const ALLOWED_STATIC_FILES = new Set(["index.html", "style.css", "script.js"]);
app.get("/", (req, res) => res.sendFile("index.html", { root: __dirname }));
app.get("/:file", (req, res, next) => {
  if (ALLOWED_STATIC_FILES.has(req.params.file)) {
    return res.sendFile(req.params.file, { root: __dirname });
  }
  next();
});

const ai = process.env.GEMINI_API_KEY &&
           !process.env.GEMINI_API_KEY.startsWith("PASTE_")
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const modeInstructions = {
  "Study Mode": "Teach clearly and encourage understanding. Keep the answer concise unless detail is needed.",
  "Teacher Mode": "Act like a patient teacher. Explain step by step and check understanding.",
  "Homework Helper": "Help the student learn how to solve the problem. Do not simply dump an answer.",
  "Notes Generator": "Create structured, concise revision notes with headings and key points.",
  "Question Solver": "Solve step by step. For math/science use Given, Formula, Calculation, Final Answer, Explanation.",
  "Concept Explainer": "Explain the concept from beginner level, then add examples.",
  "Current Affairs": "For current facts, say that live web search is required if fresh information is needed. Do not pretend old knowledge is current.",
  "Web Research": "Clearly distinguish known information from information that would require live web research.",
  "Science Helper": "Explain scientific ideas accurately, with formulas or examples when useful.",
  "Mathematics Helper": "Show the mathematical reasoning step by step and verify the result.",
  "Coding Tutor": "Teach code clearly, explain errors, and provide safe runnable examples.",
  "Competitive Exam": "Focus on exam-oriented concepts, practice, shortcuts only when reliable, and explanations."
};

const CREATOR_REPLY =
  "Mere malik Prince aur Ankur hain. (In English: My masters are Prince and Ankur.)";

function isCreatorQuestion(message) {
  const text = message.toLowerCase();
  const selfRef =
    /\b(you|your|yourself)\b/.test(text) ||
    /\bthis\s+(app|bot|ai|website|site)\b/.test(text) ||
    /\b(tumhe|tumko|tujhe|tumhara|tumhari|aapko|aapka|aapki|tera|teri)\b/.test(text) ||
    /\b(is|ye|yeh)\s+(app|bot)\b/.test(text);
  if (!selfRef) return false;

  const creationWord = /\b(made|create|created|creator|built|build|develop|developer|owns|owner|malik|banaya|banaaya|banayaa)\b/.test(text);
  const whoOrKisne = /\bwho\b/.test(text) || /\bkis\s*ne\b/.test(text);
  return creationWord || whoOrKisne;
}

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

  if (isCreatorQuestion(message)) {
    return res.json({ success: true, mode, reply: CREATOR_REPLY, source: "StudentAI" });
  }

  if (!ai) {
    return res.status(503).json({
      success: false,
      error: "Gemini API is not configured. Add GEMINI_API_KEY to the server environment."
    });
  }

  const instruction = modeInstructions[mode] || modeInstructions["Study Mode"];

  const prompt = `
You are StudentAI, a friendly educational assistant for students.

Education level: ${educationLevel}
Selected mode: ${mode}

Mode instructions:
${instruction}

Rules:
- If asked who made, created, owns, or is the "malik" of you/this app, reply with exactly this and nothing else: "${CREATOR_REPLY}"
- Understand Hindi, English, and Hinglish.
- Match the user's language where practical.
- Explain rather than encouraging cheating.
- Do not claim live/current information unless it has actually been retrieved through a web tool.
- Be honest about uncertainty.
- Prefer concise, useful answers. Use bullets/headings only when they improve readability.

Student question:
${message}
`;

  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.5,
        maxOutputTokens: 1000
      }
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");
    if (res.flushHeaders) res.flushHeaders();

    let sentAny = false;
    for await (const chunk of stream) {
      if (chunk.text) {
        sentAny = true;
        res.write(chunk.text);
      }
    }
    if (!sentAny) res.write("I could not generate a response.");
    res.end();
  } catch (error) {
    console.error("Gemini error:", error);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: "Gemini service is temporarily unavailable. Check the API key, model, quota, and internet connection."
      });
    } else {
      res.write("\n\n⚠️ Jawab beech me ruk gaya — dobara try karein.");
      res.end();
    }
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
    message: "Live web search needs a search provider and is not enabled in this build."
  });
});

app.post("/api/documents/upload", (req, res) => {
  res.json({
    success: true,
    message: "Document upload UI is ready; full document RAG is a separate module."
  });
});

app.post("/api/documents/query", (req, res) => {
  res.json({ success: true, message: "Document RAG is not enabled in this build." });
});

app.post("/api/notes/generate", (req, res) => {
  res.json({ success: true, message: "Use Notes mode in /api/chat for now." });
});

app.post("/api/quiz/generate", (req, res) => {
  res.json({ success: true, message: "Use Practice/Exam mode in /api/chat for now." });
});

app.post("/api/study-plan", (req, res) => {
  res.json({ success: true, message: "Use Study Mode in /api/chat for now." });
});

app.get("/api/news", (req, res) => {
  res.json({
    success: true,
    articles: [],
    message: "Live news requires a search/news provider."
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
