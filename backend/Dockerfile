# =============================================================================
# PERSONAL FINANCE HUB - BACKEND DOCKERFILE
# Multi-stage build for optimal production image
# =============================================================================

# =============================================================================
# BASE STAGE - Common dependencies and setup
# =============================================================================
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set timezone
ENV TZ=UTC

# Create app directory and user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Set ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# =============================================================================
# DEPENDENCIES STAGE - Install all dependencies
# =============================================================================
FROM base AS dependencies

# Install all dependencies (including dev dependencies)
RUN npm ci --only=production=false && npm cache clean --force

# =============================================================================
# BUILD STAGE - Compile TypeScript
# =============================================================================
FROM dependencies AS build

# Copy source code
COPY --chown=nodejs:nodejs . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm ci --only=production && npm cache clean --force

# =============================================================================
# DEVELOPMENT STAGE - For development environment
# =============================================================================
FROM dependencies AS development

# Install development tools globally
USER root
RUN npm install -g nodemon tsx
USER nodejs

# Copy source code
COPY --chown=nodejs:nodejs . .

# Expose ports
EXPOSE 3333 9229

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3333/health || exit 1

# Start command with hot reload
CMD ["dumb-init", "npm", "run", "dev"]

# =============================================================================
# PRODUCTION STAGE - Optimized for production
# =============================================================================
FROM base AS production

# Copy built application and production dependencies from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/package.json ./

# Create logs directory
USER root
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs
USER nodejs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3333

# Expose port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3333/health || exit 1

# Start command
CMD ["dumb-init", "node", "dist/server.js"]

# =============================================================================
# SECURITY STAGE - Additional security hardening
# =============================================================================
FROM production AS secure

USER root

# Remove unnecessary packages and clean up
RUN apk del curl && \
    rm -rf /var/cache/apk/* && \
    rm -rf /tmp/* && \
    rm -rf /root/.npm

# Create non-root user for even more security
RUN addgroup -g 1002 -S appgroup && \
    adduser -S appuser -u 1002 -G appgroup

# Change ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Use minimal base image for maximum security
FROM gcr.io/distroless/nodejs20-debian12 AS distroless

# Copy application from secure stage
COPY --from=secure --chown=1002:1002 /app /app

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3333

# Expose port
EXPOSE 3333

# No shell, more secure
ENTRYPOINT ["node", "dist/server.js"]

# =============================================================================
# DEFAULT TARGET
# =============================================================================
# Default to production stage
FROM production AS default