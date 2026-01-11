# 后端集成说明文档

## 📁 最终目录结构

```
likeuu(building BED)/
├── server/                          # 后端独立项目目录
│   ├── .env.example                 # 环境变量示例文件
│   ├── .gitignore                  # Git 忽略文件
│   ├── package.json                # 后端依赖配置
│   ├── tsconfig.json               # TypeScript 配置
│   ├── README.md                   # 后端说明文档
│   └── src/                        # 源代码目录
│       ├── index.ts                # 主入口文件
│       └── routes/                 # 路由目录
│           ├── chat.ts             # 文本对话路由
│           ├── image.ts            # 图片生成路由
│           └── analyze.ts          # 图片分析路由
├── services/
│   └── geminiService.ts           # 前端服务（已修改为调用后端）
├── vite.config.ts                  # Vite 配置（已添加代理）
└── ... (其他前端文件)
```

---

## 📝 文件说明与关键代码

### A. 后端文件

#### 1. `server/package.json`
**作用：** 定义后端项目的依赖和脚本

**关键点：**
- 使用 `"type": "module"` 支持 ES 模块
- 依赖：`express`, `dotenv`, `cors`
- 开发工具：`tsx`（支持 TypeScript 热重载）
- Node.js 版本要求：>= 18.0.0（支持原生 fetch）

#### 2. `server/tsconfig.json`
**作用：** TypeScript 编译配置

**关键点：**
- 输出目录：`dist/`
- 源代码目录：`src/`
- 目标：ES2022
- 模块系统：ESNext

#### 3. `server/src/index.ts`
**作用：** Express 服务器主入口

**关键代码：**
```typescript
// 加载环境变量
dotenv.config();

// CORS 配置（允许前端访问）
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// 支持大文件（base64 图片）
app.use(express.json({ limit: '20mb' }));

// 路由注册
app.use('/api/chat', chatRouter);
app.use('/api/image', imageRouter);
app.use('/api/analyze', analyzeRouter);
```

**功能：**
- 健康检查：`GET /api/health`
- 统一错误处理
- 404 处理

#### 4. `server/src/routes/chat.ts`
**作用：** 文本对话 API 路由

**关键代码：**
```typescript
// 构建请求体
const requestBody = {
  model: process.env.ARK_CHAT_MODEL,
  messages: messages.map(msg => ({
    role: msg.role,
    content: msg.content
  })),
  temperature: temperature
};

// 如果有 system 指令，添加到 messages 开头
if (system) {
  requestBody.messages.unshift({
    role: 'system',
    content: system
  });
}

// 调用 Ark API
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify(requestBody)
});
```

**功能：**
- 接收前端消息数组和系统指令
- 转发到 Ark `/chat/completions` 端点
- 提取并返回文本内容

#### 5. `server/src/routes/image.ts`
**作用：** 图片生成 API 路由（即梦/Seedream）

**关键代码：**
```typescript
// 构建请求体
const requestBody = {
  model: process.env.ARK_IMAGE_MODEL,
  prompt,
  n: Math.min(n, 4) // 限制最多 4 张
};

// 调用 Ark API
const response = await fetch(`${baseUrl}/images/generations`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify(requestBody)
});

// 提取图片（支持 base64 和 URL）
const firstImage = images[0];
let imageUrl: string;

if (firstImage.b64_json) {
  imageUrl = `data:image/png;base64,${firstImage.b64_json}`;
} else if (firstImage.url) {
  imageUrl = firstImage.url;
}
```

**功能：**
- 接收提示词和生成数量
- 转发到 Ark `/images/generations` 端点
- 兼容 base64 和 URL 两种返回格式

#### 6. `server/src/routes/analyze.ts`
**作用：** 图片分析 API 路由（多模态）

**关键代码：**
```typescript
// 处理 base64 字符串
let base64Data = imageBase64;
if (imageBase64.includes(',')) {
  base64Data = imageBase64.split(',')[1];
}

// 构建多模态消息
const requestBody = {
  model: process.env.ARK_CHAT_MODEL,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64Data}`
          }
        },
        {
          type: 'text',
          text: 'Analyze this clothing. Return JSON only: {name, category, tags}.'
        }
      ]
    }
  ]
};
```

**功能：**
- 接收 base64 图片
- 构建多模态请求
- 解析 JSON 响应并返回结构化数据

---

### B. 前端修改

#### 1. `vite.config.ts`
**作用：** Vite 开发服务器配置

**关键修改：**
```typescript
server: {
  port: 3000,
  host: '0.0.0.0',
  // 代理 /api 请求到后端服务器
  proxy: {
    '/api': {
      target: 'http://localhost:8787',
      changeOrigin: true,
      secure: false,
    }
  }
}
```

**说明：**
- 开发环境下，所有 `/api/*` 请求会被代理到 `http://localhost:8787`
- 生产环境需要配置反向代理（如 Nginx）

#### 2. `services/geminiService.ts`
**作用：** 前端 AI 服务（已改为调用后端）

**关键修改：**

**chatWithGemini：**
```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages,
    system: systemInstruction,
    temperature: 0.7
  })
});
const data = await response.json();
return data.text || '';
```

**generateFashionImage：**
```typescript
const response = await fetch('/api/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: fullPrompt,
    n: 1
  })
});
const data = await response.json();
return data.image || '';
```

**analyzeClothing：**
```typescript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageBase64: base64Image
  })
});
const data = await response.json();
return {
  name: data.name || "Unknown Clothing",
  category: data.category || "General",
  tags: Array.isArray(data.tags) ? data.tags : []
};
```

**说明：**
- 保留了原有的函数签名，前端代码无需修改
- 移除了对 `@google/genai` 的直接依赖
- 所有请求通过后端代理，隐藏了 API Key

---

## 🚀 运行步骤

### 步骤 1：配置后端环境变量

```bash
cd server
cp .env.example .env
```

编辑 `server/.env`，填入你的配置：
```env
PORT=8787
ARK_API_KEY=你的API密钥
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_CHAT_MODEL=你的文本模型ID
ARK_IMAGE_MODEL=你的图片模型ID
```

### 步骤 2：安装后端依赖

```bash
cd server
npm install
```

### 步骤 3：启动后端服务器

**终端 1（后端）：**
```bash
cd server
npm run dev
```

看到以下输出表示成功：
```
🚀 Backend server running on http://localhost:8787
📡 Health check: http://localhost:8787/api/health
```

### 步骤 4：启动前端开发服务器

**终端 2（前端）：**
```bash
# 在项目根目录
npm run dev
```

前端将在 `http://localhost:3000` 启动。

### 步骤 5：验证

1. 访问 `http://localhost:8787/api/health`，应返回 `{"ok":true}`
2. 在前端应用中测试 AI 功能，确认可以正常调用

---

## 🔧 常见报错排查清单

### 1. 401 Unauthorized / 403 Forbidden

**症状：** 后端返回 401 或 403 错误

**可能原因：**
- API Key 无效或过期
- API Key 格式错误（缺少 Bearer 前缀等）
- API Key 没有访问对应模型的权限

**排查步骤：**
1. 检查 `server/.env` 中的 `ARK_API_KEY` 是否正确
2. 确认 API Key 在火山引擎控制台中有效
3. 检查 API Key 是否有足够的配额
4. 查看后端日志中的错误详情

**解决方案：**
```bash
# 重新生成 API Key 并更新 .env
# 确认 API Key 有访问权限
```

---

### 2. 模型 ID 错误

**症状：** 返回 "model not found" 或类似错误

**可能原因：**
- 模型 ID 配置错误
- 模型不存在或已下线
- 模型 ID 格式不正确

**排查步骤：**
1. 检查 `server/.env` 中的 `ARK_CHAT_MODEL` 和 `ARK_IMAGE_MODEL`
2. 在火山引擎控制台确认模型 ID
3. 查看 Ark API 文档确认正确的模型 ID 格式

**解决方案：**
```bash
# 更新 .env 中的模型 ID
# 参考火山引擎文档：https://www.volcengine.com/docs/82379
```

---

### 3. CORS 错误

**症状：** 浏览器控制台显示 CORS 相关错误

**可能原因：**
- 后端未启动
- 代理配置错误
- CORS 配置不正确

**排查步骤：**
1. 确认后端服务器正在运行（访问 `http://localhost:8787/api/health`）
2. 检查 `vite.config.ts` 中的代理配置
3. 确认前端运行在 `http://localhost:3000`
4. 检查后端 `src/index.ts` 中的 CORS 配置

**解决方案：**
```typescript
// 确保 vite.config.ts 中有代理配置
proxy: {
  '/api': {
    target: 'http://localhost:8787',
    changeOrigin: true,
  }
}

// 确保后端 CORS 配置正确
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

---

### 4. 返回字段不匹配

**症状：** 前端无法获取数据，但后端返回了响应

**可能原因：**
- Ark API 返回格式与预期不符
- API 版本更新导致字段变化
- 响应结构不同

**排查步骤：**
1. 查看后端返回的 `raw` 字段了解实际结构
2. 检查 Ark API 文档确认返回格式
3. 在浏览器 Network 面板查看实际响应

**解决方案：**
```typescript
// 查看 raw 字段
const data = await response.json();
console.log('Raw response:', data.raw);

// 根据实际返回调整字段提取逻辑
// 例如：responseData.choices?.[0]?.message?.content
// 可能需要改为：responseData.result?.text
```

---

### 5. 请求体大小限制

**症状：** 上传大图片时返回 413 Payload Too Large

**可能原因：**
- Express body parser 限制太小
- base64 图片过大

**排查步骤：**
1. 检查 `server/src/index.ts` 中的 `limit` 设置
2. 计算 base64 图片大小

**解决方案：**
```typescript
// 增加限制（当前为 20mb）
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
```

---

### 6. 端口被占用

**症状：** 后端启动失败，提示端口被占用

**排查步骤：**
```bash
# 查找占用 8787 端口的进程
lsof -i :8787

# 或使用其他端口
# 修改 .env 中的 PORT=8788
# 同时更新 vite.config.ts 中的代理目标端口
```

---

### 7. TypeScript 编译错误

**症状：** `npm run build` 失败

**排查步骤：**
1. 检查 Node.js 版本（需要 >= 18.0.0）
2. 确认所有依赖已安装
3. 检查 TypeScript 配置

**解决方案：**
```bash
# 检查 Node.js 版本
node --version

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 类型检查
npm run type-check
```

---

## 📚 技术细节

### Node.js 版本要求

- **最低版本：** Node.js 18.0.0
- **原因：** 使用原生 `fetch` API（Node.js 18+ 内置）

如果使用 Node.js < 18，需要安装 `node-fetch`：
```bash
npm install node-fetch@2
```

并在代码中导入：
```typescript
import fetch from 'node-fetch';
```

### 环境变量管理

- 使用 `dotenv` 加载 `.env` 文件
- `.env` 文件不应提交到 Git（已在 `.gitignore` 中）
- `.env.example` 作为配置模板

### 错误处理策略

1. **统一错误处理中间件：** 捕获所有未处理的错误
2. **Ark API 错误转发：** 将 Ark API 的错误信息原样返回给前端
3. **默认值策略：** `analyzeClothing` 在出错时返回默认值，防止批量上传崩溃

### 安全性考虑

1. **API Key 隐藏：** 所有密钥存储在服务器端 `.env` 文件
2. **CORS 限制：** 仅允许 `http://localhost:3000` 访问
3. **请求验证：** 所有路由都验证请求体格式

---

## 🎯 下一步

1. **生产环境部署：**
   - 使用 PM2 或 systemd 管理后端进程
   - 配置 Nginx 反向代理
   - 使用环境变量管理生产配置

2. **功能扩展：**
   - 添加请求日志
   - 实现请求限流
   - 添加 API 认证（如需要）

3. **监控与调试：**
   - 集成日志系统（如 Winston）
   - 添加健康检查端点
   - 实现错误追踪

---

## 📞 支持

如有问题，请检查：
1. 后端日志输出
2. 浏览器 Network 面板
3. 火山引擎 API 文档

