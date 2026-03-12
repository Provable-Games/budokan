FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD ["sh", "-c", "npm run check-dna && npm run start -- --indexer=budokan"]
