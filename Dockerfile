# Postgres MCP Server - Docker Image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/build ./build

# Create logs directory
RUN mkdir -p /app/logs && \
    chown -R node:node /app/logs

# Run as non-root user
USER node

# Environment variables (override these when running)
ENV DATABASE_URL="" \
    LOG_LEVEL="info" \
    QUERY_TIMEOUT="30000"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "process.exit(0)"

# Entry point
ENTRYPOINT ["node", "build/index.js"]

# Labels
LABEL org.opencontainers.image.title="Postgres MCP Server" \
      org.opencontainers.image.description="Read-only PostgreSQL analysis MCP server for AI assistants" \
      org.opencontainers.image.source="https://github.com/blankbrackets/postgres-mcp" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="1.0.0"

