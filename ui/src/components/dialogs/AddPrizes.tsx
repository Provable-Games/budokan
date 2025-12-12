import { useEffect, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormToken } from "@/lib/types";
import { Prize, ERC20Data, ERC721Data } from "@/generated/models.gen";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { BigNumberish } from "starknet";
import { CairoCustomEnum, CairoOption, CairoOptionVariant } from "starknet";
import { useAccount } from "@starknet-react/core";
import { useConnectToSelectedChain } from "@/dojo/hooks/useChain";
import { useDojo } from "@/context/dojo";
import { LoadingSpinner } from "@/components/ui/spinner";
import { useGetPrizeMetrics } from "@/dojo/hooks/useSqlQueries";
import { PrizeManager } from "@/components/shared/PrizeManager";
import { ChainId } from "@/dojo/setup/networks";

type BonusPrize =
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

// Form schema for AddPrizes
const addPrizesSchema = z.object({
  prizes: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("ERC20"),
        token: z.custom<FormToken>(),
        amount: z.number(),
        position: z.number(),
        tokenDecimals: z.number().optional(),
        distribution: z.enum(["exponential", "linear", "uniform"]).optional(),
        distributionCount: z.number().optional(),
      }),
      z.object({
        type: z.literal("ERC721"),
        token: z.custom<FormToken>(),
        tokenId: z.number(),
        position: z.number(),
      }),
    ])
  ),
});

type AddPrizesFormData = z.infer<typeof addPrizesSchema>;

export function AddPrizesDialog({
  open,
  onOpenChange,
  tournamentId,
  tournamentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: BigNumberish;
  tournamentName: string;
}) {
  // Initialize form
  const form = useForm<AddPrizesFormData>({
    resolver: zodResolver(addPrizesSchema),
    defaultValues: {
      prizes: [],
    },
  });

  const { address, account: _account } = useAccount();
  const { namespace, selectedChainConfig } = useDojo();
  const { connect } = useConnectToSelectedChain();
  const {
    approveAndAddPrizes,
    approveAndAddPrizesBatched,
    getTokenDecimals,
  } = useSystemCalls();

  // Get prizes from form
  const currentPrizes = form.watch("prizes");
  const setCurrentPrizes = (prizes: BonusPrize[]) => {
    form.setValue("prizes", prizes);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [_tokenBalances, _setTokenBalances] = useState<Record<string, bigint>>(
    {}
  );
  const [tokenDecimals, setTokenDecimals] = useState<Record<string, number>>(
    {}
  );

  const chainId = selectedChainConfig?.chainId ?? "";
  const isSepolia = selectedChainConfig?.chainId === ChainId.SN_SEPOLIA;

  const { data: prizeMetricsModel } = useGetPrizeMetrics({
    namespace,
    active: open,
  });

  const prizeCount = Number(prizeMetricsModel?.total_prizes ?? 0);

  console.log("currentPrizes", prizeMetricsModel);

  useEffect(() => {
    if (!open) {
      setBatchProgress(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const submitPrizes = async () => {
    setIsSubmitting(true);
    const totalValue = 0; // Prize value calculation handled by contract
    try {
      let prizesToAdd: Prize[] = [];

      // Filter out prizes with 0 amounts to avoid transaction errors
      const validPrizes = currentPrizes.filter((prize) => {
        if (prize.type === "ERC20") {
          return prize.amount && prize.amount > 0;
        }
        return true; // ERC721 prizes are always valid if they have a tokenId
      });

      // Fetch decimals for all unique ERC20 token addresses
      const uniqueERC20Addresses = Array.from(
        new Set(
          validPrizes
            .filter((prize) => prize.type === "ERC20")
            .map((prize) => prize.token.address)
        )
      );

      const decimalsPromises = uniqueERC20Addresses.map(async (address) => {
        if (!tokenDecimals[address]) {
          const decimals = await getTokenDecimals(address);
          return { address, decimals };
        }
        return { address, decimals: tokenDecimals[address] };
      });

      const decimalsResults = await Promise.all(decimalsPromises);
      const newDecimals = decimalsResults.reduce(
        (acc, { address, decimals }) => {
          acc[address] = decimals;
          return acc;
        },
        {} as Record<string, number>
      );

      // Update decimals state
      setTokenDecimals((prev) => ({ ...prev, ...newDecimals }));

      prizesToAdd = validPrizes.map((prize, index) => {
        let token_type;

        if (prize.type === "ERC20") {
          // Map distribution string to CairoCustomEnum
          let distribution: CairoOption<CairoCustomEnum>;
          if (prize.distribution === "linear") {
            distribution = new CairoOption(
              CairoOptionVariant.Some,
              new CairoCustomEnum({
                Linear: 100,
                Exponential: undefined,
                Uniform: undefined,
                Custom: undefined,
              })
            );
          } else if (prize.distribution === "exponential") {
            distribution = new CairoOption(
              CairoOptionVariant.Some,
              new CairoCustomEnum({
                Linear: undefined,
                Exponential: 100,
                Uniform: undefined,
                Custom: undefined,
              })
            );
          } else if (prize.distribution === "uniform") {
            distribution = new CairoOption(
              CairoOptionVariant.Some,
              new CairoCustomEnum({
                Linear: undefined,
                Exponential: undefined,
                Uniform: {},
                Custom: undefined,
              })
            );
          } else {
            distribution = new CairoOption(CairoOptionVariant.None);
          }

          // Create distribution_count as CairoOption
          const distribution_count: CairoOption<BigNumberish> =
            prize.distributionCount
              ? new CairoOption(
                  CairoOptionVariant.Some,
                  prize.distributionCount
                )
              : new CairoOption(CairoOptionVariant.None);

          const erc20Data: ERC20Data = {
            amount: BigInt(
              Math.floor(
                prize.amount! *
                  10 **
                    (newDecimals[prize.token.address] ||
                      prize.tokenDecimals ||
                      18)
              )
            ).toString(),
            distribution,
            distribution_count,
          };

          token_type = new CairoCustomEnum({
            erc20: erc20Data,
            erc721: undefined,
          });
        } else {
          const erc721Data: ERC721Data = {
            id: BigInt(prize.tokenId!).toString(),
          };

          token_type = new CairoCustomEnum({
            erc20: undefined,
            erc721: erc721Data,
          });
        }

        return {
          id: Number(prizeCount) + index + 1,
          tournament_id: tournamentId,
          context_id: tournamentId,
          sponsor_address: address || "0x0",
          token_address: prize.token.address,
          token_type,
          payout_position: prize.position,
          claimed: false,
        };
      });

      // Use batched version if there are many prizes
      if (prizesToAdd.length > 30) {
        await approveAndAddPrizesBatched(
          tournamentName,
          prizesToAdd,
          true,
          totalValue,
          Number(prizeCount),
          30, // batch size
          (current, total) => setBatchProgress({ current, total })
        );
      } else {
        await approveAndAddPrizes(
          tournamentName,
          prizesToAdd,
          true,
          totalValue,
          Number(prizeCount)
        );
      }

      setCurrentPrizes([]);
      onOpenChange(false);
      setIsSubmitting(false);
    } catch (error) {
      console.error("Failed to add prizes:", error);
      setIsSubmitting(false);
    }
  };

  const aggregatedPrizes = currentPrizes.reduce((acc, prize) => {
    const key = `${prize.position}-${prize.token.address}-${prize.type}`;

    if (!acc[key]) {
      acc[key] = {
        ...prize,
        amount: prize.type === "ERC20" ? prize.amount : undefined,
        tokenIds: prize.type === "ERC721" ? [prize.tokenId] : [],
        count: 1,
      };
    } else {
      if (prize.type === "ERC20") {
        acc[key].amount =
          (acc[key].amount || 0) + (prize.type === "ERC20" ? prize.amount : 0);
      } else if (prize.type === "ERC721") {
        acc[key].tokenIds = [...(acc[key].tokenIds || []), prize.tokenId];
      }
      acc[key].count += 1;
    }

    return acc;
  }, {} as Record<string, any>);


  return (
    <FormProvider {...form}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Prizes to Tournament</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2">
            {batchProgress && (
              <div className="bg-brand/10 border border-brand p-4 rounded-lg mb-4">
                <div className="flex items-center gap-3">
                  <LoadingSpinner />
                  <div>
                    <p className="font-semibold">Processing Transactions</p>
                    <p className="text-sm text-muted-foreground">
                      Batch {batchProgress.current} of {batchProgress.total} -
                      Please do not close this window
                    </p>
                  </div>
                </div>
              </div>
            )}

            <PrizeManager
              prizes={currentPrizes}
              onPrizesChange={setCurrentPrizes}
              chainId={chainId}
              isSepolia={isSepolia}
            />
          </div>

          <DialogFooter className="flex justify-end w-full">
            {currentPrizes.length > 0 &&
              (address ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={submitPrizes}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Submitting..."
                    : `Submit ${currentPrizes.length} prize${
                        currentPrizes.length !== 1 ? "s" : ""
                      }`}
                </Button>
              ) : (
                <Button onClick={() => connect()}>Connect Wallet</Button>
              ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
