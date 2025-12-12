import { useMemo, useState } from "react";
import { FormLabel } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getTokenSymbol, getTokenLogoUrl } from "@/lib/tokensMeta";
import { X } from "@/components/Icons";
import { getOrdinalSuffix, formatNumber } from "@/lib/utils";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
import {
  PrizeSelector,
  PrizeSelectorData,
} from "@/components/shared/PrizeSelector";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { FormToken } from "@/lib/types";

type Prize =
  | {
      type: "ERC20";
      token: FormToken;
      amount: number;
      position: number;
      tokenDecimals?: number;
      distribution?: "exponential" | "linear" | "uniform";
      distributionCount?: number;
    }
  | {
      type: "ERC721";
      token: FormToken;
      tokenId: number;
      position: number;
    };

interface PrizeManagerProps {
  chainId: string;
  isSepolia: boolean;
  prizes: Prize[];
  onPrizesChange: (prizes: Prize[]) => void;
  checkBalance?: boolean;
}

export function PrizeManager({
  chainId,
  isSepolia,
  prizes,
  onPrizesChange,
  checkBalance = true,
}: PrizeManagerProps) {
  const { getTokenDecimals } = useSystemCalls();
  const [selectedNFTToken, setSelectedNFTToken] = useState<
    FormToken | undefined
  >(undefined);
  const [selectedTokenType, setSelectedTokenType] = useState<
    "ERC20" | "ERC721" | ""
  >("");
  const [tokenIdsInput, setTokenIdsInput] = useState<string>("");

  const uniqueTokenAddresses = useMemo(() => {
    const symbols = prizes
      .filter((prize) => prize.type === "ERC20")
      .map((prize) => prize.token.address);

    return [...new Set(symbols)];
  }, [prizes, chainId]);

  const { prices, isLoading: pricesLoading } = useEkuboPrices({
    tokens: uniqueTokenAddresses,
  });

  const handleAddPrize = async (prizeData: PrizeSelectorData) => {
    if (prizeData.tokenType === "ERC20" && prizeData.distributions) {
      // Fetch token decimals for ERC20 tokens
      let tokenDecimals = 18;
      try {
        tokenDecimals = await getTokenDecimals(prizeData.token.address);
      } catch (error) {
        console.error("Failed to fetch token decimals:", error);
      }

      // Calculate the total amount to be distributed
      const totalAmount = prizeData.amount ?? 0;

      // Add a single prize with distribution metadata
      const newPrize: Prize = {
        type: "ERC20" as const,
        token: prizeData.token,
        amount: totalAmount,
        position: 1, // Starting position
        tokenDecimals,
        distribution: prizeData.distribution,
        distributionCount: prizeData.distribution_count,
      };

      onPrizesChange([...prizes, newPrize]);
    } else if (
      prizeData.tokenType === "ERC721" &&
      prizeData.tokenId &&
      prizeData.position
    ) {
      const newPrize: Prize = {
        type: "ERC721",
        token: prizeData.token,
        tokenId: prizeData.tokenId,
        position: prizeData.position,
      };

      onPrizesChange([...prizes, newPrize]);
    }
  };

  const handleRemovePrize = (index: number) => {
    const newPrizes = [...prizes];
    newPrizes.splice(index, 1);
    onPrizesChange(newPrizes);
  };

  const handleBulkNFTInput = () => {
    if (!selectedNFTToken) {
      alert("Please select a token first");
      return;
    }

    try {
      const trimmedInput = tokenIdsInput.trim();
      const newNFTPrizes: Prize[] = [];

      // Try to detect format
      if (trimmedInput.startsWith("[") && trimmedInput.endsWith("]")) {
        // JSON array format - array of objects only
        const parsed = JSON.parse(trimmedInput);

        if (Array.isArray(parsed) && parsed.length > 0) {
          if (
            typeof parsed[0] === "object" &&
            parsed[0].tokenId !== undefined
          ) {
            // Array of objects: [{ tokenId: 1, position: 1 }, ...]
            newNFTPrizes.push(
              ...parsed.map((item) => {
                if (
                  typeof item.tokenId !== "number" ||
                  typeof item.position !== "number"
                ) {
                  throw new Error(
                    "Invalid object format - each object must have tokenId and position as numbers"
                  );
                }
                if (item.position < 1) {
                  throw new Error(`Position ${item.position} must be >= 1`);
                }
                return {
                  type: "ERC721" as const,
                  token: selectedNFTToken,
                  tokenId: item.tokenId,
                  position: item.position,
                };
              })
            );
          } else {
            throw new Error(
              "JSON array must contain objects with tokenId and position fields"
            );
          }
        }
      } else if (trimmedInput.includes(":")) {
        // Key-value format: tokenId:position (one per line or comma separated)
        // Example: "1:1, 2:2, 3:3" or "1:1\n2:2\n3:3"
        const lines = trimmedInput.split(/[\n,]+/);

        newNFTPrizes.push(
          ...lines
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
              const [tokenIdStr, positionStr] = line
                .split(":")
                .map((s) => s.trim());
              const tokenId = parseInt(tokenIdStr);
              const position = parseInt(positionStr);

              if (isNaN(tokenId) || isNaN(position)) {
                throw new Error(`Invalid format in line: ${line}`);
              }

              if (position < 1) {
                throw new Error(`Position ${position} must be >= 1`);
              }

              return {
                type: "ERC721" as const,
                token: selectedNFTToken,
                tokenId,
                position,
              };
            })
        );
      } else {
        throw new Error(
          "Position information is required. Please use tokenId:position format or JSON object array format"
        );
      }

      // Validate we have prizes to add
      if (newNFTPrizes.length === 0) {
        alert("No valid NFT prizes to add");
        return;
      }

      // Add all NFT prizes
      onPrizesChange([...prizes, ...newNFTPrizes]);

      // Clear the input
      setTokenIdsInput("");
    } catch (error) {
      alert(
        `Invalid format. Supported formats:\n\n` +
          `1. Token:Position pairs (one per line or comma-separated):\n` +
          `   1:1, 2:2, 3:3\n\n` +
          `2. JSON array of objects:\n` +
          `   [{ "tokenId": 1, "position": 1 }, { "tokenId": 2, "position": 2 }]\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PrizeSelector
        chainId={chainId}
        isSepolia={isSepolia}
        onAddPrize={handleAddPrize}
        checkBalance={checkBalance}
        existingPrizes={prizes}
        onTokenSelect={(token, tokenType) => {
          setSelectedNFTToken(token);
          setSelectedTokenType(tokenType);
        }}
      />

      {/* Bulk NFT Input Section - Only show when ERC721 token is selected */}
      {selectedTokenType === "ERC721" && selectedNFTToken && (
        <>
          <div className="w-full h-0.5 bg-brand/25" />
          <div className="space-y-2 border border-brand-muted p-4 rounded-lg">
            <div className="flex flex-col gap-1">
              <span className="font-semibold">Bulk Add NFTs</span>
              <span className="text-sm text-neutral">
                Add multiple NFTs from{" "}
                {selectedNFTToken.symbol || selectedNFTToken.name} with position
                mapping
              </span>
            </div>

            <div className="flex flex-col gap-4">
              {/* Bulk Input TextArea */}
              {selectedNFTToken && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm">Token IDs with Positions</Label>
                    <textarea
                      placeholder={`Supported formats:

1. Token:Position pairs (one per line or comma-separated):
   1:1
   2:2
   3:2

2. JSON array of objects:
   [{ "tokenId": 1, "position": 1 }, { "tokenId": 2, "position": 2 }]

Examples:
- Award 3 NFTs to first place: 1:1, 2:1, 3:1
- Distribute across positions: 1:1, 2:2, 3:3, 4:100`}
                      value={tokenIdsInput}
                      onChange={(e) => setTokenIdsInput(e.target.value)}
                      className="flex min-h-[120px] w-full rounded-md border border-brand-muted bg-black px-3 py-2 text-sm text-brand placeholder:text-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
                      rows={6}
                    />
                  </div>
                  <div className="flex justify-end items-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBulkNFTInput}
                      disabled={!tokenIdsInput.trim()}
                    >
                      Add All NFTs
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {prizes.length > 0 && (
        <>
          <div className="w-full h-0.5 bg-brand/25" />
          <div className="space-y-2">
            <FormLabel className="font-brand text-2xl">Added Prizes</FormLabel>
            <div className="flex flex-row items-center gap-2 overflow-x-auto pb-2 w-full">
              {prizes.map((prize, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-background/50 border border-brand-muted/50 rounded flex-shrink-0"
                >
                  {prize.type === "ERC20" &&
                  prize.distribution &&
                  prize.distributionCount ? (
                    // Display distributed prize
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-neutral">
                          Top {prize.distributionCount} positions
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-row gap-1 items-center">
                          <span>{formatNumber(prize.amount ?? 0)}</span>
                          <img
                            src={getTokenLogoUrl(chainId, prize.token.address)}
                            className="w-6 h-6 flex-shrink-0 rounded-full"
                            alt="Token logo"
                          />
                        </div>

                        <span className="text-sm text-neutral">
                          {pricesLoading
                            ? "Loading..."
                            : prices?.[prize.token.address ?? ""] &&
                              `~$${(
                                (prize.amount ?? 0) *
                                (prices?.[prize.token.address ?? ""] ?? 0)
                              ).toFixed(2)}`}
                        </span>
                      </div>
                      <div className="text-xs text-neutral capitalize">
                        {prize.distribution} distribution
                      </div>
                    </div>
                  ) : (
                    // Display single position prize
                    <>
                      <span>
                        {prize.position}
                        {getOrdinalSuffix(prize.position)}
                      </span>

                      <div className="flex flex-row items-center gap-2">
                        {prize.type === "ERC20" ? (
                          <div className="flex flex-row items-center gap-1">
                            <div className="flex flex-row gap-1 items-center">
                              <span>{formatNumber(prize.amount ?? 0)}</span>
                              <img
                                src={getTokenLogoUrl(
                                  chainId,
                                  prize.token.address
                                )}
                                className="w-6 h-6 flex-shrink-0 rounded-full"
                                alt="Token logo"
                              />
                            </div>

                            <span className="text-sm text-neutral">
                              {pricesLoading
                                ? "Loading..."
                                : prices?.[prize.token.address ?? ""] &&
                                  `~$${(
                                    (prize.amount ?? 0) *
                                    (prices?.[prize.token.address ?? ""] ?? 0)
                                  ).toFixed(2)}`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-row items-center gap-1">
                            <img
                              src={getTokenLogoUrl(
                                chainId,
                                prize.token.address
                              )}
                              className="w-6 h-6 flex-shrink-0 rounded-full"
                              alt="Token logo"
                            />
                            <span className="whitespace-nowrap text-neutral">
                              #{prize.tokenId}
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Delete button */}
                  <span
                    className="w-6 h-6 text-brand-muted cursor-pointer flex-shrink-0"
                    onClick={() => handleRemovePrize(index)}
                  >
                    <X />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
