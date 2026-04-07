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
import { Button } from "@/components/ui/button";
import Pagination from "@/components/table/Pagination";
import { useState, useEffect, useMemo } from "react";
import { BigNumberish, addAddressPadding } from "starknet";
import { useTokens } from "@provable-games/denshokan-sdk/react";
import { REFRESH, VERIFIED } from "@/components/Icons";
import { Ban } from "lucide-react";
import { useRegistrations } from "@provable-games/budokan-sdk/react";
import { useChainConfig } from "@/context/chain";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScoreTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  entryCount: number;
  isStarted: boolean;
  isEnded: boolean;
  banRefreshTrigger?: number;
}

/** Parse a base64 data URI token URI into the image URL */
function parseTokenUriImage(raw?: string): string {
  if (!raw) return "";
  try {
    const match = raw.match(/^data:application\/json;base64,(.+)$/);
    const json = match ? atob(match[1]) : raw;
    return JSON.parse(json)?.image ?? "";
  } catch {
    return "";
  }
}

export const ScoreTableDialog = ({
  open,
  onOpenChange,
  tournamentId,
  entryCount,
  isStarted,
  isEnded,
  banRefreshTrigger,
}: ScoreTableDialogProps) => {
  const { selectedChainConfig } = useChainConfig();
  const tournamentAddress = selectedChainConfig.budokanAddress!;

  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 10;

  // Paginated tokens with URI
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
          includeUri: true,
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
              <Button
                onClick={refetch}
                disabled={loading}
                size="xs"
                variant="outline"
              >
                <REFRESH className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
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
                <TableHead className="w-16">Image</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="overflow-y-auto">
              {pageEntries.length > 0 ? (
                pageEntries.map((entry: any, index: number) => {
                  const playerName = entry.playerName || "";
                  const ownerAddress = entry.owner ?? "0x0";
                  const shortAddress = `${ownerAddress?.slice(0, 6)}...${ownerAddress?.slice(-4)}`;
                  const reg = regMap.get(entry.tokenId);
                  const hasSubmitted = !!reg?.hasSubmitted;
                  const isBanned = !!reg?.isBanned;
                  const rank = currentPage * pageSize + index + 1;
                  const image = parseTokenUriImage(entry.tokenUri);

                  return (
                    <TableRow key={entry.tokenId} className={isBanned ? "opacity-60" : ""}>
                      <TableCell className="text-center font-medium">
                        {rank}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col flex-1">
                            <span className="font-medium">
                              {playerName || shortAddress}
                            </span>
                            {playerName && (
                              <span className="text-xs text-muted-foreground">
                                {shortAddress}
                              </span>
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
                      <TableCell className="p-1">
                        {image ? (
                          <Tooltip delayDuration={50}>
                            <TooltipTrigger asChild>
                              <div className="w-14 h-14 cursor-pointer">
                                <object
                                  data={image}
                                  type="image/svg+xml"
                                  className="w-14 h-14 rounded-md pointer-events-none"
                                >
                                  <img
                                    src={image}
                                    alt=""
                                    className="w-14 h-14 rounded-md"
                                  />
                                </object>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              className="bg-black p-2 border border-brand/20 z-[9999]"
                              side="left"
                              sideOffset={10}
                            >
                              <object
                                data={image}
                                type="image/svg+xml"
                                className="w-[280px] h-auto rounded-md"
                              >
                                <img
                                  src={image}
                                  alt=""
                                  className="w-[280px] h-auto rounded-md"
                                />
                              </object>
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
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
