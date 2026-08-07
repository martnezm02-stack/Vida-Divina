# Calificación del Cliente

[🏠 Índice de Proceso de Venta](./README.md)

Paso 2 del [flujo general](./flujo_general.md). Antes de invertir tiempo en descubrimiento profundo, conviene calibrar qué tan listo está el cliente para avanzar. Esto no cambia el respeto ni el tono — solo cambia el ritmo y la profundidad de la conversación.

## Los tres niveles

### 🧊 Cliente frío
**Cómo se identifica:**
- No mostró intención de compra explícita — llegó por curiosidad, por un contacto guardado, o respondió a un saludo genérico.
- Respuestas cortas, poco comprometidas, o tarda mucho en responder.
- No hizo ninguna pregunta específica sobre producto, precio o beneficio.

**Cómo actuar:**
- Ritmo lento, sin prisa por vender. Priorizar generar confianza sobre cerrar.
- Usar [`docs/conversaciones/primer_contacto/whatsapp_directo.md`](../conversaciones/primer_contacto/whatsapp_directo.md) como base de apertura.
- No pasar a [Recomendación](./recomendacion.md) sin al menos completar [Descubrimiento](./descubrimiento.md) — con un cliente frío, saltarse este paso casi garantiza que no responda.

### 🌤️ Cliente tibio
**Cómo se identifica:**
- Ya mostró algún interés concreto: hizo una pregunta sobre un producto, reaccionó a una publicación, o fue referido con contexto ("me dijo que le funcionó para X").
- Responde con cierta rapidez pero todavía no pide comprar.

**Cómo actuar:**
- Avanzar con normalidad por el flujo: [Descubrimiento](./descubrimiento.md) → [Recomendación](./recomendacion.md).
- Es el perfil más común — la mayoría de los archivos de [`docs/conversaciones/primer_contacto/`](../conversaciones/primer_contacto/index.md) (referido, redes sociales) asumen este nivel de calificación.

### 🔥 Cliente caliente
**Cómo se identifica:**
- Pregunta directamente por precio, cómo comprar, o disponibilidad — ver [`docs/conversaciones/primer_contacto/pregunta_precio.md`](../conversaciones/primer_contacto/pregunta_precio.md).
- Menciona que ya decidió o que solo necesita confirmar un detalle.
- Es un cliente recurrente que ya compró antes (ver estado `Cliente recurrente` en [`estados_del_cliente.md`](./estados_del_cliente.md)).

**Cómo actuar:**
- No alargar el descubrimiento innecesariamente — 1 pregunta de confirmación puede bastar antes de pasar a [Recomendación](./recomendacion.md) o directo a [Cierre](./cierre.md) si ya sabe exactamente qué quiere.
- **Aun así, nunca saltar directo a Cierre sin al menos confirmar el perfil/necesidad** — un cliente caliente mal diagnosticado genera una venta del producto equivocado y una objeción evitable después.

## Regla de decisión rápida

| Calificación | Profundidad de descubrimiento | Siguiente paso típico |
|---|---|---|
| Frío | Completa (todas las preguntas de [`preguntas_generales.md`](../conversaciones/descubrimiento/preguntas_generales.md)) | Descubrimiento |
| Tibio | Estándar (2-3 preguntas) | Descubrimiento → Recomendación |
| Caliente | Mínima (1 pregunta de confirmación) | Recomendación directa, o Cierre si ya hay decisión |

## Qué NO hacer al calificar
- No asumir que un cliente que pregunta precio es automáticamente "caliente" en el sentido de listo para comprar sin más contexto — puede ser solo un filtro exploratorio (ver [`docs/conversaciones/primer_contacto/pregunta_precio.md`](../conversaciones/primer_contacto/pregunta_precio.md)).
- No degradar el trato a un cliente frío por serlo — la calificación ajusta el ritmo, no la calidad de la atención.
- No re-calificar constantemente durante la misma conversación — una vez identificado el nivel, se ajusta solo si el cliente da una señal clara de cambio (ej. de tibio a caliente al preguntar cómo pagar).

---
[🏠 Índice de Proceso de Venta](./README.md)
