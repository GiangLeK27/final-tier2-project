# Final Project Tier 2 - Production Dockerfile

# Stage 1: deps
# Use node:22-alpine to install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package.json & package-lock.json
COPY app/package*.json ./

# Install dependencies (omit dev dependencies)
RUN npm ci --omit=dev

# Stage 2: runtime
# Lightweight runtime image to run the app
FROM node:22-alpine AS runtime
WORKDIR /app

# Set production environment and port
ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules from deps stage to save build time
COPY --from=deps /app/node_modules ./node_modules

# Copy package.json, source code, and scripts
COPY app/package*.json ./
COPY app/src ./src
COPY app/scripts ./scripts

# Remove unnecessary package managers to reduce attack surface
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /opt/yarn* \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg

# Expose port 3000
EXPOSE 3000

# Healthcheck to verify app is running
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode===200?0:1)).on('error', ()=>process.exit(1))"


CMD ["node", "src/server.js"]