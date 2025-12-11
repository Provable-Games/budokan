import { StepProps } from "@/containers/CreateTournament";
import {
  FormField,
  FormItem,
} from "@/components/ui/form";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { PrizeManager } from "@/components/shared/PrizeManager";
import { useDojo } from "@/context/dojo";
import { ChainId } from "@/dojo/setup/networks";

const BonusPrizes = ({ form }: StepProps) => {
  const { selectedChainConfig } = useDojo();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

  return (
    <FormField
      control={form.control}
      name="enableBonusPrizes"
      render={({ field }) => (
        <FormItem className="flex flex-col sm:p-4">
          <OptionalSection
            label="Bonus Prizes"
            description="Enable additional prizes"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          {field.value && (
            <>
              <div className="w-full h-0.5 bg-brand/25" />
              <PrizeManager
                chainId={chainId}
                isSepolia={isSepolia}
                prizes={form.watch("bonusPrizes") || []}
                onPrizesChange={(prizes) => form.setValue("bonusPrizes", prizes)}
                checkBalance={true}
              />
            </>
          )}
        </FormItem>
      )}
    />
  );
};

export default BonusPrizes;
