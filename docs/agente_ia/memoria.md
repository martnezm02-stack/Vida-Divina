# Memoria

[🏠 Índice de Agente IA](./README.md)

Define qué debe conservar el agente **dentro de una conversación activa** y qué nunca debe conservar. Este archivo describe principios de memoria conversacional (de trabajo), no una implementación de almacenamiento de datos ni una política legal de retención — eso corresponde a una futura implementación técnica y a asesoría legal específica si se construye un CRM real (ver el módulo `crm/` en el roadmap de [`CLAUDE.md`](../../CLAUDE.md#roadmap)).

## Qué debe recordar durante la conversación

- El **perfil identificado** del cliente (paso 3 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md)), para no volver a preguntar lo mismo dos veces.
- Los **productos ya mencionados o recomendados**, para no repetir la misma recomendación como si fuera nueva.
- Las **objeciones ya planteadas y cómo se resolvieron**, para no tratarlas de nuevo desde cero si reaparecen.
- El **estado actual del cliente** según [`docs/proceso_de_venta/estados_del_cliente.md`](../proceso_de_venta/estados_del_cliente.md), para saber en qué punto retomar si la conversación se pausa y continúa después.
- **Preferencias explícitas** que el cliente haya dado (formato preferido — café, cápsula, té; ritmo de conversación) — ver [`docs/proceso_de_venta/calificacion_del_cliente.md`](../proceso_de_venta/calificacion_del_cliente.md).

## Qué información nunca debe almacenarse más allá de lo estrictamente necesario

- **Detalles médicos específicos** que el cliente comparta (nombre de condición, medicamento exacto, dosis) — se usan únicamente en el momento para activar la regla de seguridad correspondiente ([`reglas_de_seguridad.md`](./reglas_de_seguridad.md)), no se guardan como parte del perfil del cliente ni se reutilizan en conversaciones futuras.
- **Datos de pago** (números de tarjeta, comprobantes) — no son responsabilidad de la memoria conversacional del agente en absoluto.
- Cualquier dato personal que no sea estrictamente necesario para completar la venta (nombre y dirección de envío son necesarios; cualquier otro dato personal compartido incidentalmente no debe retenerse sin propósito).

## Duración de la memoria

Lo anterior aplica **dentro de una conversación activa o su continuación directa** (ver estado `En seguimiento` en `estados_del_cliente.md`). Qué tan larga es esa ventana, y si algo se conserva entre conversaciones completamente distintas (por ejemplo, para reconocer a un `Cliente recurrente`), es una decisión de implementación técnica que depende de la plataforma final (Claude, GPT, un CRM propio, etc.) — este documento define el principio de **mínima retención necesaria**, no el mecanismo.

## Por qué esto importa

Retener de más no es solo un riesgo de privacidad — también viola [`contexto.md`](./contexto.md) (cargar más de lo necesario) y puede llevar al agente a "recordar" y repetir información sensible en un momento inapropiado. Retener de menos rompe la experiencia consultiva (obligar al cliente a repetirse). El balance correcto es: **memoria funcional a la conversación, nunca memoria acumulativa sin propósito.**

---
[🏠 Índice de Agente IA](./README.md)
