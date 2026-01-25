/**
 * NEAR Intents 1Click API integration for cross-chain payments
 * Enables users to pay tournament entry fees from any supported chain
 */

// =============================================================================
// Types
// =============================================================================

export type SwapStatus =
  | "PENDING_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number; // basis points (100 = 1%)
  originAsset: string; // format: "{chain}:{address}"
  depositType: "ORIGIN_CHAIN";
  destinationAsset: string; // format: "{chain}:{address}"
  amount: string; // in smallest units
  refundTo: string; // address on origin chain for refunds
  refundType: "ORIGIN_CHAIN";
  recipient: string; // Starknet address
  recipientType: "DESTINATION_CHAIN";
  deadline: string; // ISO datetime
}

export interface QuoteResponse {
  quoteId: string;
  depositAddress: string;
  depositAmount: string;
  depositAsset: string;
  destinationAmount: string;
  destinationAsset: string;
  expiresAt: string;
  minDepositAmount?: string;
  maxDepositAmount?: string;
}

export interface StatusResponse {
  status: SwapStatus;
  depositAddress: string;
  depositTxHash?: string;
  destinationTxHash?: string;
  refundTxHash?: string;
  errorMessage?: string;
  depositAmount?: string;
  destinationAmount?: string;
}

export interface SupportedToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
}

export interface SupportedChain {
  id: string;
  name: string;
  chainType: string;
  tokens: SupportedToken[];
}

// =============================================================================
// Supported Chains Configuration
// =============================================================================

export const SUPPORTED_CHAINS: Record<string, SupportedChain> = {
  ethereum: {
    id: "eth",
    name: "Ethereum",
    chainType: "evm",
    tokens: [
      {
        symbol: "ETH",
        name: "Ethereum",
        address: "native",
        decimals: 18,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
      {
        symbol: "USDT",
        name: "Tether USD",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
      },
    ],
  },
  base: {
    id: "base",
    name: "Base",
    chainType: "evm",
    tokens: [
      {
        symbol: "ETH",
        name: "Ethereum",
        address: "native",
        decimals: 18,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
      },
    ],
  },
  arbitrum: {
    id: "arb",
    name: "Arbitrum",
    chainType: "evm",
    tokens: [
      {
        symbol: "ETH",
        name: "Ethereum",
        address: "native",
        decimals: 18,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
      },
    ],
  },
  solana: {
    id: "sol",
    name: "Solana",
    chainType: "solana",
    tokens: [
      {
        symbol: "SOL",
        name: "Solana",
        address: "native",
        decimals: 9,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
      },
    ],
  },
  near: {
    id: "near",
    name: "NEAR",
    chainType: "near",
    tokens: [
      {
        symbol: "NEAR",
        name: "NEAR Protocol",
        address: "native",
        decimals: 24,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        decimals: 6,
      },
    ],
  },
};

// STRK token address on Starknet (the only token currently supported)
export const STARKNET_STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format an asset ID for the NEAR Intents API
 * @param chain - Chain identifier (e.g., "eth", "sol")
 * @param address - Token address or "native" for native tokens
 */
export function formatAssetId(chain: string, address: string): string {
  if (address === "native") {
    return `${chain}:native`;
  }
  return `${chain}:${address}`;
}

/**
 * Format Starknet asset ID for destination
 * @param address - Starknet token address
 */
export function formatStarknetAssetId(address: string): string {
  return `starknet:${address}`;
}

/**
 * Get chain display name from chain ID
 */
export function getChainName(chainId: string): string {
  const chain = Object.values(SUPPORTED_CHAINS).find((c) => c.id === chainId);
  return chain?.name ?? chainId;
}

/**
 * Get token by symbol from a chain
 */
export function getTokenBySymbol(
  chainId: string,
  symbol: string
): SupportedToken | undefined {
  const chain = Object.values(SUPPORTED_CHAINS).find((c) => c.id === chainId);
  return chain?.tokens.find((t) => t.symbol === symbol);
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE_URL = "https://1click.chaindefuser.com";
const API_TIMEOUT_MS = 15000;

/**
 * Get JWT token from environment
 */
function getJwtToken(): string | undefined {
  return import.meta.env.VITE_NEAR_INTENTS_JWT;
}

/**
 * Create headers for API requests
 */
function createHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const jwt = getJwtToken();
  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
  }

  return headers;
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get a quote for a cross-chain swap
 * @param request - Quote request parameters
 */
export async function getQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/v0/quote`,
    {
      method: "POST",
      headers: createHeaders(),
      body: JSON.stringify(request),
    },
    API_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Quote request failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Get the status of a swap by deposit address
 * @param depositAddress - The deposit address from the quote
 */
export async function getStatus(
  depositAddress: string
): Promise<StatusResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
    {
      method: "GET",
      headers: createHeaders(),
    },
    API_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status request failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Submit a deposit transaction hash to speed up processing
 * @param depositAddress - The deposit address from the quote
 * @param txHash - The transaction hash of the deposit
 */
export async function submitDeposit(
  depositAddress: string,
  txHash: string
): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/v0/deposit`,
    {
      method: "POST",
      headers: createHeaders(),
      body: JSON.stringify({
        depositAddress,
        txHash,
      }),
    },
    API_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Deposit submission failed: ${response.status} - ${errorText}`
    );
  }
}

/**
 * Check if a token address is STRK (the only currently supported token on Starknet)
 */
export function isStrkToken(tokenAddress: string): boolean {
  // Normalize addresses for comparison (remove leading zeros, lowercase)
  const normalizeAddress = (addr: string) => {
    const hex = addr.toLowerCase().replace(/^0x0*/, "0x");
    return hex;
  };

  return (
    normalizeAddress(tokenAddress) === normalizeAddress(STARKNET_STRK_ADDRESS)
  );
}

/**
 * Create a quote request for tournament entry payment
 */
export function createTournamentEntryQuoteRequest(params: {
  sourceChain: string;
  sourceToken: SupportedToken;
  sourceAmount: string;
  refundAddress: string;
  recipientAddress: string;
  deadlineMinutes?: number;
}): QuoteRequest {
  const {
    sourceChain,
    sourceToken,
    sourceAmount,
    refundAddress,
    recipientAddress,
    deadlineMinutes = 30,
  } = params;

  const deadline = new Date(
    Date.now() + deadlineMinutes * 60 * 1000
  ).toISOString();

  return {
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100, // 1%
    originAsset: formatAssetId(sourceChain, sourceToken.address),
    depositType: "ORIGIN_CHAIN",
    destinationAsset: formatStarknetAssetId(STARKNET_STRK_ADDRESS),
    amount: sourceAmount,
    refundTo: refundAddress,
    refundType: "ORIGIN_CHAIN",
    recipient: recipientAddress,
    recipientType: "DESTINATION_CHAIN",
    deadline,
  };
}
