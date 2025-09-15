# Dev Dockerfile for CRA frontend
FROM node:18-alpine

WORKDIR /app

# Install deps first for better caching
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# Expose dev server port
EXPOSE 3000

# Use react-scripts dev server
CMD ["npm", "start"]

