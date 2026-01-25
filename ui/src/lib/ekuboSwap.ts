/**
 * Ekubo DEX swap utilities for token swaps on Starknet
 * Adapted from death-mountain implementation
 */

import { num } from "starknet";

// =============================================================================
// Types
// =============================================================================

export interface SwapQuote {
  priceImpact: number;
  total: string;
  splits: SwapSplit[];
}

export interface SwapSplit {
  amount_specified: string;
  route: RouteNode[];
}

export interface RouteNode {
  pool_key: {
    token0: string;
    token1: string;
    fee: string;
    tick_spacing: string;
    extension: string;
  };
  sqrt_ratio_limit: string;
  skip_ahead: string;
}

export interface SwapCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

// =============================================================================
// Constants
// =============================================================================

// Ekubo Router contract on mainnet
export const EKUBO_ROUTER_ADDRESS = "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e";

// Chain ID for mainnet (decimal format for API)
const CHAIN_ID_DECIMAL = "23448594291968334";

// Ekubo API base URL
const EKUBO_API_BASE = "https://prod-api-quoter.ekubo.org";

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get a swap quote from Ekubo
 * @param amount Amount in smallest units (e.g., wei)
 * @param fromToken Source token address
 * @param toToken Destination token address
 */
export async function getSwapQuote(
  amount: string,
  fromToken: string,
  toToken: string
): Promise<SwapQuote | null> {
  try {
    const url = `${EKUBO_API_BASE}/${CHAIN_ID_DECIMAL}/${amount}/${fromToken}/${toToken}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Ekubo quote failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    return {
      priceImpact: data.price_impact || 0,
      total: data.total_calculated || "0",
      splits: data.splits || [],
    };
  } catch (error) {
    console.error("Failed to get Ekubo quote:", error);
    return null;
  }
}

/**
 * Get the expected output amount for a swap
 * @param amount Input amount in smallest units
 * @param fromToken Source token address
 * @param toToken Destination token address
 */
export async function getExpectedOutput(
  amount: string,
  fromToken: string,
  toToken: string
): Promise<{ output: string; priceImpact: number } | null> {
  const quote = await getSwapQuote(amount, fromToken, toToken);
  if (!quote) return null;

  // Total is negative for exact input swaps (represents output)
  const total = BigInt(quote.total);
  const output = total < 0n ? (-total).toString() : total.toString();

  return {
    output,
    priceImpact: quote.priceImpact,
  };
}

/**
 * Get the required input amount to receive a specific output
 * Uses exact output swap quote
 */
export async function getRequiredInput(
  desiredOutput: string,
  fromToken: string,
  toToken: string
): Promise<{ input: string; priceImpact: number } | null> {
  // For exact output, we query with negative amount
  const negativeAmount = `-${desiredOutput}`;
  const quote = await getSwapQuote(negativeAmount, toToken, fromToken);
  if (!quote) return null;

  const total = BigInt(quote.total);
  const input = total < 0n ? (-total).toString() : total.toString();

  return {
    input,
    priceImpact: quote.priceImpact,
  };
}

// =============================================================================
// Call Generation
// =============================================================================

/**
 * Generate swap calls for Ekubo router
 * @param fromToken Token being sold
 * @param toToken Token being bought
 * @param amount Amount of fromToken to sell (in smallest units)
 * @param minOutput Minimum output amount (slippage protection)
 * @param quote The swap quote from getSwapQuote
 */
export function generateSwapCalls(
  fromToken: string,
  toToken: string,
  amount: string,
  minOutput: string,
  quote: SwapQuote
): SwapCall[] {
  if (!quote.splits || quote.splits.length === 0) {
    return [];
  }

  // Add 1% buffer to input amount
  const amountWithBuffer = (BigInt(amount) * 101n / 100n).toString();

  // Transfer tokens to router
  const transferCall: SwapCall = {
    contractAddress: fromToken,
    entrypoint: "transfer",
    calldata: [EKUBO_ROUTER_ADDRESS, num.toHex(amountWithBuffer), "0x0"],
  };

  // Clear any remaining fromToken after swap
  const clearFromCall: SwapCall = {
    contractAddress: EKUBO_ROUTER_ADDRESS,
    entrypoint: "clear",
    calldata: [fromToken],
  };

  // Clear minimum toToken (slippage protection)
  const clearMinCall: SwapCall = {
    contractAddress: EKUBO_ROUTER_ADDRESS,
    entrypoint: "clear_minimum",
    calldata: [toToken, num.toHex(minOutput), "0x0"],
  };

  let swapCalls: SwapCall[];

  if (quote.splits.length === 1) {
    // Single route swap
    const split = quote.splits[0];
    swapCalls = [generateMultihopSwapCall(split, toToken)];
  } else {
    // Multi-route swap
    swapCalls = [generateMultiMultihopSwapCall(quote.splits, toToken)];
  }

  return [transferCall, ...swapCalls, clearMinCall, clearFromCall];
}

/**
 * Generate a single multihop swap call
 */
function generateMultihopSwapCall(split: SwapSplit, startToken: string): SwapCall {
  const routeData = encodeRoute(split.route, startToken);
  const amountSpec = BigInt(split.amount_specified);
  const absAmount = amountSpec < 0n ? -amountSpec : amountSpec;

  return {
    contractAddress: EKUBO_ROUTER_ADDRESS,
    entrypoint: "multihop_swap",
    calldata: [
      num.toHex(split.route.length),
      ...routeData,
      startToken,
      num.toHex(absAmount),
      "0x1", // is_token1
    ],
  };
}

/**
 * Generate a multi-multihop swap call for split routes
 */
function generateMultiMultihopSwapCall(splits: SwapSplit[], startToken: string): SwapCall {
  const encodedSplits = splits.reduce((memo: string[], split) => {
    const routeData = encodeRoute(split.route, startToken);
    const amountSpec = BigInt(split.amount_specified);
    const absAmount = amountSpec < 0n ? -amountSpec : amountSpec;

    return memo.concat([
      num.toHex(split.route.length),
      ...routeData,
      startToken,
      num.toHex(absAmount),
      "0x1",
    ]);
  }, []);

  return {
    contractAddress: EKUBO_ROUTER_ADDRESS,
    entrypoint: "multi_multihop_swap",
    calldata: [num.toHex(splits.length), ...encodedSplits],
  };
}

/**
 * Encode a route for the swap call
 */
function encodeRoute(route: RouteNode[], startToken: string): string[] {
  const result = route.reduce(
    (memo: { token: string; encoded: string[] }, node) => {
      const isToken1 = BigInt(memo.token) === BigInt(node.pool_key.token1);
      const nextToken = isToken1 ? node.pool_key.token0 : node.pool_key.token1;

      const sqrtRatioLimit = BigInt(node.sqrt_ratio_limit);

      return {
        token: nextToken,
        encoded: memo.encoded.concat([
          node.pool_key.token0,
          node.pool_key.token1,
          node.pool_key.fee,
          num.toHex(node.pool_key.tick_spacing),
          node.pool_key.extension,
          num.toHex(sqrtRatioLimit % 2n ** 128n),
          num.toHex(sqrtRatioLimit >> 128n),
          node.skip_ahead,
        ]),
      };
    },
    { token: startToken, encoded: [] }
  );

  return result.encoded;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate minimum output with slippage
 * @param expectedOutput Expected output amount
 * @param slippageBps Slippage in basis points (100 = 1%)
 */
export function calculateMinOutput(expectedOutput: string, slippageBps: number = 100): string {
  const output = BigInt(expectedOutput);
  const minOutput = (output * BigInt(10000 - slippageBps)) / 10000n;
  return minOutput.toString();
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  const value = Number(amount) / 10 ** decimals;
  if (value < 0.000001) return "< 0.000001";
  if (value < 1) return value.toFixed(6);
  if (value < 1000) return value.toFixed(4);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
