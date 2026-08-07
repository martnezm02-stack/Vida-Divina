# Contexto

[🏠 Índice de Agente IA](./README.md)

Define cómo el agente recupera conocimiento de `docs/` durante su razonamiento: **el mínimo necesario para el paso actual, nunca un módulo completo "por si acaso".** Este principio no es nuevo — es el mismo que organiza toda la arquitectura del proyecto (ver [`CLAUDE.md#principios-de-arquitectura`](../../CLAUDE.md#principios-de-arquitectura), "Modularidad" y "Facilidad de mantenimiento"); este archivo lo aplica específicamente al comportamiento del agente en tiempo de razonamiento.

## El principio central

Cada paso de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) carga **solo el archivo específico** que ese paso necesita, no la carpeta completa del módulo:

| Paso | Se carga | No se carga |
|---|---|---|
| 5. Consultar clientes | El archivo del perfil ya identificado (ej. `docs/clientes/energia.md`) | El resto de los 16 perfiles de `docs/clientes/` |
| 6. Consultar productos | Solo las fichas de los 1-3 productos que ese perfil recomienda | El catálogo completo de 66 productos |
| 7. Consultar objeciones | Solo el archivo de la objeción detectada | Todo `docs/objeciones/` si no hay objeción activa |
| 8. Consultar conversaciones | Solo el archivo de la etapa/escenario actual | Toda la carpeta `docs/conversaciones/` |

## Cuándo NO cargar un módulo en absoluto

- No cargar `docs/objeciones/` si el mensaje del cliente no contiene ninguna señal de duda o resistencia.
- No cargar `docs/proceso_de_venta/emprendimiento.md` si no hay ninguna señal relacionada con el negocio.
- No cargar `docs/clientes/` completo para "explorar opciones" — el perfil se identifica primero (paso 3), y solo entonces se abre el archivo específico.
- No releer un módulo ya consultado en el mismo turno si la información no cambió — reutilizar lo ya obtenido en pasos anteriores del mismo ciclo.

## Por qué esto es un principio de razonamiento, no solo de eficiencia

Cargar de más no es únicamente un costo de recursos — introduce ruido: si el agente tiene en su contexto los 16 perfiles de `docs/clientes/` a la vez, aumenta el riesgo de mezclar recomendaciones de perfiles que no aplican a este cliente. Cargar el mínimo necesario **mejora la precisión del razonamiento**, no solo su velocidad.

## Relación con las herramientas de búsqueda

Este principio es la razón de ser de las herramientas descritas en [`herramientas.md`](./herramientas.md): cada una está diseñada para devolver un resultado acotado (un perfil, un producto, una objeción), no un volcado completo de un módulo.

---
[🏠 Índice de Agente IA](./README.md)
