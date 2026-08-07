# Herramientas

[🏠 Índice de Agente IA](./README.md)

**Este archivo no implementa herramientas — no es código, no es un esquema de función, no es una definición de tool-calling.** Define, a nivel conceptual, qué capacidades de búsqueda necesita el agente y cuándo debe usar cada una. La implementación real (funciones de Python, tools de MCP, nodos de LangGraph, un flujo de n8n, o simplemente instrucciones de lectura de archivos) depende de la plataforma que se elija — este documento es la especificación que cualquiera de esas implementaciones debe cumplir.

## Las cinco capacidades

### `buscar_cliente()`
**Qué hace conceptualmente:** dado un conjunto de señales de la conversación, devuelve el perfil correspondiente de `docs/clientes/` (o indica que no hay coincidencia clara).
**Cuándo se usa:** paso 3 y 5 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md), después de completar el descubrimiento.
**Entrada conceptual:** las señales/necesidad expresadas por el cliente.
**Salida esperada:** un archivo de perfil de `docs/clientes/`, o ninguno si no hay coincidencia suficiente (ver "Perfil desconocido" en [`reglas_de_decision.md`](./reglas_de_decision.md)).

### `buscar_producto()`
**Qué hace conceptualmente:** dado un perfil ya identificado, devuelve las fichas de los productos que ese perfil recomienda en `docs/productos/`.
**Cuándo se usa:** paso 6 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) — **nunca antes** de tener un perfil (ver principio 6 en [`principios.md`](./principios.md)).
**Entrada conceptual:** el perfil obtenido de `buscar_cliente()`.
**Salida esperada:** 1-3 fichas de producto, nunca el catálogo completo.

### `buscar_objecion()`
**Qué hace conceptualmente:** dada una frase o intención del cliente que expresa duda o resistencia, devuelve el archivo de análisis correspondiente en `docs/objeciones/` (y su diálogo asociado en `docs/conversaciones/objeciones/`).
**Cuándo se usa:** paso 7 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md), solo si se detectó una objeción.
**Entrada conceptual:** el mensaje del cliente que contiene la resistencia.
**Salida esperada:** un archivo de `docs/objeciones/`, o ninguno si la frase no coincide con ninguna objeción documentada (ver [`manejo_de_errores.md`](./manejo_de_errores.md)).

### `buscar_conversacion()`
**Qué hace conceptualmente:** dado el momento del embudo actual, devuelve el archivo de ejemplo de `docs/conversaciones/` relevante para construir el tono y la estructura de la respuesta.
**Cuándo se usa:** paso 8 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md).
**Entrada conceptual:** la etapa actual (primer contacto, recomendación, objeción, cierre, seguimiento, postventa, emprendimiento).
**Salida esperada:** un archivo de ejemplo — usado como referencia de estilo, no como texto literal a copiar.

### `buscar_proceso()`
**Qué hace conceptualmente:** dado el estado actual de la conversación, devuelve la regla de orquestación correspondiente de `docs/proceso_de_venta/`.
**Cuándo se usa:** paso 4 de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md), antes de tocar cualquier otro módulo de contenido.
**Entrada conceptual:** el estado actual según [`docs/proceso_de_venta/estados_del_cliente.md`](../proceso_de_venta/estados_del_cliente.md).
**Salida esperada:** la regla o el paso del embudo aplicable.

## Principio de uso común a las cinco

Ninguna herramienta se invoca "por si acaso" — cada una se dispara únicamente cuando el paso correspondiente de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) la requiere, siguiendo el principio de carga mínima de [`contexto.md`](./contexto.md). Si una herramienta no devuelve un resultado claro (perfil no identificable, objeción no documentada), el agente sigue el procedimiento de [`manejo_de_errores.md`](./manejo_de_errores.md) — nunca inventa un resultado plausible.

---
[🏠 Índice de Agente IA](./README.md)
