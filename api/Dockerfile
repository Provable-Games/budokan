FROM node:22-alpine

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./

# Copy indexer schema (API depends on it via @budokan/schema path alias)
COPY indexer/package.json indexer/package.json
COPY indexer/src/lib/schema.ts indexer/src/lib/schema.ts

# Copy API package
COPY api/package.json api/package.json

# Install dependencies
RUN npm ci --workspace=api

# Copy API source
COPY api/ api/

WORKDIR /app/api

EXPOSE 3003

CMD ["npx", "tsx", "src/index.ts"]
