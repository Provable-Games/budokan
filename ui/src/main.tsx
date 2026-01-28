import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StarknetProvider } from "@/context/starknet";
import { MetagameProvider } from "@/context/metagame";
import { BrowserRouter as Router } from "react-router-dom";
import { DojoContextProvider } from "@/context/dojo";
import { EkuboProvider } from "@provable-games/ekubo-sdk/react";

async function main() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <StarknetProvider>
        <DojoContextProvider>
          <EkuboProvider>
            <MetagameProvider>
              <Router>
                <App />
              </Router>
            </MetagameProvider>
          </EkuboProvider>
        </DojoContextProvider>
      </StarknetProvider>
    </StrictMode>
  );
}

main().catch((error) => {
  console.error("Failed to initialize the application:", error);
});
