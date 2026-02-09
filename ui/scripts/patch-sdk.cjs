/**
 * Patches @zkpassport/sdk to fix two bugs:
 *
 * 1. handleEncryptedMessage is called without await, silently swallowing
 *    errors from the async verify() chain. This adds .catch() error handling
 *    that surfaces errors via the SDK's onError callbacks.
 *
 * 2. RegistryClient is hardcoded to Ethereum Sepolia (chainId: 11155111).
 *    This changes it to Ethereum Mainnet (chainId: 1) so that circuit
 *    manifests and verification keys are fetched from the correct registry.
 *
 * Run after npm install: node scripts/patch-sdk.cjs
 */

const fs = require("fs");
const path = require("path");

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  Skipping ${filePath} (not found)`);
    return;
  }

  let code = fs.readFileSync(filePath, "utf8");
  const original = code;

  // Fix 1: Add error handling to the unawaited handleEncryptedMessage call.
  // The minified variable names vary between installs, so match the pattern:
  //   this.handleEncryptedMessage(<var>,<var>);
  // inside the onSecureMessage handler, and add .catch() error forwarding.
  code = code.replace(
    /this\.handleEncryptedMessage\((\w+),(\w+)\);/,
    (match, topicVar, msgVar) => {
      return [
        `this.handleEncryptedMessage(${topicVar},${msgVar}).catch(err=>{`,
        `console.error("[ZKPassport SDK] handleEncryptedMessage error:",err);`,
        `Promise.all((this.onErrorCallbacks[${topicVar}]||[]).map(cb=>cb(err?.message||String(err)))).catch(()=>{});`,
        `});`,
      ].join("");
    },
  );

  // Fix 2: Replace all hardcoded Sepolia chainId with Mainnet
  code = code.split("chainId:11155111").join("chainId:1");

  if (code !== original) {
    fs.writeFileSync(filePath, code);
    console.log(`  Patched: ${path.basename(filePath)}`);
  } else {
    console.log(`  Already patched: ${path.basename(filePath)}`);
  }
}

const sdkDir = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "@zkpassport",
  "sdk",
  "dist",
);

console.log("Patching @zkpassport/sdk...");
patchFile(path.join(sdkDir, "esm", "index.js"));
patchFile(path.join(sdkDir, "cjs", "index.cjs"));
console.log("Done.");
