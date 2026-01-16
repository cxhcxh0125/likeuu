# Nginx 快速配置指南

## 系统检测

根据你的系统类型，使用相应的配置方法：

### CentOS/RHEL 系统（最常见）

```bash
# 1. 检查 Nginx 是否安装
nginx -v

# 如果未安装，安装 Nginx
sudo yum install nginx -y
# 或
sudo dnf install nginx -y

# 2. 创建配置文件
sudo nano /etc/nginx/conf.d/likeuu.conf
```

将以下内容粘贴到文件中：

```nginx
server {
    listen 80;
    server_name 8.152.199.57;

    location / {
        root /srv/likeuu/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
}
```

```bash
# 3. 测试配置
sudo nginx -t

# 4. 启动并设置开机自启（如果未启动）
sudo systemctl start nginx
sudo systemctl enable nginx

# 5. 重启 Nginx
sudo systemctl restart nginx
```

### Ubuntu/Debian 系统

```bash
# 1. 检查 Nginx 是否安装
nginx -v

# 如果未安装，安装 Nginx
sudo apt update
sudo apt install nginx -y

# 2. 创建配置文件
sudo nano /etc/nginx/sites-available/likeuu
```

将配置内容粘贴到文件中（同上）。

```bash
# 3. 创建软链接
sudo ln -s /etc/nginx/sites-available/likeuu /etc/nginx/sites-enabled/

# 4. 测试配置
sudo nginx -t

# 5. 重启 Nginx
sudo systemctl restart nginx
```

## 验证

配置完成后，验证是否正常工作：

```bash
# 测试健康检查
curl http://8.152.199.57/api/health

# 测试聊天接口
curl -X POST http://8.152.199.57/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

## 故障排查

### 1. Nginx 未安装

```bash
# CentOS/RHEL
sudo yum install nginx -y

# Ubuntu/Debian
sudo apt update && sudo apt install nginx -y
```

### 2. 配置文件语法错误

```bash
# 测试配置
sudo nginx -t

# 查看详细错误信息
sudo nginx -T
```

### 3. 端口被占用

```bash
# 检查 80 端口是否被占用
sudo netstat -tlnp | grep :80
# 或
sudo ss -tlnp | grep :80

# 如果被占用，可以修改配置文件中的端口
# listen 8080;  # 改为其他端口
```

### 4. 权限问题

```bash
# 确保 Nginx 可以访问前端文件目录
sudo chmod -R 755 /srv/likeuu/dist

# 检查 Nginx 用户
ps aux | grep nginx
# 通常是 nginx 用户，确保该用户有读取权限
```

### 5. 查看 Nginx 错误日志

```bash
# CentOS/RHEL
sudo tail -f /var/log/nginx/error.log

# Ubuntu/Debian
sudo tail -f /var/log/nginx/error.log
```

## 防火墙配置

如果使用防火墙，需要开放 80 端口：

```bash
# firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload

# ufw (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw reload

# iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
```

## 完整示例脚本（CentOS/RHEL）

```bash
#!/bin/bash
# 快速配置 Nginx（CentOS/RHEL）

# 检查并安装 Nginx
if ! command -v nginx &> /dev/null; then
    echo "安装 Nginx..."
    sudo yum install nginx -y
fi

# 创建配置文件
sudo tee /etc/nginx/conf.d/likeuu.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name 8.152.199.57;

    location / {
        root /srv/likeuu/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
}
EOF

# 测试配置
if sudo nginx -t; then
    echo "配置测试通过，重启 Nginx..."
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    echo "Nginx 配置完成！"
else
    echo "配置测试失败，请检查配置文件"
    exit 1
fi
```
