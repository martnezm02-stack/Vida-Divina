// extractor.js
// Pipeline paso 4: extraer metadatos.
// Responsabilidad única: leer el contenido de un archivo y extraer los
// campos que se pueden derivar de su texto (título, palabras clave,
// checksum). No clasifica, no resuelve referencias, no valida relaciones.

import fs from 'node:fs';
import crypto from 'node:crypto';

const H1_PATTERN = /^#\s+(.+?)\s*$/m;
const PALABRAS_CLAVE_PATTERN = /palabras\s*clave[:\*]*\s*(.+)/i;

/**
 * @param {string} absolutePath
 * @returns {{content: string, titulo: string, palabrasClave: string[], checksum: string, advertencias: string[], erroresDetectados: string[]}}
 */
export function extractMetadata(absolutePath) {
  const advertencias = [];
  const erroresDetectados = [];

  let content;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch (err) {
    erroresDetectados.push(`No se pudo leer el archivo: ${err.message}`);
    return { content: '', titulo: '', palabrasClave: [], checksum: '', advertencias, erroresDetectados };
  }

  if (content.trim().length === 0) {
    erroresDetectados.push('archivo_vacio: el documento no tiene contenido');
  }

  const h1Match = content.match(H1_PATTERN);
  let titulo;
  if (h1Match) {
    titulo = h1Match[1].trim();
  } else {
    advertencias.push('errores_de_estructura: no se encontró un encabezado H1 ("# Título")');
    titulo = '';
  }

  const palabrasClave = extractPalabrasClave(content);

  const checksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

  return { content, titulo, palabrasClave, checksum, advertencias, erroresDetectados };
}

/**
 * Heurística de extracción de palabras clave: busca una línea que contenga
 * "palabras clave" (con o sin negrita/mayúsculas) seguida de una lista
 * separada por comas. No todos los tipos de entidad tienen este campo en su
 * plantilla (por ejemplo, los archivos de docs/objeciones/ no lo tienen) —
 * en esos casos devuelve un arreglo vacío sin que eso sea un error.
 * @param {string} content
 * @returns {string[]}
 */
function extractPalabrasClave(content) {
  const match = content.match(PALABRAS_CLAVE_PATTERN);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.replace(/[.*_`]/g, '').trim())
    .filter((s) => s.length > 0);
}
