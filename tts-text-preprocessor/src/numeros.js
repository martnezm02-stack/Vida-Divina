// numeros.js
// Detecta números, símbolos y abreviaturas que podrían pronunciarse de
// forma poco natural por TTS. Solo aplica UNA transformación automática,
// por ser inambigua y estándar en español hablado: "%" -> "por ciento".
// Todo lo demás (rangos, decimales, abreviaturas) se reporta como
// advertencia para revisión humana -- nunca se reescribe a ciegas.

const ABREVIATURAS_CONOCIDAS = {
  kg: 'kilogramos', mg: 'miligramos', g: 'gramos', ml: 'mililitros', l: 'litros',
  hrs: 'horas', hr: 'hora', min: 'minutos', seg: 'segundos',
  dr: 'doctor', dra: 'doctora', sr: 'señor', sra: 'señora',
};

/**
 * @param {string} texto
 * @returns {{ texto: string, cambios: Array<object>, advertencias: Array<object> }}
 */
export function analizarNumeros(texto) {
  const cambios = [];
  const advertencias = [];
  let resultado = texto;

  const porcentajes = resultado.match(/\d+\s*%/g);
  if (porcentajes) {
    resultado = resultado.replace(/(\d+)\s*%/g, '$1 por ciento');
    porcentajes.forEach((p) => cambios.push({ tipo: 'numero', original: p, corregido: p.replace(/\s*%/, ' por ciento') }));
  }

  const rangos = texto.match(/\b\d+\s*-\s*\d+\b/g);
  if (rangos) {
    rangos.forEach((r) =>
      advertencias.push({
        tipo: 'rango_numerico',
        fragmento: r,
        detalle: `Rango "${r}" podría leerse ambiguo. Considerar escribir "de X a Y" si se confirma que TTS lo lee mal. No se modificó automáticamente.`,
      })
    );
  }

  const decimales = texto.match(/\b\d+[.,]\d+\b/g);
  if (decimales) {
    decimales.forEach((d) =>
      advertencias.push({
        tipo: 'numero_decimal',
        fragmento: d,
        detalle: `Número decimal "${d}" -- verificar que el separador (punto/coma) se lea como "punto" o como parte de la cifra según corresponda en español. No se modificó automáticamente.`,
      })
    );
  }

  const tokens = texto.replace(/[.,;:!?¿¡]/g, '').split(/\s+/);
  for (const token of tokens) {
    const limpio = token.toLowerCase().replace(/\.$/, '');
    if (ABREVIATURAS_CONOCIDAS[limpio] && token !== ABREVIATURAS_CONOCIDAS[limpio]) {
      advertencias.push({
        tipo: 'abreviatura',
        fragmento: token,
        detalle: `Abreviatura "${token}" podría leerse letra por letra en vez de como "${ABREVIATURAS_CONOCIDAS[limpio]}". No se modificó automáticamente -- requiere confirmar cómo la pronuncia el modelo antes de decidir si conviene expandirla.`,
      });
    }
  }

  const enterosSimples = texto.match(/\b\d+\b/g);
  if (enterosSimples && rangos === null && decimales === null) {
    advertencias.push({
      tipo: 'informativo',
      fragmento: enterosSimples.join(', '),
      detalle: `Números enteros simples detectados (${enterosSimples.join(', ')}). No requieren transformación: el modelo ya demostró en pruebas anteriores de este proyecto que los lee correctamente como dígitos.`,
    });
  }

  return { texto: resultado, cambios, advertencias };
}
