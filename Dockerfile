# Build stage
FROM node:24-alpine AS builder

# Add build arguments for metadata
ARG VERSION=unknown
ARG BUILD_DATE=unknown

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY ./src ./src
COPY ./tsconfig.json ./tsconfig.json

# Build the application
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# Add build arguments for metadata
ARG VERSION=unknown
ARG BUILD_DATE=unknown

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Use existing node user from base image

WORKDIR /app

# Copy built application and production dependencies
COPY --from=builder --chown=node:node /app/package*.json ./

# Install production dependencies only
RUN npm ci --ignore-scripts --omit=dev && \
    npm cache clean --force

# Copy built application
COPY --from=builder --chown=node:node /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production

# Add metadata labels
LABEL version=$VERSION \
      build-date=$BUILD_DATE \
      description="Brave Search MCP Server" \
      org.opencontainers.image.source="https://github.com/memenow/brave-search-mcp-server"

# Switch to non-root user
USER node

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/ping', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run the application
CMD ["node", "dist/index.js"]
