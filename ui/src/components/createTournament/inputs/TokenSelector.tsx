import { Button } from "@/components/ui/button";
import { FormLabel, FormDescription } from "@/components/ui/form";
import TokenDialog from "@/components/dialogs/Token";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { FormToken } from "@/lib/types";
import { useDojo } from "@/context/dojo";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { mainnetTokens } from "@/lib/mainnetTokens";
import { sepoliaTokens } from "@/lib/sepoliaTokens";
import { ChainId } from "@/dojo/setup/networks";

interface QuickSelectToken {
  address: string;
  symbol: string;
  name: string;
}

interface TokenSelectorProps {
  label: string;
  description: string;
  selectedToken?: FormToken;
  onTokenSelect: (token: FormToken) => void;
  onTokenDecimalsChange?: (decimals: number) => void;
  quickSelectAddresses?: string[];
  tokenType?: "erc20" | "erc721";
  className?: string;
}

export const TokenSelector = ({
  label,
  description,
  selectedToken,
  onTokenSelect,
  onTokenDecimalsChange,
  quickSelectAddresses,
  tokenType = "erc20",
  className = "",
}: TokenSelectorProps) => {
  const { selectedChainConfig } = useDojo();
  const { getTokenDecimals } = useSystemCalls();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isMainnet = selectedChainConfig?.chainId === ChainId.SN_MAIN;
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

  const quickSelectTokens: QuickSelectToken[] = quickSelectAddresses
    ? quickSelectAddresses
        .map((address) => {
          const token = isMainnet
            ? mainnetTokens.find((t) => t.l2_token_address === address)
            : sepoliaTokens.find((t) => t.l2_token_address === address);
          return {
            address,
            symbol: token?.symbol || "",
            name: token?.name || "",
          };
        })
        .filter((t) => t.symbol)
    : [];

  const handleQuickSelect = async (token: QuickSelectToken) => {
    const formToken: FormToken = {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      token_type: tokenType,
      is_registered: true,
    };

    onTokenSelect(formToken);

    // Fetch token decimals for ERC20 tokens
    if (tokenType === "erc20" && onTokenDecimalsChange) {
      try {
        const decimals = await getTokenDecimals(token.address);
        onTokenDecimalsChange(decimals);
      } catch (error) {
        console.error("Failed to fetch token decimals:", error);
        onTokenDecimalsChange(18); // Default to 18
      }
    }
  };

  const handleCustomSelect = async (token: FormToken) => {
    onTokenSelect(token);

    // Fetch token decimals for ERC20 tokens
    if (token.token_type === "erc20" && onTokenDecimalsChange) {
      try {
        const decimals = await getTokenDecimals(token.address);
        onTokenDecimalsChange(decimals);
      } catch (error) {
        console.error("Failed to fetch token decimals:", error);
        onTokenDecimalsChange(18); // Default to 18
      }
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-row items-center gap-5">
        <FormLabel className="text-lg font-brand">{label}</FormLabel>
        <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
          {description}
        </FormDescription>
      </div>
      <div className="flex flex-row items-center gap-3">
        {/* Quick select tokens */}
        {quickSelectTokens.length > 0 && (
          <>
            <div className="flex flex-row flex-wrap items-center gap-2">
              {quickSelectTokens.map((token) => (
                <Button
                  key={token.address}
                  type="button"
                  variant={
                    selectedToken?.address === token.address
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  className="h-10 px-3 gap-2"
                  onClick={() => handleQuickSelect(token)}
                >
                  <img
                    src={getTokenLogoUrl(chainId, token.address)}
                    className="w-4 h-4"
                    alt={token.symbol}
                  />
                  {token.symbol}
                </Button>
              ))}
            </div>
            {/* Vertical divider */}
            <div className="h-10 w-px bg-brand/25 self-end" />
          </>
        )}
        {/* Custom token selection */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-500">Custom</span>
          <TokenDialog
            selectedToken={
              // Only show as selected if it's NOT one of the quick select tokens
              quickSelectAddresses?.includes(selectedToken?.address ?? "")
                ? undefined
                : selectedToken
            }
            onSelect={handleCustomSelect}
            type={tokenType}
          />
        </div>
      </div>
    </div>
  );
};
