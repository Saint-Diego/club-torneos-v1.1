# syntax=docker/dockerfile:1.7
# Contexto de construcción: raíz del monorepo.  docker build -f frontend/Dockerfile .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci -w frontend; else npm install -w frontend; fi
COPY frontend ./frontend
# Vacío = mismo origen: nginx reenvía /api y /socket.io al backend (una sola imagen para todos los entornos).
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w frontend

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
ENV BACKEND_HOST=backend \
    BACKEND_PORT=4000 \
    BACKEND_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER=BACKEND_
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
