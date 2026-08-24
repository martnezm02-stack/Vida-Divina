# Seguimiento

[🏠 Índice de Proceso de Venta](./README.md)

Paso 10 del [flujo general](./flujo_general.md). Define **qué mensaje de seguimiento corresponde según el estado y el motivo de pausa** del cliente — el texto real está en [`docs/conversaciones/seguimiento/`](../conversaciones/seguimiento/index.md).

> **Nota de compatibilidad (Sprint 5):** [`seguimiento_postventa.md`](./seguimiento_postventa.md) representa el proceso operativo vigente de seguimiento postventa. Los escalones de 24h/15d/30d descritos en este documento histórico no representan el proceso actual.

## Regla general
El seguimiento se activa cuando el cliente **no avanza** (no responde, pide tiempo, o queda con una objeción sin resolver) — nunca reemplaza a [`manejo_de_objeciones.md`](./manejo_de_objeciones.md); primero se intenta resolver la objeción, y solo si eso no cierra la conversación se programa seguimiento.

## Tabla de decisión: motivo de pausa → tiempo de seguimiento

| Motivo de la pausa | Seguimiento correspondiente |
|---|---|
| Conversación de recomendación sin respuesta, mismo día | [`seguimiento_24h.md`](../conversaciones/seguimiento/seguimiento_24h.md) |
| Objeción de precio ("está caro") sin resolución definitiva | [`seguimiento_3dias.md`](../conversaciones/seguimiento/seguimiento_3dias.md) |
| "Lo voy a pensar" sin razón específica revelada | [`seguimiento_3dias.md`](../conversaciones/seguimiento/seguimiento_3dias.md) → si no responde, [`seguimiento_7dias.md`](../conversaciones/seguimiento/seguimiento_7dias.md) |
| Cliente pidió explícitamente "más tiempo" sin fecha concreta | [`seguimiento_7dias.md`](../conversaciones/seguimiento/seguimiento_7dias.md) |
| Objeción de dinero ("no tengo dinero ahora") | [`seguimiento_15dias.md`](../conversaciones/seguimiento/seguimiento_15dias.md) o [`seguimiento_30dias.md`](../conversaciones/seguimiento/seguimiento_30dias.md), según lo que el cliente haya indicado |
| Objeción médica en espera de confirmación con su médico | [`seguimiento_15dias.md`](../conversaciones/seguimiento/seguimiento_15dias.md) |
| Ciclo completo sin respuesta tras 30 días | [`seguimiento_30dias.md`](../conversaciones/seguimiento/seguimiento_30dias.md) — es el último contacto activo antes de pasar a contacto pasivo (ver abajo) |

## Qué hacer si no hay respuesta tras el seguimiento de 30 días

Pausar el contacto directo 1 a 1. El cliente pasa a un estado de contacto pasivo (recontacto futuro vía publicaciones o campañas generales, no seguimiento individual) — ver [`docs/conversaciones/seguimiento/seguimiento_30dias.md`](../conversaciones/seguimiento/seguimiento_30dias.md), sección "Qué hacer después".

## Qué hacer si el cliente responde durante el seguimiento

Depende de la respuesta:
- Retoma interés en el mismo producto → volver a [`recomendacion.md`](./recomendacion.md) o directo a [`cierre.md`](./cierre.md) si ya está decidido.
- Aparece una objeción nueva → [`manejo_de_objeciones.md`](./manejo_de_objeciones.md).
- Declina explícitamente → cerrar con respeto, sin más seguimiento activo en el corto plazo.

## Qué NO hacer
- No enviar dos seguimientos distintos el mismo día.
- No repetir el mismo mensaje en momentos distintos — cada tiempo de seguimiento (`24h`, `3d`, `7d`, `15d`, `30d`) tiene un enfoque de valor distinto, no es un recordatorio genérico repetido.
- No saltarse directamente a `seguimiento_30dias.md` sin haber pasado por los tiempos anteriores, salvo que el cliente mismo haya pedido ese plazo específico.

---
[🏠 Índice de Proceso de Venta](./README.md)
