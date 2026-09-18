// skillValidator.ts — Valida una skill en staging. Nunca declara PASS por
// ausencia de error: si un chequeo no puede resolverse de forma real
// (ej. no hay forma de ejecutar la skill), se marca UNABLE_TO_VERIFY.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { SkillSpec, ValidationCheck, ValidationResult } from "./types";

const REQUIRED_SECTIONS = [
  "## Prerequisites",
  "## Inputs",
  "## Outputs",
  "## Procedure",
  "## Decision Rules",
  "## Failure Modes",
  "## Required Tools",
  "## Dependencies",
  "## Limitations",
];

function checkStructure(skillMd: string): ValidationCheck {
  const missing = REQUIRED_SECTIONS.filter((s) => !skillMd.includes(s));
  return {
    name: "skill_md_structure",
    status: missing.length === 0 ? "PASS" : "FAIL",
    detail: missing.length === 0 ? "Todas las secciones requeridas presentes." : `Faltan secciones: ${missing.join(", ")}`,
  };
}

function checkTraceability(spec: SkillSpec): ValidationCheck {
  const evidenceIds = new Set(spec.evidence.map((e) => e.id));
  const dangling = spec.procedure.filter((step) => step.evidenceIds.some((id) => !evidenceIds.has(id)));
  if (spec.procedure.length === 0) {
    return { name: "traceability", status: "UNABLE_TO_VERIFY", detail: "Sin pasos de procedimiento que trazar (ver limitations)." };
  }
  return {
    name: "traceability",
    status: dangling.length === 0 ? "PASS" : "FAIL",
    detail: dangling.length === 0 ? "Todos los pasos referencian evidencia real existente." : `${dangling.length} paso(s) referencian evidenceIds inexistentes.`,
  };
}

function checkRequiredTools(spec: SkillSpec, knownToolNames: string[]): ValidationCheck {
  if (spec.requiredTools.length === 0) {
    return { name: "required_tools_exist", status: "UNABLE_TO_VERIFY", detail: "SKILL_SPEC no declara required_tools -- nada que verificar." };
  }
  const unknown = spec.requiredTools.filter((t) => !knownToolNames.includes(t));
  return {
    name: "required_tools_exist",
    status: unknown.length === 0 ? "PASS" : "FAIL",
    detail: unknown.length === 0 ? "Todas las herramientas declaradas existen en el registro real de Hermes." : `No existen en el registro real: ${unknown.join(", ")}`,
  };
}

function checkScriptsSyntax(stagingDir: string): ValidationCheck {
  const files = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];
  const scripts = files.filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  if (scripts.length === 0) {
    return { name: "scripts_syntax", status: "UNABLE_TO_VERIFY", detail: "Ningún script auxiliar generado -- nada que verificar." };
  }
  const errors: string[] = [];
  for (const file of scripts) {
    const full = path.join(stagingDir, file);
    const source = fs.readFileSync(full, "utf-8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diagnostics = (sf as any).parseDiagnostics as ts.Diagnostic[] | undefined;
    if (diagnostics && diagnostics.length > 0) {
      errors.push(`${file}: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`);
    }
  }
  return {
    name: "scripts_syntax",
    status: errors.length === 0 ? "PASS" : "FAIL",
    detail: errors.length === 0 ? `${scripts.length} script(s) sintácticamente válidos.` : errors.join(" | "),
  };
}

function checkTestsPresent(stagingDir: string, spec: SkillSpec): ValidationCheck {
  const hasScripts = fs.existsSync(stagingDir) && fs.readdirSync(stagingDir).some((f) => f.endsWith(".ts") || f.endsWith(".js"));
  if (!hasScripts) {
    return { name: "tests_when_code", status: "UNABLE_TO_VERIFY", detail: "Sin código generado -- no aplica requisito de tests." };
  }
  const hasTests = fs.existsSync(stagingDir) && fs.readdirSync(stagingDir).some((f) => f.includes(".test."));
  return {
    name: "tests_when_code",
    status: hasTests ? "PASS" : "FAIL",
    detail: hasTests ? "Existen tests para el código generado." : "Hay código generado sin test asociado.",
  };
}

export function validateSkill(spec: SkillSpec, stagingDir: string, knownToolNames: string[]): ValidationResult {
  const skillMdPath = path.join(stagingDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    return {
      overall: "FAIL",
      checks: [{ name: "skill_md_exists", status: "FAIL", detail: `No existe ${skillMdPath}` }],
    };
  }
  const skillMd = fs.readFileSync(skillMdPath, "utf-8");
  const checks: ValidationCheck[] = [
    checkStructure(skillMd),
    checkTraceability(spec),
    checkRequiredTools(spec, knownToolNames),
    checkScriptsSyntax(stagingDir),
    checkTestsPresent(stagingDir, spec),
  ];

  const anyFail = checks.some((c) => c.status === "FAIL");
  const anyUnable = checks.some((c) => c.status === "UNABLE_TO_VERIFY");
  const overall = anyFail ? "FAIL" : anyUnable ? "UNABLE_TO_VERIFY" : "PASS";

  return { overall, checks };
}
