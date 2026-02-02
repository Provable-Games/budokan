import { FormLabel, FormDescription } from "@/components/ui/form";
import AmountInput from "@/components/createTournament/inputs/Amount";
import { TokenValue } from "@/components/createTournament/containers/TokenValue";

interface TokenAmountInputProps {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
  tokenAmount?: number;
  tokenAddress?: string;
  usdValue?: number;
  isLoading?: boolean;
  disabled?: boolean;
  visible?: boolean;
  className?: string;
  minValue?: number;
}

export const TokenAmountInput = ({
  label,
  description,
  value,
  onChange,
  tokenAmount = 0,
  tokenAddress = "",
  usdValue = 0,
  isLoading = false,
  disabled = false,
  visible = true,
  className = "",
  minValue,
}: TokenAmountInputProps) => {
  return (
    <div
      className={`flex flex-col gap-2 transition-opacity ${
        !visible ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${className}`}
    >
      <div className="flex flex-row items-center gap-5">
        <FormLabel className="text-lg font-brand">{label}</FormLabel>
        <FormDescription className="hidden sm:block sm:text-xs xl:text-sm">
          {description}
        </FormDescription>
      </div>
      <div className="flex flex-col gap-2">
        <AmountInput
          value={value || undefined}
          onChange={(val) => onChange(val ?? 0)}
          disabled={disabled}
          minValue={minValue}
        />
        <TokenValue
          amount={tokenAmount}
          tokenAddress={tokenAddress}
          usdValue={usdValue}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
