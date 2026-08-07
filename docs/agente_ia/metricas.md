# Métricas

[🏠 Índice de Agente IA](./README.md)

Define **qué** debe medirse para saber si el agente está razonando bien — no implementa un dashboard ni un sistema de analítica (eso pertenece a una futura implementación técnica, posiblemente conectada al módulo `crm/` del roadmap de [`CLAUDE.md`](../../CLAUDE.md#roadmap)).

## Métricas de razonamiento

| Métrica | Qué mide | Señal observable |
|---|---|---|
| Perfil identificado correctamente | Si el paso 3 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) ubicó al cliente en el perfil de `docs/clientes/` que realmente correspondía | El cliente no corrige ni contradice la dirección de la conversación tras la primera recomendación |
| Producto recomendado correctamente | Si el producto ofrecido, dentro del perfil ya identificado, era el más adecuado al reto específico del cliente | El cliente no pide "algo distinto" inmediatamente después de la recomendación |
| Objeción resuelta | Si tras aplicar [`docs/objeciones/`](../objeciones/README.md) el cliente continuó la conversación en vez de abandonarla | El cliente responde con una pregunta de avance, no con silencio o un cierre abrupto |
| Venta realizada | Si la conversación llegó a `Venta cerrada` en [`docs/proceso_de_venta/estados_del_cliente.md`](../proceso_de_venta/estados_del_cliente.md) | Pedido confirmado |
| Cliente satisfecho | Resultado de [`docs/conversaciones/postventa/verificar_satisfaccion.md`](../conversaciones/postventa/verificar_satisfaccion.md) | Respuesta positiva explícita del cliente en postventa |
| Tiempo de conversación | Cuántos turnos o cuánto tiempo tomó llegar de `Nuevo` a una resolución (venta, seguimiento programado, o cierre respetuoso sin venta) | Conteo de turnos/tiempo transcurrido dentro del estado activo |

## Métricas de disciplina del sistema (cumplimiento de reglas)

Estas no miden resultado de venta, sino adherencia a este módulo — son las más importantes para detectar que el agente se está desviando de su especificación:

- **Cero recomendaciones sin perfil identificado** — cualquier caso en que esto ocurra es una falla de [`principios.md`](./principios.md), no una variación aceptable.
- **Cero afirmaciones médicas** — cualquier caso es una falla de [`reglas_de_seguridad.md`](./reglas_de_seguridad.md) que debe tratarse como incidente, no como estadística menor.
- **Cero datos inventados** (precios, cifras de ingreso, resultados garantizados) — mismo nivel de severidad que el punto anterior.

## Cómo se usan estas métricas

Sirven para dos propósitos: (1) detectar si el agente necesita ajustes en `docs/clientes/`, `docs/productos/` o `docs/conversaciones/` (contenido insuficiente o mal enfocado), y (2) detectar si el propio Motor Cognitivo (`docs/agente_ia/`) necesita revisión (el razonamiento se está desviando de lo especificado). La primera categoría se resuelve ampliando los módulos de negocio; la segunda se resuelve revisando este módulo — nunca al revés.

---
[🏠 Índice de Agente IA](./README.md)
