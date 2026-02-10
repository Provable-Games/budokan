import { geolocation } from "@vercel/functions";

// Blocked countries (2-letter ISO codes)
// Add codes here to block entire countries, e.g., "KP", "IR"
// For testing, add "US" to block all US users
const BLOCKED_COUNTRIES = new Set<string>([]);

const BLOCKED_STATES = new Set([
  "AZ",
  "AR",
  "CT",
  "DE",
  "LA",
  "MT",
  "SC",
  "SD",
  "TN",
]);

export const config = {
  runtime: "edge",
};

export default function handler(request: Request) {
  const geo = geolocation(request);
  const country = geo.country ?? "";
  const region = geo.countryRegion ?? "";
  const blocked =
    BLOCKED_COUNTRIES.has(country.toUpperCase()) ||
    (country === "US" && BLOCKED_STATES.has(region.toUpperCase()));

  return new Response(JSON.stringify({ country, region, blocked }), {
    headers: { "Content-Type": "application/json" },
  });
}
