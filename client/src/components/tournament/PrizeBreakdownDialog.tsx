import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DisplayPrize } from "@/lib/types";
import { cn, indexAddress } from "@/lib/utils";
import { parseDistribution } from "@/lib/utils/distribution";

export interface EntryFeeShape {
  amount?: string | number | bigint;
  tokenAddress?: string;
  tournamentCreatorShare?: number | string;
  gameCreatorShare?: number | string;
  refundShare?: number | string;
  distributionCount?: number | string;
  distribution?: any;
}

interface TokenMeta {
  token_address: string;
  symbol: string;
  logo_url?: string;
  decimals?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryFee?: EntryFeeShape | null;
  entryCount: number;
  entryFeePrizes: DisplayPrize[];
  sponsoredPrizes: DisplayPrize[];
  tournamentTokens: TokenMeta[];
  prices: Record<string, number | undefined>;
  tokenDecimals: Record<string, number>;
  totalPrizeUsd: number;
  entryFeePoolUsd: number;
}

const formatUSD = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
};

const extractErc20Amount = (prize: any): string | null => {
  const tokenType = prize.token_type ?? prize.tokenType;
  if (!tokenType) return prize.amount?.toString() ?? null;
  if (typeof tokenType === "string") {
    return prize.amount?.toString() ?? null;
  }
  const erc20 = tokenType.variant?.erc20 ?? tokenType.erc20;
  if (erc20?.amount != null) return erc20.amount.toString();
  return prize.amount?.toString() ?? null;
};

const PrizeBreakdownDialog = ({
  open,
  onOpenChange,
  entryFee,
  entryCount,
  entryFeePrizes,
  sponsoredPrizes,
  tournamentTokens,
  prices,
  tokenDecimals,
  totalPrizeUsd,
  entryFeePoolUsd,
}: Props) => {
  const hasEntryFee = !!entryFee && BigInt(entryFee.amount ?? "0") > 0n;

  const creatorShare = Number(entryFee?.tournamentCreatorShare ?? 0);
  const gameShare = Number(entryFee?.gameCreatorShare ?? 0);
  const refundShare = Number(entryFee?.refundShare ?? 0);
  const poolBps = Math.max(0, 10000 - creatorShare - gameShare - refundShare);

  const distCount = Number(entryFee?.distributionCount ?? 0);
  const parsedDist = parseDistribution(entryFee?.distribution);
  const distType = parsedDist.type;
  const distWeightRaw = parsedDist.weight;
  // Contract stores weight × 10 for fixed-point. Divide by 10 for display.
  const distWeight = distWeightRaw / 10;

  if (distType === "unknown" && entryFee?.distribution) {
    // eslint-disable-next-line no-console
    console.warn(
      "[PrizeBreakdownDialog] Unknown distribution shape, falling back to uniform:",
      entryFee.distribution,
    );
  }

  // Fee token meta + USD derivation
  const feeTokenAddr = entryFee?.tokenAddress
    ? indexAddress(entryFee.tokenAddress)
    : null;
  const feeToken = feeTokenAddr
    ? tournamentTokens.find(
        (t) => indexAddress(t.token_address) === feeTokenAddr,
      )
    : undefined;
  const feeDecimals = feeTokenAddr
    ? (tokenDecimals[feeTokenAddr] ?? feeToken?.decimals ?? 18)
    : 18;
  const feePrice = feeTokenAddr ? (prices[feeTokenAddr] ?? 0) : 0;

  const feeAmountRaw = BigInt(entryFee?.amount ?? "0");
  const totalCollectedRaw = feeAmountRaw * BigInt(entryCount);
  const creatorAmtRaw =
    creatorShare > 0 ? (totalCollectedRaw * BigInt(creatorShare)) / 10000n : 0n;
  const gameAmtRaw =
    gameShare > 0 ? (totalCollectedRaw * BigInt(gameShare)) / 10000n : 0n;
  const refundAmtRaw =
    refundShare > 0 ? (totalCollectedRaw * BigInt(refundShare)) / 10000n : 0n;
  const poolAmtRaw =
    poolBps > 0 ? (totalCollectedRaw * BigInt(poolBps)) / 10000n : 0n;

  const toHuman = (raw: bigint) => Number(raw) / 10 ** feeDecimals;
  const toUsd = (raw: bigint) =>
    feePrice ? toHuman(raw) * feePrice : null;

  const feeAmountUsd = feePrice ? toHuman(feeAmountRaw) * feePrice : null;

  const distTypeLabel =
    distType === "linear"
      ? "Linear"
      : distType === "exponential"
        ? "Exponential"
        : distType === "uniform"
          ? "Uniform (equal split)"
          : distType === "custom"
            ? "Custom"
            : "Unknown (treated as Uniform)";

  // Render the formula describing how each position's share is computed.
  // Mirrors `calculateDistribution` from metagame-sdk:
  //   exponential → share ∝ (1 − i/N)^w
  //   linear      → share ∝ 1 + (N − 1 − i) × (w / 10)
  //   uniform     → share ∝ 1 (equal)
  //
  // `i` is 0-indexed rank (0 = top), `N` is total paid places, `w` is the
  // display weight (contract weight / 10 — see Tournament.tsx).
  const hasWeight = distType === "exponential" || distType === "linear";

  // prize(i) = pool × weight(i) / Σ weights
  // where weight(i) depends on the distribution type.
  const WeightExpr =
    distType === "exponential"
      ? (
        <>
          <span className="text-neutral">(1</span>
          <span className="text-brand-muted mx-1">−</span>
          <span className="text-neutral">i / N)</span>
          <sup className="text-brand font-bold ml-0.5">w</sup>
        </>
      )
      : distType === "linear"
        ? (
          <>
            <span className="text-neutral">1</span>
            <span className="text-brand-muted mx-1">+</span>
            <span className="text-neutral">(N − 1 − i)</span>
            <span className="text-brand-muted mx-1">×</span>
            <span className="text-neutral">(</span>
            <span className="text-brand font-bold">w</span>
            <span className="text-brand-muted mx-0.5">/</span>
            <span className="text-neutral">10)</span>
          </>
        )
        : null;

  // Per-position entry fee amounts
  const entryFeePositions = entryFeePrizes
    .map((p) => {
      const pos = Number(
        (p as any).position ?? (p as any).payout_position ?? 0,
      );
      const amountStr = extractErc20Amount(p);
      if (!amountStr || pos <= 0) return null;
      const raw = BigInt(amountStr);
      const usd = toUsd(raw);
      const pct =
        poolAmtRaw > 0n ? Number((raw * 10000n) / poolAmtRaw) / 100 : 0;
      return { position: pos, usd, pct };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.position - b.position);

  // Quick lookup of entry-fee payout by position for the unified table.
  const entryFeeByPos = new Map<number, { usd: number | null; pct: number }>();
  for (const ef of entryFeePositions) {
    entryFeeByPos.set(ef.position, { usd: ef.usd, pct: ef.pct });
  }

  // Sponsored prizes aggregated by position (sum USD across any tokens)
  const sponsoredByPositionUsd = new Map<number, number>();
  let sponsoredTotalUsd = 0;
  for (const prize of sponsoredPrizes) {
    const pos = Number(
      (prize as any).position ?? (prize as any).payout_position ?? 0,
    );
    if (pos <= 0) continue;
    const addr = (prize as any).token_address ?? (prize as any).tokenAddress;
    if (!addr) continue;
    const normalized = indexAddress(addr);
    const meta = tournamentTokens.find(
      (t) => indexAddress(t.token_address) === normalized,
    );
    const decimals = tokenDecimals[normalized] ?? meta?.decimals ?? 18;
    const price = prices[normalized];
    const amountStr = extractErc20Amount(prize);
    if (!amountStr) continue;
    let human = 0;
    try {
      human = Number(BigInt(amountStr)) / 10 ** decimals;
    } catch {
      continue;
    }
    if (!price || isNaN(price)) continue;
    const usd = human * price;
    sponsoredByPositionUsd.set(
      pos,
      (sponsoredByPositionUsd.get(pos) ?? 0) + usd,
    );
    sponsoredTotalUsd += usd;
  }
  const sponsoredCount = sponsoredPrizes.length;

  // Unified per-position list: the union of entry-fee payout positions and
  // sponsored-prize positions, sorted ascending. We collapse the two tables
  // into one so viewers see the total prize at each rank without mentally
  // summing two lists — important for tournaments with many paid places.
  const positionKeys = new Set<number>();
  for (const ef of entryFeePositions) positionKeys.add(ef.position);
  for (const pos of sponsoredByPositionUsd.keys()) positionKeys.add(pos);
  const unifiedPositions = Array.from(positionKeys)
    .sort((a, b) => a - b)
    .map((pos) => {
      const ef = entryFeeByPos.get(pos);
      const sponsoredUsd = sponsoredByPositionUsd.get(pos) ?? 0;
      const entryFeeUsd = ef?.usd ?? 0;
      return {
        position: pos,
        entryFeePct: ef?.pct ?? null,
        entryFeeUsd: ef ? ef.usd : null,
        sponsoredUsd,
        totalUsd: (entryFeeUsd ?? 0) + sponsoredUsd,
      };
    });
  const hasEntryFeeColumn = entryFeePositions.length > 0;
  const hasSponsoredColumn = sponsoredByPositionUsd.size > 0;

  const TokenStack = ({
    tokens,
    size = 18,
    max = 4,
  }: {
    tokens: Array<{ symbol: string; logoUrl?: string }>;
    size?: number;
    max?: number;
  }) => {
    if (tokens.length === 0) return null;
    const shown = tokens.slice(0, max);
    const extra = tokens.length - shown.length;
    return (
      <div className="flex flex-row items-center">
        {shown.map((token, i) =>
          token.logoUrl ? (
            <img
              key={`${token.symbol}-${i}`}
              src={token.logoUrl}
              alt={token.symbol}
              style={{
                width: size,
                height: size,
                marginLeft: i === 0 ? 0 : -6,
              }}
              className="rounded-full border-2 border-black bg-black/40"
            />
          ) : (
            <div
              key={`${token.symbol}-${i}`}
              style={{
                width: size,
                height: size,
                marginLeft: i === 0 ? 0 : -6,
              }}
              className="rounded-full border-2 border-black bg-brand-muted/20 flex items-center justify-center text-[8px] font-bold text-brand"
            >
              {token.symbol.slice(0, 2)}
            </div>
          ),
        )}
        {extra > 0 && (
          <div
            style={{ width: size, height: size, marginLeft: -6 }}
            className="rounded-full border-2 border-black bg-neutral/20 flex items-center justify-center text-[9px] font-bold text-neutral"
          >
            +{extra}
          </div>
        )}
      </div>
    );
  };

  const ShareRow = ({
    label,
    bps,
    usd,
  }: {
    label: string;
    bps: number;
    usd: number | null;
  }) => (
    <div className="flex flex-row items-center justify-between gap-2 text-xs py-1">
      <div className="flex flex-row items-center gap-2 min-w-0">
        <span className="text-brand-muted truncate">{label}</span>
        <span className="font-mono text-brand/70 flex-shrink-0">
          {(bps / 100).toFixed(2)}%
        </span>
      </div>
      <span className="font-brand text-brand flex-shrink-0">
        {formatUSD(usd)}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border border-brand p-4 sm:p-6 rounded-lg sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="font-brand text-lg sm:text-xl text-brand">
          Prize Breakdown
        </DialogTitle>

        {/* Total pool */}
        <div className="flex flex-col gap-1 border-b border-brand/15 pb-3">
          <div className="flex flex-row items-baseline justify-between gap-2">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider text-brand-muted">
              Total Prize Pool
            </span>
            <span className="font-brand text-xl sm:text-2xl text-brand">
              {formatUSD(totalPrizeUsd)}
            </span>
          </div>
          <div className="flex flex-row flex-wrap text-[11px] sm:text-xs gap-x-2 gap-y-0.5 text-brand-muted">
            <span>
              Entry Fee Pool{" "}
              <span className="text-brand font-mono">
                {formatUSD(entryFeePoolUsd)}
              </span>
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              Sponsored{" "}
              <span className="text-brand font-mono">
                {formatUSD(sponsoredTotalUsd)}
              </span>
              {sponsoredCount > 0 && (
                <span className="text-brand-muted/70 ml-1">
                  ({sponsoredCount})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Entry fee breakdown */}
        {hasEntryFee ? (
          <section className="flex flex-col gap-2">
            <h4 className="font-brand text-base text-brand">Entry Fee Pool</h4>
            <div className="flex flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs font-mono text-brand-muted">
              <span className="text-brand">{formatUSD(feeAmountUsd)}</span>
              <span>×</span>
              <span className="text-neutral">
                {entryCount} {entryCount === 1 ? "entry" : "entries"}
              </span>
              <span>=</span>
              <span className="text-brand">
                {formatUSD(toUsd(totalCollectedRaw))}
              </span>
            </div>

            <div className="flex flex-col border border-brand/10 rounded-md bg-brand/5 px-3 divide-y divide-brand/10">
              <ShareRow
                label="Prize Pool"
                bps={poolBps}
                usd={toUsd(poolAmtRaw)}
              />
              {creatorShare > 0 && (
                <ShareRow
                  label="Tournament Creator"
                  bps={creatorShare}
                  usd={toUsd(creatorAmtRaw)}
                />
              )}
              {gameShare > 0 && (
                <ShareRow
                  label="Game Creator"
                  bps={gameShare}
                  usd={toUsd(gameAmtRaw)}
                />
              )}
              {refundShare > 0 && (
                <ShareRow
                  label="Refund (per entry)"
                  bps={refundShare}
                  usd={toUsd(refundAmtRaw)}
                />
              )}
            </div>

            {/* Distribution */}
            {poolBps > 0 && distCount > 0 && (
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wider text-brand-muted">
                        Distribution
                      </span>
                      <div className="flex flex-row items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-brand leading-none">
                          {distTypeLabel}
                        </span>
                        {hasWeight && (
                          <span className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand/10 px-1.5 py-0.5 leading-none">
                            <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                              w
                            </span>
                            <span className="font-brand text-xs text-brand">
                              {distWeight.toFixed(1)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-row items-center gap-2 flex-shrink-0">
                      {feeToken && (
                        <TokenStack
                          tokens={[
                            {
                              symbol: feeToken.symbol,
                              logoUrl: feeToken.logo_url,
                            },
                          ]}
                          size={16}
                        />
                      )}
                      <span className="text-[10px] uppercase tracking-wider text-brand-muted">
                        {distCount}{" "}
                        {distCount === 1 ? "paid place" : "paid places"}
                      </span>
                    </div>
                  </div>

                  {WeightExpr && (
                    <div className="flex flex-col gap-1.5 rounded-md border border-brand/15 bg-brand/[0.03] px-3 py-2">
                      <span className="text-[9px] uppercase tracking-wider text-brand-muted">
                        Prize per position
                      </span>
                      <div className="font-mono text-sm flex flex-row items-center flex-wrap gap-y-0.5">
                        <span className="text-neutral">prize(i)</span>
                        <span className="text-brand-muted mx-1">=</span>
                        <span className="text-brand font-semibold">pool</span>
                        <span className="text-brand-muted mx-1">×</span>
                        {WeightExpr}
                        <span className="text-brand-muted mx-1">/</span>
                        <span className="text-neutral">Σ</span>
                      </div>
                      <div className="flex flex-row flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-brand-muted/80">
                        <span>
                          <span className="text-brand font-bold">i</span> = rank
                          (0 = top)
                        </span>
                        <span>
                          <span className="text-brand font-bold">N</span> ={" "}
                          {distCount}
                        </span>
                        <span>
                          <span className="text-brand font-bold">w</span> ={" "}
                          {distWeight.toFixed(1)}
                        </span>
                        <span>
                          <span className="text-neutral">Σ</span> = sum of all
                          position weights
                        </span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            <p className="text-[10px] text-brand-muted/70 italic leading-snug">
              Amounts scale with the number of entries. Values shown reflect
              the current entry count ({entryCount}) and live USD prices.
            </p>
          </section>
        ) : (
          <section className="flex flex-col gap-1">
            <h4 className="font-brand text-base text-brand">Entry Fee Pool</h4>
            <p className="text-xs text-brand-muted italic">
              This tournament has no entry fee — the prize pool comes entirely
              from sponsored prizes below.
            </p>
          </section>
        )}

        {/* Unified per-position prize table. Combines the entry-fee share
            (percentage + USD) and sponsored USD for every rank, so viewers
            see the full payout at each position without summing two lists.
            Inner scroll keeps the dialog compact when there are many paid
            places (e.g. 50-position leagues). */}
        {unifiedPositions.length > 0 && (() => {
          const showBoth = hasEntryFeeColumn && hasSponsoredColumn;
          // Column layout:
          //  - only entry fee: Pos | Share | USD
          //  - only sponsored: Pos | USD
          //  - both:           Pos | Entry Fee | Sponsored | Total
          const gridCols = showBoth
            ? "grid-cols-[44px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]"
            : hasEntryFeeColumn
              ? "grid-cols-[44px_1fr_auto]"
              : "grid-cols-[44px_1fr]";
          return (
            <section className="flex flex-col gap-2 border-t border-brand/15 pt-3">
              <div className="flex flex-row items-baseline justify-between gap-2 flex-wrap">
                <h4 className="font-brand text-base text-brand">
                  Prize per Position
                </h4>
                <span className="text-[10px] uppercase tracking-wider text-brand-muted">
                  {unifiedPositions.length}{" "}
                  {unifiedPositions.length === 1 ? "position" : "positions"}
                </span>
              </div>
              <div className="flex flex-col border border-brand/10 rounded-md overflow-hidden">
                {/* Header (sticky within the scroll container) */}
                <div
                  className={cn(
                    "grid items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-brand-muted/70 bg-brand/5",
                    gridCols,
                  )}
                >
                  <span>Pos</span>
                  {showBoth ? (
                    <>
                      <span>Entry Fee</span>
                      <span className="text-right">Sponsored</span>
                      <span className="text-right">Total</span>
                    </>
                  ) : hasEntryFeeColumn ? (
                    <>
                      <span>Share</span>
                      <span className="text-right">USD</span>
                    </>
                  ) : (
                    <span className="text-right">USD</span>
                  )}
                </div>
                {/* Body (scrollable) */}
                <div className="max-h-64 overflow-y-auto">
                  {unifiedPositions.map((row) => (
                    <div
                      key={row.position}
                      className={cn(
                        "grid items-center gap-2 px-3 py-1.5 text-xs",
                        gridCols,
                        row.position < 4 && "bg-brand/[0.03]",
                      )}
                    >
                      <span className="font-brand text-brand">
                        #{row.position}
                      </span>
                      {showBoth ? (
                        <>
                          <span className="flex flex-row items-baseline gap-1 min-w-0">
                            {row.entryFeePct != null ? (
                              <>
                                <span className="font-mono text-brand-muted text-[11px] flex-shrink-0">
                                  {row.entryFeePct.toFixed(2)}%
                                </span>
                                <span className="font-brand text-brand truncate">
                                  {formatUSD(row.entryFeeUsd)}
                                </span>
                              </>
                            ) : (
                              <span className="text-brand-muted/50">—</span>
                            )}
                          </span>
                          <span className="font-brand text-brand text-right">
                            {row.sponsoredUsd > 0
                              ? formatUSD(row.sponsoredUsd)
                              : (
                                <span className="text-brand-muted/50">—</span>
                              )}
                          </span>
                          <span className="font-brand text-brand text-right font-semibold">
                            {formatUSD(row.totalUsd)}
                          </span>
                        </>
                      ) : hasEntryFeeColumn ? (
                        <>
                          <span className="font-mono text-brand-muted">
                            {row.entryFeePct != null
                              ? `${row.entryFeePct.toFixed(2)}%`
                              : "—"}
                          </span>
                          <span className="font-brand text-brand text-right">
                            {formatUSD(row.entryFeeUsd)}
                          </span>
                        </>
                      ) : (
                        <span className="font-brand text-brand text-right">
                          {formatUSD(row.sponsoredUsd)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {sponsoredCount > 0 && !hasEntryFeeColumn && (
                <p className="text-[10px] text-brand-muted/70 italic leading-snug">
                  {sponsoredCount}{" "}
                  {sponsoredCount === 1
                    ? "sponsored prize"
                    : "sponsored prizes"}
                  .
                </p>
              )}
            </section>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
};

export default PrizeBreakdownDialog;
