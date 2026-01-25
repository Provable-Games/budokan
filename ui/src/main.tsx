import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StarknetProvider } from "@/context/starknet";
import { MetagameProvider } from "@/context/metagame";
import { BrowserRouter as Router } from "react-router-dom";
import { DojoContextProvider } from "@/context/dojo";
import { CrossChainWalletProvider } from "@/context/crossChainWallet";

async function main() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <CrossChainWalletProvider>
        <StarknetProvider>
          <DojoContextProvider>
            <MetagameProvider>
              <Router>
                <App />
              </Router>
            </MetagameProvider>
          </DojoContextProvider>
        </StarknetProvider>
      </CrossChainWalletProvider>
    </StrictMode>
  );
}

main().catch((error) => {
  console.error("Failed to initialize the application:", error);
});
