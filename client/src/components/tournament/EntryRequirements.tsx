import type { Tournament } from "@provable-games/budokan-sdk";
import {
  displayAddress,
  identifyExtensionType,
  parseTournamentValidatorConfig,
  parseERC20BalanceValidatorConfig,
  parseOpusTrovesValidatorConfig,
  parseMerkleValidatorConfig,
  getQualifyingModeInfo,
  formatTokenAmount,
  formatCashToUSD,
} from "@/lib/utils";
import { useChainConfig } from "@/context/chain";
import { useMerkleTrees } from "@provable-games/metagame-sdk/react";
import {
  COIN,
  TROPHY,
  CLOCK,
  LOCK,
  EXTERNAL_LINK,
  INFO,
  OPUS,
} from "@/components/Icons";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// Tournament type now comes from SDK
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMemo, useState } from "react";
import { ListChecks, Coins } from "lucide-react";
import type {
  TournamentValidatorConfig,
  ERC20BalanceValidatorConfig,
  OpusTrovesValidatorConfig,
  MerkleValidatorConfig,
} from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getTokenByAddress } from "@/lib/tokenUtils";
import { getTokenDecimals } from "@/lib/tokensMeta";
import { useEkuboPrices } from "@/hooks/useEkuboPrices";
// computeAbsoluteTimes no longer needed — SDK provides pre-computed timestamps

// Helper component for Entry Limit display with info tooltip
const EntryLimitInfo = ({ limit }: { limit: number }) => (
  <div className="flex flex-row items-center gap-2">
    <span>Entry Limit:</span>
    <span>{limit}</span>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="w-4 h-4 text-brand-muted hover:text-brand cursor-help">
            <INFO />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>
            Maximum number of times each eligible address can register for this
            tournament. Set to limit multiple entries per participant.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

const EntryRequirements = ({
  tournamentModel,
  tournamentsData,
}: {
  tournamentModel: Tournament;
  tournamentsData: Tournament[];
}) => {
  const entryRequirement = (tournamentModel as any)?.entryRequirement;
  if (!entryRequirement) {
    return null;
  }
  const { selectedChainConfig } = useChainConfig();

  const navigate = useNavigate();

  // SDK shape: { entryLimit, entryRequirementType: { type, tokenAddress?, config? } }
  const reqType = entryRequirement?.entryRequirementType;
  const entryLimit = entryRequirement?.entryLimit;
  const hasEntryLimit = Number(entryLimit) > 0;
  const activeVariant = useMemo(
    () => reqType?.type as string | undefined,
    [reqType]
  );

  const tokenAddress = useMemo(
    () => reqType?.tokenAddress,
    [reqType]
  );

  // Get token data from static tokens
  const token = useMemo(() => {
    if (activeVariant !== "token" || !tokenAddress) return undefined;
    return getTokenByAddress(tokenAddress, selectedChainConfig?.chainId ?? "");
  }, [tokenAddress, activeVariant, selectedChainConfig]);

  // Get CASH token for display
  const cashToken = useMemo(() => {
    return getTokenByAddress(
      "0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada",
      selectedChainConfig?.chainId ?? ""
    );
  }, [selectedChainConfig?.chainId]);

  const tokenLoading = false; // No loading needed for static data

  const extensionConfig = useMemo(
    () => reqType?.type === "extension" ? { address: reqType?.address, config: reqType?.config } : undefined,
    [reqType]
  );

  // Identify extension type using SDK utility
  const extensionType = useMemo(
    () =>
      extensionConfig?.address
        ? identifyExtensionType(
            extensionConfig.address,
            selectedChainConfig?.chainId ?? ""
          )
        : "unknown",
    [extensionConfig?.address, selectedChainConfig?.chainId]
  );

  const isTournamentValidatorExtension = extensionType === "tournament";
  const isERC20BalanceValidatorExtension = extensionType === "erc20Balance";
  const isOpusTrovesValidatorExtension = extensionType === "opusTroves";
  const isMerkleValidatorExtension = extensionType === "merkle";

  const merkleValidatorConfig: MerkleValidatorConfig | null = useMemo(
    () =>
      isMerkleValidatorExtension && extensionConfig?.config
        ? parseMerkleValidatorConfig(extensionConfig.config)
        : null,
    [isMerkleValidatorExtension, extensionConfig?.config]
  );

  // Fetch tree metadata for merkle validators
  const { trees: merkleTrees } = useMerkleTrees();
  const merkleTreeName = useMemo(() => {
    if (!merkleValidatorConfig?.treeId) return null;
    const tree = merkleTrees.find((t) => String(t.id) === merkleValidatorConfig.treeId);
    return tree?.name || null;
  }, [merkleTrees, merkleValidatorConfig?.treeId]);
  const merkleTreeDescription = useMemo(() => {
    if (!merkleValidatorConfig?.treeId) return null;
    const tree = merkleTrees.find((t) => String(t.id) === merkleValidatorConfig.treeId);
    return tree?.description || null;
  }, [merkleTrees, merkleValidatorConfig?.treeId]);

  const tournamentValidatorConfig: TournamentValidatorConfig | null = useMemo(
    () =>
      isTournamentValidatorExtension && extensionConfig?.config
        ? parseTournamentValidatorConfig(extensionConfig.config)
        : null,
    [isTournamentValidatorExtension, extensionConfig?.config]
  );

  // Parse ERC20 balance validator config and add formatted display values
  const rawErc20Config: ERC20BalanceValidatorConfig | null = useMemo(
    () =>
      isERC20BalanceValidatorExtension && extensionConfig?.config
        ? parseERC20BalanceValidatorConfig(extensionConfig.config)
        : null,
    [isERC20BalanceValidatorExtension, extensionConfig?.config]
  );

  const erc20BalanceValidatorConfig = useMemo(() => {
    if (!rawErc20Config) return null;
    const decimals =
      getTokenDecimals(
        selectedChainConfig?.chainId ?? "",
        rawErc20Config.tokenAddress
      ) || 18;
    return {
      ...rawErc20Config,
      minThresholdFormatted: formatTokenAmount(
        rawErc20Config.minThreshold,
        decimals
      ),
      maxThresholdFormatted: formatTokenAmount(
        rawErc20Config.maxThreshold,
        decimals
      ),
      valuePerEntryFormatted: formatTokenAmount(
        rawErc20Config.valuePerEntry,
        decimals
      ),
    };
  }, [rawErc20Config, selectedChainConfig?.chainId]);

  // Parse Opus Troves validator config and add display values
  const rawOpusConfig: OpusTrovesValidatorConfig | null = useMemo(
    () =>
      isOpusTrovesValidatorExtension && extensionConfig?.config
        ? parseOpusTrovesValidatorConfig(extensionConfig.config)
        : null,
    [isOpusTrovesValidatorExtension, extensionConfig?.config]
  );

  const opusTrovesValidatorConfig = useMemo(() => {
    if (!rawOpusConfig) return null;
    const assets = rawOpusConfig.assetAddresses
      .map((addr) =>
        getTokenByAddress(addr, selectedChainConfig?.chainId ?? "")
      )
      .filter((t): t is NonNullable<typeof t> => t !== undefined);
    return {
      ...rawOpusConfig,
      assets,
      thresholdUSD: formatCashToUSD(rawOpusConfig.threshold),
      valuePerEntryUSD: formatCashToUSD(rawOpusConfig.valuePerEntry),
      isWildcard: rawOpusConfig.assetCount === 0,
    };
  }, [rawOpusConfig, selectedChainConfig?.chainId]);

  // Get tournament data for validator extensions
  const validatorTournaments = useMemo(() => {
    if (
      !tournamentValidatorConfig ||
      !tournamentsData ||
      !Array.isArray(tournamentsData)
    )
      return [];
    return tournamentsData.filter((t) =>
      tournamentValidatorConfig.tournamentIds.some(
        (id) => String(BigInt(t.id)) === id
      )
    );
  }, [tournamentValidatorConfig, tournamentsData]);

  // Get token data for ERC20 balance validator
  const erc20Token = useMemo(() => {
    if (!erc20BalanceValidatorConfig?.tokenAddress) return undefined;
    return getTokenByAddress(
      erc20BalanceValidatorConfig.tokenAddress,
      selectedChainConfig?.chainId ?? ""
    );
  }, [erc20BalanceValidatorConfig?.tokenAddress, selectedChainConfig]);

  // Get price for ERC20 token
  const { prices: _prices } = useEkuboPrices({
    tokens: erc20Token?.token_address ? [erc20Token.token_address] : [],
  });

  const blockExplorerExists =
    selectedChainConfig.blockExplorerUrl !== undefined;

  const [dialogOpen, setDialogOpen] = useState(false);

  const chipContent: { icon: React.ReactNode; value: React.ReactNode } = (() => {
    if (activeVariant === "token") {
      const iconNode = token?.logo_url ? (
        <img
          src={token.logo_url}
          alt={token.name || "Token"}
          className="w-4 h-4 rounded-full object-cover"
        />
      ) : (
        <span className="w-4 h-4 text-brand opacity-70">
          <COIN />
        </span>
      );
      return {
        icon: iconNode,
        value: tokenLoading ? (
          <Skeleton className="h-3 w-16" />
        ) : (
          <span className="font-brand font-bold text-sm text-brand truncate max-w-[120px]">
            {token?.name ?? "Token"}
          </span>
        ),
      };
    }
    if (activeVariant === "extension") {
      if (isTournamentValidatorExtension) {
        return {
          icon: (
            <span className="w-4 h-4 text-brand opacity-70">
              <TROPHY />
            </span>
          ),
          value: (
            <span className="font-brand font-bold text-sm text-brand capitalize">
              {tournamentValidatorConfig?.requirementType || "Tournament"}
            </span>
          ),
        };
      }
      if (isERC20BalanceValidatorExtension) {
        return {
          icon: <Coins className="w-4 h-4 text-brand opacity-70" />,
          value: (
            <span className="font-brand font-bold text-sm text-brand truncate max-w-[120px]">
              {erc20Token?.name || "Token"}
            </span>
          ),
        };
      }
      if (isOpusTrovesValidatorExtension) {
        return {
          icon: (
            <span className="w-4 h-4 text-brand opacity-70">
              <OPUS />
            </span>
          ),
          value: (
            <span className="font-brand font-bold text-sm text-brand">
              Opus
            </span>
          ),
        };
      }
      if (isMerkleValidatorExtension) {
        return {
          icon: <ListChecks className="w-4 h-4 text-brand opacity-70" />,
          value: (
            <span className="font-brand font-bold text-sm text-brand truncate max-w-[120px]">
              {merkleTreeName || "Allowlist"}
            </span>
          ),
        };
      }
      return {
        icon: (
          <span className="w-4 h-4 text-brand opacity-70">
            <EXTERNAL_LINK />
          </span>
        ),
        value: (
          <span className="font-brand font-bold text-sm text-brand font-mono">
            {displayAddress(extensionConfig?.address ?? "0x0")}
          </span>
        ),
      };
    }
    return {
      icon: (
        <span className="w-4 h-4 text-brand opacity-70">
          <LOCK />
        </span>
      ),
      value: (
        <span className="font-brand font-bold text-sm text-brand">Gated</span>
      ),
    };
  })();

  const renderHoverContent = () => {
    if (activeVariant === "token") {
      return (
        <>
          <p className="text-muted-foreground">
            To enter this tournament you must hold:
          </p>
          <div className="flex items-center gap-2">
            {token?.logo_url ? (
              <img
                src={token.logo_url}
                alt={token.name || "Token"}
                className="w-8 h-8 object-cover rounded"
              />
            ) : (
              <span className="w-8">
                <COIN />
              </span>
            )}
            {tokenLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                <span>{token?.name}</span>
                <span
                  className="text-brand-muted hover:cursor-pointer"
                  onClick={() => {
                    if (blockExplorerExists) {
                      window.open(
                        `${selectedChainConfig.blockExplorerUrl}/nft-contract/${token?.token_address}`,
                        "_blank"
                      );
                    }
                  }}
                >
                  {displayAddress(token?.token_address ?? "0x0")}
                </span>
              </>
            )}
          </div>
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    } else if (activeVariant === "extension") {
      // Show ERC20 balance details if it's an ERC20 balance validator
      if (isERC20BalanceValidatorExtension && erc20BalanceValidatorConfig) {
        return (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                To enter you must hold the required token balance:
              </p>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 flex-shrink-0">
                    <COIN />
                  </span>
                  <span className="font-medium text-sm">
                    {erc20Token?.name || "ERC20 Token"}
                  </span>
                  <span
                    className="text-brand-muted hover:cursor-pointer font-mono text-xs"
                    onClick={() => {
                      if (blockExplorerExists) {
                        window.open(
                          `${selectedChainConfig.blockExplorerUrl}/contract/${erc20BalanceValidatorConfig.tokenAddress}`,
                          "_blank"
                        );
                      }
                    }}
                  >
                    {displayAddress(erc20BalanceValidatorConfig.tokenAddress)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-xs mt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-muted whitespace-nowrap">
                      Min Balance:
                    </span>
                    <span className="font-medium">
                      {erc20BalanceValidatorConfig.minThresholdFormatted}
                    </span>
                    <span className="text-brand-muted">
                      {erc20Token?.symbol || "tokens"}
                    </span>
                  </div>
                  {erc20BalanceValidatorConfig.maxThreshold > 0n && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-muted whitespace-nowrap">
                        Max Balance:
                      </span>
                      <span className="font-medium">
                        {erc20BalanceValidatorConfig.maxThresholdFormatted}
                      </span>
                      <span className="text-brand-muted">
                        {erc20Token?.symbol || "tokens"}
                      </span>
                    </div>
                  )}
                  {erc20BalanceValidatorConfig.valuePerEntry > 0n && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-muted whitespace-nowrap">
                        Value Per Entry:
                      </span>
                      <span className="font-medium">
                        {erc20BalanceValidatorConfig.valuePerEntryFormatted}
                      </span>
                      <span className="text-brand-muted">
                        {erc20Token?.symbol || "tokens"}
                      </span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="w-3 h-3 flex-shrink-0 text-brand-muted hover:text-brand cursor-help">
                              <INFO />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>
                              Amount of token balance consumed per tournament
                              entry
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                  {erc20BalanceValidatorConfig.maxEntries > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-brand-muted whitespace-nowrap">
                        Max Entries:
                      </span>
                      <span className="font-medium">
                        {erc20BalanceValidatorConfig.maxEntries}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {!!hasEntryLimit && (
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                  <span className="text-brand-muted whitespace-nowrap">
                    Entry Limit:
                  </span>
                  <span className="font-medium">{Number(entryLimit)}</span>
                </div>
              )}
            </div>
          </>
        );
      }
      // Show Opus Troves details if it's an Opus Troves validator
      if (isOpusTrovesValidatorExtension && opusTrovesValidatorConfig) {
        return (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                To enter you must have an Opus Trove with:
              </p>
              <div className="flex flex-col gap-1 text-xs">
                {/* Asset requirement */}
                <div className="flex flex-wrap items-start gap-2">
                  <span className="text-brand-muted whitespace-nowrap">
                    Collateral Assets:
                  </span>
                  {opusTrovesValidatorConfig.isWildcard ? (
                    <span className="font-medium">Any (wildcard)</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {opusTrovesValidatorConfig.assets.map(
                        (asset: any, idx: number) => (
                          <span
                            key={idx}
                            className="font-medium bg-brand/10 px-2 py-0.5 rounded"
                          >
                            {asset.symbol}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Threshold */}
                {opusTrovesValidatorConfig.threshold > 0n && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-muted whitespace-nowrap">
                      Min CASH Debt:
                    </span>
                    {cashToken?.logo_url && (
                      <img
                        src={cashToken.logo_url}
                        alt="CASH"
                        className="w-3 h-3 flex-shrink-0"
                      />
                    )}
                    <span className="font-medium">
                      ${opusTrovesValidatorConfig.thresholdUSD}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="w-3 h-3 flex-shrink-0 text-brand-muted hover:text-brand cursor-help">
                            <INFO />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            Minimum CASH debt required in your trove to qualify
                            (~$1 USD per CASH)
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                {/* Value per entry */}
                {opusTrovesValidatorConfig.valuePerEntry > 0n && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-muted whitespace-nowrap">
                      CASH Per Entry:
                    </span>
                    {cashToken?.logo_url && (
                      <img
                        src={cashToken.logo_url}
                        alt="CASH"
                        className="w-3 h-3 flex-shrink-0"
                      />
                    )}
                    <span className="font-medium">
                      ${opusTrovesValidatorConfig.valuePerEntryUSD}
                    </span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="w-3 h-3 flex-shrink-0 text-brand-muted hover:text-brand cursor-help">
                            <INFO />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>
                            Amount of CASH that needs to be borrowed per
                            tournament entry
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                {/* Max entries */}
                {opusTrovesValidatorConfig.maxEntries > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-muted whitespace-nowrap">
                      Max Entries:
                    </span>
                    <span className="font-medium">
                      {opusTrovesValidatorConfig.maxEntries}
                    </span>
                  </div>
                )}
              </div>
              {!!hasEntryLimit && (
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                  <span className="text-brand-muted whitespace-nowrap">
                    Entry Limit:
                  </span>
                  <span className="font-medium">{Number(entryLimit)}</span>
                </div>
              )}
            </div>
          </>
        );
      }
      // Show Merkle Allowlist details if it's a Merkle validator
      if (isMerkleValidatorExtension) {
        return (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs">
                To enter you must be on the allowlist:
              </p>
              <div className="flex flex-col gap-1 text-xs">
                {merkleTreeName && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {merkleTreeName}
                    </span>
                  </div>
                )}
                {merkleTreeDescription && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">
                      {merkleTreeDescription}
                    </span>
                  </div>
                )}
                {!merkleTreeName && merkleValidatorConfig?.treeId && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-muted whitespace-nowrap">
                      Tree ID:
                    </span>
                    <span className="font-medium font-mono">
                      {merkleValidatorConfig.treeId}
                    </span>
                  </div>
                )}
              </div>
              {!!hasEntryLimit && (
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                  <span className="text-brand-muted whitespace-nowrap">
                    Entry Limit:
                  </span>
                  <span className="font-medium">{Number(entryLimit)}</span>
                </div>
              )}
            </div>
          </>
        );
      }
      // Show tournament qualification details if it's a tournament validator
      if (isTournamentValidatorExtension && tournamentValidatorConfig) {
        return (
          <>
            <div className="flex flex-col gap-1 mb-2">
              <div className="flex flex-row items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  {`To enter you must have ${
                    tournamentValidatorConfig.requirementType === "won"
                      ? "won"
                      : "participated in"
                  }:`}
                </p>
                {!!hasEntryLimit && (
                  <div className="flex flex-row items-center gap-1 text-xs">
                    <span className="text-brand-muted">Limit:</span>
                    <span className="font-medium">{Number(entryLimit)}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-row items-center gap-2 text-xs">
                <span className="text-brand-muted">Mode:</span>
                <span className="font-medium">
                  {
                    getQualifyingModeInfo(
                      tournamentValidatorConfig.qualifyingMode
                    ).label
                  }
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-3 h-3 text-brand-muted hover:text-brand cursor-help">
                        <INFO />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        {
                          getQualifyingModeInfo(
                            tournamentValidatorConfig.qualifyingMode
                          ).description
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {tournamentValidatorConfig.requirementType === "won" && (
                <div className="flex flex-row items-center gap-2 text-xs">
                  <span className="text-brand-muted">Positions:</span>
                  <span className="font-medium">
                    Top {tournamentValidatorConfig.topPositions ?? 1}
                  </span>
                </div>
              )}
            </div>
            <div className="max-h-[80px] overflow-y-auto">
              {validatorTournaments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 px-2 text-xs">
                        Tournament
                      </TableHead>
                      <TableHead className="h-8 px-2 text-xs text-right">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validatorTournaments.map((tournament, index) => {
                      // SDK tournaments have pre-computed absolute timestamps
                      const gameEndTime = Number(tournament.gameEndTime ?? 0);
                      const tournamentEnded =
                        gameEndTime > 0 && gameEndTime < Math.floor(Date.now() / 1000);
                      return (
                        <TableRow
                          key={index}
                          className="cursor-pointer hover:bg-brand-muted/20"
                          onClick={() => {
                            navigate(`/tournament/${Number(tournament.id)}`);
                          }}
                        >
                          <TableCell className="p-2 text-xs font-medium">
                            {tournament.name}
                          </TableCell>
                          <TableCell className="p-2 text-right">
                            <div className="flex flex-row items-center justify-end gap-1">
                              <span className="w-3">
                                <CLOCK />
                              </span>
                              <span className="text-xs">
                                {tournamentEnded ? "Ended" : "Active"}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <span className="text-muted-foreground text-xs">
                  Tournament IDs:{" "}
                  {tournamentValidatorConfig.tournamentIds
                    .map((id: any) => id.toString())
                    .join(", ")}
                </span>
              )}
            </div>
          </>
        );
      }
      // Otherwise show generic extension details
      return (
        <>
          <p className="text-muted-foreground">
            Entry validated by custom contract:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-6">
              <EXTERNAL_LINK />
            </span>
            <span
              className="text-brand-muted hover:cursor-pointer font-mono text-xs"
              onClick={() => {
                if (blockExplorerExists) {
                  window.open(
                    `${selectedChainConfig.blockExplorerUrl}/contract/${extensionConfig?.address}`,
                    "_blank"
                  );
                }
              }}
            >
              {displayAddress(extensionConfig?.address ?? "0x0")}
            </span>
          </div>
          {extensionConfig?.config && extensionConfig.config.length > 0 && (
            <div className="flex flex-row items-center gap-2">
              <span>Config:</span>
              <span className="font-mono text-xs">
                {extensionConfig.config.join(", ")}
              </span>
            </div>
          )}
          {!!hasEntryLimit && <EntryLimitInfo limit={Number(entryLimit)} />}
        </>
      );
    }
    return null;
  };

  const TriggerCard = ({ onClick = () => {} }) => (
    <button
      onClick={onClick}
      aria-label="Entry requirements"
      className="flex flex-col items-center justify-center px-3 py-2 rounded-md border border-brand/10 bg-brand/5 hover:bg-brand/10 hover:border-brand/25 transition-colors cursor-pointer"
    >
      <div className="flex flex-row items-center gap-1.5">
        {chipContent.icon}
        {chipContent.value}
      </div>
      <span className="text-[9px] uppercase tracking-wider text-brand-muted mt-0.5">
        Requires
      </span>
    </button>
  );

  const ContentSection = () => (
    <div className="flex flex-col gap-2 h-full">{renderHoverContent()}</div>
  );

  return (
    <>
      {/* Mobile: Dialog (visible below sm breakpoint) */}
      <div className="sm:hidden">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <div>
              <TriggerCard />
            </div>
          </DialogTrigger>
          <DialogContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Entry Requirements</h3>
            <ContentSection />
          </DialogContent>
        </Dialog>
      </div>

      {/* Desktop: HoverCard (visible at sm breakpoint and above) */}
      <div className="hidden sm:block">
        <HoverCard openDelay={50} closeDelay={0}>
          <HoverCardTrigger asChild>
            <div>
              <TriggerCard />
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            className="w-80 max-h-[150px] p-4 text-sm z-50 overflow-hidden"
            align="start"
            side="bottom"
            sideOffset={5}
          >
            <ContentSection />
          </HoverCardContent>
        </HoverCard>
      </div>

    </>
  );
};

export default EntryRequirements;
