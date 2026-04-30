# Final Project Tier 2 - Production Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app

COPY app/package*.json ./
RUN npm install

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY app/package*.json ./
COPY app/src ./src
COPY app/scripts ./scripts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["npm", "start"]
