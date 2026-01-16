# 故障排除指南

## 常见错误及解决方案

### 1. IndexedDB VersionError

**错误信息：**
```
VersionError: The requested version (1) is less than the existing version (2)
```

**原因：**
浏览器中已存在更高版本的 IndexedDB 数据库。

**解决方案：**
- ✅ 已修复：代码已升级到版本 2 并添加了自动降级处理
- 如果问题仍然存在，可以在浏览器开发者工具中：
  1. 打开 Application/存储标签
  2. 找到 IndexedDB → `ULookFashionDB`
  3. 删除该数据库
  4. 刷新页面，数据库会重新创建

---

### 2. 401 Unauthorized - API Key 认证失败

**错误信息：**
```
the API key or AK/SK in the request is missing or invalid
```

**可能原因：**
1. `.env` 文件中没有设置 `ARK_API_KEY`
2. API Key 格式不正确
3. 认证方式不匹配

**解决方案：**

#### 步骤 1：检查 `.env` 文件
确保 `server/.env` 文件存在且包含：

```env
ARK_API_KEY=your_actual_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_CHAT_MODEL=doubao-seed-1-8-251228
ARK_IMAGE_MODEL=doubao-seedream-4-5-251128
```

#### 步骤 2：验证 API Key
- 确保 API Key 没有多余的空格或换行符
- 确保 API Key 完整且正确

#### 步骤 3：尝试不同的认证方式
火山引擎 Ark API 可能支持不同的认证格式。在 `server/.env` 中添加：

```env
# 尝试方式 1：Bearer Token（默认）
ARK_AUTH_TYPE=bearer

# 或者尝试方式 2：直接 API Key
ARK_AUTH_TYPE=direct

# 或者尝试方式 3：X-API-Key header
ARK_AUTH_TYPE=x-api-key
```

#### 步骤 4：重启服务器
修改 `.env` 后，必须重启后端服务器：

```bash
cd server
npm run dev
```

#### 步骤 5：检查服务器日志
查看服务器控制台输出，确认：
- API Key 是否被正确加载
- 使用的认证类型
- 错误详情

---

### 3. 环境变量未加载

**症状：**
- 所有 API 请求都失败
- 服务器返回 500 错误

**解决方案：**

1. **确认 `.env` 文件位置：**
   - 应该在 `server/.env`（不在项目根目录）

2. **检查 `.env` 文件格式：**
   ```env
   # 正确格式（无引号，无空格）
   ARK_API_KEY=actual_key_value
   
   # 错误格式
   ARK_API_KEY="actual_key_value"  # 不要加引号
   ARK_API_KEY = actual_key_value  # 等号前后不要有空格
   ```

3. **确认服务器启动：**
   ```bash
   cd server
   npm run dev
   ```
   应该看到：
   ```
   ===== ENV CHECK =====
   ARK_BASE_URL: https://ark.cn-beijing.volces.com/api/v3
   ARK_CHAT_MODEL: doubao-seed-1-8-251228
   ARK_IMAGE_MODEL: doubao-seedream-4-5-251128
   ARK_API_KEY exists? true length: XX
   =====================
   ```

---

### 4. CORS 错误

**错误信息：**
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

**解决方案：**
确保后端 `server/src/index.ts` 中已配置 CORS：

```typescript
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
```

---

### 5. 端口冲突

**症状：**
- 后端服务器启动失败
- 端口已被占用

**解决方案：**
1. 修改端口（在 `server/.env` 中）：
   ```env
   PORT=8788
   ```
2. 或关闭占用端口的进程

---

### 6. guidance_scale 参数错误

**错误信息：**
```
The parameter `guidance_scale` specified in the request is not valid: guidance_scale must be between 1.0 and 10.0
```

**原因：**
`guidance_scale` 参数值超出了 Ark API 允许的范围（1.0-10.0）。

**解决方案：**
- ✅ 已修复：代码已更新，所有 `guidance_scale` 值都在有效范围内
- 如果问题仍然存在，请清除浏览器缓存并刷新页面
- 确保使用的是最新版本的代码

---

## 调试技巧

### 检查后端环境变量

在 `server/src/index.ts` 中，启动时会打印环境变量检查：

```typescript
console.log("===== ENV CHECK =====");
console.log("ARK_BASE_URL:", process.env.ARK_BASE_URL);
console.log("ARK_CHAT_MODEL:", process.env.ARK_CHAT_MODEL);
console.log("ARK_IMAGE_MODEL:", process.env.ARK_IMAGE_MODEL);
console.log("ARK_API_KEY exists?", !!process.env.ARK_API_KEY, "length:", process.env.ARK_API_KEY?.length);
```

### 检查前端网络请求

1. 打开浏览器开发者工具（F12）
2. 切换到 Network 标签
3. 发送请求
4. 查看失败的请求：
   - 状态码
   - 请求头（特别是 Authorization）
   - 响应内容

### 检查后端日志

后端服务器控制台会输出详细错误信息，包括：
- 认证头格式
- API Key 长度
- API 响应详情

---

## 获取帮助

如果问题仍然存在，请提供：
1. 完整的错误信息（从浏览器控制台和服务器日志）
2. `.env` 文件配置（隐藏 API Key）
3. 使用的认证类型（`ARK_AUTH_TYPE`）
4. 浏览器和 Node.js 版本

