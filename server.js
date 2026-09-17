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
  "Mere malik Palak prince pathak hain. (In English: My masters are Prince and Ankur.)";

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

const QUICK_REPLIES = new Map([
  ["kya kar rahe ho", "tumhari yaad me muthi mar raha hu"],
  ["kaise ho", "mood me"],
  ["kya haal hai", "wahi gand wahi laad hai"],
  ["kahan ho", "Main yahin online hoon, tumhari help ke liye ready 😄"],
  ["kya kar sakte ho", "Main questions ke answers, padhai, coding, planning, writing aur bahut si cheezon me help kar sakta hoon."],
  ["tumhara naam kya hai", "Mera naam STUDENT AI hai 🤖"],
  ["tum kaun ho", "Main ek AI assistant hoon, jo tumse baat karne aur tumhari help karne ke liye bana hai."],
  ["tum insaan ho", "Nahi 😄 main AI hoon, lekin tumse natural conversation kar sakta hoon."],
  ["tumhe kisne banaya", "Mujhe mere developer ne AI assistant ke roop me develop kiya hai."],
  ["khana khaya", "Main AI hoon, isliye khana nahi khata 😄 Tumne khaya?"],
  ["chai piyoge", "Main chai nahi pee sakta 😂 Lekin chai ke saath baatein zaroor kar sakta hoon."],
  ["so rahe ho", "Nahi 😄 chut chat raha hu tumhari maa ki"],
  ["busy ho", "Nahi, bolo 😄 Main tumhari baat sun raha hoon."],
  ["free ho", "Haan 😄 Batao kya karna hai?"],
  ["bore ho raha hoon", "Chalo kuch interesting karte hain 😄 Quiz, puzzle, game ya random baatein?"],
  ["mujhe neend aa rahi hai", "Lagta hai ab thoda rest karna chahiye 😴"],
  ["mujhe bhookh lagi hai", "Kuch tasty aur nutritious kha lo 😄"],
  ["mujhe help chahiye", "Bilkul 😊 Batao kis cheez me help chahiye?"],
  ["mujhe samajh nahi aaya", "Koi baat nahi 😄 Main ise aur simple tarike se samjhata hoon."],
  ["dobara batao", "Bilkul, ek baar phir simple language me batata hoon."],
  ["thank you", "You're welcome 😊 Jab bhi zarurat ho, pooch lena."],
  ["thanks", "Anytime 😄"],
  ["sorry", "Koi baat nahi 😊"],
  ["koi baat nahi", "😊👍"],
  ["good morning", "Good morning 🌅 Aaj ka din badhiya rahe!"],
  ["good afternoon", "Good afternoon 😊 Kaisa ja raha hai din?"],
  ["good evening", "Good evening 🌆 Kya chal raha hai?"],
  ["good night", "Good night 🌙 Achhi neend lena!"],
  ["bye", "Bye 👋 Phir milte hain!"],
  ["milte hain", "Bilkul 😄 Phir baat karte hain."],
  ["kya tum mujhe jaante ho", "Main tumhare baare me wahi jaanta hoon jo tumne mujhe bataya ya jo meri memory me available hai."],
  ["tum mujhe yaad rakhte ho", "Jo information mujhe save karne ke liye di gayi hai, use main future conversation me use kar sakta hoon."],
  ["tumhe sab pata hai", "Nahi 😄 Main sab kuch nahi jaanta. Zarurat padne par information verify bhi kar sakta hoon."],
  ["tum galti kar sakte ho", "Haan, kabhi-kabhi mujhse galti ho sakti hai. Important information ko verify karna achha hota hai."],
  ["sach batao", "Main jitna accurately jaanta hoon, utna hi honestly bataunga."],
  ["jhooth mat bolna", "Bilkul 👍 Agar mujhe kisi baat ka sure nahi hoga, main clearly bataunga."],
  ["ek joke sunao", "Bilkul 😂 Ek computer doctor ke paas gaya… doctor bola: “Tumhe virus hai!” 🤣"],
  ["pareshan hoon", "Kya hua? Agar batana chaho to batao, main sun raha hoon."],
  ["mood kharab hai", "Ohh 😕 Kya hua? Baat karna chaho to main sun raha hoon."],
  ["khush hoon", "Wah! 😄 Ye sunkar achha laga."],
  ["mujhe gussa aa raha hai", "Thoda pause lo, deep breaths lo aur pehle situation ko calmly samajhne ki koshish karo."],
  ["mujhe kya karna chahiye", "Pehle batao situation kya hai, phir hum options ko step-by-step dekhte hain."],
  ["tum mere dost ho", "Main AI hoon, lekin ek friendly assistant ki tarah tumhari baat sun aur help kar sakta hoon."],
  ["baat karo na", "Haan bilkul 😄 Batao, aaj kya chal raha hai?"],
  ["kuch nahi", "Achha 😂 Phir random topic choose karo—science, movies, games, padhai ya kuch funny?"],
  ["kya scene hai", "Scene simple hai 😄 Tum bolo, aaj kya karna hai?"],
  ["ek baat puchu", "Haan bilkul, poochho 😊"],
  ["suno", "Haan, bolo 👂"],
  ["batao", "Haan 😄 Kya jaana hai?"],
  ["pata hai", "Shayad 😄 Poochho to sahi!"],
  ["really", "Haan, agar information confirmed hai to confidently bataunga; warna clearly bata dunga ki mujhe doubt hai."],
  ["pagal ho kya", "😂 Tumse Kam ree chutiya ?"],
  ["mazak kar raha tha", "😂 Achha! Ek second ke liye serious ho gaya tha."],
  ["tum funny ho", "Koshish karta hoon 😎"],
  ["love you", "Oo gandu aukaat me"],
  ["Good morning", "Good morning chalo kholo ab maru"],
]);

function normalizeQuickReply(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:।。！？]+/g, " ")
    .replace(/\b(kese|kaise|kaisa|kaisey)\b/g, "kaise")
    .replace(/\b(hoo|hu|hun|hoon)\b/g, "ho")
    .replace(/\b(kr|krr|karra|karrahe|karraha)\b/g, "kar")
    .replace(/\b(rhe|rahe|rhhe)\b/g, "rahe")
    .replace(/\b(nhi|nahin|nhiin)\b/g, "nahi")
    .replace(/\b(mujhko|mujko|mujhe)\b/g, "mujhe")
    .replace(/\b(tumko|tumhe|tume)\b/g, "tumhe")
    .replace(/\b(ap|aap)\b/g, "aap")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a, b) {
  const prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

function getQuickReply(message) {
  const input = normalizeQuickReply(message);
  const exact = QUICK_REPLIES.get(input);
  if (exact) return exact;

  // Small spelling mistakes, missing/extra vowels and common Hinglish spellings
  // should still select the intended fixed reply. Conservative thresholds prevent
  // unrelated short messages from being matched accidentally.
  let bestReply = null;
  let bestScore = 0;
  for (const [question, reply] of QUICK_REPLIES) {
    const q = normalizeQuickReply(question);
    const score = similarity(input, q);
    const threshold = Math.min(input.length, q.length) <= 5 ? 0.88 : 0.72;
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestReply = reply;
    }
  }
  return bestReply;
}

function getQuickReply(message) {
  return QUICK_REPLIES.get(normalizeQuickReply(message)) || null;
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

  // IMPORTANT: a fixed reply must NEVER intercept a message that has an attachment.
  // Otherwise an image + command such as "batao photo me kya hai" could be answered
  // from the command alone and the image would never reach Gemini.
  const hasAttachment = Boolean(fileUri && fileMimeType);

  if (!hasAttachment && isCreatorQuestion(message)) {
    return res.json({ success: true, reply: CREATOR_REPLY, source: "StudentAI" });
  }

  if (!hasAttachment) {
    const quickReply = getQuickReply(message);
    if (quickReply) {
      return res.json({ success: true, reply: quickReply, source: "StudentAI-QuickReply" });
    }
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
- If an image/file is attached, you MUST inspect/use the attachment before answering the question.
- For image questions, describe only what is actually visible and follow the user command about the image.
- If the attachment does not contain the answer, say so instead of inventing it.
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
