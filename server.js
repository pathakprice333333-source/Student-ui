require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const {
  GoogleGenAI,
  createUserContent,
  createPartFromUri
} = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 5000;

const FREE_MODELS = {
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite"
};

const DEFAULT_MODEL =
  FREE_MODELS[process.env.GEMINI_MODEL] ? process.env.GEMINI_MODEL : "gemini-3.8-flash";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
      "image/webp"
    ]);
    cb(null, allowed.has(file.mimetype));
  }
});

const ai = process.env.GEMINI_API_KEY &&
  !process.env.GEMINI_API_KEY.startsWith("PASTE_")
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const modeInstructions = {
  "Study Mode": "Teach clearly with simple examples.",
  "Teacher Mode": "Act like a patient teacher and explain step by step.",
  "Homework Helper": "Help the student understand the method instead of only dumping an answer.",
  "Notes Generator": "Create concise structured revision notes with headings and key points.",
  "Question Solver": "Solve step by step. For math/science use Given, Formula, Calculation, Final Answer, Explanation.",
  "Concept Explainer": "Start from beginner level, then add examples.",
  "Current Affairs": "Do not claim live information unless a real web-search feature has supplied it.",
  "Web Research": "Clearly separate model knowledge from information that requires live web research.",
  "Science Helper": "Explain scientific ideas accurately with formulas/examples when useful.",
  "Mathematics Helper": "Show reasoning step by step and verify the result.",
  "Coding Tutor": "Teach code clearly and explain errors.",
  "Competitive Exam": "Focus on reliable exam-oriented concepts and explanations."
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

  const creationWord =
    /\b(made|create|created|creator|built|build|develop|developer|owns|owner|malik|banaya|banaaya|banayaa)\b/.test(text);
  const whoOrKisne = /\bwho\b/.test(text) || /\bkis\s*ne\b/.test(text);

  return creationWord || whoOrKisne;
}

function safeModel(model) {
  return FREE_MODELS[model] ? model : DEFAULT_MODEL;
}

app.get("/", (req, res) => res.sendFile("index.html", { root: __dirname }));

for (const file of ["index.html", "style.css", "script.js"]) {
  app.get("/" + file, (req, res) => res.sendFile(file, { root: __dirname }));
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    aiConfigured: Boolean(ai),
    defaultModel: DEFAULT_MODEL,
    models: FREE_MODELS
  });
});

app.get("/api/models", (req, res) => {
  res.json({
    success: true,
    models: Object.entries(FREE_MODELS).map(([id, name]) => ({ id, name })),
    defaultModel: DEFAULT_MODEL
  });
});

/*
  Upload flow:
  1. Browser sends the file here.
  2. Server sends it to Gemini Files API.
  3. Browser receives only the temporary Gemini file URI metadata.
  4. The next chat request sends that URI to the server.
*/
app.post("/api/documents/upload", upload.single("file"), async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      success: false,
      error: "Gemini API is not configured on the server."
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Please select a supported file."
    });
  }

  try {
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });

    const uploaded = await ai.files.upload({
      file: blob,
      config: {
        displayName: req.file.originalname,
        mimeType: req.file.mimetype
      }
    });

    let current = uploaded;

    // PDFs/documents can briefly stay in PROCESSING.
    for (let i = 0; i < 30; i++) {
      const state = String(current.state || "").toUpperCase();
      if (!state || state === "ACTIVE") break;
      if (state === "FAILED") {
        throw new Error("Gemini could not process this file.");
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      current = await ai.files.get({ name: uploaded.name });
    }

    const finalState = String(current.state || "").toUpperCase();
    if (finalState === "PROCESSING") {
      return res.status(202).json({
        success: true,
        processing: true,
        file: {
          name: current.name,
          uri: current.uri,
          mimeType: current.mimeType || req.file.mimetype,
          originalName: req.file.originalname
        },
        message: "File uploaded. It is still processing; try your question in a moment."
      });
    }

    res.json({
      success: true,
      processing: false,
      file: {
        name: current.name,
        uri: current.uri,
        mimeType: current.mimeType || req.file.mimetype,
        originalName: req.file.originalname
      },
      message: "File uploaded successfully. You can now ask questions about it."
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(502).json({
      success: false,
      error: "Unable to read this file. Try a PDF, TXT, DOC/DOCX or image under 50 MB."
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const {
    message,
    mode = "Study Mode",
    educationLevel = "General",
    model = DEFAULT_MODEL,
    fileUri = "",
    fileMimeType = ""
  } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message is required." });
  }

  if (isCreatorQuestion(message)) {
    return res.json({ success: true, reply: CREATOR_REPLY, source: "StudentAI" });
  }

  if (!ai) {
    return res.status(503).json({
      success: false,
      error: "Gemini API is not configured. Add GEMINI_API_KEY to .env on the server."
    });
  }

  const selectedModel = safeModel(model);
  const instruction = modeInstructions[mode] || modeInstructions["Study Mode"];

  const prompt = `
You are StudentAI, an educational assistant for students.

Education level: ${educationLevel}
Selected mode: ${mode}

Mode instructions:
${instruction}

Rules:
- Understand Hindi, English and Hinglish.
- Match the user's language where practical.
- Explain rather than encouraging cheating.
- Do not claim live/current information unless it was actually retrieved by a web tool.
- If a file is attached, answer primarily from that file when the question is about it.
- If the file does not contain the answer, say so instead of inventing it.
- Keep answers useful and student-friendly.

Student question:
${message}
`;

  try {
    let contents;

    if (fileUri && fileMimeType) {
      contents = createUserContent([
        createPartFromUri(fileUri, fileMimeType),
        prompt
      ]);
    } else {
      contents = prompt;
    }

    const stream = await ai.models.generateContentStream({
      model: selectedModel,
      contents,
      config: {
        temperature: 0.4,
        maxOutputTokens: 800
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
        error: "AI service is temporarily unavailable. Check the selected model, API key and quota."
      });
    } else {
      res.write("\n\n⚠️ Answer stopped. Please try again.");
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`StudentAI running at http://localhost:${PORT}`);
  console.log(`Default model: ${DEFAULT_MODEL}`);
});
