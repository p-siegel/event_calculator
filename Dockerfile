FROM node:18-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy application files
COPY . .

# Create directory for database with proper permissions
RUN mkdir -p /app/data/db && \
    chmod -R 777 /app && \
    chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3002

# Set environment variable
ENV NODE_ENV=production
ENV PORT=3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3002/api/check-auth || exit 1

# Start the application
CMD ["node", "server.js"]

