# Recomendación

[🏠 Índice de Proceso de Venta](./README.md)

Paso 7 del [flujo general](./flujo_general.md). Define **cómo se elige** qué producto ofrecer — no qué decir (eso es [`docs/conversaciones/recomendacion/`](../conversaciones/recomendacion/index.md)).

## Regla no negociable de precedencia

```
Descubrimiento completo (perfil identificado)
        ↓
docs/clientes/<perfil>.md   ← SIEMPRE se consulta primero
        ↓
docs/productos/...          ← solo los productos que ese perfil ya recomienda
        ↓
Recomendación al cliente
```

**Nunca se recomienda un producto sin haber identificado primero el perfil del cliente.** Y dentro del perfil, **nunca se consulta `docs/productos/` antes que `docs/clientes/`** — el perfil es el filtro que decide qué productos son relevantes; sin ese filtro, `docs/productos/` tiene 66 productos y ninguna forma de priorizar entre ellos.

## Cómo seleccionar el producto específico

1. Abrir la ficha del perfil en `docs/clientes/` y revisar su sección **"Productos recomendados"** — esa lista, no el catálogo completo, es el universo de opciones válidas para esta conversación.
2. Si el perfil tiene un archivo dedicado en [`docs/conversaciones/recomendacion/`](../conversaciones/recomendacion/index.md), usarlo como base del diálogo — ya está calibrado a variantes comunes de esa conversación.
3. Si el perfil **no** tiene archivo en `conversaciones/recomendacion/` todavía (ver pendientes en su [índice](../conversaciones/recomendacion/index.md)), construir la recomendación directamente desde las secciones "Cómo iniciar la conversación" y "Argumentos de venta" de la ficha en `docs/clientes/`.
4. Elegir **1-2 productos como máximo** para la primera recomendación — nunca la lista completa de "Productos recomendados" de un perfil de una sola vez. Los "Productos complementarios" del perfil se guardan para [Postventa](./postventa.md) (venta cruzada), no para la primera recomendación.

## Cómo desempatar cuando hay varias opciones válidas

- Si el cliente mencionó un formato preferido en descubrimiento (café, cápsula, té), priorizar el producto del perfil que venga en ese formato.
- Si el cliente mencionó un reto específico dentro de la necesidad general (ej. "el apetito" dentro de Pérdida de Peso), priorizar el producto cuyo beneficio principal en `docs/productos/` calce más directo con ese reto.
- Si ninguna de las anteriores aplica, usar el producto que la ficha de `docs/clientes/` presenta primero en su lista de "Productos recomendados" — estas listas ya están ordenadas por relevancia/prioridad al construirse.

## Qué hacer si el cliente tiene más de una necesidad

Recomendar solo para la necesidad que el cliente priorizó en [Descubrimiento](./descubrimiento.md) (ver esa misma regla ahí). La segunda necesidad no se ignora — se registra mentalmente para ofrecerla como venta cruzada en [`postventa.md`](./postventa.md), una vez cerrada y satisfecha la primera.

## Después de recomendar

- Si el cliente acepta o pregunta cómo proceder → [`cierre.md`](./cierre.md).
- Si el cliente muestra duda o resistencia → [`manejo_de_objeciones.md`](./manejo_de_objeciones.md).
- Si el cliente no responde → [`seguimiento.md`](./seguimiento.md).

Ver la tabla completa de estos tres casos en [`reglas_de_decision.md`](./reglas_de_decision.md).

---
[🏠 Índice de Proceso de Venta](./README.md)
