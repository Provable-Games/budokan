import { geolocation } from "@vercel/functions";

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
    country === "US" && BLOCKED_STATES.has(region.toUpperCase());

  return new Response(JSON.stringify({ country, region, blocked }), {
    headers: { "Content-Type": "application/json" },
  });
}
