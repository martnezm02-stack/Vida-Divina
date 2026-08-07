# Vida Divina — Estado Oficial del Proyecto

> **Propósito de este documento:** permitir que cualquier persona o conversación nueva entienda, sin contexto previo, dónde está el proyecto, qué existe, qué falta, y qué sigue — usando únicamente el repositorio, este documento y [`docs/ARCHITECTURE_v1.md`](ARCHITECTURE_v1.md).
>
> Este documento resume el estado; no repite el razonamiento ni la evidencia completa detrás de cada decisión. Para el detalle (contratos por componente, diagrama de flujo real, evidencia de cada hallazgo) ver `ARCHITECTURE_v1.md`, referenciado en cada sección donde aplica.
>
> **Corte de este cierre:** compilación verificada `2026-08-07T09:35:11.919Z` — 165 entidades, 1886 relaciones, 0 errores, 11 advertencias. Repositorio sin ningún commit de Git todavía.

---

## 1. Resumen ejecutivo

**¿Qué es Vida Divina?** Un negocio de venta directa (multinivel) de productos de bienestar y nutrición, con una red de distribuidores. Este proyecto no es el negocio en sí — es el sistema de conocimiento y las herramientas de software que lo sostienen.

**¿Cuál es el objetivo del proyecto?** Convertir el conocimiento comercial de Vida Divina — qué productos existen, quién los necesita, cómo se conversa con un cliente real, por qué resiste, cuándo se decide qué — en una base documental explícita y modular en Markdown (`docs/`), y demostrar mediante implementación real (no solo diseño) que esa base es suficiente para sostener decisiones de recomendación de producto y simulación de conversación sin inventar información ni depender de conocimiento tácito.

**¿En qué etapa se encuentra?** Se cierra formalmente la primera gran etapa: la base de conocimiento (6 módulos) y tres componentes de código (Knowledge Compiler, Conversation Simulator, Recommendation Engine) están construidos y validados por evidencia. La arquitectura resultante está descrita y congelada en `ARCHITECTURE_v1.md`. **Nada de esto está en producción** — todo se ejecuta localmente, por línea de comandos, sin canal real ni modelo de lenguaje involucrado. La siguiente etapa (ver §12) todavía no ha comenzado.

---

## 2. Arquitectura actual

Enumeración de los componentes existentes. Detalle completo de contratos, qué conoce/no conoce cada uno, y el diagrama de flujo real en `ARCHITECTURE_v1.md` §3–§4.

| Componente | Propósito | Estado | Ubicación | Dependencias principales |
|---|---|---|---|---|
| Base de Conocimiento | Contener el conocimiento de negocio en prosa estructurada | Validado (parcial en 2 de 6 módulos, ver §7) | `docs/` (6 módulos) | Ninguna |
| Knowledge Model | Contrato conceptual: qué entidades y relaciones existen | Diseñado, congelado (Iteración 2) | `docs/KNOWLEDGE_MODEL.md` | Ninguna |
| Knowledge Compiler | Transforma `docs/` en datos estructurados consultables | Validado | `compiler/` | Base de Conocimiento |
| Knowledge Package | Artefacto de datos regenerable (`raw/` + `compiled/`) | Implementado | `knowledge/` | Knowledge Compiler |
| Recommendation Engine | Clasifica productos por prioridad para un perfil dado | Validado, aislado | `recommendation-engine/` | Knowledge Package |
| Conversation Simulator | Ejecuta el flujo comercial de 7 pasos para un mensaje dado | Validado, aislado | `simulator/` | Knowledge Package |

Nota estructural importante (detalle completo en `ARCHITECTURE_v1.md` §4 y Hallazgo 1, §8): **Recommendation Engine y Conversation Simulator son componentes hermanos, no una cadena.** Ambos leen `knowledge/compiled/` de forma independiente; no existe conexión entre ellos.

---

## 3. Componentes implementados

| Componente | Sprint/fase de origen | Estado actual | Madurez | Validado / pendiente |
|---|---|---|---|---|
| Auditoría Técnica | Fase 1 | Cerrada | Documento único, de solo lectura | Validado (evidencia recopilada de todo el repo, no solo `docs/`) |
| Knowledge Model | Fase 2, Sprint 1 + Architecture Review Iteración 1 | Congelado | Diseño maduro, iterado una vez con revisión formal | Validado por uso posterior (los 3 componentes de código siguientes lo cumplen) |
| Knowledge Compiler | Fase 2, Sprint 2 | Estable | MVP funcional, sin pruebas automatizadas | Validado (165 entidades, 1886 relaciones, 0 errores en la última corrida) |
| Conversation Simulator | Fase 3, Sprint 3A | Estable | MVP funcional, reglas transcritas a mano, sin pruebas automatizadas | Validado (6/6 casos ejecutados sin excepciones) |
| Recommendation Engine | Fase 3, Sprint 3B | Estable | MVP funcional, aislado deliberadamente de los otros dos | Validado (6 perfiles, 0 excepciones) — incluyó una extensión puntual y justificada del Knowledge Compiler (3 archivos) |
| Architecture v1 | Cierre de Fase 3 | Congelado | Documento de síntesis, no software | Validado — aceptado en el mensaje que abre este cierre de fase |

Ningún componente de código tiene fecha de calendario fiable de aparición (el proyecto no tiene historial de Git); se identifican por su sprint/fase, que es la unidad de trazabilidad real usada durante todo el proyecto.

---

## 4. Componentes pendientes

Ninguno de los siguientes existe en código. Se documentan, no se diseñan. Detalle completo en `ARCHITECTURE_v1.md` §7.

| Componente | Objetivo | Prioridad | Dependencia arquitectónica |
|---|---|---|---|
| Decision Engine / Orchestrator | Conectar Recommendation Engine y Conversation Simulator en un solo flujo de decisión coherente | Alta — resuelve la brecha más importante detectada (Hallazgo 1, §9) | Debería construirse después de resolver la granularidad del catálogo (§7, deuda "1 archivo = 1 entidad") |
| Fuente operativa de precios | Dar a `simulator/` una fuente real de precios (hoy: 0 instancias) | Media | Ninguna sobre los componentes actuales — es una integración de datos externa |
| Conversation Runtime | Memoria persistente entre turnos de una misma conversación | Media | Depende de que exista primero el Decision Engine — dar memoria a un sistema que puede contradecirse a sí mismo (ver Hallazgo 1) amplificaría el problema |
| Modelo de Promoción | Esquema y datos para promociones reales | Baja | Bloqueado por falta de datos reales en `docs/`, no por falta de código |
| Resource Engine | Selección de recursos de apoyo y testimonios reales | Baja | Bloqueado: la entidad `Resource` ya existe en el Knowledge Model pero tiene 0 instancias reales en `docs/` |
| Integración de canal real (WhatsApp u otro) | Conectar el sistema a un canal de mensajería real | Más baja — deliberadamente al final | Depende de que los componentes anteriores estén conectados; exponer a un cliente real antes sería prematuro |

---

## 5. Documentación oficial

Agrupada por módulo. **Normativo** = describe el estado o contrato vigente, se mantiene actualizado. **Histórico** = documento de cierre de un sprint específico, válido como evidencia de lo que se hizo pero no se actualiza hacia adelante.

**Raíz del proyecto**
- `CLAUDE.md` — normativo. Documento maestro: rol de la IA, arquitectura de `docs/`, convenciones, estado del proyecto.

**Raíz de `docs/` (arquitectura y cierre de etapa)**
- [`KNOWLEDGE_MODEL.md`](KNOWLEDGE_MODEL.md) — normativo, congelado.
- [`ARCHITECTURE_v1.md`](ARCHITECTURE_v1.md) — normativo, baseline vigente.
- `PROJECT_STATE.md` — normativo, este documento.
- [`FASE_1_AUDITORIA_TECNICA.md`](FASE_1_AUDITORIA_TECNICA.md) — histórico (auditoría de un momento específico).
- [`KNOWLEDGE_COMPILER_IMPLEMENTATION.md`](KNOWLEDGE_COMPILER_IMPLEMENTATION.md) — histórico (cierre de Fase 2, Sprint 2).
- [`KNOWLEDGE_COMPILER_NOTES.md`](KNOWLEDGE_COMPILER_NOTES.md) — histórico (gaps detectados en Fase 2, Sprint 2).
- [`CONVERSATION_SIMULATOR.md`](CONVERSATION_SIMULATOR.md) — histórico (cierre de Fase 3, Sprint 3A).
- [`RECOMMENDATION_ENGINE.md`](RECOMMENDATION_ENGINE.md) — histórico (cierre de Fase 3, Sprint 3B).

**Módulos de conocimiento (todos normativos — contenido de negocio vivo)**
- `docs/productos.md` + `docs/productos/` — catálogo, 66 productos / 13 categorías. Completo.
- `docs/clientes/` — 16 perfiles de cliente. Completo.
- `docs/conversaciones/` — diálogos de ejemplo. Parcial (cobertura 80/20; resto documentado como pendiente en cada índice).
- `docs/objeciones/` — análisis estratégico de objeciones. Parcial (4 de 9 objeciones con análisis completo).
- `docs/proceso_de_venta/` — orquestador de reglas de decisión de negocio. Completo.
- `docs/agente_ia/` — especificación cognitiva del agente. Completo.

---

## 6. Decisiones arquitectónicas congeladas

Ninguna de estas debería modificarse sin una revisión formal (ver criterios de revisión en `ARCHITECTURE_v1.md` §13). Lista completa con evidencia en `ARCHITECTURE_v1.md` §11.

1. `docs/` en Markdown es la única fuente de verdad; ningún componente de código escribe ahí.
2. La compilación es unidireccional (`docs/` → `knowledge/`, nunca al revés).
3. Separación estricta entre conocimiento (`docs/`) e implementación (código).
4. Metadatos por archivo paralelo (`.meta.json`), no frontmatter embebido.
5. Sin base de datos, sin motor de grafos, sin embeddings, sin modelo de lenguaje en ningún componente actual.
6. Node.js sin dependencias externas como runtime único.
7. Un componente, una responsabilidad — ninguno absorbe la responsabilidad de otro.
8. Toda regla de decisión transcrita a código debe citar su fuente documental exacta.
9. Nunca inventar información; lo no verificable se declara como hallazgo.
10. La señal de seguridad (médica) tiene prioridad absoluta sobre cualquier recomendación.
11. Todo hallazgo se documenta antes de corregirse — ningún sprint corrige silenciosamente lo que otro encontró.
12. `knowledge/` es en su totalidad regenerable y desechable.

---

## 7. Deuda técnica aceptada

Solo deuda reconocida explícitamente durante los sprints. Detalle completo en `ARCHITECTURE_v1.md` §9.

- Catálogo de productos agrupado por archivo, no por entidad real (61 entidades compiladas vs. 66 productos reales) — de esas 61, 7 son en realidad archivos de categoría mal-tipados como `producto` (confirmado en la Auditoría RC1; ver Hallazgo 2 en `ARCHITECTURE_v1.md` §8), por lo que solo 54 corresponden a un producto individual real.
- Sin validación automática de anclas Markdown (`#anchor`).
- Vocabulario de relaciones compilado (6 tipos) más limitado que el contemplado en el Knowledge Model.
- Clasificación de entidades por convención de nombre/carpeta, no por análisis de contenido.
- Sin cache incremental de compilación.
- `git_commit` siempre `null` en el manifiesto — el repositorio no tiene historial de versiones.
- Recommendation Engine y Conversation Simulator sin integrar (deuda aceptada explícitamente, ver Hallazgo 1 en §9 de este documento).
- Lectores de `knowledge/compiled/` duplicados en tres componentes en vez de una librería compartida.
- Cobertura de `NOT_RECOMMENDED` parcial (4 de 16 perfiles con datos reales).
- Cero pruebas automatizadas en `compiler/`, `recommendation-engine/` y `simulator/`.
- `docs/conversaciones/` y `docs/objeciones/` con cobertura parcial (ver §5), documentada como pendiente en cada índice, no como vacío silencioso.

---

## 8. Riesgos actuales

Solo riesgos observados durante la implementación, no teóricos. Detalle completo en `ARCHITECTURE_v1.md` §10.

- **Ausencia total de historial de Git.** Cuatro sprints de código se completaron sin un solo punto de reversión posible.
- **Desincronización silenciosa entre `docs/` y `knowledge/`.** Nada detecta automáticamente cuándo `knowledge/compiled/` quedó desactualizado; depende de recordar recompilar manualmente.
- **Reglas transcritas a mano pueden divergir de su fuente sin aviso.** `simulator/src/rules.js` y `stateMachine.js` son transcripciones manuales de `docs/proceso_de_venta/`; un cambio ahí no se propaga ni se detecta.
- **Doble fuente de verdad para "qué producto recomendar".** Consecuencia directa de la falta de integración entre Recommendation Engine y Conversation Simulator — ya se verificó que pueden divergir para el mismo perfil.

---

## 9. Hallazgos más importantes

**Knowledge Compiler.** El hallazgo más significativo fue que "¿este archivo es el índice de su módulo?" no es una sola pregunta sino dos distintas: un hecho de posición en el árbol de carpetas (`esRaizDeModulo`) y una excepción histórica documentada (`docs/productos.md` vive fuera de su propia carpeta). Tratarlas como la misma pregunta habría clasificado mal todos los archivos de los módulos sin subcarpetas (`proceso_de_venta/`, `agente_ia/`). Este hallazgo cambió la comprensión de que "convención estructural" en este proyecto no es uniforme entre módulos — hay una excepción real y documentada que el código debe modelar explícitamente, no asumir como caso general.

**Conversation Simulator.** El hallazgo más significativo fue que **tener una relación compilada entre un perfil y un producto no es lo mismo que tener una relación priorizada.** El caso de Insomnio expuso que la heurística de "primeros N productos referenciados" trataba a Sleep N' Lose, Eterno y Orange Genius como equivalentes, cuando el documento fuente sí distingue cuál es la recomendación principal. Este hallazgo no se quedó como nota — cambió directamente el roadmap del proyecto: fue la razón por la que se abrió el Sprint 3B (Recommendation Engine).

**Recommendation Engine.** Dos hallazgos relevantes. Primero, la limitación "1 archivo = 1 entidad" reapareció en una capa distinta (caso Salud Visual), confirmando que no es un defecto aislado del Sprint 2 sino una limitación estructural que afecta a cualquier motor construido sobre `knowledge/compiled/entities.json`. Segundo, se descubrió que la sección "Kits recomendados", presente en la plantilla de los 16 perfiles de cliente, no tiene contenido enlazable real en ninguno de ellos (0/16) — cambió la comprensión de que la plantilla documental y los datos reales que la llenan no siempre coinciden, incluso en un módulo marcado como "completo".

**Transversal a los tres.** El hallazgo más importante de toda la etapa solo se hizo visible una vez que Recommendation Engine y Conversation Simulator existían ambos, por separado: el segundo fue la causa directa de construir el primero, y aun así nunca quedaron conectados. Ninguno de los tres componentes, evaluado de forma aislada, habría revelado esto — solo apareció al mirar la arquitectura completa en conjunto (ejercicio que produjo `ARCHITECTURE_v1.md`).

---

## 10. Estado de implementación

| Componente | Estado |
|---|---|
| Base de Conocimiento (`docs/`) | Validado (parcial en `conversaciones/` y `objeciones/`) |
| Knowledge Model | Diseñado (congelado) |
| Knowledge Compiler | Validado |
| Knowledge Package (`knowledge/`) | Implementado |
| Recommendation Engine | Validado |
| Conversation Simulator | Validado |
| Architecture v1 | Validado |
| Decision Engine / Orchestrator | Pendiente |
| Conversation Runtime | Pendiente |
| Fuente operativa de precios | Pendiente |
| Modelo de Promoción | Pendiente |
| Resource Engine | Pendiente |
| Integración de canal real | Pendiente |

---

## 11. Roadmap recomendado

Orden de evolución de arquitectura, no de funcionalidades. Justificación completa (por qué cada paso depende del anterior) en `ARCHITECTURE_v1.md` §12.

1. **Primer commit de Git.** Costo mínimo; prerrequisito de todo lo demás, que implica cambios de código o esquema sin punto de reversión hoy.
2. **Resolver "1 archivo = 1 entidad".** Es el hallazgo con más apariciones independientes (tres) de todo el proyecto; cualquier motor construido encima hereda hoy un conteo de productos incorrecto.
3. **Formalizar en el Knowledge Model las relaciones tipadas perfil→producto que el compilador ya emite.** El Decision Engine debe construirse sobre un contrato ya formalizado, no sobre una implementación de facto.
4. **Diseñar el Decision Engine / Orchestrator.** Cierra la brecha más importante detectada (Hallazgo 1). Se ubica después de los pasos 2 y 3 para no propagar sus defectos a la integración.
5. **Resource Engine**, solo cuando exista al menos un dato real de tipo `Resource`.
6. **Conversation Runtime**, una vez exista un Decision Engine capaz de producir una decisión coherente por turno.
7. **Fuente operativa de precios y promociones** — integración de datos externa, no bloquea a los pasos anteriores.
8. **Integración de canal real**, deliberadamente al final: exponer a un cliente real antes de resolver los pasos 1–6 propagaría las inconsistencias ya documentadas.

---

## 12. Próxima fase recomendada

**La siguiente gran fase debería ser "Estabilización de la Arquitectura"**, cubriendo los pasos 1 a 4 del roadmap anterior como una sola unidad de trabajo: higiene de Git, corrección de granularidad del catálogo, formalización del vocabulario de relaciones en el Knowledge Model, y diseño del Decision Engine que finalmente conecte Recommendation Engine con Conversation Simulator.

La justificación es directa: los tres componentes de código construidos hasta ahora están individualmente validados, pero el hallazgo más importante de todo el proyecto (§9, transversal) es que dos de ellos —construidos con una dependencia causal explícita entre sí— nunca quedaron conectados. Avanzar hacia componentes nuevos (Resource Engine, Conversation Runtime, integración de canal real) sin cerrar antes esa brecha construiría sobre una base que ya se sabe inconsistente. Ninguno de los componentes pendientes de mayor valor de negocio (memoria de conversación, canal real) depende de features nuevas — dependen de que la arquitectura ya construida termine de conectarse consigo misma.

---

## 13. Estado general del proyecto

**🟡 Arquitectura estable con deuda técnica controlada.**

No es 🟢 sin matices porque existe una brecha arquitectónica real y ya identificada (Recommendation Engine y Conversation Simulator sin integrar) y un riesgo activo (cero historial de Git) — ninguno de los dos es hipotético, ambos están documentados con evidencia concreta en este mismo cierre.

No es 🔴 porque ninguno de estos problemas está oculto, sin gestionar, o generando comportamiento silenciosamente incorrecto sin que el sistema lo reporte: cada componente de código registra explícitamente sus propias limitaciones como "hallazgos" en vez de fallar en silencio (0 errores en la última compilación; el simulador registra hallazgos en cada corrida en vez de inventar datos faltantes); toda la deuda técnica listada en §7 fue aceptada conscientemente, no descubierta después del hecho; y la arquitectura completa, incluida su brecha más importante, ya está descrita, priorizada y con un roadmap justificado para resolverla (§11–§12).

---

## Cierre

Con este documento se cierra formalmente la etapa de construcción y validación de la arquitectura de Vida Divina. No se ha modificado ningún componente existente ni ningún documento previo para producirlo. No se inicia ningún desarrollo nuevo.

Una conversación nueva puede retomar el proyecto usando únicamente: este repositorio, `docs/ARCHITECTURE_v1.md` y este documento (`docs/PROJECT_STATE.md`).
