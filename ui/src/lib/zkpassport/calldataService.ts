interface CalldataResponse {
  calldata: string[];
}

function getErrorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }
  return "Calldata generation failed";
}

export async function generateCalldata(
  proofHex: string,
  publicInputsHex: string,
  vkBase64: string,
): Promise<string[]> {
  const response = await fetch("/api/garaga-calldata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proof: proofHex,
      publicInputs: publicInputsHex,
      vk: vkBase64,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  const calldata = (payload as CalldataResponse).calldata;
  if (!Array.isArray(calldata) || calldata.length === 0) {
    throw new Error("Calldata generation returned no calldata");
  }
  return calldata;
}
