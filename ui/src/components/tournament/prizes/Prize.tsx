import { motion } from "framer-motion";
import { formatNumber, getOrdinalSuffix, indexAddress } from "@/lib/utils";
import { calculatePrizeValue, countTotalNFTs } from "@/lib/utils/formatting";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { TokenPrices } from "@/hooks/useEkuboPrices";
import { TokenPrizes, TokenMetadata } from "@/lib/types";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { QUESTION } from "@/components/Icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDojo } from "@/context/dojo";
import { useState, useMemo } from "react";
import { useNftTokenUris } from "@/hooks/useNftTokenUris";
import NftPreview from "@/components/tournament/prizes/NftPreview";

interface PrizeProps {
  position: number;
  prizes: TokenPrizes;
  prices: TokenPrices;
  tokens: TokenMetadata[];
  tokenDecimals: Record<string, number>;
  nftSymbols?: Record<string, string>;
}

const Prize = ({
  position,
  prizes,
  prices,
  tokens,
  tokenDecimals,
  nftSymbols = {},
}: PrizeProps) => {
  const { selectedChainConfig } = useDojo();
  const totalPrizeNFTs = countTotalNFTs(prizes);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);

  // Extract NFT info for fetching token URIs
  const nftPrizes = useMemo(() => {
    const nfts: { address: string; tokenId: bigint }[] = [];
    Object.values(prizes).forEach((prize) => {
      if (prize.type === "erc721") {
        if (Array.isArray(prize.value)) {
          prize.value.forEach((tokenId) => {
            nfts.push({ address: prize.address, tokenId });
          });
        } else {
          nfts.push({ address: prize.address, tokenId: prize.value });
        }
      }
    });
    return nfts;
  }, [prizes]);

  // Fetch NFT token URIs
  const { tokenUris, loading: nftUrisLoading } = useNftTokenUris(nftPrizes);

  // Get NFT symbol for the summary display
  const getNftSymbol = () => {
    const nftPrizes = Object.entries(prizes).filter(
      ([_, prize]) => prize.type === "erc721"
    );
    if (nftPrizes.length === 0) return "NFT";

    // Get the first NFT's address
    const firstNftAddress = nftPrizes[0][1].address;
    const nftToken = tokens.find(
      (t) => indexAddress(t.token_address) === indexAddress(firstNftAddress)
    );
    return nftToken?.symbol || nftSymbols[firstNftAddress] || "NFT";
  };

  // Calculate total USD value using token addresses
  const totalPrizesValueUSD = Object.entries(prizes)
    .filter(([_, prize]) => prize.type === "erc20")
    .reduce((total, [_key, prize]) => {
      const price = prices[prize.address];
      const decimals = tokenDecimals[prize.address] || 18;
      const amount = Number(prize.value) / 10 ** decimals;
      if (price === undefined) return total;
      return total + price * amount;
    }, 0);

  const chainId = selectedChainConfig?.chainId ?? "";

  // Function to render prize details content
  const renderPrizeDetails = () => (
    <div className="flex flex-col gap-2 max-h-[400px]">
      <div className="pt-4 px-4 flex-shrink-0">
        <h4 className="font-brand">
          {position}
          <sup>{getOrdinalSuffix(position)}</sup> Prize
        </h4>
      </div>
      <div className="w-full bg-brand/50 h-0.5 flex-shrink-0" />
      <div className="flex flex-col gap-2 overflow-y-auto px-4 py-2">
        {Object.entries(prizes)
          .map(([key, prize]) => {
            const token = tokens.find((t) => t.token_address === prize.address);
            const symbol = token?.symbol || key;
            const hasPrice = prices[prize.address] !== undefined;
            const USDValue = calculatePrizeValue(
              prize,
              prize.address,
              prices,
              tokenDecimals
            );
            return {
              key,
              symbol,
              prize,
              hasPrice,
              USDValue,
            };
          })
          .sort((a, b) => b.USDValue - a.USDValue) // Sort by USDValue in descending order
          .map(({ key, prize, hasPrice, USDValue }) => {
            const token = tokens.find(
              (token) => token.token_address === prize.address
            );
            const decimals = tokenDecimals[prize.address] || 18;
            return (
              <div key={key} className="flex justify-between items-center">
                {prize.type === "erc20" ? (
                  <div className="flex flex-row gap-1 items-center">
                    <span>{`${formatNumber(
                      Number(prize.value) / 10 ** decimals
                    )}`}</span>
                    {getTokenLogoUrl(chainId, prize.address) ? (
                      <img
                        src={getTokenLogoUrl(chainId, prize.address)}
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <span className="text-brand-muted text-xs">
                        {token?.symbol}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {(() => {
                      const nftToken = tokens.find(
                        (t) =>
                          indexAddress(t.token_address) ===
                          indexAddress(prize.address)
                      );
                      const nftSymbol =
                        nftToken?.symbol || nftSymbols[prize.address] || "NFT";

                      if (Array.isArray(prize.value)) {
                        const count = prize.value.length;
                        if (count > 5) {
                          // Show summary for more than 5 NFTs
                          return (
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-2">
                                {prize.value.slice(0, 3).map((tokenId, idx) => (
                                  <NftPreview
                                    key={idx}
                                    tokenUri={
                                      tokenUris[`${prize.address}_${tokenId}`]
                                    }
                                    tokenId={tokenId}
                                    symbol={nftSymbol}
                                    size="sm"
                                    loading={nftUrisLoading}
                                  />
                                ))}
                              </div>
                              <span>
                                {count} {nftSymbol}
                                {count > 1 ? "s" : ""}
                              </span>
                            </div>
                          );
                        } else {
                          // Show individual NFTs for 5 or fewer
                          return prize.value.map((tokenId, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <NftPreview
                                tokenUri={
                                  tokenUris[`${prize.address}_${tokenId}`]
                                }
                                tokenId={tokenId}
                                symbol={nftSymbol}
                                size="sm"
                                loading={nftUrisLoading}
                              />
                              <span>
                                {nftSymbol} #{tokenId.toString()}
                              </span>
                            </div>
                          ));
                        }
                      } else {
                        return (
                          <div className="flex items-center gap-2">
                            <NftPreview
                              tokenUri={
                                tokenUris[`${prize.address}_${prize.value}`]
                              }
                              tokenId={prize.value}
                              symbol={nftSymbol}
                              size="sm"
                              loading={nftUrisLoading}
                            />
                            <span>
                              {nftSymbol} #{prize.value.toString()}
                            </span>
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
                {prize.type === "erc20" && hasPrice ? (
                  <span className="text-neutral">~${USDValue.toFixed(2)}</span>
                ) : prize.type === "erc20" ? (
                  <Tooltip delayDuration={50}>
                    <TooltipTrigger asChild>
                      <span className="w-6 h-6 text-neutral cursor-pointer">
                        <QUESTION />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-black text-brand 3xl:text-lg">
                      <span className="text-neutral">
                        No Price Data Available
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            );
          })}
      </div>
      {totalPrizesValueUSD > 0 && (
        <div className="flex flex-col gap-2 flex-shrink-0">
          <div className="w-full bg-brand/50 h-0.5" />
          <div className="flex justify-between items-center px-4 pb-2">
            <span className="font-brand">Total</span>
            <span>${totalPrizesValueUSD.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop hover card (hidden on mobile) */}
      <div className="hidden sm:block">
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: position * 0.1 }}
              className="flex items-center gap-4 p-2 sm:p-3 rounded-lg border border-brand/20 w-fit hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 transition-all duration-200"
            >
              <div className="flex items-center justify-center w-6 h-6 xl:w-8 xl:h-8 3xl:w-10 3xl:h-10 rounded-full bg-brand/20">
                <span className="font-brand xl:text-lg 3xl:text-2xl text-brand">
                  {position}
                  <sup>{getOrdinalSuffix(position)}</sup>
                </span>
              </div>
              {totalPrizesValueUSD > 0 || totalPrizeNFTs > 0 ? (
                <div className="flex flex-row items-center gap-2 font-brand xl:text-lg 3xl:text-2xl">
                  {totalPrizesValueUSD > 0 && (
                    <span>{`$${totalPrizesValueUSD.toFixed(2)}`}</span>
                  )}
                  {totalPrizesValueUSD > 0 && totalPrizeNFTs > 0 && (
                    <span className="text-brand/25">|</span>
                  )}
                  {totalPrizeNFTs > 0 && (
                    <span>
                      {totalPrizeNFTs} {getNftSymbol()}
                      {totalPrizeNFTs === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              ) : Object.entries(prizes).length > 0 ? (
                <div className="flex flex-row items-center gap-2 font-brand xl:text-lg 3xl:text-2xl">
                  {Object.entries(prizes)
                    .filter(([_, prize]) => {
                      // Prioritize ERC20 - if any ERC20 exists, only show ERC20s
                      const hasERC20 = Object.values(prizes).some(
                        (p) => p.type === "erc20"
                      );
                      return hasERC20 ? prize.type === "erc20" : true;
                    })
                    .map(([key, prize]) => {
                      const decimals = tokenDecimals[prize.address] || 18;
                      const token = tokens.find(
                        (t) => t.token_address === prize.address
                      );
                      const symbol = token?.symbol || key;
                      return (
                        <div
                          className="flex flex-row items-center gap-2"
                          key={key}
                        >
                          {prize.type === "erc20" ? (
                            <>
                              <span className="whitespace-nowrap">{`${formatNumber(
                                Number(prize.value) / 10 ** decimals
                              )}`}</span>
                              <div className="w-6 h-6">
                                <img
                                  src={getTokenLogoUrl(chainId, prize.address)}
                                  alt={`${symbol} token`}
                                />
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {(() => {
                                const nftToken = tokens.find(
                                  (t) =>
                                    indexAddress(t.token_address) ===
                                    indexAddress(prize.address)
                                );
                                const nftSymbol =
                                  nftToken?.symbol ||
                                  nftSymbols[prize.address] ||
                                  "NFT";
                                if (Array.isArray(prize.value)) {
                                  const firstTokenId = prize.value[0];
                                  return (
                                    <>
                                      <NftPreview
                                        tokenUri={
                                          tokenUris[
                                            `${prize.address}_${firstTokenId}`
                                          ]
                                        }
                                        tokenId={firstTokenId}
                                        symbol={nftSymbol}
                                        size="sm"
                                        loading={nftUrisLoading}
                                        showTooltip={false}
                                      />
                                      <span>
                                        {nftSymbol} #{firstTokenId?.toString()}
                                        {prize.value.length > 1 &&
                                          ` +${prize.value.length - 1}`}
                                      </span>
                                    </>
                                  );
                                } else {
                                  return (
                                    <>
                                      <NftPreview
                                        tokenUri={
                                          tokenUris[
                                            `${prize.address}_${prize.value}`
                                          ]
                                        }
                                        tokenId={prize.value}
                                        symbol={nftSymbol}
                                        size="sm"
                                        loading={nftUrisLoading}
                                        showTooltip={false}
                                      />
                                      <span>
                                        {nftSymbol} #{prize.value.toString()}
                                      </span>
                                    </>
                                  );
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <span>No Prizes</span>
              )}
            </motion.div>
          </HoverCardTrigger>
          <HoverCardContent
            className="w-48 p-0 text-sm z-50"
            align="center"
            side="top"
            sideOffset={5}
          >
            {renderPrizeDetails()}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Mobile clickable element (hidden on desktop) */}
      <motion.div
        className="sm:hidden flex items-center gap-4 p-2 rounded-lg border border-brand/20 w-fit hover:cursor-pointer hover:bg-brand/25 hover:border-brand/30 transition-all duration-200"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: position * 0.1 }}
        onClick={() => setIsMobileDialogOpen(true)}
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-brand/20">
          <span className="font-brand text-brand">
            {position}
            <sup>{getOrdinalSuffix(position)}</sup>
          </span>
        </div>
        {totalPrizesValueUSD > 0 || totalPrizeNFTs > 0 ? (
          <div className="flex flex-row items-center gap-2 font-brand">
            {totalPrizesValueUSD > 0 && (
              <span>${totalPrizesValueUSD.toFixed(2)}</span>
            )}
            {totalPrizesValueUSD > 0 && totalPrizeNFTs > 0 && (
              <span className="text-brand/25">|</span>
            )}
            {totalPrizeNFTs > 0 && (
              <span>
                {totalPrizeNFTs} {getNftSymbol()}
                {totalPrizeNFTs === 1 ? "" : "s"}
              </span>
            )}
          </div>
        ) : Object.entries(prizes).length > 0 ? (
          <div className="flex flex-row items-center gap-2 font-brand">
            {Object.entries(prizes)
              .filter(([_, prize]) => {
                // Prioritize ERC20 - if any ERC20 exists, only show ERC20s
                const hasERC20 = Object.values(prizes).some(
                  (p) => p.type === "erc20"
                );
                return hasERC20 ? prize.type === "erc20" : true;
              })
              .map(([key, prize]) => {
                const decimals = tokenDecimals[prize.address] || 18;
                const token = tokens.find(
                  (t) => t.token_address === prize.address
                );
                const symbol = token?.symbol || key;
                return (
                  <div className="flex flex-row items-center gap-2" key={key}>
                    {prize.type === "erc20" ? (
                      <>
                        <span className="whitespace-nowrap">{`${formatNumber(
                          Number(prize.value) / 10 ** decimals
                        )}`}</span>
                        <div className="w-6 h-6">
                          <img
                            src={getTokenLogoUrl(chainId, prize.address)}
                            alt={`${symbol} token`}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        {(() => {
                          const nftToken = tokens.find(
                            (t) =>
                              indexAddress(t.token_address) ===
                              indexAddress(prize.address)
                          );
                          const nftSymbol =
                            nftToken?.symbol ||
                            nftSymbols[prize.address] ||
                            "NFT";
                          if (Array.isArray(prize.value)) {
                            const firstTokenId = prize.value[0];
                            return (
                              <>
                                <NftPreview
                                  tokenUri={
                                    tokenUris[
                                      `${prize.address}_${firstTokenId}`
                                    ]
                                  }
                                  tokenId={firstTokenId}
                                  symbol={nftSymbol}
                                  size="sm"
                                  loading={nftUrisLoading}
                                  showTooltip={false}
                                />
                                <span>
                                  {nftSymbol} #{firstTokenId?.toString()}
                                  {prize.value.length > 1 &&
                                    ` +${prize.value.length - 1}`}
                                </span>
                              </>
                            );
                          } else {
                            return (
                              <>
                                <NftPreview
                                  tokenUri={
                                    tokenUris[`${prize.address}_${prize.value}`]
                                  }
                                  tokenId={prize.value}
                                  symbol={nftSymbol}
                                  size="sm"
                                  loading={nftUrisLoading}
                                  showTooltip={false}
                                />
                                <span>
                                  {nftSymbol} #{prize.value.toString()}
                                </span>
                              </>
                            );
                          }
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <span>No Prizes</span>
        )}
      </motion.div>

      {/* Mobile dialog for prize details */}
      <Dialog open={isMobileDialogOpen} onOpenChange={setIsMobileDialogOpen}>
        <DialogContent className="sm:hidden bg-black border border-brand p-0 rounded-lg max-w-[90vw] mx-auto">
          {renderPrizeDetails()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Prize;
