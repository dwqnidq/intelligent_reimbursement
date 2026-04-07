FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ─── 生产镜像：用 Nginx 托管静态文件 ───
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx 配置：支持 SPA 路由 + 反向代理 /api
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
