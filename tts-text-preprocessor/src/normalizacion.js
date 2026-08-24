// normalizacion.js
// Correcciones puramente mecánicas de puntuación -- nunca reestructura
// oraciones ni decide dónde "debería" haber una pausa (eso es
// analisisEstructural.js, y solo advierte, no reescribe). Aquí solo se
// arreglan cosas que son objetivamente errores tipográficos:
//   - espacios múltiples
//   - espacio antes de coma/punto
//   - falta de espacio después de coma/punto
//   - preguntas con "?" de cierre pero sin "¿" de apertura

/**
 * @param {string} texto
 * @returns {{ texto: string, cambios: Array<{tipo: string, original: string, corregido: string}> }}
 */
export function normalizarPuntuacion(texto) {
  const cambios = [];
  let resultado = texto;

  const espaciosMultiples = resultado.match(/ {2,}/g);
  if (espaciosMultiples) {
    resultado = resultado.replace(/ {2,}/g, ' ');
    cambios.push({ tipo: 'espaciado', original: '(espacios múltiples)', corregido: '(un solo espacio)' });
  }

  const espacioAntesPuntuacion = resultado.match(/ +([,.;:!?])/g);
  if (espacioAntesPuntuacion) {
    resultado = resultado.replace(/ +([,.;:!?])/g, '$1');
    cambios.push({ tipo: 'espaciado', original: '(espacio antes de puntuación)', corregido: '(sin espacio antes de puntuación)' });
  }

  const sinEspacioDespues = resultado.match(/([,.;:])([A-Za-zÁÉÍÓÚÑÜáéíóúñü])/g);
  if (sinEspacioDespues) {
    resultado = resultado.replace(/([,.;:])([A-Za-zÁÉÍÓÚÑÜáéíóúñü])/g, '$1 $2');
    cambios.push({ tipo: 'espaciado', original: '(sin espacio tras puntuación)', corregido: '(espacio añadido tras puntuación)' });
  }

  // Preguntas con "?" de cierre sin "¿" de apertura: se busca el inicio
  // razonable de la pregunta (tras el ultimo . ! ? o inicio de texto) y se
  // antepone "¿" si no existe ya.
  const oracionesConSignoFinal = [...resultado.matchAll(/([^.!?]*)\?/g)];
  for (const m of oracionesConSignoFinal) {
    const fragmento = m[1];
    if (fragmento.includes('¿')) continue;
    const fragmentoTrim = fragmento.replace(/^[\s]+/, '');
    if (fragmentoTrim.length === 0) continue;
    const original = m[0];
    const inicioEspacios = fragmento.slice(0, fragmento.length - fragmentoTrim.length);
    const corregido = `${inicioEspacios}¿${fragmentoTrim}?`;
    resultado = resultado.replace(original, corregido);
    cambios.push({ tipo: 'pregunta', original: fragmentoTrim + '?', corregido: '¿' + fragmentoTrim + '?' });
  }

  return { texto: resultado, cambios };
}
