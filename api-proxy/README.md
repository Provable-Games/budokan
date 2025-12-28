# Budokan API Proxy

A simple Express-based proxy service that protects your Voyager API key by handling API requests server-side.

## Why This Proxy?

The Voyager API requires an API key for authentication. Exposing this key in your frontend code is a security risk as anyone can inspect your browser and extract it. This proxy service:

- Keeps your API key secure on the server
- Acts as a middleware between your frontend and Voyager API
- Adds the API key to requests server-side
- Returns responses to your frontend

## Features

- Simple Express server with CORS support
- Proxies Voyager NFT API requests
- Handles pagination automatically
- Health check endpoint
- Configurable CORS origins
- Ready for Railway deployment

## Deployment to Railway

### Prerequisites

1. A Railway account (sign up at [railway.app](https://railway.app))
2. Your Voyager API key

### Step 1: Install Railway CLI (Optional)

```bash
npm install -g @railway/cli
railway login
```

Or use the Railway web dashboard instead.

### Step 2: Deploy via Railway CLI

From the `api-proxy` directory:

```bash
# Login to Railway
railway login

# Initialize new project
railway init

# Add environment variables
railway variables --set VOYAGER_API_KEY=your_actual_api_key_here
railway variables --set ALLOWED_ORIGINS=https://yourdomain.com

# Deploy
railway up
```

### Step 3: Deploy via Railway Dashboard

1. Go to [railway.app](https://railway.app) and create a new project
2. Choose "Deploy from GitHub repo" or "Empty Project"
3. If using GitHub:
   - Connect your repository
   - Set the root directory to `/budokan/api-proxy`
4. If using Empty Project:
   - Use "Deploy from Dockerfile"
   - Upload the api-proxy directory contents
5. Add environment variables:
   - `VOYAGER_API_KEY`: Your Voyager API key
   - `ALLOWED_ORIGINS`: Your frontend URL (e.g., `https://yourdomain.com` or `*` for development)
6. Railway will automatically detect the Dockerfile and deploy

### Step 4: Get Your Deployment URL

After deployment, Railway will provide you with a URL like:
```
https://your-service-name.up.railway.app
```

## Environment Variables

Set these in Railway's dashboard or via CLI:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VOYAGER_API_KEY` | Yes | Your Voyager API key | `voy_abc123...` |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed origins for CORS | `https://yourdomain.com,https://app.yourdomain.com` |
| `VOYAGER_API_BASE_URL` | No | Voyager API base URL | `https://api.voyager.online/beta` |
| `PORT` | No | Port (Railway sets automatically) | `3001` |

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "hasApiKey": true,
  "timestamp": "2025-12-28T10:30:00.000Z"
}
```

### NFT Items

```
GET /api/voyager/nft-items?contract_address=0x...&owner_address=0x...&limit=100
```

Query Parameters:
- `contract_address` (required): NFT contract address
- `owner_address` (optional): Owner wallet address
- `limit` (optional): Number of items per page (default: 100)
- `page` (optional): Page number for pagination

### Pagination

The proxy automatically handles Voyager's pagination links:

```
GET /api/voyager/nft-items?page=2&...
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
# Edit .env and add your API key
```

3. Run the server:
```bash
npm start

# Or with auto-reload:
npm run dev
```

4. Test the health endpoint:
```bash
curl http://localhost:3001/health
```

## Frontend Integration

Update your frontend to use the proxy URL instead of calling Voyager directly.

Before (direct API call):
```javascript
const response = await fetch(
  `https://api.voyager.online/beta/nft-items?contract_address=${address}`,
  {
    headers: {
      'x-api-key': VOYAGER_API_KEY, // EXPOSED!
    }
  }
);
```

After (using proxy):
```javascript
const response = await fetch(
  `https://your-proxy.up.railway.app/api/voyager/nft-items?contract_address=${address}`
);
```

See the frontend update instructions in the main README.

## Security Notes

- Never commit your `.env` file
- Set `ALLOWED_ORIGINS` to your actual domain in production
- Monitor your Railway usage and set up billing alerts
- Rotate your Voyager API key periodically

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:
1. Check that your frontend URL is in `ALLOWED_ORIGINS`
2. Use `*` for development (not recommended for production)
3. Ensure there are no trailing slashes in the origin URLs

### API Key Not Working

1. Check the health endpoint: `/health`
2. Verify `hasApiKey: true` in the response
3. Double-check your Voyager API key in Railway dashboard
4. Ensure no extra spaces in the environment variable

### Railway Deployment Issues

1. Check Railway logs for errors
2. Verify Dockerfile is being detected
3. Ensure all environment variables are set
4. Check that PORT is not hardcoded (Railway sets it automatically)

## License

MIT
