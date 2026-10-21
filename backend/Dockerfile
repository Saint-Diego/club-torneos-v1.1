# syntax=docker/dockerfile:1.7
# Contexto de construcción: raíz del monorepo.  docker build -f backend/Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci -w backend; else npm install -w backend; fi

FROM deps AS build
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
RUN npm run build -w backend

FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci -w backend --omit=dev; else npm install -w backend --omit=dev; fi

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app/backend
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --chown=node:node backend/package.json ./package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
