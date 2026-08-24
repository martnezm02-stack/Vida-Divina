// exportMarkdown.js — Exportación en Markdown legible por humanos. Muestra la
// cadena SOURCE → OBSERVATION → INFERENCE → HYPOTHESIS de forma resumida.

export function toMarkdownReport({ rawRecords, observations, inferences, hypotheses, claims = [], trends = [] }) {
  const lines = [];

  lines.push('# Reporte de Marketing Intelligence — corrida de prueba', '');
  lines.push(`Generado: ${new Date().toISOString()}`, '');

  lines.push('## Fuentes RAW consultadas', '');
  for (const r of rawRecords) {
    lines.push(
      `- **${r.source}** [${r.fetch_status}] — [${r.title || r.url}](${r.url}) ` +
      `(adquirido ${r.retrieved_at}, hash \`${r.content_hash.slice(0, 12)}...\`)`
    );
  }

  lines.push('', '## Observaciones (Etapa A — dato observado)', '');
  for (const o of observations) {
    // Fase 2 usó "source_record_id"; Fase 3 usa "raw_id" (mismo concepto,
    // nombre alineado al modelo de datos del encargo de Fase 3). Se acepta
    // cualquiera de los dos para no romper el reporte de la Fase 2.
    const rawId = o.raw_id ?? o.source_record_id ?? 'desconocido';
    lines.push(`- **${o.dimension}**: ${o.value} — _"${o.evidence_quote}"_ (fuente RAW: \`${rawId.slice(0, 8)}...\`)`);
  }

  lines.push('', '## Inferencias (Etapa B — agregado, con alcance declarado)', '');
  for (const i of inferences) {
    lines.push(`- **${i.dimension} → ${i.pattern}** — frecuencia ${i.frequency} (${i.scope})`);
  }

  lines.push('', '## Hipótesis (Etapa C — especulativas, requieren revisión humana)', '');
  for (const h of hypotheses) {
    lines.push(`- ${h.hypothesis}`);
  }

  if (claims.length > 0) {
    lines.push('', '## Claims detectados (NO verificados — requieren revisión humana, ver §10 del diseño)', '');
    for (const c of claims) {
      lines.push(
        `- **${c.claim_type}**: "${c.claim_text}" — estado: ${c.verification_status}, ` +
        `revisión requerida: ${c.requires_human_review} (fuente RAW: \`${c.raw_id.slice(0, 8)}...\`)`
      );
    }
  }

  if (trends.length > 0) {
    lines.push('', '## Tendencias (comparación entre corridas en el tiempo)', '');
    for (const t of trends) {
      lines.push(`- **${t.dimension} → ${t.pattern}**: ${t.direction}${t.note ? ' — ' + t.note : ''}`);
    }
  }

  return lines.join('\n') + '\n';
}
