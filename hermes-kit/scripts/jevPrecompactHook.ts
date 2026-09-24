// jevPrecompactHook.ts — Entrypoint ejecutable del hook PreCompact
// (registrado en .claude/settings.json). Solo hace de glue de proceso
// (stdin -> parsePayload -> buildCustomInstructions -> stdout/exit); toda
// la lógica real vive en src/lib/hooks/jevPrecompactHook.ts, donde es
// testeable sin proceso real.
import { createJevDecisionProvider } from "../src/lib/intelligence/decision";
import { buildCustomInstructions, parsePayload } from "../src/lib/hooks/jevPrecompactHook";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const payload = parsePayload(raw);

  // Sin JEV_API_KEY, createJevDecisionProvider() queda "no configurado" --
  // no se piden credenciales aquí; buildCustomInstructions ya sabe
  // degradar al baseline determinista si el provider falla al primer uso.
  const jev = createJevDecisionProvider(process.env.JEV_API_KEY ? { apiKey: process.env.JEV_API_KEY } : undefined);
  const instructions = await buildCustomInstructions(payload, jev);

  // Solo las instrucciones van a stdout -- exit 0 hace que Claude Code las
  // añada tal cual como custom_instructions del compactado. Cualquier
  // diagnóstico va a stderr para no contaminar ese contenido.
  process.stdout.write(instructions);
  process.exitCode = 0;
}

main().catch((err) => {
  // Nunca se deja stdout parcial/corrupto ni se usa exit 2 -- ante un
  // fallo inesperado, el hook simplemente no aporta instrucciones (exit 0
  // silencioso) para no interferir con la compaction normal.
  console.error("[jevPrecompactHook] error inesperado:", err instanceof Error ? err.message : err);
  process.exitCode = 0;
});
