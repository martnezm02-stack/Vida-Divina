// jevPrecompactHookCli.test.ts — Prueba de contrato real: invoca
// scripts/jevPrecompactHook.ts como subproceso (igual que lo hará Claude
// Code), le da un payload PreCompact por stdin, y verifica stdout/exit
// code -- el mismo contrato documentado en el hook (exit 0 + stdout ->
// custom_instructions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const SCRIPT_PATH = path.resolve(__dirname, "..", "..", "scripts", "jevPrecompactHook.ts");
const TSX_CLI = path.resolve(__dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");

function runHook(stdinPayload: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, SCRIPT_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
    child.stdin.write(stdinPayload);
    child.stdin.end();
  });
}

test("CLI real: payload PreCompact válido -> exit 0, stdout con instrucciones no vacías", async () => {
  const { stdout, exitCode } = await runHook(
    JSON.stringify({ hook_event_name: "PreCompact", trigger: "auto", custom_instructions: "" })
  );
  assert.equal(exitCode, 0);
  assert.ok(stdout.length > 0);
  assert.ok(stdout.includes("Preserva"));
});

test("CLI real: stdin vacío/malformado -> igual exit 0, nunca exit 2, nunca cuelga", async () => {
  const { exitCode, stdout } = await runHook("");
  assert.equal(exitCode, 0);
  assert.ok(stdout.length > 0, "debe seguir devolviendo el baseline aunque no haya payload");

  const malformed = await runHook("{ esto no es json");
  assert.equal(malformed.exitCode, 0);
});
