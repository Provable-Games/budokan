import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;
const VOYAGER_API_KEY = process.env.VOYAGER_API_KEY;
const VOYAGER_API_BASE_URL = process.env.VOYAGER_API_BASE_URL || 'https://api.voyager.online/beta';

// Allowed origins for CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(origin => origin.trim());

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!VOYAGER_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint for Voyager NFT API
app.get('/api/voyager/nft-items', async (req, res) => {
  try {
    if (!VOYAGER_API_KEY) {
      return res.status(500).json({
        error: 'Voyager API key not configured on server'
      });
    }

    // Build query string from request parameters
    const queryParams = new URLSearchParams();

    // Forward allowed query parameters
    const allowedParams = ['contract_address', 'owner_address', 'limit', 'page'];
    allowedParams.forEach(param => {
      if (req.query[param]) {
        queryParams.append(param, req.query[param]);
      }
    });

    const url = `${VOYAGER_API_BASE_URL}/nft-items?${queryParams.toString()}`;

    // Make request to Voyager API
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': VOYAGER_API_KEY,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Voyager API error: ${response.status} ${response.statusText}`, errorText);
      return res.status(response.status).json({
        error: `Voyager API error: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Internal proxy error',
      message: error.message
    });
  }
});

// Handle pagination requests (when next URL is provided)
app.get('/api/voyager/*', async (req, res) => {
  try {
    if (!VOYAGER_API_KEY) {
      return res.status(500).json({
        error: 'Voyager API key not configured on server'
      });
    }

    // Extract the path after /api/voyager/
    const voyagerPath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const url = `${VOYAGER_API_BASE_URL}/${voyagerPath}${queryString ? '?' + queryString : ''}`;

    // Make request to Voyager API
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': VOYAGER_API_KEY,
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Voyager API error: ${response.status} ${response.statusText}`, errorText);
      return res.status(response.status).json({
        error: `Voyager API error: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Internal proxy error',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Voyager API proxy running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Voyager API key configured: ${!!VOYAGER_API_KEY}`);
});
