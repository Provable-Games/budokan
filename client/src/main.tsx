import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StarknetProvider } from "@/context/starknet";

import { BrowserRouter as Router } from "react-router-dom";
import { DojoContextProvider } from "@/context/dojo";
import { EkuboProvider } from "@provable-games/ekubo-sdk/react";
import { BudokanProvider } from "@/context/budokan";
import { DenshokanProvider } from "@/context/denshokan";

async function main() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <StarknetProvider>
        <DojoContextProvider>
          <EkuboProvider config={{ fetch: { timeout: 30000 } }}>
            <BudokanProvider>
              <DenshokanProvider>
                  <Router>
                    <App />
                  </Router>
              </DenshokanProvider>
            </BudokanProvider>
          </EkuboProvider>
        </DojoContextProvider>
      </StarknetProvider>
    </StrictMode>
  );
}

main().catch((error) => {
  console.error("Failed to initialize the application:", error);
});
