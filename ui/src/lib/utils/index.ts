import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BigNumberish, shortString } from "starknet";
import { Prize } from "@/generated/models.gen";
import { TOKEN_ADDRESSES } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayPrice(num: number): string {
  if (Math.abs(num) >= 1) {
    return num.toFixed(0);
  } else if (Math.abs(num) > 0) {
    return num.toFixed(2);
  } else {
    return "0";
  }
}

export function roundUSDPrice(price: number): string {
  // Handle negative numbers by applying the same logic to the absolute value
  const isNegative = price < 0;
  const absPrice = Math.abs(price);

  // Get the integer part
  const integerPart = Math.floor(absPrice);

  // Get the decimal part
  const decimalPart = absPrice - integerPart;

  let result: number;

  if (decimalPart <= 0.25) {
    // Round down to the integer
    result = integerPart;
  } else if (decimalPart <= 0.75) {
    // Round to x.50
    result = integerPart + 0.5;
  } else {
    // Round up to the next integer
    result = integerPart + 1;
  }

  // Apply the sign back
  result = isNegative ? -result : result;

  // Format the result
  if (result % 1 === 0) {
    return result.toFixed(0);
  } else {
    return result.toFixed(2);
  }
}

export function formatNumber(num: number): string {
  if (Math.abs(num) >= 1000000) {
    return parseFloat((num / 1000000).toFixed(2)) + "m";
  } else if (Math.abs(num) >= 1000) {
    return parseFloat((num / 1000).toFixed(2)) + "k";
  } else if (Math.abs(num) >= 1) {
    return num.toFixed(0);
  } else if (Math.abs(num) >= 0.1) {
    return num.toFixed(1);
  } else if (Math.abs(num) >= 0.01) {
    return num.toFixed(2);
  } else if (Math.abs(num) >= 0.001) {
    return num.toFixed(3);
  } else if (num === 0) {
    return "0";
  } else {
    return num.toFixed(4);
  }
}

export function formatScore(num: number): string {
  if (Math.abs(num) >= 1000000) {
    return parseFloat((num / 1000000).toFixed(2)) + "m";
  } else if (Math.abs(num) >= 1000) {
    return parseFloat((num / 1000).toFixed(2)) + "k";
  } else if (Math.abs(num) >= 10) {
    return num.toFixed(0);
  } else if (Math.abs(num) > 0) {
    return num.toFixed(0);
  } else {
    return "0";
  }
}

export function formatEth(num: number): string {
  if (Math.abs(num) >= 0.01) {
    return num.toFixed(2);
  } else if (Math.abs(num) >= 0.0001) {
    return num.toFixed(4);
  } else {
    return "0";
  }
}

export function indexAddress(address: string) {
  return address.replace(/^0x0+/, "0x");
}

export function padAddress(address: string) {
  if (address && address !== "") {
    const length = address.length;
    const neededLength = 66 - length;
    let zeros = "";
    for (var i = 0; i < neededLength; i++) {
      zeros += "0";
    }
    const newHex = address.substring(0, 2) + zeros + address.substring(2);
    return newHex;
  } else {
    return "";
  }
}

export function padU32(num: number): string {
  if (num < 0 || num > 0xffffffff) {
    throw new Error("Value out of range for u32");
  }
  const hex = num.toString(16);
  return "0x" + hex.padStart(8, "0");
}

export function padU64(num: bigint): string {
  if (num < 0n || num > 0xffffffffffffffffn) {
    throw new Error("Value out of range for u64");
  }
  const hex = num.toString(16);
  return "0x" + hex.padStart(16, "0");
}

export function displayAddress(string: string) {
  if (string === undefined) return "unknown";
  return string.substring(0, 6) + "..." + string.substring(string.length - 4);
}

export const stringToFelt = (v: string): BigNumberish =>
  v ? shortString.encodeShortString(v) : "0x0";

export const feltToString = (v: BigNumberish): string => {
  return BigInt(v) > 0n ? shortString.decodeShortString(bigintToHex(v)) : "";
};

export const bigintToHex = (v: BigNumberish): `0x${string}` =>
  !v ? "0x0" : `0x${BigInt(v).toString(16)}`;

export const isPositiveBigint = (v: BigNumberish | null): boolean => {
  try {
    return v != null && BigInt(v) > 0n;
  } catch {
    return false;
  }
};

export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} Day${days > 1 ? "s" : ""}`;
  } else if (hours > 0) {
    return `${hours} Hour${hours > 1 ? "s" : ""}`;
  } else if (minutes > 0) {
    return `${minutes} Min${minutes > 1 ? "s" : ""}`;
  } else {
    return `${seconds.toFixed(0)} Sec${seconds > 1 ? "s" : ""}`;
  }
};
// Add a utility function to check if a date is before another date
export function isBefore(date1: Date, date2: Date) {
  return date1.getTime() < date2.getTime();
}

export function formatBalance(num: BigNumberish): number {
  return Number(num) / 10 ** 18;
}

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("Failed to copy text: ", err);
  }
};

export const removeFieldOrder = <T extends Record<string, any>>(
  obj: T
): Omit<T, "fieldOrder"> => {
  const newObj = { ...obj } as Record<string, any>; // Cast to a non-generic type
  delete newObj.fieldOrder;

  Object.keys(newObj).forEach((key) => {
    if (typeof newObj[key] === "object" && newObj[key] !== null) {
      newObj[key] = removeFieldOrder(newObj[key]);
    }
  });

  return newObj as Omit<T, "fieldOrder">;
};

export const cleanObject = (obj: any): any =>
  Object.keys(obj).reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {} as { [key: string]: any });

export const calculatePayouts = (
  totalPlaces: number,
  weightingFactor: number
): number[] => {
  // Calculate the weights for each place
  const weights: number[] = [];
  for (let i = 1; i <= totalPlaces; i++) {
    weights.push(1 / Math.pow(i, weightingFactor));
  }

  // Calculate the total weight
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  // Calculate the percentage payouts
  const payouts: number[] = weights.map((weight) =>
    Math.floor((weight / totalWeight) * 100)
  );

  // Calculate the sum of rounded payouts
  const totalPayout = payouts.reduce((sum, payout) => sum + payout, 0);

  // Distribute the remaining percentage points
  // to the highest weighted positions until we reach 100
  let remaining = 100 - totalPayout;
  let index = 0;
  while (remaining > 0) {
    payouts[index] += 1;
    remaining -= 1;
    index = (index + 1) % totalPlaces;
  }

  return payouts;
};

export const getRandomInt = (min: number, max: number): number => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export function getTokenKeyFromValue(searchValue: string): string | null {
  const entry = Object.entries(TOKEN_ADDRESSES).find(
    ([_key, value]) => value === searchValue
  );
  return entry ? entry[0] : null;
}

export const getPrizesByToken = (prizes: Prize[]) => {
  return Object.entries(
    prizes.reduce((acc, prize) => {
      const key = prize.token_address;
      if (!acc[key]) acc[key] = [];
      acc[key].push(prize);
      return acc;
    }, {} as Record<string, typeof prizes>)
  );
};

export const getOrdinalSuffix = (position: number) => {
  const formatPosition = isNaN(position) ? 0 : position;
  if (formatPosition % 10 === 1 && formatPosition !== 11) return "st";
  if (formatPosition % 10 === 2 && formatPosition !== 12) return "nd";
  if (position % 10 === 3 && position !== 13) return "rd";
  return "th";
};

// pixel borders

type Point = {
  x: number;
  y: number;
};
// from  https://pixelcorners.lukeb.co.uk/
export function generatePixelBorderPath(radius = 4, pixelSize = 4) {
  const points = generatePoints(radius, pixelSize);
  const flipped = flipCoords(points);

  return generatePath(flipped);
}

function generatePath(coords: Point[], reverse = false) {
  const mirroredCoords = mirrorCoords(coords);

  return (reverse ? mirroredCoords : mirroredCoords.reverse())
    .map((point) => {
      return `${point.x} ${point.y}`;
    })
    .join(",\n    ");
}

function generatePoints(radius: number, pixelSize: number, offset = 0) {
  const coords = [];

  const lastCoords = {
    x: -1,
    y: -1,
  };

  for (let i = 270; i > 225; i--) {
    const x =
      Math.floor(radius * Math.sin((2 * Math.PI * i) / 360) + radius + 0.5) *
      pixelSize;
    const y =
      Math.floor(radius * Math.cos((2 * Math.PI * i) / 360) + radius + 0.5) *
      pixelSize;

    if (x !== lastCoords.x || y !== lastCoords.y) {
      lastCoords.x = x;
      lastCoords.y = y;

      coords.push({
        x: x + offset * pixelSize,
        y: y + offset * pixelSize,
      });
    }
  }

  const mergedCoords = mergeCoords(coords);
  const corners = addCorners(mergedCoords);

  return corners;
}

function flipCoords(coords: Point[]) {
  return [
    ...coords,
    ...coords.map(({ x, y }) => ({ x: y, y: x })).reverse(),
  ].filter(({ x, y }, i, arr) => {
    return !i || arr[i - 1].x !== x || arr[i - 1].y !== y;
  });
}

function mergeCoords(coords: Point[]) {
  return coords.reduce((result: Point[], point: Point, index: number) => {
    if (
      index !== coords.length - 1 &&
      point.x === 0 &&
      coords[index + 1].x === 0
    ) {
      return result;
    }

    if (index !== 0 && point.y === 0 && coords[index - 1].y === 0) {
      return result;
    }

    if (
      index !== 0 &&
      index !== coords.length - 1 &&
      point.x === coords[index - 1].x &&
      point.x === coords[index + 1].x
    ) {
      return result;
    }

    result.push(point);
    return result;
  }, []);
}

function addCorners(coords: Point[]) {
  return coords.reduce((result: Point[], point: Point, i: number) => {
    result.push(point);

    if (
      coords.length > 1 &&
      i < coords.length - 1 &&
      coords[i + 1].x !== point.x &&
      coords[i + 1].y !== point.y
    ) {
      result.push({
        x: coords[i + 1].x,
        y: point.y,
      });
    }

    return result;
  }, []);
}

function mirrorCoords(coords: Point[], offset = 0) {
  return [
    ...coords.map(({ x, y }) => ({
      x: offset ? `${x + offset}px` : `${x}px`,
      y: offset ? `${y + offset}px` : `${y}px`,
    })),
    ...coords.map(({ x, y }) => ({
      x: edgeCoord(y, offset),
      y: offset ? `${x + offset}px` : `${x}px`,
    })),
    ...coords.map(({ x, y }) => ({
      x: edgeCoord(x, offset),
      y: edgeCoord(y, offset),
    })),
    ...coords.map(({ x, y }) => ({
      x: offset ? `${y + offset}px` : `${y}px`,
      y: edgeCoord(x, offset),
    })),
  ];
}

function edgeCoord(n: number, offset: number) {
  if (offset) {
    return n === 0
      ? `calc(100% - ${offset}px)`
      : `calc(100% - ${offset + n}px)`;
  }

  return n === 0 ? "100%" : `calc(100% - ${n}px)`;
}

// Helper function to adjust color opacity
export const adjustColorOpacity = (color: string, opacity: number): string => {
  // Handle RGB/RGBA format
  if (color.startsWith("rgb")) {
    const rgbValues = color.match(/\d+/g);
    if (rgbValues && rgbValues.length >= 3) {
      const [r, g, b] = rgbValues;
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }

  // Handle HEX format
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // If the format isn't recognized, return the original color
  console.warn(`Color format not recognized for: ${color}`);
  return color;
};

export type DistributionType = "linear" | "exponential" | "uniform";

export const calculateDistribution = (
  positions: number,
  weight: number,
  creatorFee?: number,
  gameFee?: number,
  refundShare?: number,
  distributionType: DistributionType = "exponential"
): number[] => {
  // Handle invalid inputs
  if (positions <= 0) {
    return [];
  }

  const safeCreatorFee = creatorFee ?? 0;
  const safeGameFee = gameFee ?? 0;
  const safeRefundShare = refundShare ?? 0;
  const prizePoolPercentage = 100 - safeCreatorFee - safeGameFee - safeRefundShare;

  // If there's nothing to distribute, return array of zeros
  if (prizePoolPercentage <= 0) {
    return Array(positions).fill(0);
  }

  let rawDistributions: number[] = [];

  if (distributionType === "uniform") {
    // Uniform distribution - everyone gets equal share
    rawDistributions = Array(positions).fill(1);
  } else if (distributionType === "linear") {
    // Linear distribution with weight
    // Formula: position i gets (n - i + 1)^(weight/10) shares
    // Weight is scaled by 10 (e.g., 10 = 1.0, 25 = 2.5, 100 = 10.0)
    // For 0-indexed array position i, the formula becomes (n - i)^(weight/10)
    // since array[0] represents position 1, so (n - 0) = n, which equals (n - 1 + 1)
    for (let i = 0; i < positions; i++) {
      const positionValue = positions - i; // For i=0 (1st place): n, i=1 (2nd): n-1, etc.
      const share = Math.pow(positionValue, weight / 10);
      rawDistributions.push(share);
    }
  } else {
    // Exponential distribution (default)
    for (let i = 0; i < positions; i++) {
      const share = Math.pow(1 - i / positions, weight);
      rawDistributions.push(share);
    }
  }

  // Normalize to get the sum of all raw shares
  const total = rawDistributions.reduce((a, b) => a + b, 0);

  // Prevent division by zero
  if (total === 0) {
    return Array(positions).fill(0);
  }

  // Calculate each position's percentage of the prize pool (not total entry fee)
  // Each position gets (its raw share / total raw shares) * 100% of prize pool
  const normalizedDistributions = rawDistributions.map(
    (d) => (d / total) * 100
  );

  // Round to 2 decimal places
  const roundedDistributions = normalizedDistributions.map((d) =>
    Math.round(d * 100) / 100
  );

  // Calculate the remaining due to rounding
  const totalRounded = roundedDistributions.reduce((a, b) => a + b, 0);
  const remaining = 100 - totalRounded;

  // Add remaining to the first position to ensure it sums to exactly 100%
  if (remaining !== 0 && positions > 0) {
    roundedDistributions[0] = Math.round((roundedDistributions[0] + remaining) * 100) / 100;
  }

  return roundedDistributions;
};
