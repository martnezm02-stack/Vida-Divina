// mapRow.js
// pg devuelve columnas en snake_case (mismo nombre que en el esquema SQL,
// ej. customer_id, producto_id). El resto del proyecto (simulator/,
// whatsapp-adapter/) usa camelCase para variables JS (productoId,
// telefono) — este helper traduce filas de pg a objetos camelCase para que
// los repositories devuelvan una forma consistente con el resto del código
// que eventualmente los consuma. No transforma valores, solo claves.

function aCamelCase(snake) {
  return snake.replace(/_([a-z0-9])/g, (_, letra) => letra.toUpperCase());
}

/**
 * @param {Object|null} row - una fila de pg (o null/undefined)
 * @returns {Object|null}
 */
export function camelCaseRow(row) {
  if (!row) return row ?? null;
  const resultado = {};
  for (const [clave, valor] of Object.entries(row)) {
    resultado[aCamelCase(clave)] = valor;
  }
  return resultado;
}

/**
 * @param {Array<Object>} rows
 * @returns {Array<Object>}
 */
export function camelCaseRows(rows) {
  return rows.map(camelCaseRow);
}
