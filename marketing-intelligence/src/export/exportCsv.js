// exportCsv.js — Exportación en CSV. Campos anidados (objetos/arreglos) se
// serializan como JSON dentro de la celda — CSV no es el formato adecuado
// para inspeccionar esos campos, para eso están JSON/JSONL.

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(records) {
  if (!records || records.length === 0) return '';
  const fields = Object.keys(records[0]);
  const header = fields.join(',');
  const rows = records.map((record) => fields.map((field) => csvEscape(record[field])).join(','));
  return [header, ...rows].join('\n') + '\n';
}
