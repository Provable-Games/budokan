import { DojoProvider } from "@dojoengine/core";
import {
  Account,
  AccountInterface,
  BigNumberish,
  CairoOption,
  CairoCustomEnum,
  ByteArray,
  Uint256,
} from "starknet";
import * as models from "./models.gen";

export function setupWorld(provider: DojoProvider, namespace: string) {
  const game_mock_getScore = async (gameId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "score",
        calldata: [gameId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_startGame = async (
    snAccount: Account | AccountInterface,
    gameId: BigNumberish
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "start_game",
          calldata: [gameId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_endGame = async (
    snAccount: Account | AccountInterface,
    gameId: BigNumberish,
    score: BigNumberish
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "end_game",
          calldata: [gameId, score],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_setSettings = async (
    snAccount: Account | AccountInterface,
    settingsId: BigNumberish,
    name: BigNumberish,
    description: ByteArray,
    exists: boolean
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "set_settings",
          calldata: [settingsId, name, description, exists],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_initializer = async (
    snAccount: Account | AccountInterface
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "initializer",
          calldata: [],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_newGame = async (
    snAccount: Account | AccountInterface,
    playerName: BigNumberish,
    settingsId: BigNumberish,
    availableAt: BigNumberish,
    expiresAt: BigNumberish,
    to: string
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "mint",
          calldata: [playerName, settingsId, availableAt, expiresAt, to],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_getSettingsId = async (tokenId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "get_settings_id",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_getSettingsDetails = async (settingsId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "get_settings_details",
        calldata: [settingsId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_settingsExists = async (settingsId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "settings_exists",
        calldata: [settingsId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_tokenMetadata = async (tokenId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "token_metadata",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_balanceOf = async (account: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "balance_of",
        calldata: [account],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_ownerOf = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "owner_of",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_safeTransferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256,
    data: Array<BigNumberish>
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "safe_transfer_from",
          calldata: [from, to, tokenId, data],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_transferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "transfer_from",
          calldata: [from, to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_approve = async (
    snAccount: Account | AccountInterface,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "approve",
          calldata: [to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_setApprovalForAll = async (
    snAccount: Account | AccountInterface,
    operator: string,
    approved: boolean
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "game_mock",
          entrypoint: "set_approval_for_all",
          calldata: [operator, approved],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_getApproved = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "get_approved",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_isApprovedForAll = async (
    owner: string,
    operator: string
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "is_approved_for_all",
        calldata: [owner, operator],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_supportsInterface = async (interfaceId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "supports_interface",
        calldata: [interfaceId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_name = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "name",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_symbol = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "symbol",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const game_mock_tokenUri = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "game_mock",
        entrypoint: "token_uri",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_balanceOf = async (account: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "balance_of",
        calldata: [account],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_ownerOf = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "owner_of",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_safeTransferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256,
    data: Array<BigNumberish>
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc721_mock",
          entrypoint: "safe_transfer_from",
          calldata: [from, to, tokenId, data],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_transferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc721_mock",
          entrypoint: "transfer_from",
          calldata: [from, to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_approve = async (
    snAccount: Account | AccountInterface,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc721_mock",
          entrypoint: "approve",
          calldata: [to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_setApprovalForAll = async (
    snAccount: Account | AccountInterface,
    operator: string,
    approved: boolean
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc721_mock",
          entrypoint: "set_approval_for_all",
          calldata: [operator, approved],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_getApproved = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "get_approved",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_isApprovedForAll = async (
    owner: string,
    operator: string
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "is_approved_for_all",
        calldata: [owner, operator],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_supportsInterface = async (interfaceId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "supports_interface",
        calldata: [interfaceId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_name = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "name",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_symbol = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "symbol",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_tokenUri = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc721_mock",
        entrypoint: "token_uri",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc721_mock_mint = async (
    snAccount: Account | AccountInterface,
    recipient: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc721_mock",
          entrypoint: "mint",
          calldata: [recipient, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_mint = async (
    snAccount: Account | AccountInterface,
    recipient: string,
    amount: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc20_mock",
          entrypoint: "mint",
          calldata: [recipient, amount],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_totalSupply = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "total_supply",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_balanceOf = async (account: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "balance_of",
        calldata: [account],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_allowance = async (owner: string, spender: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "allowance",
        calldata: [owner, spender],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_transfer = async (
    snAccount: Account | AccountInterface,
    recipient: string,
    amount: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc20_mock",
          entrypoint: "transfer",
          calldata: [recipient, amount],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_transferFrom = async (
    snAccount: Account | AccountInterface,
    sender: string,
    recipient: string,
    amount: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc20_mock",
          entrypoint: "transfer_from",
          calldata: [sender, recipient, amount],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_approve = async (
    snAccount: Account | AccountInterface,
    spender: string,
    amount: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "erc20_mock",
          entrypoint: "approve",
          calldata: [spender, amount],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_name = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "name",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_symbol = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "symbol",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const erc20_mock_decimals = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "erc20_mock",
        entrypoint: "decimals",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_createTournament = async (
    snAccount: Account | AccountInterface,
    metadata: models.Metadata,
    schedule: models.Schedule,
    gameConfig: models.GameConfig,
    entryFee: CairoOption<models.Period>,
    entryRequirement: CairoOption<models.Period>
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "create_tournament",
          calldata: [
            metadata,
            schedule,
            gameConfig,
            entryFee,
            entryRequirement,
          ],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_enterTournament = async (
    snAccount: Account | AccountInterface,
    tournamentId: BigNumberish,
    playerName: BigNumberish,
    playerAddress: string,
    qualification: CairoOption<models.Period>
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "enter_tournament",
          calldata: [tournamentId, playerName, playerAddress, qualification],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_submitScore = async (
    snAccount: Account | AccountInterface,
    tournamentId: BigNumberish,
    tokenId: BigNumberish,
    position: BigNumberish
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "submit_score",
          calldata: [tournamentId, tokenId, position],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_claimPrize = async (
    snAccount: Account | AccountInterface,
    tournamentId: BigNumberish,
    prizeType: CairoCustomEnum
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "claim_prize",
          calldata: [tournamentId, prizeType],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_addPrize = async (
    snAccount: Account | AccountInterface,
    tournamentId: BigNumberish,
    tokenAddress: string,
    tokenType: CairoCustomEnum,
    position: BigNumberish
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "add_prize",
          calldata: [tournamentId, tokenAddress, tokenType, position],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_totalTournaments = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "total_tournaments",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_tournament = async (tournamentId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "tournament",
        calldata: [tournamentId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_getRegistration = async (
    tournamentId: BigNumberish,
    tokenId: BigNumberish
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "get_registration",
        calldata: [tournamentId, tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_tournamentEntries = async (
    tournamentId: BigNumberish
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "tournament_entries",
        calldata: [tournamentId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_isTokenRegistered = async (address: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "is_token_registered",
        calldata: [address],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_registerToken = async (
    snAccount: Account | AccountInterface,
    address: string,
    tokenType: CairoCustomEnum
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "register_token",
          calldata: [address, tokenType],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_getLeaderboard = async (tournamentId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "get_leaderboard",
        calldata: [tournamentId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_getState = async (tournamentId: BigNumberish) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "current_phase",
        calldata: [tournamentId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_balanceOf = async (account: string) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "balance_of",
        calldata: [account],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_ownerOf = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "owner_of",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_safeTransferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256,
    data: Array<BigNumberish>
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "safe_transfer_from",
          calldata: [from, to, tokenId, data],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_transferFrom = async (
    snAccount: Account | AccountInterface,
    from: string,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "transfer_from",
          calldata: [from, to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_approve = async (
    snAccount: Account | AccountInterface,
    to: string,
    tokenId: Uint256
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "approve",
          calldata: [to, tokenId],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_setApprovalForAll = async (
    snAccount: Account | AccountInterface,
    operator: string,
    approved: boolean
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "set_approval_for_all",
          calldata: [operator, approved],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_getApproved = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "get_approved",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_isApprovedForAll = async (
    owner: string,
    operator: string
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "is_approved_for_all",
        calldata: [owner, operator],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_supportsInterface = async (
    interfaceId: BigNumberish
  ) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "supports_interface",
        calldata: [interfaceId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_name = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "name",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_symbol = async () => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "symbol",
        calldata: [],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_tokenUri = async (tokenId: Uint256) => {
    try {
      return await provider.call(namespace, {
        contractName: "tournament_mock",
        entrypoint: "token_uri",
        calldata: [tokenId],
      });
    } catch (error) {
      console.error(error);
    }
  };

  const tournament_mock_initializer = async (
    snAccount: Account | AccountInterface,
    name: ByteArray,
    symbol: ByteArray,
    baseUri: ByteArray,
    safeMode: boolean,
    testMode: boolean,
    testErc20: string,
    testErc721: string
  ) => {
    try {
      return await provider.execute(
        snAccount as any,
        {
          contractName: "tournament_mock",
          entrypoint: "initializer",
          calldata: [
            name,
            symbol,
            baseUri,
            safeMode,
            testMode,
            testErc20,
            testErc721,
          ],
        },
        namespace
      );
    } catch (error) {
      console.error(error);
    }
  };

  return {
    game_mock: {
      getScore: game_mock_getScore,
      startGame: game_mock_startGame,
      endGame: game_mock_endGame,
      setSettings: game_mock_setSettings,
      initializer: game_mock_initializer,
      newGame: game_mock_newGame,
      getSettingsId: game_mock_getSettingsId,
      getSettingsDetails: game_mock_getSettingsDetails,
      settingsExists: game_mock_settingsExists,
      tokenMetadata: game_mock_tokenMetadata,
      balanceOf: game_mock_balanceOf,
      ownerOf: game_mock_ownerOf,
      safeTransferFrom: game_mock_safeTransferFrom,
      transferFrom: game_mock_transferFrom,
      approve: game_mock_approve,
      setApprovalForAll: game_mock_setApprovalForAll,
      getApproved: game_mock_getApproved,
      isApprovedForAll: game_mock_isApprovedForAll,
      supportsInterface: game_mock_supportsInterface,
      name: game_mock_name,
      symbol: game_mock_symbol,
      tokenUri: game_mock_tokenUri,
    },
    erc721_mock: {
      balanceOf: erc721_mock_balanceOf,
      ownerOf: erc721_mock_ownerOf,
      safeTransferFrom: erc721_mock_safeTransferFrom,
      transferFrom: erc721_mock_transferFrom,
      approve: erc721_mock_approve,
      setApprovalForAll: erc721_mock_setApprovalForAll,
      getApproved: erc721_mock_getApproved,
      isApprovedForAll: erc721_mock_isApprovedForAll,
      supportsInterface: erc721_mock_supportsInterface,
      name: erc721_mock_name,
      symbol: erc721_mock_symbol,
      tokenUri: erc721_mock_tokenUri,
      mint: erc721_mock_mint,
    },
    erc20_mock: {
      mint: erc20_mock_mint,
      totalSupply: erc20_mock_totalSupply,
      balanceOf: erc20_mock_balanceOf,
      allowance: erc20_mock_allowance,
      transfer: erc20_mock_transfer,
      transferFrom: erc20_mock_transferFrom,
      approve: erc20_mock_approve,
      name: erc20_mock_name,
      symbol: erc20_mock_symbol,
      decimals: erc20_mock_decimals,
    },
    tournament_mock: {
      createTournament: tournament_mock_createTournament,
      enterTournament: tournament_mock_enterTournament,
      submitScore: tournament_mock_submitScore,
      claimPrize: tournament_mock_claimPrize,
      addPrize: tournament_mock_addPrize,
      totalTournaments: tournament_mock_totalTournaments,
      tournament: tournament_mock_tournament,
      getRegistration: tournament_mock_getRegistration,
      tournamentEntries: tournament_mock_tournamentEntries,
      isTokenRegistered: tournament_mock_isTokenRegistered,
      registerToken: tournament_mock_registerToken,
      getLeaderboard: tournament_mock_getLeaderboard,
      getState: tournament_mock_getState,
      balanceOf: tournament_mock_balanceOf,
      ownerOf: tournament_mock_ownerOf,
      safeTransferFrom: tournament_mock_safeTransferFrom,
      transferFrom: tournament_mock_transferFrom,
      approve: tournament_mock_approve,
      setApprovalForAll: tournament_mock_setApprovalForAll,
      getApproved: tournament_mock_getApproved,
      isApprovedForAll: tournament_mock_isApprovedForAll,
      supportsInterface: tournament_mock_supportsInterface,
      name: tournament_mock_name,
      symbol: tournament_mock_symbol,
      tokenUri: tournament_mock_tokenUri,
      initializer: tournament_mock_initializer,
    },
  };
}
