import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_PROOF_HEX_LENGTH = 2_000_000;
const MAX_PUBLIC_INPUTS_HEX_LENGTH = 200_000;
const MAX_VK_BASE64_LENGTH = 200_000;

type RequestLike = {
  method?: string;
  body?: unknown;
};

type ResponseLike = {
  setHeader(name: string, value: string): void;
  status(code: number): ResponseLike;
  json(payload: unknown): void;
};

type CalldataRequestBody = {
  proof?: unknown;
  publicInputs?: unknown;
  vk?: unknown;
};

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value;
}

function decodeHex(input: string, field: string, maxLength: number): Buffer {
  const normalized = stripHexPrefix(input.trim());
  if (normalized.length === 0) {
    throw new Error(`${field} is empty`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} is too large`);
  }
  if (normalized.length % 2 !== 0) {
    throw new Error(`${field} hex length must be even`);
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${field} must be hex-encoded`);
  }
  return Buffer.from(normalized, "hex");
}

function decodeBase64(input: string): Buffer {
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new Error("vk is empty");
  }
  if (normalized.length > MAX_VK_BASE64_LENGTH) {
    throw new Error("vk is too large");
  }
  const output = Buffer.from(normalized, "base64");
  if (output.length === 0) {
    throw new Error("vk base64 decoding failed");
  }
  return output;
}

function parseBody(input: unknown): CalldataRequestBody {
  if (typeof input === "string") {
    return JSON.parse(input) as CalldataRequestBody;
  }
  if (input && typeof input === "object") {
    return input as CalldataRequestBody;
  }
  return {};
}

function parseArrayOutput(stdout: string): string[] {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error("garaga output is not a JSON-like array");
  }
  const values = trimmed
    .slice(1, -1)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("garaga returned empty calldata");
  }
  for (const value of values) {
    if (!/^[0-9]+$/.test(value)) {
      throw new Error("garaga returned non-numeric calldata");
    }
  }
  return values;
}

function resolveGaragaBinary(): string {
  const configured = process.env.GARAGA_BIN?.trim();
  if (configured) {
    return configured;
  }

  const workspaceDefault = "/workspace/garaga/venv/bin/garaga";
  if (existsSync(workspaceDefault)) {
    return workspaceDefault;
  }

  return "garaga";
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let tempDir = "";
  try {
    const body = parseBody(req.body);

    if (
      typeof body.proof !== "string" ||
      typeof body.publicInputs !== "string" ||
      typeof body.vk !== "string"
    ) {
      res.status(400).json({ error: "Invalid payload: proof, publicInputs, vk are required" });
      return;
    }

    const proofBytes = decodeHex(body.proof, "proof", MAX_PROOF_HEX_LENGTH);
    const publicInputsBytes = decodeHex(
      body.publicInputs,
      "publicInputs",
      MAX_PUBLIC_INPUTS_HEX_LENGTH,
    );
    const vkBytes = decodeBase64(body.vk);

    tempDir = await mkdtemp(path.join(os.tmpdir(), "garaga-calldata-"));
    const proofPath = path.join(tempDir, "proof.bin");
    const publicInputsPath = path.join(tempDir, "public_inputs.bin");
    const vkPath = path.join(tempDir, "vk.bin");

    await Promise.all([
      writeFile(proofPath, proofBytes),
      writeFile(publicInputsPath, publicInputsBytes),
      writeFile(vkPath, vkBytes),
    ]);

    const garagaBinary = resolveGaragaBinary();
    const { stdout } = await execFileAsync(
      garagaBinary,
      [
        "calldata",
        "--system",
        "ultra_keccak_zk_honk",
        "--proof",
        proofPath,
        "--vk",
        vkPath,
        "--public-inputs",
        publicInputsPath,
        "--format",
        "array",
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );

    const calldata = parseArrayOutput(stdout);
    res.status(200).json({ calldata });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error generating calldata";
    res.status(500).json({ error: message });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
