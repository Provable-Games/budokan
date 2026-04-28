import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/table/Pagination";
import { useState, useEffect, useMemo } from "react";
import { BigNumberish, addAddressPadding } from "starknet";
import { useTokens } from "@provable-games/denshokan-sdk/react";
import { REFRESH, VERIFIED } from "@/components/Icons";
import { Ban, ExternalLink } from "lucide-react";
import { useRegistrations } from "@provable-games/budokan-sdk/react";
import { useChainConfig } from "@/context/chain";
import { cn, displayAddress, getOrdinalSuffix, indexAddress } from "@/lib/utils";
import { useGetUsernames } from "@/hooks/useController";
import type { PositionPrizeDisplay } from "@/components/tournament/EntrantsTable";

interface ScoreTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  banRefreshTrigger?: number;
  prizesByPosition?: Map<number, PositionPrizeDisplay>;
}

const formatUSDCompact = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
};

const positionLabel = (pos0: number) => {
  if (pos0 === 0) return "🥇";
  if (pos0 === 1) return "🥈";
  if (pos0 === 2) return "🥉";
  const pos = pos0 + 1;
  return `${pos}${getOrdinalSuffix(pos)}`;
};

const PrizeCell = ({
  prize,
  highlight,
}: {
  prize?: PositionPrizeDisplay;
  highlight?: boolean;
}) => {
  if (!prize) {
    return (
      <span className="text-xs text-brand-muted/30">—</span>
    );
  }
  const tokens =
    prize.tokens && prize.tokens.length > 0
      ? prize.tokens
      : prize.tokenLogo || prize.tokenSymbol
        ? [{ logoUrl: prize.tokenLogo, symbol: prize.tokenSymbol }]
        : [];
  const shownTokens = tokens.slice(0, 2);
  const extraTokens = Math.max(0, tokens.length - shownTokens.length);
  return (
    <div className="flex flex-row items-center justify-end gap-1 min-w-[60px]">
      {shownTokens.length > 0 && (
        <div className="flex flex-row items-center flex-shrink-0">
          {shownTokens.map((token, i) =>
            token.logoUrl ? (
              <img
                key={`${token.symbol ?? "tok"}-${i}`}
                src={token.logoUrl}
                alt=""
                className="w-3.5 h-3.5 rounded-full bg-black/40"
                style={{ marginLeft: i === 0 ? 0 : -4 }}
              />
            ) : (
              <div
                key={`${token.symbol ?? "tok"}-${i}`}
                className="w-3.5 h-3.5 rounded-full bg-brand-muted/20 flex items-center justify-center text-[7px] font-bold text-brand"
                style={{ marginLeft: i === 0 ? 0 : -4 }}
              >
                {(token.symbol ?? "?").slice(0, 2)}
              </div>
            ),
          )}
          {extraTokens > 0 && (
            <div
              className="h-3.5 px-1 rounded-full bg-neutral/20 flex items-center justify-center text-[8px] font-bold text-neutral"
              style={{ marginLeft: -4 }}
            >
              +{extraTokens}
            </div>
          )}
        </div>
      )}
      {prize.usd != null ? (
        <span
          className={cn(
            "font-brand text-xs font-bold",
            highlight ? "text-brand" : "text-brand-muted",
          )}
        >
          {formatUSDCompact(prize.usd)}
        </span>
      ) : (
        <span className="font-brand text-xs text-brand-muted">
          {prize.tokenAmountDisplay ?? prize.tokenSymbol ?? "?"}
        </span>
      )}
    </div>
  );
};

export const ScoreTableDialog = ({
  open,
  onOpenChange,
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  banRefreshTrigger,
  prizesByPosition,
}: ScoreTableDialogProps) => {
  const { selectedChainConfig } = useChainConfig();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const blockExplorerUrl = selectedChainConfig.blockExplorerUrl;

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Paginated tokens (no URI needed — we show prize per position instead)
  const {
    data: tokensResult,
    isLoading: loading,
    refetch,
  } = useTokens(
    open
      ? {
          contextId: Number(tournamentId),
          minterAddress: addAddressPadding(tournamentAddress),
          sort: { field: "score", direction: "desc" },
          limit: pageSize,
          offset: currentPage * pageSize,
        }
      : undefined,
  );

  const pageEntries = tokensResult?.data ?? [];
  const totalCount = tokensResult?.total || entryCount;
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNextPage = currentPage < totalPages - 1;
  const hasPreviousPage = currentPage > 0;
  const nextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
  const previousPage = () => setCurrentPage((p) => Math.max(0, p - 1));

  // Fetch registrations for ban/submit metadata
  const tournamentIdStr = tournamentId ? String(tournamentId) : undefined;
  const { registrations: registrantsResult } = useRegistrations(
    pageEntries.length > 0 ? tournamentIdStr : undefined,
    { limit: 1000 },
  );
  const registrants = registrantsResult?.data ?? null;

  // Build registration lookup
  const regMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const r of (registrants as any[]) ?? []) {
      const raw = r.gameTokenId?.toString();
      const hex = raw?.startsWith("0x")
        ? raw
        : "0x" + BigInt(raw ?? 0).toString(16);
      map.set(hex, r);
    }
    return map;
  }, [registrants]);

  // Resolve cartridge usernames for the visible page's owners.
  const ownerAddresses = useMemo(
    () => pageEntries.map((e: any) => e?.owner ?? "0x0"),
    [pageEntries],
  );
  const { usernames } = useGetUsernames(ownerAddresses);

  // Refetch when a ban operation completes
  useEffect(() => {
    if (banRefreshTrigger && banRefreshTrigger > 0 && open) {
      refetch();
    }
  }, [banRefreshTrigger, open]);

  // Reset page when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPage(0);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 border-b border-border p-4">
          <div className="flex items-center justify-between">
            <DialogTitle>
              {isStarted ? "Scores" : "Entrants"} Table
            </DialogTitle>
            <div className="flex items-center gap-3 mr-6">
              <button
                onClick={refetch}
                disabled={loading}
                aria-label="Refresh"
                className="flex items-center justify-center h-8 w-8 rounded-md border border-brand/30 bg-black text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
              >
                <REFRESH className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <span className="text-sm text-muted-foreground">
                {loading ? "Loading..." : `${totalCount} ${totalCount === 1 ? "entry" : "entries"}`}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16 text-center">Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Score</TableHead>
                {isEnded && (
                  <TableHead className="text-center">Submitted</TableHead>
                )}
                <TableHead className="w-24 text-right">Prize</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="overflow-y-auto">
              {pageEntries.length > 0 ? (
                pageEntries.map((entry: any, index: number) => {
                  const ownerAddress = entry.owner ?? "0x0";
                  const shortAddress = displayAddress(ownerAddress);
                  const username = usernames?.get(indexAddress(ownerAddress));
                  const displayName = entry.playerName || username || shortAddress;
                  const showSubAddress = displayName !== shortAddress;
                  const reg = regMap.get(entry.tokenId);
                  const hasSubmitted = !!reg?.hasSubmitted;
                  const isBanned = !!reg?.isBanned;
                  const pos0 = currentPage * pageSize + index;
                  const prize = prizesByPosition?.get(pos0 + 1);

                  return (
                    <TableRow key={entry.tokenId} className={isBanned ? "opacity-60" : ""}>
                      <TableCell className="text-center font-medium font-brand">
                        {positionLabel(pos0)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-medium truncate">
                              {displayName}
                            </span>
                            {showSubAddress ? (
                              <div className="flex flex-row items-center gap-1 text-xs text-muted-foreground">
                                <span>{shortAddress}</span>
                                {blockExplorerUrl && (
                                  <a
                                    href={`${blockExplorerUrl}/contract/${ownerAddress}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-brand-muted hover:text-brand transition-colors"
                                    aria-label="View on explorer"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              blockExplorerUrl && (
                                <a
                                  href={`${blockExplorerUrl}/contract/${ownerAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-brand-muted hover:text-brand transition-colors"
                                  aria-label="View on explorer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )
                            )}
                          </div>
                          {isBanned && (
                            <Ban className="w-4 h-4 text-destructive flex-shrink-0" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {entry.score || 0}
                      </TableCell>
                      {isEnded && (
                        <TableCell className="text-center">
                          {hasSubmitted ? (
                            <div className="inline-flex justify-center w-full">
                              <span className="w-4 h-4 text-brand">
                                <VERIFIED />
                              </span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <PrizeCell prize={prize} highlight={pos0 < 3} />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={isEnded ? 5 : 4}
                    className="text-center text-muted-foreground py-8"
                  >
                    {loading ? "Loading..." : "No entries yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="flex-shrink-0 p-4 border-t border-border">
            <Pagination
              totalPages={totalPages}
              currentPage={currentPage}
              nextPage={nextPage}
              previousPage={previousPage}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
