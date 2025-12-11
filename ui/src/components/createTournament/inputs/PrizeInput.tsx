import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenSelector } from "@/components/createTournament/inputs/TokenSelector";
import { TokenAmountInput } from "@/components/createTournament/inputs/TokenAmountInput";
import { FormControl, FormItem } from "@/components/ui/form";
import { FormToken } from "@/lib/types";
import {
  MAINNET_ERC20_TEMPLATES,
  SEPOLIA_ERC20_TEMPLATES,
  MAINNET_NFT_TEMPLATES,
  SEPOLIA_NFT_TEMPLATES,
} from "@/lib/templateTokens";

interface PrizeInputProps {
  // Token selection props
  selectedToken: FormToken | undefined;
  onTokenSelect: (token: FormToken) => void;
  onTokenDecimalsChange?: (decimals: number) => void;
  tokenType: "ERC20" | "ERC721" | "";
  onTokenTypeChange?: (type: "ERC20" | "ERC721") => void;

  // ERC20 props
  value?: number;
  onValueChange?: (value: number) => void;
  tokenAmount?: number;
  tokenAddress?: string;
  usdValue?: number;
  pricesLoading?: boolean;

  // ERC721 props
  tokenId?: number;
  onTokenIdChange?: (tokenId: number) => void;
  position?: number;
  onPositionChange?: (position: number) => void;

  // Display control
  tokenEverSelected?: boolean;
  isSepolia?: boolean;
  showTypeSelector?: boolean;
}

export function PrizeInput({
  selectedToken,
  onTokenSelect,
  onTokenDecimalsChange,
  tokenType,
  onTokenTypeChange,
  value,
  onValueChange,
  tokenAmount,
  tokenAddress,
  usdValue,
  pricesLoading,
  tokenId,
  onTokenIdChange,
  position,
  onPositionChange,
  tokenEverSelected = false,
  isSepolia = false,
  showTypeSelector = false,
}: PrizeInputProps) {
  // Get quick select addresses based on token type and chain
  const quickSelectAddresses = useMemo(() => {
    if (tokenType === "ERC721") {
      return isSepolia ? SEPOLIA_NFT_TEMPLATES : MAINNET_NFT_TEMPLATES;
    }
    return isSepolia ? SEPOLIA_ERC20_TEMPLATES : MAINNET_ERC20_TEMPLATES;
  }, [tokenType, isSepolia]);

  const isERC20 = tokenType === "ERC20";
  const isERC721 = tokenType === "ERC721";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:divide-x lg:divide-brand/25">
      {/* Token Selection */}
      <FormItem>
        <FormControl>
          <TokenSelector
            label={isERC721 ? "NFT Collection" : "Prize Token"}
            description={
              isERC721
                ? "Select the NFT collection for the prize"
                : "Select the token for bonus prize"
            }
            selectedToken={selectedToken}
            onTokenSelect={onTokenSelect}
            onTokenDecimalsChange={onTokenDecimalsChange}
            quickSelectAddresses={quickSelectAddresses}
            tokenType={isERC721 ? "erc721" : "erc20"}
            showTypeSelector={showTypeSelector}
            onTokenTypeChange={(type) => onTokenTypeChange?.(type === "erc20" ? "ERC20" : "ERC721")}
          />
        </FormControl>
      </FormItem>

      {/* Horizontal divider for mobile */}
      <div className="w-full h-0.5 bg-brand/25 lg:hidden" />

      {/* Amount Input for ERC20 */}
      {isERC20 && (
        <FormItem>
          <FormControl>
            <TokenAmountInput
              label="Prize Amount"
              description="Prize amount in USD"
              value={value || 0}
              onChange={(val) => onValueChange?.(val)}
              tokenAmount={tokenAmount ?? 0}
              tokenAddress={tokenAddress ?? ""}
              usdValue={usdValue ?? 0}
              isLoading={pricesLoading ?? false}
              visible={tokenEverSelected}
              className="lg:pl-4"
            />
          </FormControl>
        </FormItem>
      )}

      {/* Token ID & Position Input for ERC721 */}
      {isERC721 && tokenEverSelected && (
        <div className="lg:pl-4 flex flex-col gap-2">
          <div className="flex flex-row items-center gap-5">
            <span className="text-lg font-brand">Token ID & Position</span>
            <span className="hidden xl:block xl:text-sm text-neutral">
              Enter token ID and position
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-sm">Token ID</Label>
              <Input
                type="number"
                placeholder="Token ID"
                value={tokenId || ""}
                onChange={(e) => onTokenIdChange?.(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1 w-[120px]">
              <Label className="text-sm">Position</Label>
              <Input
                type="number"
                placeholder="Position"
                min={1}
                value={position || ""}
                onChange={(e) => onPositionChange?.(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Empty div when nothing should be shown on the right */}
      {!isERC20 && !isERC721 && <div className="lg:pl-4" />}
    </div>
  );
}
