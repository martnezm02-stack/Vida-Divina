// anchorEntities.js
// Detecta y extrae los sub-productos que viven dentro de un mismo archivo
// de "categoría de archivo único" — docs/KNOWLEDGE_MODEL.md §3/§7 ya modela
// "Categoría de Producto" con tipo_organizacion "archivo_unico" como una
// entidad distinta de "Producto"; el compilador nunca implementó esa
// distinción, y por eso los 7 archivos de este tipo se compilaban como una
// sola entidad "producto" en vez de una "indice_categoria" contenedora más
// sus productos reales (ver Hallazgo 2 en docs/ARCHITECTURE_v1.md,
// documentado como mejora de extracción — no de esquema — en
// docs/KNOWLEDGE_COMPILER_NOTES.md §2).
//
// Convención observada, verificada en los 7 archivos reales que la usan
// (docs/productos/04-funcion-cognitiva.md, 05-, 06-, 07-, 08-, 09-, 12-):
// cada producto empieza con `<a id="slug"></a>` seguido, en la línea
// siguiente, de un encabezado `## Nombre del producto`. Es exclusiva de
// docs/productos/ — no aparece en ningún otro módulo.

const ANCHOR_BLOCK_PATTERN = /<a id="([^"]+)"><\/a>\s*\n##\s+(.+?)\s*\n/g;

/**
 * @param {string} content
 * @returns {Array<{slug: string, titulo: string, startIndex: number, endIndex: number, blockContent: string}>}
 */
export function extractAnchorBlocks(content) {
  const starts = [];
  ANCHOR_BLOCK_PATTERN.lastIndex = 0;
  let match;
  while ((match = ANCHOR_BLOCK_PATTERN.exec(content)) !== null) {
    starts.push({ slug: match[1], titulo: match[2].trim(), startIndex: match.index });
  }

  // El bloque de un producto se extiende hasta que empieza el siguiente (o
  // hasta el final del archivo para el último) — así se capturan también
  // sus campos y enlaces propios sin necesitar delimitadores adicionales.
  return starts.map((block, i) => {
    const endIndex = i + 1 < starts.length ? starts[i + 1].startIndex : content.length;
    return { ...block, endIndex, blockContent: content.slice(block.startIndex, endIndex) };
  });
}
