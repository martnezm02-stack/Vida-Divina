# Postventa

[🏠 Índice de Proceso de Venta](./README.md)

Pasos 11-13 del [flujo general](./flujo_general.md): postventa, venta cruzada y fidelización. Define **cuándo** activar cada una — el diálogo real está en [`docs/conversaciones/postventa/`](../conversaciones/postventa/index.md).

> **Nota de compatibilidad (Sprint 5):** la venta cruzada, la solicitud de testimonio y la solicitud de referido descritas en este documento **no forman parte del proceso postventa actual confirmado**. El proceso vigente está documentado en [`seguimiento_postventa.md`](./seguimiento_postventa.md).

## Cuándo verificar satisfacción

Tan pronto como haya pasado tiempo razonable desde la [confirmación de envío](../conversaciones/cierre/confirmacion_envio.md) para que el cliente ya haya recibido y probado el producto (días, no horas). Usar [`docs/conversaciones/postventa/verificar_satisfaccion.md`](../conversaciones/postventa/verificar_satisfaccion.md).

**Regla:** este paso ocurre **antes** que cualquier venta cruzada o solicitud de testimonio — nunca se ofrece un producto nuevo sin haber confirmado primero que el anterior salió bien.

## Cuándo ofrecer productos complementarios (venta cruzada)

Solo **después** de confirmar satisfacción positiva. Consultar la sección "Posibles ventas futuras (cross-selling)" del perfil correspondiente en `docs/clientes/`, y ejecutar con [`docs/conversaciones/postventa/recomendar_complementarios.md`](../conversaciones/postventa/recomendar_complementarios.md).

**No ofrecer venta cruzada si:**
- La verificación de satisfacción reveló un problema o duda sin resolver — primero se atiende eso (tratar como objeción, ver [`manejo_de_objeciones.md`](./manejo_de_objeciones.md)).
- El cliente no ha respondido todavía a la verificación de satisfacción.

## Cuándo solicitar testimonio

Cuando el cliente expresa satisfacción de forma espontánea y clara (no forzada) — por ejemplo, si menciona que ya lo recomendó a alguien más, o responde con entusiasmo genuino a la verificación de satisfacción. Usar [`docs/conversaciones/postventa/solicitar_testimonio.md`](../conversaciones/postventa/solicitar_testimonio.md).

**Regla:** nunca condicionar la venta cruzada o el trato al cliente a que acepte dar un testimonio — es una solicitud independiente y opcional.

## Cuándo solicitar una recomendación (referido)

Mismo momento que el testimonio, o inmediatamente después si el cliente ya lo dio — un cliente satisfecho que ya compartió su experiencia es un buen momento para preguntar si conoce a alguien más a quien le pueda interesar. Este escenario específico está pendiente de construir en `docs/conversaciones/postventa/` (ver su [índice](../conversaciones/postventa/index.md)); mientras tanto, aplicar el mismo tono y estructura de [`solicitar_testimonio.md`](../conversaciones/postventa/solicitar_testimonio.md), cambiando el pedido de "reseña" por "contacto".

## Orden recomendado dentro de postventa

```
Verificar satisfacción
        ↓
   ¿Positiva?
   ↙        ↘
 No           Sí
  ↓            ↓
Tratar como   Venta cruzada (si aplica un complementario relevante)
objeción            ↓
              Solicitar testimonio / referido
                     ↓
        ¿Señal de interés en el negocio? → ver emprendimiento.md
```

---
[🏠 Índice de Proceso de Venta](./README.md)
