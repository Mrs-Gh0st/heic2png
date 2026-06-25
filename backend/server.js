import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";
import heicConvert from "heic-convert";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── Directories ──────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "tmp", "uploads");
const OUTPUTS_DIR = path.join(__dirname, "tmp", "outputs");
await fs.mkdir(UPLOADS_DIR, { recursive: true });
await fs.mkdir(OUTPUTS_DIR, { recursive: true });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST", "DELETE"],
}));
app.use(express.json());

// ── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}_${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 89 }, // 50MB per file, max 89
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".heic", ".heif"].includes(ext) || file.mimetype === "image/heic" || file.mimetype === "image/heif") {
      cb(null, true);
    } else {
      cb(new Error(`File "${file.originalname}" is not a HEIC/HEIF file.`));
    }
  },
});

// ── Session store (in-memory, resets on restart) ──────────────────────────────
const sessions = new Map();

// ── Helper: clean up temp files after 1 hour ────────────────────────────────
function scheduleCleanup(sessionId, delay = 60 * 60 * 1000) {
  setTimeout(async () => {
    const session = sessions.get(sessionId);
    if (!session) return;
    for (const f of session.files) {
      await fs.rm(f.inputPath, { force: true });
      await fs.rm(f.outputPath, { force: true });
    }
    sessions.delete(sessionId);
  }, delay);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Upload & convert
app.post("/api/convert", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  const sessionId = uuidv4();
  const outputFormat = (req.body.format || "png").toLowerCase();
  const quality = parseInt(req.body.quality || "90", 10);

  const results = [];

  for (const file of req.files) {
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
    const baseName = path.basename(originalName, path.extname(originalName));
    const outExt = outputFormat === "jpeg" ? "jpg" : "png";
    const outputFilename = `${baseName}.${outExt}`;
    const outputPath = path.join(OUTPUTS_DIR, `${uuidv4()}_${outputFilename}`);

    try {
      const inputBuffer = await fs.readFile(file.path);

      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: outputFormat === "jpeg" ? "JPEG" : "PNG",
        quality: outputFormat === "jpeg" ? quality / 100 : undefined,
      });

      await fs.writeFile(outputPath, Buffer.from(outputBuffer));

      const stat = await fs.stat(outputPath);

      results.push({
        id: uuidv4(),
        originalName,
        outputName: outputFilename,
        outputPath,
        inputPath: file.path,
        size: stat.size,
        status: "success",
      });
    } catch (err) {
      results.push({
        id: uuidv4(),
        originalName,
        outputName: outputFilename,
        outputPath: null,
        inputPath: file.path,
        size: 0,
        status: "error",
        error: err.message,
      });
    }
  }

  sessions.set(sessionId, { files: results, format: outputFormat, createdAt: Date.now() });
  scheduleCleanup(sessionId);

  res.json({
    sessionId,
    total: results.length,
    success: results.filter(r => r.status === "success").length,
    failed: results.filter(r => r.status === "error").length,
    files: results.map(r => ({
      id: r.id,
      originalName: r.originalName,
      outputName: r.outputName,
      size: r.size,
      status: r.status,
      error: r.error || null,
    })),
  });
});

// Download single file
app.get("/api/download/:sessionId/:fileId", async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found or expired." });

  const file = session.files.find(f => f.id === req.params.fileId);
  if (!file || file.status !== "success") return res.status(404).json({ error: "File not found." });

  res.download(file.outputPath, file.outputName);
});

// Download all as ZIP
app.get("/api/download/:sessionId/zip", async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found or expired." });

  const successFiles = session.files.filter(f => f.status === "success");
  if (successFiles.length === 0) return res.status(400).json({ error: "No converted files available." });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="converted_images.zip"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(res);

  for (const file of successFiles) {
    archive.file(file.outputPath, { name: file.outputName });
  }

  await archive.finalize();
});

// Session history
app.get("/api/session/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found or expired." });

  res.json({
    sessionId: req.params.sessionId,
    format: session.format,
    createdAt: session.createdAt,
    files: session.files.map(f => ({
      id: f.id,
      originalName: f.originalName,
      outputName: f.outputName,
      size: f.size,
      status: f.status,
    })),
  });
});

// Delete session
app.delete("/api/session/:sessionId", async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found." });

  for (const f of session.files) {
    await fs.rm(f.inputPath, { force: true });
    if (f.outputPath) await fs.rm(f.outputPath, { force: true });
  }
  sessions.delete(req.params.sessionId);
  res.json({ message: "Session deleted." });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
