# Descubrimiento

[🏠 Índice de Proceso de Venta](./README.md)

Paso 3 del [flujo general](./flujo_general.md). Este es el paso que determina si toda la venta posterior va a estar bien dirigida o no. **Regla no negociable: nunca recomendar un producto antes de completar este paso.**

## Qué información debe obtener la IA antes de recomendar

Como mínimo, antes de pasar a [Recomendación](./recomendacion.md), debe quedar claro:

1. **Cuál es la necesidad o el objetivo principal** del cliente (energía, peso, digestión, piel, etc.) — suficiente para ubicarlo en un perfil de [`docs/clientes/`](../clientes/README.md).
2. **Si hay una mención de condición médica o medicamento** — si aparece, este paso se detiene y se desvía inmediatamente (ver "Cuándo detener la conversación" abajo).
3. **Idealmente (no obligatorio):** si ya probó algo similar antes, y qué tan urgente es la necesidad — ayuda a anticipar objeciones y a calibrar el ritmo (ver [`calificacion_del_cliente.md`](./calificacion_del_cliente.md)).

El guion real de preguntas está en [`docs/conversaciones/descubrimiento/preguntas_generales.md`](../conversaciones/descubrimiento/preguntas_generales.md) — este archivo no repite esas preguntas, solo define qué información es obligatoria antes de avanzar.

## Qué preguntas hacer

- Preguntas abiertas, no cerradas: "¿Qué te gustaría mejorar?" en vez de "¿Quieres bajar de peso?" (una pregunta cerrada sesga la respuesta hacia lo que el asesor espera vender).
- Máximo 2-3 preguntas antes de tener suficiente información para identificar un perfil — más que eso empieza a sentirse como interrogatorio (ver `docs/conversaciones/descubrimiento/preguntas_generales.md`, sección "Qué NO decir").
- Una pregunta de profundización según la respuesta inicial (ver la tabla de variantes en ese mismo archivo).

## Qué preguntas evitar

- Preguntas que ya asumen un producto o perfil ("¿quieres probar el TéDivina?") — eso es recomendación disfrazada de descubrimiento, y viola la regla de precedencia.
- Preguntas médicas o de diagnóstico ("¿tienes resistencia a la insulina?", "¿qué te dijo tu médico exactamente?") — no es información que el asesor deba recopilar ni diagnosticar; si el cliente la menciona por su cuenta, se seguen las reglas de la sección siguiente.
- Preguntas de presión ("¿para cuándo lo necesitas?", en tono de urgencia forzada) — no está alineado con el tono consultivo del proyecto.

## Cuándo detener la conversación para obtener más información

Detener el avance hacia [Recomendación](./recomendacion.md) y pedir una aclaración adicional cuando:

- **La respuesta es demasiado ambigua** para ubicar un perfil ("quiero sentirme mejor" sin más detalle) → una pregunta más antes de asumir [Bienestar General](../clientes/bienestar_general.md) por defecto.
- **El cliente menciona más de una necesidad a la vez** (ej. cansancio y dolor articular) → preguntar cuál es la prioridad antes de recomendar, en vez de ofrecer ambas de inmediato (la segunda necesidad se guarda para venta cruzada en [Postventa](./postventa.md)).
- **El cliente menciona una condición médica, medicamento o indicación de su médico** → detener el flujo de descubrimiento/recomendación por completo y pasar directamente a la lógica de [`docs/objeciones/README.md`](../objeciones/README.md) → archivo `mi_medico_no_me_deja` (ver tabla completa en [`reglas_de_decision.md`](./reglas_de_decision.md)). Esto tiene prioridad sobre cualquier otro paso del embudo.

## Qué hacer al completar este paso
Con la necesidad identificada, pasar al paso 4-5 del [flujo general](./flujo_general.md): mapear la señal a un perfil (tabla en [`docs/clientes/README.md`](../clientes/README.md#mapa-rápido-necesidad--primer-producto-de-entrada)) y abrir esa ficha completa antes de tocar `docs/productos/`.

---
[🏠 Índice de Proceso de Venta](./README.md)
