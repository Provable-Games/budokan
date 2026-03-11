FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD npm run check-dna && npm run start -- --indexer=budokan
