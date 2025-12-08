import { ChainId } from "@/dojo/setup/networks";
import { useDojo } from "@/context/dojo";

export interface Game {
  contract_address: string;
  name: string;
  image?: string;
  url?: string;
  controllerOnly?: boolean;
  playUrl?: string;
}

export const getGameUrl = (gameAddress: string): string => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
  return game?.url || "";
};

export const getPlayUrl = (gameAddress: string): string => {
  const games = getGames();
  const game = games.find((game) => game.contract_address === gameAddress);
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

export const getGames = (): Game[] => {
  const { selectedChainConfig } = useDojo();
  const isSepolia = selectedChainConfig.chainId === ChainId.SN_SEPOLIA;
  const isMainnet = selectedChainConfig.chainId === ChainId.SN_MAIN;

  if (isSepolia) {
    return [
      {
        contract_address:
          "0x04359aee29873cd9603207d29b4140468bac3e042aa10daab2e1a8b2dd60ef7b",
        name: "Dark Shuffle",
        image: "https://darkshuffle.dev/favicon.svg",
        url: "https://darkshuffle.dev",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x07ae26eecf0274aabb31677753ff3a4e15beec7268fa1b104f73ce3c89202831",
        name: "Death Mountain",
        image: "https://darkshuffle.dev/favicon.svg",
        url: "https://lootsurvivor.io/",
        playUrl: "https://lootsurvivor.io/survivor/play?id=",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x012ccc9a2d76c836d088203f6e9d62e22d1a9f7479d1aea8b503a1036c0f4487",
        name: "Nums",
        url: "https://nums-blond.vercel.app/",
        playUrl: "https://nums-blond.vercel.app/",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x063410083d205c7e66cd2cdcd59614a233b682b9394f46d44e838d3a32048a7a",
        name: "zKube",
        url: "https://localhost:5173/",
        playUrl: "https://localhost:5173/play/",
        controllerOnly: true,
      },
    ];
  } else if (isMainnet) {
    return [
      {
        contract_address:
          "0x03451230bc1bbec7bb1f337f22c9f6699d238429638ac357dba53af193674c70",
        name: "Dark Shuffle",
        image: "https://darkshuffle.io/favicon.svg",
        url: "https://darkshuffle.io",
        playUrl: "https://darkshuffle.io/play/",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x05e2dfbdc3c193de629e5beb116083b06bd944c1608c9c793351d5792ba29863",
        name: "Loot Survivor",
        image: "https://lootsurvivor.io/favicon-32x32.png",
        url: "https://tournaments.lootsurvivor.io/",
        playUrl: "https://tournaments.lootsurvivor.io/survivor/play?id=",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x012bf5118f03d2bbb8a2a31c72e0020ab85af172dd965ccd55c3132066ad8554",
        name: "DopeWars",
        url: "https://dopewars-kappa.vercel.app/",
        playUrl: "https://dopewars-kappa.vercel.app/",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x079c30d00719faea99297075e22fd84260f39960e14239f2018ba5d1dc1ab907",
        name: "zKube",
        image: "https://app.zkube.xyz/assets/pwa-512x512.png",
        url: "https://app.zkube.xyz",
        playUrl: "https://app.zkube.xyz/play/",
        controllerOnly: true,
      },
      {
        contract_address:
          "0x0473a834b65e8129652dec5788c5d9427fe1ea7e2e79fbe0493e38df816259d9",
        name: "Nums",
        url: "https://nums.gg/",
        playUrl: "https://nums.gg/",
        controllerOnly: true,
      },
    ];
  } else {
    return [
      {
        contract_address:
          "0x0035389eec883a077ca4cc036cbe17fc802d297a08e8d7e930781de9ed492d05",
        name: "Loot Survivor",
        image: "https://lootsurvivor.io/favicon-32x32.png",
        url: "https://lootsurvivor.io",
      },
      {
        contract_address:
          "0x075bd3616602ebec162c920492e4d032155fd0d199f1ed44edcb2eec120feb3d",
        name: "Dark Shuffle",
        image: "https://darkshuffle.io/favicon.svg",
        url: "https://darkshuffle.io",
      },
      {
        contract_address:
          "0x075bd3616602ebec142c920492e4d042155fd0d199f1ed44edcb2eec120feb3d",
        name: "zKube",
        image: "https://zkube.io/favicon.svg",
        url: "https://zkube.io",
      },
      {
        contract_address:
          "0x075bd3616652ebec162c920492e4d042155fd0d199f1ed44edcb2eec120feb3d",
        name: "Dope Wars",
        image: "https://dopewars.gg/favicon.ico",
        url: "https://dopewars.gg",
      },
      {
        contract_address:
          "0x075bd3616302ebec162c920492e4d042155fd0d199f1ed44edcb2eec120feb3d",
        name: "Jokers of Neon",
        image: "https://jokersofneon.com/icon.png",
        url: "https://jokersofneon.com",
      },
    ];
  }
};
