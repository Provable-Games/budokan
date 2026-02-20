import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { formatNumber } from "@/lib/utils";
import { useDojo } from "@/context/dojo";

interface TokenValueProps {
  amount: number;
  tokenAddress: string;
  usdValue: number;
  isLoading?: boolean;
  className?: string;
}

export const TokenValue = ({
  amount,
  tokenAddress,
  usdValue,
  isLoading = false,
  className = "",
}: TokenValueProps) => {
  const { selectedChainConfig } = useDojo();
  const chainId = selectedChainConfig?.chainId ?? "";

  if (isLoading) {
    return <p>Loading...</p>;
  }

  const entryFeeAmountExists = amount > 0;

  return (
    <>
      {entryFeeAmountExists && (
        <div className={`flex flex-row items-center gap-2 ${className}`}>
          <p>~{formatNumber(amount)}</p>
          <img
            src={getTokenLogoUrl(chainId, tokenAddress)}
            className="w-6"
            alt="Token logo"
          />
          <span className="text-sm text-neutral">~${usdValue.toFixed(2)}</span>
        </div>
      )}
    </>
  );
};
