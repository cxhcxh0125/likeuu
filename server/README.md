# LikeUU Backend Server

独立的后端服务器，用于转发火山引擎方舟 Ark API 请求。

## 技术栈

- Node.js >= 18.0.0
- TypeScript
- Express
- dotenv

## 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填入你的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
PORT=8787
ARK_API_KEY=your_ark_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_CHAT_MODEL=your_chat_model_id_here
ARK_IMAGE_MODEL=your_image_model_id_here
```

### 3. 运行开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:8787` 启动。

### 4. 生产环境构建

```bash
npm run build
npm start
```

## API 端点

### GET /api/health

健康检查接口

**响应：**
```json
{ "ok": true }
```

### POST /api/chat

文本对话接口

**请求体：**
```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "system": "你是一个时尚助手",
  "temperature": 0.7
}
```

**响应：**
```json
{
  "text": "回复内容",
  "raw": { ... }
}
```

### POST /api/image

图片生成接口（即梦/Seedream）

**请求体：**
```json
{
  "prompt": "生成一张时尚照片",
  "n": 1
}
```

**响应：**
```json
{
  "image": "data:image/png;base64,...",
  "raw": { ... }
}
```

### POST /api/analyze

图片分析接口（多模态）

**请求体：**
```json
{
  "imageBase64": "data:image/png;base64,..."
}
```

**响应：**
```json
{
  "name": "服装名称",
  "category": "类别",
  "tags": ["标签1", "标签2"],
  "raw": { ... }
}
```

## 常见问题排查

### 1. 401/403 错误

**原因：** API Key 无效或过期

**解决：**
- 检查 `.env` 文件中的 `ARK_API_KEY` 是否正确
- 确认 API Key 有足够的权限
- 检查 API Key 是否过期

### 2. 模型 ID 错误

**原因：** 模型 ID 配置错误或模型不存在

**解决：**
- 检查 `.env` 文件中的 `ARK_CHAT_MODEL` 和 `ARK_IMAGE_MODEL`
- 确认模型 ID 在火山引擎控制台中存在
- 查看 Ark API 文档确认正确的模型 ID 格式

### 3. CORS 错误

**原因：** 前端无法访问后端

**解决：**
- 确认后端服务器正在运行（`http://localhost:8787`）
- 检查 `vite.config.ts` 中的代理配置是否正确
- 确认前端运行在 `http://localhost:3000`

### 4. 返回字段不匹配

**原因：** Ark API 返回格式与预期不符

**解决：**
- 查看 `raw` 字段了解实际返回内容
- 根据 Ark API 文档调整代码中的字段提取逻辑
- 检查 API 版本是否匹配

### 5. 请求体大小限制

**原因：** base64 图片过大

**解决：**
- 当前限制为 20MB，如需调整，修改 `src/index.ts` 中的 `limit: '20mb'`
- 考虑在前端压缩图片后再发送

### 6. 端口被占用

**原因：** 8787 端口已被使用

**解决：**
```bash
# 查找占用端口的进程
lsof -i :8787

# 修改 .env 中的 PORT 为其他端口（如 8788）
# 同时更新 vite.config.ts 中的代理目标端口
```

## 开发说明

- 使用 `tsx` 进行开发，支持热重载
- TypeScript 配置在 `tsconfig.json`
- 所有路由在 `src/routes/` 目录下
- 主入口文件：`src/index.ts`

