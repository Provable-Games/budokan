FROM node:22-alpine

WORKDIR /app

# Copy package file and install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD ["sh", "-c", "npm run check-dna && npm run start -- --indexer=budokan"]
