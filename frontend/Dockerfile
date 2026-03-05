# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/sitescope.conf

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Non-root nginx (uses port 8080)
RUN addgroup -S sitescope && adduser -S sitescope -G sitescope \
    && chown -R sitescope:sitescope /usr/share/nginx/html \
    && chown -R sitescope:sitescope /var/cache/nginx \
    && chown -R sitescope:sitescope /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown sitescope:sitescope /var/run/nginx.pid

USER sitescope

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
