import { StepProps } from "@/containers/CreateTournament";
import { PrizeManager } from "@/components/shared/PrizeManager";
import { useDojo } from "@/context/dojo";
import { ChainId } from "@/dojo/setup/networks";
import { FormField, FormItem } from "@/components/ui/form";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";

const BonusPrizes = ({ form }: StepProps) => {
  const { selectedChainConfig } = useDojo();

  const chainId = selectedChainConfig?.chainId ?? "";
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

  const currentPrizes = form.watch("prizes") || [];

  const handlePrizesChange = (prizes: any[]) => {
    form.setValue("prizes", prizes);
  };

  return (
    <FormField
      control={form.control}
      name="enablePrizes"
      render={({ field }) => (
        <FormItem className="flex flex-col sm:p-4">
          <OptionalSection
            label="Prizes"
            description="Add prizes to your tournament"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          {field.value && (
            <>
              <div className="w-full h-0.5 bg-brand/25" />
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add bonus prizes to your tournament. You can also add more prizes
                  after the tournament is created.
                </p>

                <PrizeManager
                  prizes={currentPrizes}
                  onPrizesChange={handlePrizesChange}
                  chainId={chainId}
                  isSepolia={isSepolia}
                />
              </div>
            </>
          )}
        </FormItem>
      )}
    />
  );
};

export default BonusPrizes;
