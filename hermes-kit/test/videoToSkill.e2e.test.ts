// videoToSkill.e2e.test.ts — Validación funcional real del pipeline
// VIDEO -> EVIDENCE -> SKILL_SPEC -> SKILL.md -> VALIDATE -> REVIEW ->
// REGISTRY, para Hermes Desktop (módulo aislado, no toca Vida Divina
// comercial). Usa un fixture SINTÉTICO generado por ffmpeg (testsrc + tono
// + subtítulos SRT embebidos) para evitar cualquier ambigüedad con
// contenido comercial real -- el objetivo es probar la MECÁNICA del
// pipeline, no analizar un video de negocio real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let fixtureDir: string;
let fixtureVideoPath: string;

before(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "v2s-fixture-"));
  const basePath = path.join(fixtureDir, "base.mp4");
  const srtPath = path.join(fixtureDir, "subs.srt");
  fixtureVideoPath = path.join(fixtureDir, "fixture.mp4");

  execFileSync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=10:duration=6",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-shortest",
    basePath,
    "-v", "error",
  ]);

  fs.writeFileSync(
    srtPath,
    [
      "1",
      "00:00:00,000 --> 00:00:02,000",
      "Abre el panel de configuracion",
      "",
      "2",
      "00:00:02,000 --> 00:00:04,000",
      "Escribe el mensaje de bienvenida",
      "",
      "3",
      "00:00:04,000 --> 00:00:06,000",
      "Guarda los cambios",
      "",
    ].join("\n"),
    "utf-8"
  );

  execFileSync("ffmpeg", [
    "-y",
    "-i", basePath,
    "-i", srtPath,
    "-map", "0:v", "-map", "0:a", "-map", "1:s",
    "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
    fixtureVideoPath,
    "-v", "error",
  ]);
});

after(() => {
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test("1) VIDEO -> EVIDENCE -> SKILL_SPEC: pipeline real produce evidencia trazable desde subtítulos embebidos", async () => {
  await import("../scripts/env-loader");
  const { runVideoToSkillPipeline } = await import("../src/lib/videoToSkill/index");
  const { toolDefinitions } = await import("../src/lib/tools");

  const result = await runVideoToSkillPipeline({
    videoPath: fixtureVideoPath,
    skillName: "demo-configurar-bienvenida",
    purpose: "Configurar el mensaje de bienvenida a partir de un tutorial en video (fixture sintético de prueba).",
    trigger: "El usuario pide 'cómo configuro el mensaje de bienvenida'.",
    knownToolNames: toolDefinitions.map((t) => t.function.name),
  });

  assert.equal("ok" in result && result.ok === false, false, "el pipeline no debería fallar con un fixture válido");
  if (!("skillId" in result)) throw new Error("resultado inesperado");

  assert.equal(result.diagnostics.transcriptStatus, "OBSERVED", "transcript debe venir de subtítulos embebidos, $0");
  assert.ok(result.diagnostics.framesExtracted > 0, "debe haber extraído al menos un frame representativo");
  assert.ok(result.spec.procedure.length >= 3, "debe derivar al menos los 3 pasos narrados en el SRT");

  // Trazabilidad real: cada paso debe apuntar a un evidenceId presente en la evidencia.
  const evidenceIds = new Set(result.spec.evidence.map((e) => e.id));
  for (const step of result.spec.procedure) {
    for (const id of step.evidenceIds) {
      assert.ok(evidenceIds.has(id), `evidenceId ${id} debe existir en spec.evidence`);
    }
  }

  assert.ok(fs.existsSync(path.join(result.stagingDir, "SKILL.md")));
  assert.ok(fs.existsSync(path.join(result.stagingDir, "evidence.json")));

  (globalThis as any).__v2sResult = result; // reutilizado por los tests siguientes de este mismo archivo
});

test("2) VALIDATOR: nunca declara PASS por ausencia de error", async () => {
  const result = (globalThis as any).__v2sResult;
  assert.ok(result, "requiere el resultado del test 1");
  assert.notEqual(result.validation.overall, undefined);
  assert.ok(["PASS", "FAIL", "UNABLE_TO_VERIFY"].includes(result.validation.overall));
  const traceabilityCheck = result.validation.checks.find((c: any) => c.name === "traceability");
  assert.equal(traceabilityCheck.status, "PASS");
});

test("3) REVIEW GATE: una skill REJECTED no puede activarse", async () => {
  const { submitReview, activate } = await import("../src/lib/videoToSkill/index");
  const result = (globalThis as any).__v2sResult;

  submitReview(result.stagingDir, "REJECTED", "test-harness (NO es un humano real -- esto es una prueba mecánica del gate)", "Rechazo de prueba para validar el bloqueo de activación.", {
    whatWasLearned: "3 pasos narrados en un video sintético de prueba.",
    whatWasImplemented: "SKILL.md + evidence.json en staging.",
    filesCreated: result.filesCreated,
    evidenceHighlights: result.spec.evidence.slice(0, 3).map((e: any) => e.evidenceRef),
    testsPassed: [],
    unverified: result.spec.limitations,
    externalDependencies: ["ffmpeg", "ffprobe"],
    risks: ["Fixture sintético, no representa un caso de uso real"],
  });

  const activation = activate(result.stagingDir, result.skillId, "demoConfigurarBienvenida");
  assert.equal(activation.ok, false);
  assert.equal(activation.state, "REJECTED_NOT_ACTIVATED");
});

test("4) REVIEW GATE: una skill APPROVED sí puede activarse (dry-run, genera parche, no toca index.ts real)", async () => {
  const { submitReview, activate } = await import("../src/lib/videoToSkill/index");
  const result = (globalThis as any).__v2sResult;

  submitReview(result.stagingDir, "APPROVED", "test-harness (NO es un humano real -- esto es una prueba mecánica del gate)", "Aprobación de prueba para validar el flujo de activación.", {
    whatWasLearned: "3 pasos narrados en un video sintético de prueba.",
    whatWasImplemented: "SKILL.md + evidence.json en staging.",
    filesCreated: result.filesCreated,
    evidenceHighlights: result.spec.evidence.slice(0, 3).map((e: any) => e.evidenceRef),
    testsPassed: ["skill_md_structure", "traceability"],
    unverified: result.spec.limitations,
    externalDependencies: ["ffmpeg", "ffprobe"],
    risks: ["Fixture sintético, no representa un caso de uso real"],
  });

  const activation = activate(result.stagingDir, result.skillId, "demoConfigurarBienvenida");
  assert.equal(activation.ok, true);
  assert.equal(activation.state, "ACTIVATED_PENDING_MANUAL_MERGE");
  assert.ok(activation.registrationPatchPath && fs.existsSync(activation.registrationPatchPath));

  // Nunca debe haberse tocado el index.ts REAL de producción.
  const realIndexTs = fs.readFileSync(path.join(process.cwd(), "src/lib/tools/index.ts"), "utf-8");
  assert.ok(!realIndexTs.includes("demoConfigurarBienvenida"), "el pipeline nunca debe escribir directamente sobre el router real de tools");
});
