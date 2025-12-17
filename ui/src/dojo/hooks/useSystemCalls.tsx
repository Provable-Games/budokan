import { useAccount } from "@starknet-react/core";
import { useProvider } from "@starknet-react/core";
import { useDojo } from "@/context/dojo";
import {
  Tournament,
  Prize,
  EntryFee,
  QualificationProofEnum,
  TokenTypeDataEnum,
  ERC20Data,
  ERC721Data,
} from "@/generated/models.gen";
import {
  Account,
  BigNumberish,
  CairoOption,
  CairoOptionVariant,
  CallData,
  ByteArray,
  byteArray,
  Uint256,
  AccountInterface,
  CairoCustomEnum,
  Contract,
} from "starknet";
import { feltToString } from "@/lib/utils";
import useUIStore from "@/hooks/useUIStore";
import { useToastMessages } from "@/components/toast";
import { useEntityUpdates } from "@/dojo/hooks/useEntityUpdates";
import BUDOKAN_ABI from "@/lib/abis/budokan";

export const useSystemCalls = () => {
  const { client, selectedChainConfig } = useDojo();
  const { account, address } = useAccount();
  const { provider } = useProvider();
  const tournamentAddress = selectedChainConfig.budokanAddress!;
  const { getGameName } = useUIStore();
  const {
    waitForTournamentCreation,
    waitForTournamentEntry,
    waitForAddPrizes,
    waitForSubmitScores,
  } = useEntityUpdates();
  const {
    showTournamentEntry,
    showScoreSubmission,
    showPrizeAddition,
    showPrizeDistribution,
    showTournamentCreation,
  } = useToastMessages();

  const initializeBudokanContract = () => {
    if (!account && !provider) {
      throw new Error("No account or provider available");
    }

    return new Contract({
      abi: BUDOKAN_ABI,
      address: tournamentAddress,
      providerOrAccount: account || provider,
    });
  };

  // Tournament

  const approveAndEnterTournament = async (
    entryFeeToken: CairoOption<EntryFee>,
    tournamentId: BigNumberish,
    tournamentName: string,
    tournamentModel: Tournament,
    player_name: BigNumberish,
    player_address: BigNumberish,
    qualification: CairoOption<QualificationProofEnum>,
    duration: number,
    entryFeeUsdCost: number,
    entryCount: number,
    prizeTotalUsd: number
  ) => {
    const startsIn =
      Number(tournamentModel.schedule.game.start) - Date.now() / 1000;
    const game = getGameName(tournamentModel.game_config.address);
    console.log("Entry Qualification:", qualification);

    const budokanContract = initializeBudokanContract();

    try {
      const call = budokanContract.populate("enter_tournament", [
        tournamentId,
        player_name,
        player_address,
        qualification,
      ]);
      let calls = [];
      if (entryFeeToken.isSome()) {
        calls.push({
          contractAddress: entryFeeToken.Some?.token_address!,
          entrypoint: "approve",
          calldata: CallData.compile([
            tournamentAddress,
            entryFeeToken.Some?.amount!,
            "0",
          ]),
        });
      }
      calls.push({
        contractAddress: tournamentAddress,
        entrypoint: "enter_tournament",
        calldata: call.calldata,
      });

      const tx = await account?.execute(calls);

      await waitForTournamentEntry(tournamentId, entryCount);

      if (tx) {
        showTournamentEntry({
          tournamentName,
          game,
          entryFeeUsdCost,
          hasEntryFee: entryFeeToken.isSome(),
          startsIn,
          duration,
          prizeTotalUsd,
        });
      }
    } catch (error) {
      console.error("Error executing enter tournament:", error);
      throw error;
    }
  };

  const validateEntry = async (
    tournamentId: BigNumberish,
    gameTokenId: BigNumberish,
    proof: string[]
  ) => {
    try {
      const tx = await account?.execute({
        contractAddress: tournamentAddress,
        entrypoint: "validate_entry",
        calldata: CallData.compile([tournamentId, gameTokenId, proof]),
      });

      return tx;
    } catch (error) {
      console.error("Error executing validate entry:", error);
      throw error;
    }
  };

  const submitScores = async (
    tournamentId: BigNumberish,
    tournamentName: string,
    submissions: Array<{
      tokenId: BigNumberish;
      position: BigNumberish;
    }>
  ) => {
    try {
      let calls = [];
      for (const submission of submissions) {
        calls.push({
          contractAddress: tournamentAddress,
          entrypoint: "submit_score",
          calldata: CallData.compile([
            tournamentId,
            submission.tokenId,
            submission.position,
          ]),
        });
      }

      const tx = await account?.execute(calls);

      await waitForSubmitScores(tournamentId);

      if (tx) {
        showScoreSubmission(tournamentName);
      }
    } catch (error) {
      console.error("Error executing submit scores:", error);
      throw error;
    }
  };

  const submitScoresBatched = async (
    tournamentId: BigNumberish,
    tournamentName: string,
    submissions: Array<{
      tokenId: BigNumberish;
      position: BigNumberish;
    }>,
    batchSize: number = 30,
    onProgress?: (current: number, total: number) => void
  ) => {
    try {
      // Split submissions into batches
      const batches = [];
      for (let i = 0; i < submissions.length; i += batchSize) {
        batches.push(submissions.slice(i, i + batchSize));
      }

      let tx;
      for (const [index, batch] of batches.entries()) {
        const calls = batch.map((submission) => ({
          contractAddress: tournamentAddress,
          entrypoint: "submit_score",
          calldata: CallData.compile([
            tournamentId,
            submission.tokenId,
            submission.position,
          ]),
        }));

        console.log(
          `Processing score submission batch ${index + 1}/${
            batches.length
          } with ${calls.length} scores`
        );

        // Call progress callback
        if (onProgress) {
          onProgress(index + 1, batches.length);
        }

        tx = await account?.execute(calls);

        if (tx?.transaction_hash) {
          console.log(
            `Waiting for transaction ${tx.transaction_hash} to be confirmed...`
          );
          // Wait for the transaction to be accepted on L2
          await account?.waitForTransaction(tx.transaction_hash);
          console.log(`Transaction ${tx.transaction_hash} confirmed`);
        }
      }

      await waitForSubmitScores(tournamentId);

      if (tx) {
        showScoreSubmission(tournamentName);
      }
    } catch (error) {
      console.error("Error executing batched submit scores:", error);
      throw error;
    }
  };

  const approveAndAddPrizes = async (
    tournamentName: string,
    prizes: Prize[],
    showToast: boolean,
    prizeTotalUsd: number,
    totalCurrentPrizes: number
  ) => {
    try {
      let calls = [];

      // Separate ERC20 and ERC721 prizes
      const erc20Prizes = prizes.filter((p) => p.token_type.variant.erc20);
      const erc721Prizes = prizes.filter((p) => p.token_type.variant.erc721);

      // Handle ERC20 approvals - sum amounts for same token
      const erc20ApprovalCalls = Object.values(
        erc20Prizes.reduce((acc: { [key: string]: any }, prize) => {
          const tokenAddress = prize.token_address;
          if (!acc[tokenAddress]) {
            acc[tokenAddress] = {
              contractAddress: tokenAddress,
              entrypoint: "approve",
              calldata: CallData.compile([
                tournamentAddress,
                prize.token_type.variant.erc20?.amount!,
                "0",
              ]),
              totalAmount: BigInt(prize.token_type.variant.erc20?.amount! || 0),
            };
          } else {
            // Sum the amounts for the same token
            acc[tokenAddress].totalAmount += BigInt(
              prize.token_type.variant.erc20?.amount! || 0
            );
            // Update calldata with new total
            acc[tokenAddress].calldata = CallData.compile([
              tournamentAddress,
              acc[tokenAddress].totalAmount.toString(),
              "0",
            ]);
          }
          return acc;
        }, {})
      ).map(({ contractAddress, entrypoint, calldata }) => ({
        contractAddress,
        entrypoint,
        calldata,
      }));

      // Handle ERC721 approvals - individual approve for each token ID
      const erc721ApprovalCalls = erc721Prizes.map((prize) => ({
        contractAddress: prize.token_address,
        entrypoint: "approve",
        calldata: CallData.compile([
          tournamentAddress,
          { low: prize.token_type.variant.erc721?.id || "1", high: "0" }, // Token ID as u256
        ]),
      }));

      // Add all approval calls
      calls.push(...erc20ApprovalCalls, ...erc721ApprovalCalls);

      // Add prize calls
      const budokanContract = initializeBudokanContract();

      for (const prize of prizes) {
        // Create position as CairoOption
        const position = (prize as any).position
          ? new CairoOption(CairoOptionVariant.Some, (prize as any).position)
          : new CairoOption(CairoOptionVariant.None);

        const call = budokanContract.populate("add_prize", [
          prize.context_id,
          prize.token_address,
          prize.token_type,
          position,
        ]);

        const addPrizesCall = {
          contractAddress: tournamentAddress,
          entrypoint: "add_prize",
          calldata: call.calldata,
        };

        calls.push(addPrizesCall);
      }

      console.log(calls);

      const tx = await account?.execute(calls);

      await waitForAddPrizes(totalCurrentPrizes + prizes.length);

      if (showToast && tx) {
        showPrizeAddition({
          tournamentName,
          prizeTotalUsd,
        });
      }
    } catch (error) {
      console.error("Error executing add prize:", error);
      throw error;
    }
  };

  const approveAndAddPrizesBatched = async (
    tournamentName: string,
    prizes: Prize[],
    showToast: boolean,
    prizeTotalUsd: number,
    totalCurrentPrizes: number,
    batchSize: number = 30,
    onProgress?: (current: number, total: number) => void
  ) => {
    try {
      // Separate ERC20 and ERC721 prizes
      const erc20Prizes = prizes.filter((p) => p.token_type.variant.erc20);
      const erc721Prizes = prizes.filter((p) => p.token_type.variant.erc721);

      // Calculate ERC20 approvals - sum amounts for same token
      const erc20ApprovalCalls = Object.values(
        erc20Prizes.reduce((acc: { [key: string]: any }, prize) => {
          const tokenAddress = prize.token_address;
          if (!acc[tokenAddress]) {
            acc[tokenAddress] = {
              contractAddress: tokenAddress,
              entrypoint: "approve",
              calldata: CallData.compile([
                tournamentAddress,
                prize.token_type.variant.erc20?.amount!,
                "0",
              ]),
              totalAmount: BigInt(prize.token_type.variant.erc20?.amount! || 0),
            };
          } else {
            // Sum the amounts for the same token
            acc[tokenAddress].totalAmount += BigInt(
              prize.token_type.variant.erc20?.amount! || 0
            );
            // Update calldata with new total
            acc[tokenAddress].calldata = CallData.compile([
              tournamentAddress,
              acc[tokenAddress].totalAmount.toString(),
              "0",
            ]);
          }
          return acc;
        }, {})
      ).map(({ contractAddress, entrypoint, calldata }) => ({
        contractAddress,
        entrypoint,
        calldata,
      }));

      // Calculate ERC721 approvals - individual approve for each token ID
      const erc721ApprovalCalls = erc721Prizes.map((prize) => ({
        contractAddress: prize.token_address,
        entrypoint: "approve",
        calldata: CallData.compile([
          tournamentAddress,
          { low: prize.token_type.variant.erc721?.id || "1", high: "0" }, // Token ID as u256
        ]),
      }));

      // Combine all approval calls
      const approvalCalls = [...erc20ApprovalCalls, ...erc721ApprovalCalls];

      // Split prizes into batches
      const batches = [];
      for (let i = 0; i < prizes.length; i += batchSize) {
        batches.push(prizes.slice(i, i + batchSize));
      }

      let addedPrizesCount = 0;
      for (const [index, batch] of batches.entries()) {
        let calls = [];

        // Add approvals to the first batch
        if (index === 0 && approvalCalls.length > 0) {
          calls.push(...approvalCalls);
        }

        // Add prize calls
        const prizeCalls = batch.map((prize) => {
          // Create position as CairoOption
          const position = (prize as any).position
            ? new CairoOption(CairoOptionVariant.Some, (prize as any).position)
            : new CairoOption(CairoOptionVariant.None);

          return {
            contractAddress: tournamentAddress,
            entrypoint: "add_prize",
            calldata: CallData.compile([
              prize.context_id, // Changed from tournament_id
              prize.token_address,
              prize.token_type,
              position, // Position as Option<u32>
            ]),
          };
        });
        calls.push(...prizeCalls);

        console.log(
          `Processing batch ${index + 1}/${batches.length} with ${
            prizeCalls.length
          } prizes${
            index === 0 && approvalCalls.length > 0
              ? ` and ${approvalCalls.length} approvals`
              : ""
          }`
        );

        // Call progress callback
        if (onProgress) {
          onProgress(index + 1, batches.length);
        }

        const tx = await account?.execute(calls);

        if (tx?.transaction_hash) {
          console.log(
            `Waiting for transaction ${tx.transaction_hash} to be confirmed...`
          );
          // Wait for the transaction to be accepted on L2
          await account?.waitForTransaction(tx.transaction_hash);
          console.log(`Transaction ${tx.transaction_hash} confirmed`);
        }

        // Wait for this batch to be processed
        addedPrizesCount += batch.length;
        await waitForAddPrizes(totalCurrentPrizes + addedPrizesCount);

        // Show toast only on the last batch if requested
        if (showToast && tx && index === batches.length - 1) {
          showPrizeAddition({
            tournamentName,
            prizeTotalUsd,
          });
        }
      }
    } catch (error) {
      console.error("Error executing batched add prizes:", error);
      throw error;
    }
  };

  const createTournamentAndApproveAndAddPrizes = async (
    tournament: Tournament,
    prizes: Prize[],
    entryFeeUsdCost: number,
    duration: number
  ) => {
    const budokanContract = initializeBudokanContract();
    const game = getGameName(tournament.game_config.address);
    console.log([
      address!,
      tournament.metadata,
      tournament.schedule,
      tournament.game_config,
      tournament.entry_fee,
      tournament.entry_requirement,
    ]);
    try {
      const call = budokanContract.populate("create_tournament", [
        address!,
        tournament.metadata,
        tournament.schedule,
        tournament.game_config,
        tournament.entry_fee,
        tournament.entry_requirement,
        tournament.soulbound,
        tournament.play_url,
      ]);

      let calls = [];
      const createCall = {
        contractAddress: tournamentAddress,
        entrypoint: "create_tournament",
        calldata: call.calldata,
      };
      calls.push(createCall);

      // Separate ERC20 and ERC721 prizes
      const erc20Prizes = prizes.filter((p) => p.token_type.variant.erc20);
      const erc721Prizes = prizes.filter((p) => p.token_type.variant.erc721);

      // Handle ERC20 approvals
      const erc20ApprovalCalls = Object.values(
        erc20Prizes.reduce((acc: { [key: string]: any }, prize) => {
          const tokenAddress = prize.token_address;
          if (!acc[tokenAddress]) {
            acc[tokenAddress] = {
              contractAddress: tokenAddress,
              entrypoint: "approve",
              calldata: CallData.compile([
                tournamentAddress,
                prize.token_type.variant.erc20?.amount!,
                "0",
              ]),
              totalAmount: BigInt(prize.token_type.variant.erc20?.amount! || 0),
            };
          } else {
            // Sum the amounts for the same token
            acc[tokenAddress].totalAmount += BigInt(
              prize.token_type.variant.erc20?.amount! || 0
            );
            // Update calldata with new total
            acc[tokenAddress].calldata = CallData.compile([
              tournamentAddress,
              acc[tokenAddress].totalAmount.toString(),
              "0",
            ]);
          }
          return acc;
        }, {})
      ).map(({ contractAddress, entrypoint, calldata }) => ({
        contractAddress,
        entrypoint,
        calldata,
      }));

      // Handle ERC721 approvals
      const erc721ApprovalCalls = erc721Prizes.map((prize) => ({
        contractAddress: prize.token_address,
        entrypoint: "approve",
        calldata: CallData.compile([
          tournamentAddress,
          { low: prize.token_type.variant.erc721?.id || "1", high: "0" },
        ]),
      }));

      calls.push(...erc20ApprovalCalls, ...erc721ApprovalCalls);
      for (const prize of prizes) {
        // Create position as CairoOption
        const position = (prize as any).position
          ? new CairoOption(CairoOptionVariant.Some, (prize as any).position)
          : new CairoOption(CairoOptionVariant.None);

        const addPrizesCall = {
          contractAddress: tournamentAddress,
          entrypoint: "add_prize",
          calldata: CallData.compile([
            prize.context_id, // Changed from tournament_id
            prize.token_address,
            prize.token_type,
            position, // Position as Option<u32>
          ]),
        };
        calls.push(addPrizesCall);
      }

      console.log(calls);

      const tx = await account?.execute(calls);

      await waitForTournamentCreation(Number(tournament.id));

      if (tx) {
        showTournamentCreation({
          tournamentName: feltToString(tournament.metadata.name),
          tournamentId: Number(tournament.id).toString(),
          game,
          hasEntryFee: tournament.entry_fee.isSome(),
          entryFeeUsdCost: entryFeeUsdCost,
          startsIn: Number(tournament.schedule.game.start) - Date.now() / 1000,
          duration,
        });
      }
    } catch (error) {
      console.error("Error executing create tournament:", error);
      throw error;
    }
  };

  const createTournamentAndApproveAndAddPrizesBatched = async (
    tournament: Tournament,
    prizes: Prize[],
    entryFeeUsdCost: number,
    duration: number,
    batchSize: number = 50
  ) => {
    const game = getGameName(tournament.game_config.address);
    try {
      // Manually convert description to ByteArray to avoid stack overflow
      const descriptionByteArray = byteArray.byteArrayFromString(
        tournament.metadata.description
      );

      const metadataWithByteArray = {
        name: tournament.metadata.name,
        description: descriptionByteArray,
      };

      // Create tournament call
      const createCall = {
        contractAddress: tournamentAddress,
        entrypoint: "create_tournament",
        calldata: CallData.compile([
          address!,
          metadataWithByteArray,
          tournament.schedule,
          tournament.game_config,
          tournament.entry_fee,
          tournament.entry_requirement,
          tournament.soulbound,
          tournament.play_url,
        ]),
      };

      // Separate ERC20 and ERC721 prizes
      const erc20Prizes = prizes.filter((p) => p.token_type.variant.erc20);
      const erc721Prizes = prizes.filter((p) => p.token_type.variant.erc721);

      // Calculate ERC20 approvals
      const erc20ApprovalCalls = Object.values(
        erc20Prizes.reduce((acc: { [key: string]: any }, prize) => {
          const tokenAddress = prize.token_address;
          if (!acc[tokenAddress]) {
            acc[tokenAddress] = {
              contractAddress: tokenAddress,
              entrypoint: "approve",
              calldata: CallData.compile([
                tournamentAddress,
                prize.token_type.variant.erc20?.amount!,
                "0",
              ]),
              totalAmount: BigInt(prize.token_type.variant.erc20?.amount! || 0),
            };
          } else {
            // Sum the amounts for the same token
            acc[tokenAddress].totalAmount += BigInt(
              prize.token_type.variant.erc20?.amount! || 0
            );
            // Update calldata with new total
            acc[tokenAddress].calldata = CallData.compile([
              tournamentAddress,
              acc[tokenAddress].totalAmount.toString(),
              "0",
            ]);
          }
          return acc;
        }, {})
      ).map(({ contractAddress, entrypoint, calldata }) => ({
        contractAddress,
        entrypoint,
        calldata,
      }));

      // Calculate ERC721 approvals
      const erc721ApprovalCalls = erc721Prizes.map((prize) => ({
        contractAddress: prize.token_address,
        entrypoint: "approve",
        calldata: CallData.compile([
          tournamentAddress,
          { low: prize.token_type.variant.erc721?.id || "1", high: "0" },
        ]),
      }));

      // Combine all approval calls
      const approvalCalls = [...erc20ApprovalCalls, ...erc721ApprovalCalls];

      // Split prizes into batches
      const batches = [];
      for (let i = 0; i < prizes.length; i += batchSize) {
        batches.push(prizes.slice(i, i + batchSize));
      }

      let tx;
      for (const [index, batch] of batches.entries()) {
        let calls = [];

        // First batch includes tournament creation and approvals
        if (index === 0) {
          calls.push(createCall);
          if (approvalCalls.length > 0) {
            calls.push(...approvalCalls);
          }
        }

        // Add prize calls
        const prizeCalls = batch.map((prize) => {
          // Create position as CairoOption
          const position = (prize as any).position
            ? new CairoOption(CairoOptionVariant.Some, (prize as any).position)
            : new CairoOption(CairoOptionVariant.None);

          return {
            contractAddress: tournamentAddress,
            entrypoint: "add_prize",
            calldata: CallData.compile([
              prize.context_id, // Changed from tournament_id
              prize.token_address,
              prize.token_type,
              position, // Position as Option<u32>
            ]),
          };
        });
        calls.push(...prizeCalls);

        console.log(
          `Processing batch ${index + 1}/${batches.length} with ${
            prizeCalls.length
          } prizes${
            index === 0
              ? `, tournament creation, and ${approvalCalls.length} approvals`
              : ""
          }`
        );

        tx = await account?.execute(calls);

        if (tx?.transaction_hash) {
          console.log(
            `Waiting for transaction ${tx.transaction_hash} to be confirmed...`
          );
          // Wait for the transaction to be accepted on L2
          await account?.waitForTransaction(tx.transaction_hash);
          console.log(`Transaction ${tx.transaction_hash} confirmed`);
        }

        // Wait for tournament creation after first batch
        if (index === 0) {
          await waitForTournamentCreation(Number(tournament.id));
        }
      }

      if (tx) {
        showTournamentCreation({
          tournamentName: feltToString(tournament.metadata.name),
          tournamentId: Number(tournament.id).toString(),
          game,
          hasEntryFee: tournament.entry_fee.isSome(),
          entryFeeUsdCost: entryFeeUsdCost,
          startsIn: Number(tournament.schedule.game.start) - Date.now() / 1000,
          duration,
        });
      }
    } catch (error) {
      console.error(
        "Error executing create tournament with batched prizes:",
        error
      );
      throw error;
    }
  };

  const claimPrizes = async (
    tournamentId: BigNumberish,
    tournamentName: string,
    rewardTypes: Array<CairoCustomEnum>
  ) => {
    console.log(rewardTypes);
    try {
      let calls = [];
      for (const rewardType of rewardTypes) {
        calls.push({
          contractAddress: tournamentAddress,
          entrypoint: "claim_reward",
          calldata: CallData.compile([tournamentId, rewardType]),
        });
      }

      console.log(calls);

      const tx = await account?.execute(calls);

      if (tx) {
        showPrizeDistribution(tournamentName);
      }
    } catch (error) {
      console.error("Error executing distribute prizes:", error);
      throw error;
    }
  };

  const claimPrizesBatched = async (
    tournamentId: BigNumberish,
    tournamentName: string,
    rewardTypes: Array<CairoCustomEnum>,
    batchSize: number = 30,
    onProgress?: (current: number, total: number) => void
  ) => {
    try {
      // Split reward types into batches
      const batches = [];
      for (let i = 0; i < rewardTypes.length; i += batchSize) {
        batches.push(rewardTypes.slice(i, i + batchSize));
      }

      let tx;
      for (const [index, batch] of batches.entries()) {
        const calls = batch.map((rewardType) => ({
          contractAddress: tournamentAddress,
          entrypoint: "claim_reward",
          calldata: CallData.compile([tournamentId, rewardType]),
        }));

        console.log(
          `Processing claim batch ${index + 1}/${batches.length} with ${
            calls.length
          } rewards`
        );

        // Call progress callback
        if (onProgress) {
          onProgress(index + 1, batches.length);
        }

        tx = await account?.execute(calls);

        if (tx?.transaction_hash) {
          console.log(
            `Waiting for transaction ${tx.transaction_hash} to be confirmed...`
          );
          // Wait for the transaction to be accepted on L2
          await account?.waitForTransaction(tx.transaction_hash);
          console.log(`Transaction ${tx.transaction_hash} confirmed`);
        }
      }

      if (tx) {
        showPrizeDistribution(tournamentName);
      }
    } catch (error) {
      console.error("Error executing batched prize claims:", error);
      throw error;
    }
  };

  // Game

  const endGame = async (gameId: BigNumberish, score: BigNumberish) => {
    try {
      const resolvedClient = await client;
      await resolvedClient.game_mock.endGame(
        account as unknown as Account | AccountInterface,
        gameId,
        score
      );
    } catch (error) {
      console.error("Error executing end game:", error);
      throw error;
    }
  };

  const getBalanceGeneral = async (tokenAddress: string) => {
    const result = await account?.callContract({
      contractAddress: tokenAddress,
      entrypoint: "balance_of",
      calldata: [address!],
    });
    const decimalsResult = await account?.callContract({
      contractAddress: tokenAddress,
      entrypoint: "decimals",
      calldata: [],
    });
    const decimals = Number(decimalsResult?.[0]!);
    const balance =
      (BigInt(result?.[0]!) / 10n ** BigInt(decimals)) * 10n ** 18n;
    return balance;
  };

  const mintErc20 = async (
    tokenAddress: string,
    recipient: string,
    amount: Uint256
  ) => {
    await account?.execute({
      contractAddress: tokenAddress,
      entrypoint: "mint",
      calldata: [recipient, amount],
    });
  };

  const mintErc721 = async (
    tokenAddress: string,
    recipient: string,
    tokenId: Uint256
  ) => {
    await account?.execute({
      contractAddress: tokenAddress,
      entrypoint: "mint",
      calldata: [recipient, tokenId],
    });
  };

  const getErc20Balance = async (address: string) => {
    const resolvedClient = await client;
    return await resolvedClient.erc20_mock.balanceOf(address);
  };

  const getErc721Balance = async (address: string) => {
    const resolvedClient = await client;
    return await resolvedClient.erc721_mock.balanceOf(address);
  };

  const getTokenDecimals = async (tokenAddress: string) => {
    try {
      if (!provider) return 18;
      const decimalsResult = await provider.callContract({
        contractAddress: tokenAddress,
        entrypoint: "decimals",
        calldata: [],
      });
      return Number(decimalsResult?.[0] || 18);
    } catch (error) {
      console.error("Error fetching token decimals:", error);
      return 18; // Default to 18 on error
    }
  };

  const getTokenInfo = async (tokenAddress: string) => {
    try {
      if (!account) return null;
      const nameResult = await account.callContract({
        contractAddress: tokenAddress,
        entrypoint: "name",
        calldata: [],
      });

      const nameByteArray: ByteArray = {
        data: nameResult.slice(0, -2),
        pending_word: nameResult[nameResult.length - 2],
        pending_word_len: nameResult[nameResult.length - 1],
      };

      const symbolResult = await account.callContract({
        contractAddress: tokenAddress,
        entrypoint: "symbol",
        calldata: [],
      });

      const symbolByteArray: ByteArray = {
        data: symbolResult.slice(0, -2),
        pending_word: symbolResult[symbolResult.length - 2],
        pending_word_len: symbolResult[symbolResult.length - 1],
      };

      // Convert ByteArray to string for name and symbol
      const name = nameResult
        ? byteArray.stringFromByteArray(nameByteArray)
        : "";
      const symbol = symbolResult
        ? byteArray.stringFromByteArray(symbolByteArray)
        : "";

      return { name, symbol };
    } catch (error) {
      console.error("Error fetching token info:", error);
      return null;
    }
  };

  const registerToken = async (
    tokenAddress: string,
    tokenType: "erc20" | "erc721",
    tokenId?: string
  ) => {
    try {
      let tokenTypeData: TokenTypeDataEnum;
      let calls = [];

      if (tokenType === "erc20") {
        tokenTypeData = new CairoCustomEnum({
          erc20: { amount: 1 } as ERC20Data,
          erc721: undefined,
        });

        // Add ERC20 approval call for 1 unit
        calls.push({
          contractAddress: tokenAddress,
          entrypoint: "approve",
          calldata: CallData.compile([
            tournamentAddress,
            { low: "1", high: "0" }, // Approve 1 unit
          ]),
        });
      } else {
        tokenTypeData = new CairoCustomEnum({
          erc20: undefined,
          erc721: { id: tokenId || "1" } as ERC721Data,
        });

        // Add ERC721 approval call
        calls.push({
          contractAddress: tokenAddress,
          entrypoint: "approve",
          calldata: CallData.compile([
            tournamentAddress,
            { low: tokenId || "1", high: "0" }, // Token ID as u256
          ]),
        });
      }

      // Add register token call
      calls.push({
        contractAddress: tournamentAddress,
        entrypoint: "register_token",
        calldata: CallData.compile([tokenAddress, tokenTypeData]),
      });

      const tx = await account?.execute(calls);

      return tx;
    } catch (error) {
      console.error("Error executing register token:", error);
      throw error;
    }
  };

  const checkExtensionValidEntry = async (
    extensionAddress: string,
    tournamentId: BigNumberish,
    playerAddress: string,
    qualification: string[]
  ): Promise<boolean> => {
    try {
      if (!provider) return false;

      const result = await provider.callContract({
        contractAddress: extensionAddress,
        entrypoint: "valid_entry",
        calldata: CallData.compile([
          tournamentId,
          playerAddress,
          qualification,
        ]),
      });

      return result[0] === "0x1" || BigInt(result[0]) === 1n;
    } catch (error) {
      console.error("Error checking extension valid_entry:", error);
      return false;
    }
  };

  const getExtensionEntriesLeft = async (
    extensionAddress: string,
    tournamentId: BigNumberish,
    playerAddress: string,
    qualification: string[]
  ): Promise<number | null> => {
    try {
      if (!provider) return null;

      const result = await provider.callContract({
        contractAddress: extensionAddress,
        entrypoint: "entries_left",
        calldata: CallData.compile([
          tournamentId,
          playerAddress,
          qualification,
        ]),
      });

      console.log(result);

      // Result is Option<u8>
      // If Option::Some, result[0] is 0 and result[1] is the value
      // If Option::None, result[0] is 1
      if (result[0] === "0x1" || BigInt(result[0]) === 1n) {
        // Option::None - no limit
        return null;
      } else {
        // Option::Some - return the value
        return Number(result[1]);
      }
    } catch (error) {
      console.error("Error getting extension entries_left:", error);
      return null;
    }
  };

  return {
    approveAndEnterTournament,
    validateEntry,
    submitScores,
    submitScoresBatched,
    approveAndAddPrizes,
    approveAndAddPrizesBatched,
    createTournamentAndApproveAndAddPrizes,
    createTournamentAndApproveAndAddPrizesBatched,
    claimPrizes,
    claimPrizesBatched,
    endGame,
    getBalanceGeneral,
    mintErc721,
    mintErc20,
    getErc20Balance,
    getErc721Balance,
    getTokenDecimals,
    getTokenInfo,
    registerToken,
    checkExtensionValidEntry,
    getExtensionEntriesLeft,
  };
};
