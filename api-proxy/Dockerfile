FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./

# Expose port (Railway will set PORT env var)
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
