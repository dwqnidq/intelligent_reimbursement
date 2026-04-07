# 构建上下文为项目根目录（docker-compose 中配置）

# ─── 阶段1：构建前端 ───
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY intelligent_reimbursement_system/package*.json ./
RUN npm install

COPY intelligent_reimbursement_system .
RUN npm run build

# ─── 阶段2：构建后端 ───
FROM node:20-alpine AS backend-builder

WORKDIR /app

RUN npm install -g pnpm

COPY intelligent_reimbursement_system_server/package.json intelligent_reimbursement_system_server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY intelligent_reimbursement_system_server .
RUN pnpm build

# ─── 阶段3：生产镜像 ───
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY intelligent_reimbursement_system_server/package.json intelligent_reimbursement_system_server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /frontend/dist ./client

EXPOSE 3000

CMD ["node", "dist/main"]
