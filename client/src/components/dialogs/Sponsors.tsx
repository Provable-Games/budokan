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
import { TokenPrices } from "@/hooks/useEkuboPrices";
import {
  formatNumber,
  indexAddress,
  aggregatePrizesBySponsor,
} from "@/lib/utils";
import type { SponsorContribution as MgSponsorContribution } from "@/lib/utils";
import { getTokenLogoUrl, getTokenSymbol } from "@/lib/tokensMeta";
import { useChainConfig } from "@/context/chain";
import { useMemo } from "react";
import { usePrizes } from "@provable-games/budokan-sdk/react";
import { BigNumberish } from "starknet";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetUsernames } from "@/hooks/useController";
import { useNftTokenUris } from "@/hooks/useNftTokenUris";
import NftPreview from "@/components/tournament/prizes/NftPreview";
import { adaptSdkPrize } from "@/lib/utils/prizeAdapters";
import type { Prize as MetagamePrize } from "@provable-games/metagame-sdk";

interface SponsorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prices: TokenPrices;
  tokenDecimals: Record<string, number>;
  tournamentId?: BigNumberish;
}

interface TokenContribution {
  tokenAddress: string;
  totalAmount: bigint;
  count: number;
  usdValue: number;
}

interface NftCollectionContribution {
  tokenAddress: string;
  tokenSymbol: string;
  nfts: { tokenId: bigint }[];
}

interface EnrichedSponsorContribution {
  sponsorAddress: string;
  tokens: Map<string, TokenContribution>;
  nftCollections: Map<string, NftCollectionContribution>;
  totalUsdValue: number;
  totalPrizes: number;
}

export const SponsorsDialog = ({
  open,
  onOpenChange,
  prices,
  tokenDecimals,
  tournamentId,
}: SponsorsDialogProps) => {
  const { selectedChainConfig } = useChainConfig();
  const chainId = selectedChainConfig?.chainId ?? "";

  const tournamentIdStr = tournamentId ? String(tournamentId) : undefined;

  // Fetch all prizes to get sponsored ones
  const { prizes: sponsoredPrizes, loading: prizesLoading } =
    usePrizes(
      open ? tournamentIdStr : undefined,
    );
  const prizesData = sponsoredPrizes;

  // Convert budokan-sdk prizes to metagame-sdk Prize type
  const mgPrizes = useMemo<MetagamePrize[]>(
    () => (prizesData ?? []).map(adaptSdkPrize),
    [prizesData],
  );

  // Group prizes by sponsor using metagame-sdk aggregation
  const sponsorContributions = useMemo(() => {
    if (mgPrizes.length === 0) return [];

    const mgSponsors: MgSponsorContribution[] =
      aggregatePrizesBySponsor(mgPrizes);

    // Build a lookup of NFT prizes per sponsor for collection grouping
    // (the SDK aggregation counts NFTs but doesn't track individual token IDs)
    const nftsBySponsor = new Map<
      string,
      Map<string, NftCollectionContribution>
    >();
    for (const prize of mgPrizes) {
      if (
        prize.tokenType !== "erc721" ||
        !prize.sponsorAddress ||
        prize.sponsorAddress === "0x0"
      )
        continue;

      if (!nftsBySponsor.has(prize.sponsorAddress)) {
        nftsBySponsor.set(prize.sponsorAddress, new Map());
      }
      const collections = nftsBySponsor.get(prize.sponsorAddress)!;

      if (!collections.has(prize.tokenAddress)) {
        const tokenSymbol =
          getTokenSymbol(chainId, prize.tokenAddress) || "NFT";
        collections.set(prize.tokenAddress, {
          tokenAddress: prize.tokenAddress,
          tokenSymbol,
          nfts: [],
        });
      }

      collections.get(prize.tokenAddress)!.nfts.push({
        tokenId: BigInt(prize.amount),
      });
    }

    // Enrich each sponsor contribution with USD values and NFT details
    const enriched: EnrichedSponsorContribution[] = mgSponsors.map(
      (mgSponsor) => {
        const tokens = new Map<string, TokenContribution>();
        let totalUsdValue = 0;

        for (const token of mgSponsor.tokens) {
          const decimals =
            tokenDecimals[indexAddress(token.tokenAddress)] || 18;
          const tokenAmount = Number(token.totalAmount) / 10 ** decimals;
          const tokenPrice = prices[indexAddress(token.tokenAddress)] ?? 0;
          const usdValue = tokenAmount * tokenPrice;

          tokens.set(token.tokenAddress, {
            tokenAddress: token.tokenAddress,
            totalAmount: token.totalAmount,
            count: token.prizeCount,
            usdValue,
          });

          totalUsdValue += usdValue;
        }

        return {
          sponsorAddress: mgSponsor.sponsorAddress,
          tokens,
          nftCollections:
            nftsBySponsor.get(mgSponsor.sponsorAddress) ?? new Map(),
          totalUsdValue,
          totalPrizes: mgSponsor.totalPrizeCount,
        };
      },
    );

    // Sort sponsors by total USD value (descending)
    return enriched.sort((a, b) => b.totalUsdValue - a.totalUsdValue);
  }, [mgPrizes, prices, tokenDecimals, chainId]);

  const totalSponsors = sponsorContributions.length;
  const totalSponsoredValue = sponsorContributions.reduce(
    (sum, sponsor) => sum + sponsor.totalUsdValue,
    0
  );

  // Get all sponsor addresses for username lookup
  const sponsorAddresses = useMemo(
    () => sponsorContributions.map((s) => s.sponsorAddress),
    [sponsorContributions]
  );

  // Fetch Cartridge usernames for sponsor addresses
  const { usernames } = useGetUsernames(sponsorAddresses);

  // Collect all NFTs for token URI fetching
  const allNfts = useMemo(() => {
    const nfts: { address: string; tokenId: bigint }[] = [];
    sponsorContributions.forEach((sponsor) => {
      sponsor.nftCollections.forEach((collection) => {
        collection.nfts.forEach((nft) => {
          nfts.push({ address: collection.tokenAddress, tokenId: nft.tokenId });
        });
      });
    });
    return nfts;
  }, [sponsorContributions]);

  const { tokenUris, loading: nftUrisLoading } = useNftTokenUris(allNfts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <span>Prize Sponsors ({totalSponsors})</span>
              {totalSponsoredValue > 0 && (
                <span className="text-brand-muted text-sm sm:text-base">
                  ${totalSponsoredValue.toFixed(2)} Total
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {prizesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : sponsorContributions.length === 0 ? (
          <div className="text-center py-8 text-brand-muted">
            No sponsors for this tournament
          </div>
        ) : (
          <div className="space-y-6">
            {sponsorContributions.map((sponsor, index) => (
              <div
                key={sponsor.sponsorAddress}
                className="border border-brand/20 rounded-lg p-3 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 mb-3">
                  <div>
                    {usernames?.get(indexAddress(sponsor.sponsorAddress)) ? (
                      <>
                        <h3 className="font-semibold text-base sm:text-lg">
                          {usernames.get(indexAddress(sponsor.sponsorAddress))}
                        </h3>
                        <p className="text-xs sm:text-sm text-brand-muted font-mono">
                          {sponsor.sponsorAddress.slice(0, 6)}...
                          {sponsor.sponsorAddress.slice(-4)}
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-semibold text-base sm:text-lg">
                          Sponsor {index + 1}
                        </h3>
                        <p className="text-xs sm:text-sm text-brand-muted font-mono">
                          {sponsor.sponsorAddress.slice(0, 6)}...
                          {sponsor.sponsorAddress.slice(-4)}
                        </p>
                      </>
                    )}
                  </div>
                  {sponsor.totalUsdValue > 0 && (
                    <div className="sm:text-right">
                      <p className="text-lg sm:text-xl font-bold text-brand">
                        ${sponsor.totalUsdValue.toFixed(2)}
                      </p>
                      <p className="text-xs sm:text-sm text-brand-muted">
                        {sponsor.totalPrizes} prize
                        {sponsor.totalPrizes !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>

                {/* Mobile: Card layout */}
                <div className="sm:hidden space-y-2">
                  {/* ERC20 Tokens */}
                  {Array.from(sponsor.tokens.values()).map((tokenContrib) => {
                    const decimals =
                      tokenDecimals[indexAddress(tokenContrib.tokenAddress)] || 18;
                    const tokenAmount =
                      Number(tokenContrib.totalAmount) / 10 ** decimals;

                    return (
                      <div
                        key={tokenContrib.tokenAddress}
                        className="bg-brand/5 rounded p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={getTokenLogoUrl(
                                chainId,
                                tokenContrib.tokenAddress
                              )}
                              className="w-5 h-5"
                              alt="token"
                            />
                            <span className="font-medium text-sm">
                              {getTokenSymbol(
                                chainId,
                                tokenContrib.tokenAddress
                              ) || "Unknown"}
                            </span>
                          </div>
                          <span className="text-xs text-brand-muted">
                            {tokenContrib.count} prize
                            {tokenContrib.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-muted">Amount:</span>
                          <span className="font-medium">
                            {formatNumber(tokenAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-brand-muted">USD Value:</span>
                          <span className="font-medium text-brand">
                            ${tokenContrib.usdValue.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* NFT Collections */}
                  {Array.from(sponsor.nftCollections.values()).map(
                    (collection) => (
                      <div
                        key={collection.tokenAddress}
                        className="bg-brand/5 rounded p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between border-b border-brand/10 pb-2">
                          <span className="font-medium text-sm">
                            {collection.tokenSymbol}
                          </span>
                          <span className="text-xs text-brand-muted">
                            {collection.nfts.length} NFT
                            {collection.nfts.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {collection.nfts.map((nft, idx) => (
                            <div
                              key={`${collection.tokenAddress}-${nft.tokenId}-${idx}`}
                              className="flex items-center gap-2"
                            >
                              <NftPreview
                                tokenUri={
                                  tokenUris[
                                    `${collection.tokenAddress}_${nft.tokenId}`
                                  ]
                                }
                                tokenId={nft.tokenId}
                                symbol={collection.tokenSymbol}
                                size="sm"
                                loading={nftUrisLoading}
                                showTooltip={false}
                              />
                              <span className="text-xs text-brand-muted">
                                #{nft.tokenId.toString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Desktop: Table layout */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead className="text-right">
                          Total Amount
                        </TableHead>
                        <TableHead className="text-right">USD Value</TableHead>
                        <TableHead className="text-right">
                          Prize Count
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* ERC20 Tokens */}
                      {Array.from(sponsor.tokens.values()).map(
                        (tokenContrib) => {
                          const decimals =
                            tokenDecimals[indexAddress(tokenContrib.tokenAddress)] || 18;
                          const tokenAmount =
                            Number(tokenContrib.totalAmount) / 10 ** decimals;

                          return (
                            <TableRow key={tokenContrib.tokenAddress}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <img
                                    src={getTokenLogoUrl(
                                      chainId,
                                      tokenContrib.tokenAddress
                                    )}
                                    className="w-6 h-6"
                                    alt="token"
                                  />
                                  <span>
                                    {getTokenSymbol(
                                      chainId,
                                      tokenContrib.tokenAddress
                                    ) || "Unknown"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(tokenAmount)}
                              </TableCell>
                              <TableCell className="text-right">
                                ${tokenContrib.usdValue.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-brand-muted">
                                {tokenContrib.count}
                              </TableCell>
                            </TableRow>
                          );
                        }
                      )}

                      {/* NFT Collections */}
                      {Array.from(sponsor.nftCollections.values()).map(
                        (collection) => (
                          <>
                            {/* Individual NFT rows */}
                            {collection.nfts.map((nft, idx) => (
                              <TableRow
                                key={`${collection.tokenAddress}-${nft.tokenId}-${idx}`}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <NftPreview
                                      tokenUri={
                                        tokenUris[
                                          `${collection.tokenAddress}_${nft.tokenId}`
                                        ]
                                      }
                                      tokenId={nft.tokenId}
                                      symbol={collection.tokenSymbol}
                                      size="sm"
                                      loading={nftUrisLoading}
                                    />
                                    <span className="text-sm text-brand-muted">
                                      #{nft.tokenId.toString()}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-brand-muted">
                                    {collection.tokenSymbol}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-brand-muted">-</span>
                                </TableCell>
                                <TableCell className="text-right text-brand-muted">
                                  1
                                </TableCell>
                              </TableRow>
                            ))}
                          </>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
