# 生产环境部署指南

## 问题诊断

如果前端访问 `http://8.152.199.57/api/chat` 返回 404，但 `curl http://localhost:8787/api/chat` 正常工作，说明问题在于：

1. **反向代理未配置**：Nginx 或其他反向代理没有正确配置 `/api` 路由
2. **后端监听地址**：后端可能只监听 `127.0.0.1:8787`，外部无法直接访问

## 解决方案

### 方案 1: 配置 Nginx 反向代理（推荐）

#### 1. 检查后端服务器状态

```bash
# 确认后端在运行
curl http://localhost:8787/api/health

# 确认监听地址（应该监听 127.0.0.1:8787）
netstat -tlnp | grep 8787
# 或
ss -tlnp | grep 8787
```

#### 2. 配置 Nginx

**CentOS/RHEL 系统**（推荐，适用于大多数服务器）：

```bash
# 创建配置文件
sudo nano /etc/nginx/conf.d/likeuu.conf
```

**Ubuntu/Debian 系统**：

```bash
# 创建配置文件
sudo nano /etc/nginx/sites-available/likeuu
```

使用以下配置（参考 `nginx.conf.example`）：

```nginx
server {
    listen 80;
    server_name 8.152.199.57;  # 你的服务器 IP 或域名

    # 前端静态文件
    location / {
        root /path/to/likeuu/dist;  # 你的前端构建目录
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理 - 关键！
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 支持大文件上传
        client_max_body_size 20M;
    }
}
```

**重要**：`proxy_pass` 后面的 URL 可以有或没有尾随斜杠，但行为不同：
- `proxy_pass http://127.0.0.1:8787;` - 会将 `/api/chat` 转发为 `http://127.0.0.1:8787/api/chat`
- `proxy_pass http://127.0.0.1:8787/;` - 会将 `/api/chat` 转发为 `http://127.0.0.1:8787/chat`（去掉 `/api` 前缀）

根据我们的配置，应该使用 `http://127.0.0.1:8787;`（不带尾随斜杠）。

#### 3. 启用配置并重启 Nginx

**CentOS/RHEL 系统**：

```bash
# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
# 或
sudo service nginx restart
```

**Ubuntu/Debian 系统**：

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/likeuu /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

#### 4. 验证

```bash
# 测试健康检查
curl http://8.152.199.57/api/health

# 测试聊天接口
curl -X POST http://8.152.199.57/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

### 方案 2: 直接暴露后端端口（不推荐，仅用于测试）

如果暂时没有 Nginx，可以让后端监听所有接口：

**修改后端配置（仅测试用）：**

```typescript
// server/src/index.ts
const HOST = process.env.HOST ?? "0.0.0.0";  // 从 127.0.0.1 改为 0.0.0.0
```

然后重启后端：

```bash
pm2 restart likeuu-server
```

**注意**：这种方法不安全，不推荐用于生产环境，因为：
- 没有反向代理的保护
- 无法使用 HTTPS
- 无法处理静态文件
- 安全性较低

## 完整部署检查清单

### 后端部署

- [ ] 代码已编译：`cd server && npm run build`
- [ ] 环境变量已配置：`.env` 文件正确
- [ ] 后端服务运行：`pm2 list` 或 `systemctl status likeuu-server`
- [ ] 本地测试通过：`curl http://localhost:8787/api/health`

### 前端部署

- [ ] 前端已构建：`npm run build`
- [ ] 静态文件已部署到服务器
- [ ] 前端文件路径正确配置在 Nginx 中

### Nginx 配置

- [ ] Nginx 配置已创建
- [ ] `/api/` 路由正确代理到 `http://127.0.0.1:8787`
- [ ] 前端静态文件路径正确
- [ ] Nginx 配置测试通过：`sudo nginx -t`
- [ ] Nginx 已重启：`sudo systemctl restart nginx`

### 验证测试

- [ ] 健康检查：`curl http://8.152.199.57/api/health`
- [ ] 聊天接口：`curl -X POST http://8.152.199.57/api/chat ...`
- [ ] 前端页面可以正常访问
- [ ] 浏览器控制台无 404 错误

## 常见问题

### 1. Nginx 返回 502 Bad Gateway

**原因**：后端服务未运行或无法连接

**解决**：
```bash
# 检查后端是否运行
pm2 list
# 或
systemctl status likeuu-server

# 检查端口是否监听
netstat -tlnp | grep 8787

# 检查后端日志
pm2 logs likeuu-server
```

### 2. Nginx 返回 404 Not Found

**原因**：Nginx 配置中 `proxy_pass` 路径不正确

**解决**：
- 确认使用 `proxy_pass http://127.0.0.1:8787;`（不带尾随斜杠）
- 检查后端路由是否正确注册
- 查看 Nginx 错误日志：`sudo tail -f /var/log/nginx/error.log`

### 3. CORS 错误

**原因**：后端 CORS 配置只允许 `localhost:3000`

**解决**：修改后端 CORS 配置（如果需要允许生产域名）

### 4. 静态文件 404

**原因**：前端文件路径配置错误

**解决**：
- 检查 `root` 指令指向的路径是否正确
- 确认 `try_files` 指令包含 `/index.html`

## 相关文件

- `nginx.conf.example` - Nginx 配置示例
- `server/ecosystem.config.cjs` - PM2 配置
- `ROUTE_VERIFICATION.md` - 路由验证文档
