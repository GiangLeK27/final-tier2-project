# Final Project Tier 2 - Production Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app

COPY app/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY app/package*.json ./
COPY app/src ./src
COPY app/scripts ./scripts

# Remove package managers from runtime image to reduce attack surface.
# The app runs with node directly, so npm/yarn/corepack are not required at runtime.
RUN rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /opt/yarn* \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]