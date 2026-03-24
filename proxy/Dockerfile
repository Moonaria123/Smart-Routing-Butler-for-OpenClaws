# Proxy 代理层——多阶段构建（Node.js 22 + TypeScript）
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY .npmrc ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- 运行时 ----
FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
COPY .npmrc ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "dist/index.js"]
