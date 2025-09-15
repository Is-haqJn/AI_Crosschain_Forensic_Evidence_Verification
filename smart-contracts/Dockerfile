# Multi-stage build for Smart Contracts
FROM node:22-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Install dependencies only when needed
FROM base AS deps
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
EXPOSE 8545
CMD ["npm", "run", "node"]

# Build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Compile contracts
RUN npm run compile

# Production stage
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 contracts

# Copy built artifacts
COPY --from=builder --chown=contracts:nodejs /app/artifacts ./artifacts
COPY --from=builder --chown=contracts:nodejs /app/cache ./cache
COPY --from=builder --chown=contracts:nodejs /app/contracts ./contracts
COPY --from=builder --chown=contracts:nodejs /app/scripts ./scripts
COPY --from=builder --chown=contracts:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=contracts:nodejs /app/package*.json ./
COPY --from=builder --chown=contracts:nodejs /app/hardhat.config.js ./

# Create deployments directory
RUN mkdir -p /app/deployments
RUN chown -R contracts:nodejs /app/deployments

# Switch to non-root user
USER contracts

# Set environment variables
ENV NODE_ENV=production

# Default command (can be overridden)
CMD ["npm", "run", "compile"]
