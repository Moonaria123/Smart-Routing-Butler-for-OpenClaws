# Dashboard 控制台——多阶段构建（Next.js 15 standalone）
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma/ ./prisma/

RUN npm ci
RUN npx prisma generate

# ---- 构建 ----
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 保证 public 存在（部分 Next 项目无此目录，COPY 会报错）
RUN mkdir -p /app/public

ENV NEXT_TELEMETRY_DISABLED=1
# Better Auth：构建期占位密钥与基址，消除 next build 日志噪声；运行态由 compose env_file 覆盖（ISSUE-V5-15）
ENV BETTER_AUTH_SECRET=docker-build-only-placeholder-not-for-production-min-32b
ENV BETTER_AUTH_URL=http://127.0.0.1:3000
ENV NEXT_PUBLIC_BETTER_AUTH_URL=http://127.0.0.1:3000
RUN npm run build

# ---- 运行时 ----
FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

RUN npm install -g prisma@6

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
