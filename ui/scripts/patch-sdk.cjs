/**
 * Patches @zkpassport/sdk to fix four issues:
 *
 * 1. handleEncryptedMessage is called without await, silently swallowing
 *    errors from the async verify() chain. This adds .catch() error handling
 *    that surfaces errors via the SDK's onError callbacks.
 *
 * 2. handleResult calls this.verify() without try-catch, so if verify throws
 *    (e.g. registry fetch failure), onResult never fires. This wraps verify()
 *    in a try-catch so onResult fires with verified:false on failure.
 *
 * 3. verify() dynamically imports @aztec/bb.js which references `process`
 *    (Node.js global) causing ReferenceError in browsers. Since we validate
 *    proofs via RPC instead, we stub out the import with a no-op backend.
 *
 * 4. RegistryClient is hardcoded to Ethereum Mainnet (chainId: 1), but
 *    ZKPassport only deploys circuit manifests to Ethereum Sepolia. This
 *    changes it to Sepolia (chainId: 11155111) so circuit manifests and
 *    verification keys can be fetched.
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

  // Fix 2: Wrap this.verify() in handleResult with try-catch.
  // The pattern is: }=await this.verify({...props...});
  // We wrap it so exceptions return {verified:false} instead of throwing.
  code = code.replace(
    /(=await this\.verify\(\{[^}]+\}\))(;)/,
    (match, verifyCall, semi) => {
      return `${verifyCall}.catch(err=>{console.warn("[ZKPassport SDK] verify() failed:",err);return{uniqueIdentifier:void 0,uniqueIdentifierType:void 0,verified:false,queryResultErrors:void 0}})${semi}`;
    },
  );

  // Fix 3: Skip @aztec/bb.js import in verify() to avoid `process is not defined`
  // in browser. We do RPC-based validation instead. Replace the dynamic import
  // with a no-op that returns a stub backend. The SDK's verify() will fall through
  // to verified:false, and our RPC validation takes over.
  code = code.replace(
    /\{UltraHonkVerifierBackend:(\w+)\}\s*=\s*await import\(['"]@aztec\/bb\.js['"]\)/,
    (match, varName) => {
      return `{UltraHonkVerifierBackend:${varName}}={UltraHonkVerifierBackend:class{async verifyProof(){return false}destroy(){}}}`;
    }
  );

  // Fix 4: Change RegistryClient chainId from Mainnet (1) to Sepolia (11155111).
  // The SDK uses `new RegistryClient({chainId:1})` in three places:
  //   - checkCertificateRegistryRoot
  //   - checkCircuitRegistryRoot
  //   - verify (for manifest/vkey fetch)
  // ZKPassport deploys circuits only to Sepolia, so we must use that registry.
  // Match `chainId:1}` specifically (with closing brace) to avoid false positives.
  code = code.split("chainId:1}").join("chainId:11155111}");

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
