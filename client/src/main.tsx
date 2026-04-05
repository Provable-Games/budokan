import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StarknetProvider } from "@/context/starknet";

import { BrowserRouter as Router } from "react-router-dom";
import { ChainContextProvider } from "@/context/chain";
import { EkuboProvider } from "@provable-games/ekubo-sdk/react";
import { BudokanProvider } from "@/context/budokan";
import { DenshokanProvider } from "@/context/denshokan";
import { MetagameProvider } from "@/context/metagame";

async function main() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <StarknetProvider>
        <ChainContextProvider>
          <EkuboProvider config={{ fetch: { timeout: 30000 } }}>
            <MetagameProvider>
              <BudokanProvider>
                <DenshokanProvider>
                    <Router>
                      <App />
                    </Router>
                </DenshokanProvider>
              </BudokanProvider>
            </MetagameProvider>
          </EkuboProvider>
        </ChainContextProvider>
      </StarknetProvider>
    </StrictMode>
  );
}

main().catch((error) => {
  console.error("Failed to initialize the application:", error);
});
