# Use lightweight Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package manifests first for efficient caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code and configuration files
COPY src/ ./src/
COPY recipients.csv ./
COPY sent-log.json ./

# Expose default port (Render will override via PORT env var)
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]

