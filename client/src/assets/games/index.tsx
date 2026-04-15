import { ChainId } from "@/chain/setup/networks";
import { useChainConfig } from "@/context/chain";
import lsLogo from "./ls-logo.png";

export interface Game {
  contract_address: string;
  name: string;
  image?: string;
  url?: string;
  controllerOnly?: boolean;
  playUrl?: string;
  watchLink?: string;
  replayLink?: string;
  disabled?: boolean;
  minEntryFeeUsd?: number;
  defaultEntryFeeToken?: string;
  defaultGameFeePercentage?: number;
  averageGasCostUsd?: number;
  /** Use <object> tag for token URI SVGs (enables CSS animations). Default: false (uses <img>) */
  objectImage?: boolean;
}

// STRK token address (same on mainnet and sepolia)
const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const getGameDefaults = (
  gameAddress: string,
  chainId: string,
): {
  minEntryFeeUsd: number;
  defaultEntryFeeToken: string;
  defaultGameFeePercentage: number;
  averageGasCostUsd: number | undefined;
} => {
  const games = getGamesForChain(chainId);
  const game = games.find((g) => g.contract_address === gameAddress);
  return {
    minEntryFeeUsd: game?.minEntryFeeUsd ?? 0.25,
    defaultEntryFeeToken: game?.defaultEntryFeeToken ?? STRK_ADDRESS,
    defaultGameFeePercentage: game?.defaultGameFeePercentage ?? 1,
    averageGasCostUsd: game?.averageGasCostUsd,
  };
};

export const getGameUrl = (gameAddress: string): string => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.url || "";
};

export const getPlayUrl = (gameAddress: string, gameName?: string): string => {
  const games = getGames();
  let game = games.find((game) => game.contract_address === gameAddress);
  // Fall back to matching by name so play URLs work across different
  // contract addresses (e.g. on Sepolia where addresses change often)
  if (!game && gameName) {
    game = games.find((g) => g.name.toLowerCase() === gameName.toLowerCase());
  }
  return game?.playUrl || "";
};

export const getGameName = (gameAddress: string): string => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.name || "";
};

export const isControllerOnly = (gameAddress: string): boolean => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.controllerOnly || false;
};

export const getWatchLink = (gameAddress: string): string | undefined => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.watchLink;
};

export const getReplayLink = (gameAddress: string): string | undefined => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.replayLink;
};

export const getObjectImage = (gameAddress: string): boolean => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.objectImage ?? false;
};

export const getGamesForChain = (chainId: string): Game[] => {
  const isSepolia = chainId === ChainId.SN_SEPOLIA;

  let games: Game[] = [];

  if (isSepolia) {
    games = [
      {
        contract_address:
          "0x04359aee29873cd9603207d29b4140468bac3e042aa10daab2e1a8b2dd60ef7b",
        name: "Dark Shuffle",
        image: "https://darkshuffle.dev/favicon.svg",
        url: "https://darkshuffle.dev",
        controllerOnly: true,
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
      },
      {
        contract_address:
          "0x07ae26eecf0274aabb31677753ff3a4e15beec7268fa1b104f73ce3c89202831",
        name: "Death Mountain",
        image: "https://darkshuffle.dev/favicon.svg",
        url: "https://lootsurvivor.io/",
        playUrl: "https://lootsurvivor.io/survivor/play?id=",
        controllerOnly: true,
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
      },
      {
        contract_address:
          "0x012ccc9a2d76c836d088203f6e9d62e22d1a9f7479d1aea8b503a1036c0f4487",
        name: "Nums",
        url: "https://nums-blond.vercel.app/",
        playUrl: "https://nums-blond.vercel.app/",
        controllerOnly: true,
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
      },
      {
        contract_address:
          "0x3a2ea07f0f49c770035eed9a010eb3d1e1bc3cb92e1d47eef2ad75a25c6bdb2",
        name: "Number Guess",
        url: "https://funfactory.gg/games/1",
        playUrl: "https://funfactory.gg/tokens/{tokenId}/play",
        controllerOnly: true,
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
        objectImage: true,
      },
      {
        contract_address:
          "0x5e02a1f750b3fa0e835d454705b664ecb23166cdb49459b1c96c1e3eaf9a2f4",
        name: "zKube",
        url: "https://zkube-budokan-sepolia.vercel.app",
        playUrl: "https://zkube-budokan-sepolia.vercel.app/play/",
        controllerOnly: true,
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
      },
    ];
  } else {
    games = [
      {
        contract_address:
          "0x4de0351ceab4ecd50be6ee09329b0dcb3b96a9da88cc158f453823a389722fa",
        name: "Death Mountain",
        image: lsLogo,
        url: "https://super-death-mountain.vercel.app/",
        playUrl: "https://super-death-mountain.vercel.app/play?id=",
        controllerOnly: true,
        watchLink: "https://super-death-mountain.vercel.app/watch?id=",
        replayLink: "https://super-death-mountain.vercel.app/replay?id=",
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
        defaultGameFeePercentage: 5,
        averageGasCostUsd: 0.25,
      },
      {
        contract_address:
          "0x642f228f70b1ca7edb4ab7ff0bab067369c2e276ddc2570ca18802d4e758edc",
        name: "zKube",
        image: "https://zkube.io/favicon.svg",
        url: "https://zkube.io",
        playUrl: "https://zkube.io/play/",
        minEntryFeeUsd: 0.25,
        defaultEntryFeeToken: STRK_ADDRESS,
      },
    ];
  }

  // Sort games so non-disabled ones appear first
  return games.sort((a, b) => {
    const aDisabled = a.disabled ?? false;
    const bDisabled = b.disabled ?? false;
    if (aDisabled === bDisabled) return 0;
    return aDisabled ? 1 : -1;
  });
};

export const getGames = (): Game[] => {
  const { selectedChainConfig } = useChainConfig();
  return getGamesForChain(selectedChainConfig.chainId ?? "");
};
