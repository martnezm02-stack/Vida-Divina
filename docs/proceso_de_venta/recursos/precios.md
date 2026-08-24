# Recurso: Precios por Producto

[⬅ Recursos](./README.md) · [🏠 Índice de Proceso de Venta](../README.md)

> Derivado de [`SPRINT_5_PROCESO_COMERCIAL.md`](../SPRINT_5_PROCESO_COMERCIAL.md) §7, que permanece como fuente de verdad del proceso comercial real de Vida Divina.
>
> **Actualización (Fase Pre-E2E, 2026-08-14):** catálogo y precios reales de 8 productos, proporcionados directamente por el propietario para el piloto — no derivados de Sprint 5 (que nunca documentó cifras) ni inventados. El resto del catálogo (todo producto fuera de esta lista) permanece PENDIENTE.

## Descripción

Después del testimonio se presenta el precio. La estructura del proceso es la misma para cualquier producto, pero el recurso de precio depende del producto solicitado.

**Regla:** producto de interés → recurso de precios correspondiente. **No existe una única imagen de precios universal para todos los productos.**

## Catálogo real (piloto, 2026-08-14)

Un producto puede pertenecer a más de una categoría comercial — la lista de abajo no es mutuamente excluyente. Las categorías aquí son **comerciales/de piloto** (cómo se agrupan para conversación y campaña), distintas de la categoría estructural del catálogo en `docs/productos/` (cómo se organiza el archivo) — ambas son válidas y no se contradicen entre sí, solo sirven propósitos distintos.

| Producto | ID interno (`productoId`) | Precio | Categoría(s) comercial(es) | Descripción comercial |
|---|---|---|---|---|
| TéDivina | `productos/01-control-de-peso/tedivina` | $1,600 MXN | Digestión | Digestión saludable |
| Café Divina Black | `productos/02-cafe-divina/black` | $750 MXN | Digestión | Café digestivo |
| Sculpt Max | `productos/01-control-de-peso/sculpt-max` | $1,750 MXN | Digestión | Bienestar digestivo |
| Café Divina Sculpt Black | `productos/02-cafe-divina/sculpt-black` | $1,600 MXN | Control de Peso | Control de peso |
| Ripped Capsules | `productos/07-rendimiento-fisico/ripped-capsules` | $1,600 MXN | Control de Peso | Quema de grasa |
| Reishi Capsules | `productos/03-longevidad-bienestar/reishi-capsules` | $1,600 MXN | Bienestar / Energía | Bienestar integral y Energía |
| Mars Capsules | `productos/08-intimidad-libido/mars-capsules` | $1,600 MXN | Bienestar / Energía | Energía masculina |
| Tongkat Ali Café | `productos/02-cafe-divina/tongkat-ali-cafe` | $750 MXN | Bienestar / Energía | Vitalidad diaria / Energía y vitalidad |

**Nota de correspondencia verificada contra `docs/productos.md`:** los 8 `productoId` de arriba fueron confirmados contra `knowledge/compiled/entities.json` (no adivinados) antes de escribir esta tabla, para asegurar que el motor pueda encontrarlos al identificar el producto en el mensaje del cliente. "Tongkat Ali Café" corresponde específicamente al archivo `tongkat-ali-cafe.md` ("Tongkat Ali (Café)") — existe un producto distinto, "Sculpt Tongkat Ali", que **no** es el mismo y no forma parte de este catálogo de 8.

## Resto del catálogo

Cualquier producto fuera de la tabla de arriba permanece **PENDIENTE** — ningún precio se documenta ni se inventa para él. `obtenerPrecioProducto()` sigue devolviendo `disponible:false` en esos casos.

## Fuente

Precios, nombres y descripciones comerciales: instrucción directa del propietario, Fase Pre-E2E, 2026-08-14. Estructura del proceso: `SPRINT_5_PROCESO_COMERCIAL.md` §7.

---
[⬅ Recursos](./README.md) · [🏠 Índice de Proceso de Venta](../README.md)
