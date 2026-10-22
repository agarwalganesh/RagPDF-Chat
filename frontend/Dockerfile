# ── Frontend Dockerfile (multi-stage) ───────────────────────────────

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the production bundle
COPY . .
RUN npm run build

# ── Stage 2: Serve with Nginx ──────────────────────────────────────
FROM nginx:alpine

# Remove default Nginx site config
RUN rm /etc/nginx/conf.d/default.conf

# Use our custom Nginx config (SPA fallback + API reverse-proxy)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
