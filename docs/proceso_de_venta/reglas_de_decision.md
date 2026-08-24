# Reglas de Decisión

[🏠 Índice de Proceso de Venta](./README.md)

**El archivo más importante de este módulo.** Tabla maestra de navegación: dado lo que ocurre en la conversación, qué módulo o archivo consultar a continuación. Formato fijo: `SI [condición] → ENTONCES [módulo/archivo]`.

> Este archivo no explica *por qué* ni *qué decir* — para eso están `docs/clientes/`, `docs/objeciones/` y `docs/conversaciones/`. Aquí solo se decide *a dónde ir*.

---

## Regla de precedencia general

Ninguna tabla de abajo se salta este orden:

```
Calificación → Descubrimiento → Perfil (docs/clientes) → Producto (docs/productos)
→ Recomendación → [Objeciones] → Cierre → Seguimiento/Postventa → [Emprendimiento]
```

Ver el detalle de cada eslabón en [`flujo_general.md`](./flujo_general.md).

---

## Tabla 1 Señal de necesidad y perfil de cliente

La tabla completa y canónica (16 perfiles) vive en [`docs/clientes/README.md#mapa-rápido-necesidad--primer-producto-de-entrada`](../clientes/README.md#mapa-rápido-necesidad--primer-producto-de-entrada) — no se repite aquí. Ejemplos representativos del patrón:

| SI el cliente menciona... | ENTONCES consultar |
|---|---|
| Cansancio, falta de energía | [`docs/clientes/energia.md`](../clientes/energia.md) |
| Bajar de peso, controlar el apetito | [`docs/clientes/perder_peso.md`](../clientes/perder_peso.md) |
| Arrugas, verse más joven | [`docs/clientes/belleza_anti_edad.md`](../clientes/belleza_anti_edad.md) |
| Ganar dinero, ingreso extra | [`docs/clientes/emprendimiento.md`](../clientes/emprendimiento.md) |
| Nada específico / respuesta vaga | [`docs/clientes/bienestar_general.md`](../clientes/bienestar_general.md) |

## Tabla 2 Señal de objeción y archivo a consultar

> **Nota de compatibilidad (Sprint 5):** esta clasificación estructurada de objeciones no representa el manejo actual en el flujo comercial principal (`SPRINT_5_PROCESO_COMERCIAL.md` §18 confirma que hoy se usa una respuesta genérica, no esta tabla). `docs/objeciones/` **sí** es conocimiento de apoyo válido para [`recuperacion_de_compra.md`](./recuperacion_de_compra.md).

| SI el cliente dice algo como... | ENTONCES consultar (análisis) | Diálogo de ejemplo |
|---|---|---|
| "Está caro" / "se me hace mucho" / "vi más barato" | [`docs/objeciones/esta_caro.md`](../objeciones/esta_caro.md) | [conversaciones/objeciones/esta_caro.md](../conversaciones/objeciones/esta_caro.md) |
| "Lo voy a pensar" / "déjame pensarlo" / "te aviso" | [`docs/objeciones/lo_voy_a_pensar.md`](../objeciones/lo_voy_a_pensar.md) | [conversaciones/objeciones/lo_voy_a_pensar.md](../conversaciones/objeciones/lo_voy_a_pensar.md) |
| "No creo en suplementos" / "es puro placebo" | [`docs/objeciones/no_creo_en_suplementos.md`](../objeciones/no_creo_en_suplementos.md) | [conversaciones/objeciones/no_creo_en_suplementos.md](../conversaciones/objeciones/no_creo_en_suplementos.md) |
| "No tengo dinero" / "ando corto/a" | [`docs/objeciones/no_tengo_dinero.md`](../objeciones/no_tengo_dinero.md) | [conversaciones/objeciones/no_tengo_dinero.md](../conversaciones/objeciones/no_tengo_dinero.md) |
| "Ya probé otros productos y no funcionó" | *(análisis pendiente en `docs/objeciones/`)* | [conversaciones/objeciones/ya_probe_otros_productos.md](../conversaciones/objeciones/ya_probe_otros_productos.md) |
| Menciona medicamento, condición médica o "mi médico no me deja" — **prioridad máxima** | *(análisis pendiente en `docs/objeciones/`)* | [conversaciones/objeciones/mi_medico_no_me_deja.md](../conversaciones/objeciones/mi_medico_no_me_deja.md) |
| "No tengo tiempo" | *(pendiente en ambos módulos)* | Aplicar [reglas generales](../conversaciones/README.md#reglas-generales-aplican-a-todo-el-módulo) mientras se construye |
| "No me gustan las ventas" (rama Emprendimiento) | *(pendiente en ambos módulos)* | Ver [`emprendimiento.md`](./emprendimiento.md) de este módulo |
| "No quiero emprender" (rama Emprendimiento) | *(pendiente en ambos módulos)* | Ver [`emprendimiento.md`](./emprendimiento.md) de este módulo |

## Tabla 3 Evento de conversación y acción siguiente

| SI ocurre esto... | ENTONCES... |
|---|---|
| Cliente acepta una recomendación | Continuar con [`docs/conversaciones/cierre/`](../conversaciones/cierre/index.md) — ver [`cierre.md`](./cierre.md) |
| Cliente aún no decide / pide tiempo | Continuar con [`docs/conversaciones/seguimiento/`](../conversaciones/seguimiento/index.md) — ver [`seguimiento.md`](./seguimiento.md) |
| Cliente expresa una objeción (cualquier tipo) | Ir a Tabla 2 de este archivo — ver [`manejo_de_objeciones.md`](./manejo_de_objeciones.md) |
| Cliente confirma el pedido | [`docs/conversaciones/cierre/confirmacion_pedido.md`](../conversaciones/cierre/confirmacion_pedido.md) |
| Cliente ya recibió el producto | [`docs/conversaciones/postventa/verificar_satisfaccion.md`](../conversaciones/postventa/verificar_satisfaccion.md) — ver [`postventa.md`](./postventa.md) |
| Cliente reporta un problema o insatisfacción en postventa | Tratar como objeción — volver a Tabla 2 / [`manejo_de_objeciones.md`](./manejo_de_objeciones.md), **no** ignorar ni forzar venta cruzada |
| Cliente pregunta directamente por el negocio | [`docs/clientes/emprendimiento.md`](../clientes/emprendimiento.md) — ver [`emprendimiento.md`](./emprendimiento.md) |
| Cliente menciona más de una necesidad a la vez | Priorizar la primera mencionada — ver [`descubrimiento.md`](./descubrimiento.md); guardar la segunda para [`postventa.md`](./postventa.md) |
| Cliente menciona condición médica o medicamento | **Prioridad máxima** — pausar recomendación, ir a fila de "mi médico no me deja" en Tabla 2 |
| Cliente no responde tras una recomendación | [`seguimiento.md`](./seguimiento.md), empezando por [`seguimiento_24h.md`](../conversaciones/seguimiento/seguimiento_24h.md) |
| Cliente declina explícitamente (producto o negocio) | Cerrar con respeto, sin insistir — no se activa ningún otro módulo en la misma conversación |

## Tabla 4 Estado del cliente y módulo prioritario

Ver el modelo completo de estados en [`estados_del_cliente.md`](./estados_del_cliente.md). Resumen de a dónde ir según el estado actual:

| Estado | Módulo prioritario a consultar |
|---|---|
| `Nuevo` | [`docs/conversaciones/primer_contacto/`](../conversaciones/primer_contacto/index.md) + [`calificacion_del_cliente.md`](./calificacion_del_cliente.md) |
| `En descubrimiento` | [`docs/conversaciones/descubrimiento/`](../conversaciones/descubrimiento/index.md) + [`descubrimiento.md`](./descubrimiento.md) |
| `Perfil identificado` | [`docs/clientes/`](../clientes/README.md) — ficha del perfil correspondiente |
| `Producto recomendado` | Esperar señal del cliente → Tabla 3 de este archivo |
| `Objeción detectada` | [`docs/objeciones/`](../objeciones/README.md) → Tabla 2 de este archivo |
| `Evaluando` | [`seguimiento.md`](./seguimiento.md) |
| `Venta cerrada` | [`docs/conversaciones/cierre/`](../conversaciones/cierre/index.md), luego [`postventa.md`](./postventa.md) |
| `En seguimiento` | [`seguimiento.md`](./seguimiento.md) — tabla de tiempos |
| `Cliente recurrente` | [`postventa.md`](./postventa.md) (venta cruzada/fidelización) o nuevo ciclo de [`descubrimiento.md`](./descubrimiento.md) si trae una necesidad distinta |
| `Prospecto de emprendimiento` | [`docs/clientes/emprendimiento.md`](../clientes/emprendimiento.md) + [`docs/conversaciones/emprendimiento/`](../conversaciones/emprendimiento/index.md) |

---
[🏠 Índice de Proceso de Venta](./README.md)
