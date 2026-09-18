// inventorySnapshot.js — cálculo puro del estado agregado de inventario
// (existencia total, valor a costo, distribución NORMAL/MINIMO/AGOTADO,
// críticos). Única fuente de este cálculo: antes vivía solo dentro de
// dashboard/server/routes/inventory.js -- se extrae aquí para que Hermes
// Ventas (reporte de inventario por correo) lo reutilice exactamente igual,
// sin duplicar la lógica ni crear una segunda fuente de verdad. Sin I/O:
// recibe las filas reales de `inventory` (crm.inventory.findAll()) y una
// función de resolución de nombre (el catálogo real, cualquiera que sea su
// forma en quien llama), nunca consulta nada por su cuenta.

/** "01-control-de-peso" -> "Control De Peso" (capitalización real del nombre de carpeta -- nunca un texto inventado). */
export function humanizeCategorySlug(slug) {
  return slug
    .replace(/^\d+-/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function categoriaDeProductoId(productoId) {
  const partes = productoId.split('/');
  return partes.length >= 2 ? humanizeCategorySlug(partes[1]) : 'Sin categoría';
}

/** SKU real derivado del slug del producto -- no existe un SKU explícito en el catálogo hoy, así que se deriva de forma determinista (nunca aleatoria) del propio productoId. */
export function skuDeSlug(slug) {
  return `VD-${slug.replace(/[^a-z0-9]+/gi, '-').toUpperCase().slice(0, 12)}`;
}

export function calcularEstado(fila) {
  if (Number(fila.cantidadActual) === 0) return 'AGOTADO';
  if (fila.minimo != null && Number(fila.cantidadActual) <= Number(fila.minimo)) return 'MINIMO';
  return 'NORMAL';
}

/**
 * Construye el snapshot agregado real de inventario a partir de las filas
 * reales de `inventory`. `resolveNombre(productoId)` puede devolver
 * string|null o una Promise de eso -- si no hay nombre real disponible, se
 * usa el último segmento del productoId (nunca un nombre inventado).
 *
 * @param {Array<Object>} inventoryRows filas reales de crm.inventory.findAll()
 * @param {(productoId: string) => (string|null|Promise<string|null>)} resolveNombre
 * @returns {Promise<Object>}
 */
export async function buildInventorySnapshot(inventoryRows, resolveNombre) {
  let existenciaTotal = 0;
  let agotados = 0;
  let enMinimo = 0;
  let valorInventarioTotal = 0;
  let valorInventarioIncompleto = false; // true si algún costoUnitario real falta -- nunca se completa con un número inventado
  const porCategoria = new Map();
  const productos = [];

  for (const fila of inventoryRows) {
    const slugFinal = fila.productoId.split('/').pop();
    const nombreResuelto = await resolveNombre(fila.productoId);
    const nombreVisible = nombreResuelto ?? slugFinal;
    const categoria = categoriaDeProductoId(fila.productoId);
    const estado = calcularEstado(fila);
    const cantidad = Number(fila.cantidadActual);
    const costoUnitario = fila.costoUnitario != null ? Number(fila.costoUnitario) : null;
    const valor = costoUnitario != null ? cantidad * costoUnitario : null;

    existenciaTotal += cantidad;
    if (estado === 'AGOTADO') agotados += 1;
    if (estado === 'MINIMO') enMinimo += 1;
    if (valor != null) valorInventarioTotal += valor;
    else valorInventarioIncompleto = true;

    const catAcc = porCategoria.get(categoria) ?? { categoria, valor: 0, incompleto: false };
    if (valor != null) catAcc.valor += valor;
    else catAcc.incompleto = true;
    porCategoria.set(categoria, catAcc);

    productos.push({
      productoId: fila.productoId,
      producto: nombreVisible,
      sku: skuDeSlug(slugFinal),
      categoria,
      existencia: cantidad,
      minimo: fila.minimo != null ? Number(fila.minimo) : null,
      estado,
      costoUnitario,
      moneda: fila.monedaCosto ?? null,
      valor,
      actualizadoEn: fila.actualizadoEn ?? null,
    });
  }

  const distribucion = {
    normal: productos.filter((p) => p.estado === 'NORMAL').length,
    minimo: enMinimo,
    agotado: agotados,
  };

  const productosCriticos = productos
    .filter((p) => p.estado !== 'NORMAL')
    .sort((a, b) => (a.estado === 'AGOTADO' ? -1 : 1) - (b.estado === 'AGOTADO' ? -1 : 1) || a.existencia - b.existencia);

  return {
    actualizadoEn: new Date().toISOString(),
    resumen: {
      existenciaTotal,
      productosAgotados: agotados,
      enNivelMinimo: enMinimo,
      productosNormales: distribucion.normal,
      valorInventario: valorInventarioTotal,
      valorInventarioIncompleto,
    },
    distribucion,
    valorPorCategoria: [...porCategoria.values()].sort((a, b) => b.valor - a.valor),
    productosCriticos,
    productos,
  };
}
