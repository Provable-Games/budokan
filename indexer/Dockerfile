FROM node:22-alpine

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy indexer package.json
COPY indexer/package.json indexer/package.json

# Install dependencies
RUN npm ci --workspace=indexer

# Copy indexer source
COPY indexer/ indexer/

WORKDIR /app/indexer

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD npm run check-dna && npm run start -- --indexer=budokan
