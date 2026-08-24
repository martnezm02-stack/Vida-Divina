// exportJson.js — Exportación en JSON / JSONL.

export function toJson(data) {
  return JSON.stringify(data, null, 2);
}

export function toJsonl(records) {
  if (records.length === 0) return '';
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}
