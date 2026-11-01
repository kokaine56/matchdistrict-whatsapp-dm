# Use lightweight Node.js LTS image
FROM node:20-bookworm-slim

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package manifests first for efficient caching
COPY package*.json ./

# Install build tools for native dependencies as a fallback
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code and configuration files
COPY src/ ./src/
COPY public/ ./public/
COPY config.json ./
COPY recipients.csv ./
COPY sent-log.json ./

# Create uploads directory for publicly served media
RUN mkdir -p uploads

# Expose default port (Render will override via PORT env var)
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
