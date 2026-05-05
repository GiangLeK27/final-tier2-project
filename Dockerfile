# Final Project Tier 2 - Production Dockerfile

# Stage 1: deps
# Dùng node:22-alpine để cài dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package.json & package-lock.json
COPY app/package*.json ./

# Cài đặt dependencies (bỏ dev dependencies)
RUN npm ci --omit=dev

# Stage 2: runtime
# Tạo image runtime nhẹ, chỉ chạy app
FROM node:22-alpine AS runtime
WORKDIR /app

# Set môi trường production và port
ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules từ stage deps để tiết kiệm thời gian build
COPY --from=deps /app/node_modules ./node_modules

# Copy package.json (runtime) và source code + scripts
COPY app/package*.json ./
COPY app/src ./src
COPY app/scripts ./scripts

# Loại bỏ package managers không cần thiết để giảm bề mặt tấn công
# App chạy trực tiếp với node, không cần npm/yarn/corepack runtime
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /opt/yarn* \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg

# Expose port 3000 cho container
EXPOSE 3000

# Healthcheck: kiểm tra app có chạy không
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode===200?0:1)).on('error', ()=>process.exit(1))"

# Chạy app Node.js
CMD ["node", "src/server.js"]