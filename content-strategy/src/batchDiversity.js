// batchDiversity.js — Fase 14, §7. Diversidad CONTROLADA, no aleatoriedad:
// se permite algo de repetición (ej. 2 piezas pueden compartir el mismo
// hook si su ángulo/formato difiere), pero nunca la combinación completa
// hook+angle+format repetida, nunca body/estructura byte-idénticos, y nunca
// TODOS los CTA idénticos a la vez.

function countGroups(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

export function validateContentBatchDiversity(pieces) {
  // pieces: [{ item, draft }] — item da hookVariant/angle/format/pillar, draft da hook/body/scene_structure/cta.
  const violations = [];

  const hooks = pieces.map((p) => p.draft.hook);
  const hookGroups = countGroups(hooks);
  for (const [hook, count] of hookGroups) {
    if (count > 2) violations.push({ check: 'hooks_no_idénticos_en_exceso', detail: `El hook "${hook}" se repite ${count} veces (máximo permitido: 2).` });
  }

  const bodies = pieces.map((p) => p.draft.body);
  const bodyGroups = countGroups(bodies);
  for (const [, count] of bodyGroups) {
    if (count > 1) violations.push({ check: 'body_no_idéntico', detail: `${count} piezas comparten exactamente el mismo body.` });
  }

  const structures = pieces.map((p) => JSON.stringify(p.draft.scene_structure));
  const structureGroups = countGroups(structures);
  for (const [, count] of structureGroups) {
    if (count > 1) violations.push({ check: 'estructura_no_idéntica', detail: `${count} piezas comparten exactamente la misma scene_structure.` });
  }

  const combos = pieces.map((p) => `${p.item.hook}::${p.item.angle}::${p.item.format}`);
  const comboGroups = countGroups(combos);
  for (const [combo, count] of comboGroups) {
    if (count > 1) violations.push({ check: 'combinación_hook_angle_format_repetida', detail: `La combinación "${combo}" se repite ${count} veces — cada combinación debe ser única en el batch.` });
  }

  const ctas = pieces.map((p) => p.draft.cta ?? null);
  if (pieces.length > 1 && ctas.every((c) => c !== null && c === ctas[0])) {
    violations.push({ check: 'cta_idéntico_innecesario', detail: 'Las piezas del batch comparten exactamente el mismo CTA sin ninguna variación.' });
  }

  return { valid: violations.length === 0, violations };
}
