import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chat.js';
import imageRouter from './routes/image.js';
import analyzeRouter from './routes/analyze.js';

// Load environment variables
dotenv.config();

console.log("===== ENV CHECK =====");
console.log("ARK_BASE_URL:", process.env.ARK_BASE_URL);
console.log("ARK_CHAT_MODEL:", process.env.ARK_CHAT_MODEL);
console.log("ARK_IMAGE_MODEL:", process.env.ARK_IMAGE_MODEL);
console.log(
  "ARK_API_KEY exists?",
  !!process.env.ARK_API_KEY,
  "length:",
  process.env.ARK_API_KEY?.length
);
console.log("=====================");


const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const isProd = process.env.NODE_ENV === "production";

if (!Number.isFinite(PORT) || PORT <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}


// Middleware

if (process.env.NODE_ENV !== "production") {
  app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
  }));
}

// 支持大文件上传（base64 图片）
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health check endpoint
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("ULook backend ok"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use('/api/chat', chatRouter);
app.use('/api/image', imageRouter);
app.use('/api/analyze', analyzeRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});

