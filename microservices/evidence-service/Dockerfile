# Multi-stage build for Evidence Service
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Development stage
FROM base AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 evidence

# Copy built application
COPY --from=builder --chown=evidence:nodejs /app/dist ./dist
COPY --from=builder --chown=evidence:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=evidence:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/uploads /app/temp /app/logs
RUN chown -R evidence:nodejs /app/uploads /app/temp /app/logs

# Switch to non-root user
USER evidence

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD npm run health-check

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the application
CMD ["npm", "run", "start:prod"]