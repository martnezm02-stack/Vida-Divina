# Manejo de Objeciones

[🏠 Índice de Proceso de Venta](./README.md)

Paso 8 del [flujo general](./flujo_general.md). Define **cuándo** desviar la conversación hacia `docs/objeciones/` y **cómo** retomar el flujo normal después — no el contenido de cada objeción (eso vive en `docs/objeciones/` y `docs/conversaciones/objeciones/`).

## Cuándo consultar docs/objeciones

Consultar en cuanto el cliente exprese cualquier forma de resistencia, duda o freno **después** de una recomendación — o incluso antes, si la resistencia es filosófica/general (ej. escepticismo hacia la categoría) y aparece ya en [Descubrimiento](./descubrimiento.md).

Señales típicas de que se debe activar este paso:
- El cliente cuestiona el precio, el valor, o dice que lo va a pensar.
- El cliente menciona experiencias previas negativas con productos similares.
- El cliente expresa duda filosófica sobre si "esto funciona".
- El cliente menciona una condición médica, medicamento, o indicación de un profesional de salud — **esta señal tiene prioridad máxima** y se atiende de inmediato, incluso si aparece en medio de otro paso del embudo (ver [`descubrimiento.md`](./descubrimiento.md), sección "Cuándo detener la conversación").
- El cliente menciona limitación de tiempo o interés en el negocio pero no en comprar (ramas específicas de la carpeta [Emprendimiento](../conversaciones/emprendimiento/index.md)).

## Cómo decidir qué objeción aplicar

1. Identificar la frase o intención del cliente.
2. Buscar la coincidencia en la tabla de señales de [`reglas_de_decision.md`](./reglas_de_decision.md#tabla-2-señal-de-objeción-y-archivo-a-consultar) — esa tabla mapea frases típicas a archivos concretos de `docs/objeciones/`.
3. Abrir primero [`docs/objeciones/<objeción>.md`](../objeciones/README.md) para entender el porqué y la estrategia general.
4. Usar [`docs/conversaciones/objeciones/<objeción>.md`](../conversaciones/objeciones/index.md) para el diálogo real.
5. Si la objeción mencionada **no tiene archivo construido todavía** (ver pendientes en ambos índices), aplicar el principio general de [reglas generales de Conversaciones](../conversaciones/README.md#reglas-generales-aplican-a-todo-el-módulo): sin presión, sin afirmaciones médicas, validar antes de responder — y registrar el vacío para priorizarlo en la próxima ronda de expansión del módulo.

## Cómo volver al proceso de venta después de resolver una objeción

| Resultado de la objeción | Siguiente paso |
|---|---|
| Cliente acepta seguir / objeción resuelta | Volver a [`recomendacion.md`](./recomendacion.md) (si la objeción surgió antes de decidir) o avanzar a [`cierre.md`](./cierre.md) (si ya había una decisión pendiente de confirmar) |
| Cliente pide tiempo / objeción parcialmente resuelta | [`seguimiento.md`](./seguimiento.md), eligiendo el tiempo según el tipo de objeción (ver tabla en ese archivo) |
| Cliente declina explícitamente | Cerrar la conversación con respeto (ver "Qué NO decir" en cada archivo de `docs/conversaciones/objeciones/`), sin insistir. No forzar un segundo intento en la misma conversación |
| Objeción de tipo médico, sin resolución posible por el asesor | Remitir a un profesional de salud y **no continuar** con recomendación de producto hasta que el cliente confirme por su cuenta — ver [`docs/objeciones/README.md`](../objeciones/README.md) |

## Qué NO hacer en este paso
- No pasar a [Cierre](./cierre.md) mientras una objeción siga sin resolver o sin respuesta del cliente.
- No presentar una segunda objeción/contraargumento si el cliente ya declinó una vez — ver reglas de no-presión en `docs/conversaciones/README.md`.
- No inventar una respuesta para una objeción que no está documentada — usar el principio general, no una afirmación no verificada.

---
[🏠 Índice de Proceso de Venta](./README.md)
