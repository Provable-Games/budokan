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
    fee: string;  // Decimal string from API, converted to hex for calldata
    tick_spacing: number;
    extension: string;
  };
  sqrt_ratio_limit: string;
  skip_ahead: number;  // Number from API, converted to hex for calldata
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
 * Returns the quote as well for generating swap calls
 *
 * Note: Ekubo API expects (destinationToken, sourceToken) order with negative amount
 * to query "I want X of destinationToken, how much sourceToken do I need?"
 */
export async function getRequiredInput(
  desiredOutput: string,
  fromToken: string,
  toToken: string
): Promise<{ input: string; priceImpact: number; quote: SwapQuote } | null> {
  // Query with negative amount and (toToken, fromToken) order
  // This asks: "I want desiredOutput of toToken, how much fromToken do I need?"
  const negativeAmount = `-${desiredOutput}`;
  const quote = await getSwapQuote(negativeAmount, toToken, fromToken);
  if (!quote || !quote.splits || quote.splits.length === 0) return null;

  // total_calculated is negative (the amount of fromToken needed)
  // Negate to get positive input amount
  const total = BigInt(quote.total);
  const input = total < 0n ? (-total).toString() : total.toString();

  return {
    input,
    priceImpact: quote.priceImpact,
    quote,
  };
}

// =============================================================================
// Call Generation
// =============================================================================

/**
 * Generate swap calls for Ekubo router
 * @param fromToken Token being sold (source/payment token)
 * @param toToken Token being bought (destination token)
 * @param _amount Unused - we use quote.total directly
 * @param minOutput Minimum output amount (slippage protection)
 * @param quote The swap quote from getRequiredInput (route is toToken → fromToken direction)
 */
export function generateSwapCalls(
  fromToken: string,
  toToken: string,
  _amount: string,
  minOutput: string,
  quote: SwapQuote
): SwapCall[] {
  if (!quote.splits || quote.splits.length === 0) {
    return [];
  }

  // Get total from quote and add buffer (matching death_mountain: totalQuoteSum * 100n / 99n)
  const total = BigInt(quote.total);
  const totalQuoteSum = total < 0n ? -total : total;
  const totalWithBuffer = (totalQuoteSum * 100n) / 99n;

  // Transfer source tokens to router
  const transferCall: SwapCall = {
    contractAddress: fromToken,
    entrypoint: "transfer",
    calldata: [EKUBO_ROUTER_ADDRESS, num.toHex(totalWithBuffer), "0x0"],
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

  // Generate swap call(s) - use multi_multihop_swap if multiple splits
  let swapCall: SwapCall;

  if (quote.splits.length === 1) {
    // Single split - use multihop_swap
    swapCall = generateMultihopSwapCall(quote.splits[0], toToken);
  } else {
    // Multiple splits - use multi_multihop_swap to execute all of them
    swapCall = generateMultiMultihopSwapCall(quote.splits, toToken);
  }

  return [transferCall, swapCall, clearMinCall, clearFromCall];
}

/**
 * Generate a single multihop swap call
 * Format: route_len, [pool_key + sqrt_ratio_limit + skip_ahead]..., token_in, amount, is_token1
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
      "0x1",
    ],
  };
}

/**
 * Generate a multi_multihop_swap call for multiple splits
 * Format: splits_len, [route_len, route_data..., token_in, amount, is_token1]...
 *
 * This executes ALL splits from the quote to achieve the full output amount.
 */
function generateMultiMultihopSwapCall(splits: SwapSplit[], startToken: string): SwapCall {
  const calldata: string[] = [num.toHex(splits.length)];

  for (const split of splits) {
    const routeData = encodeRoute(split.route, startToken);
    const amountSpec = BigInt(split.amount_specified);
    const absAmount = amountSpec < 0n ? -amountSpec : amountSpec;

    calldata.push(
      num.toHex(split.route.length),
      ...routeData,
      startToken,
      num.toHex(absAmount),
      "0x1",
    );
  }

  return {
    contractAddress: EKUBO_ROUTER_ADDRESS,
    entrypoint: "multi_multihop_swap",
    calldata,
  };
}

/**
 * Encode a route for the swap call
 * Each hop is: token0, token1, fee, tick_spacing, extension, sqrt_ratio_limit_low, sqrt_ratio_limit_high, skip_ahead
 *
 * All numeric values are converted to hex for proper calldata encoding.
 */
function encodeRoute(route: RouteNode[], _startToken: string): string[] {
  const encoded: string[] = [];

  for (const node of route) {
    const sqrtRatioLimit = BigInt(node.sqrt_ratio_limit);
    // Convert fee from decimal string to hex
    const fee = BigInt(node.pool_key.fee);

    encoded.push(
      node.pool_key.token0,
      node.pool_key.token1,
      num.toHex(fee),
      num.toHex(node.pool_key.tick_spacing),
      node.pool_key.extension,
      num.toHex(sqrtRatioLimit % 2n ** 128n),  // low 128 bits
      num.toHex(sqrtRatioLimit >> 128n),       // high 128 bits
      num.toHex(node.skip_ahead),
    );
  }

  return encoded;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate minimum output with slippage
 * @param expectedOutput Expected output amount
 * @param slippageBps Slippage in basis points (100 = 1%, 300 = 3%)
 * Default is 300 (3%) to account for price movement between quote and execution
 */
export function calculateMinOutput(expectedOutput: string, slippageBps: number = 300): string {
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
