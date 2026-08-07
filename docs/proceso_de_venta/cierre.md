# Cierre

[🏠 Índice de Proceso de Venta](./README.md)

Paso 9 del [flujo general](./flujo_general.md). Define **cuándo** es correcto intentar cerrar la venta — el guion real está en [`docs/conversaciones/cierre/`](../conversaciones/cierre/index.md).

## Cuándo SÍ intentar el cierre

Todas estas condiciones deben cumplirse:

1. **El perfil fue identificado** en [Descubrimiento](./descubrimiento.md) — nunca se cierra una venta "genérica" sin saber qué necesidad resuelve.
2. **Se hizo una recomendación concreta** de 1-2 productos (paso 7).
3. **No hay ninguna objeción activa sin resolver** (ver [`manejo_de_objeciones.md`](./manejo_de_objeciones.md)) — si el cliente mencionó una duda y no fue atendida, no se avanza a cierre.
4. **El cliente dio una señal explícita de decisión**, no solo de interés. Señales válidas: pregunta cómo pagar, pide confirmar el pedido, dice directamente "sí, lo quiero", o similar.

## Cuándo NO intentar el cierre

- El cliente todavía está en fase de pregunta o comparación ("¿y esto para qué sirve exactamente?") — eso es señal de que falta [Recomendación](./recomendacion.md) más completa, no de que esté listo para cerrar.
- Hay una objeción mencionada pero no resuelta (aunque sea implícita, como un silencio largo después de mencionar el precio).
- El cliente mencionó una condición médica o medicamento y no se ha completado la derivación correspondiente (ver [`manejo_de_objeciones.md`](./manejo_de_objeciones.md)) — cerrar una venta en este estado no es apropiado.
- El cliente pidió explícitamente tiempo para pensarlo — en ese caso corresponde [`seguimiento.md`](./seguimiento.md), no insistir en el cierre en la misma conversación.

## Señales que indican que el cliente aún no está listo

| Señal | Qué indica | Siguiente paso correcto |
|---|---|---|
| Preguntas repetidas sobre lo mismo | La recomendación no quedó clara | Volver a [`recomendacion.md`](./recomendacion.md), explicar distinto |
| Respuestas cada vez más cortas o tardías | Interés decreciente, no forzar | [`seguimiento.md`](./seguimiento.md), sin insistir en el momento |
| Menciona precio sin seguir la conversación | Objeción de valor no verbalizada | [`manejo_de_objeciones.md`](./manejo_de_objeciones.md) → `docs/objeciones/esta_caro.md` |
| "Lo voy a pensar" o equivalente | Objeción oculta sin identificar aún | [`manejo_de_objeciones.md`](./manejo_de_objeciones.md) → `docs/objeciones/lo_voy_a_pensar.md` |
| Silencio prolongado sin cierre previo | Conversación enfriándose | [`seguimiento.md`](./seguimiento.md), no repetir el mismo mensaje |

## Al completar el cierre

Continuar con la secuencia completa de [`docs/conversaciones/cierre/`](../conversaciones/cierre/index.md): confirmación de pedido → explicación de pago → confirmación de envío → agradecimiento. El estado del cliente pasa a `Venta cerrada` (ver [`estados_del_cliente.md`](./estados_del_cliente.md)), y el siguiente paso del [flujo general](./flujo_general.md) es [Postventa](./postventa.md).

---
[🏠 Índice de Proceso de Venta](./README.md)
