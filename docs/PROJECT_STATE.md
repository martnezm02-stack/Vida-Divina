# Vida Divina — Estado Oficial del Proyecto

> **Propósito de este documento:** permitir que cualquier persona o conversación nueva entienda, sin contexto previo, dónde está el proyecto, qué existe, qué falta, y qué sigue — usando únicamente el repositorio, este documento y [`docs/ARCHITECTURE_v1.md`](ARCHITECTURE_v1.md).
>
> Este documento resume el estado; no repite el razonamiento ni la evidencia completa detrás de cada decisión. Para el detalle (contratos por componente, diagrama de flujo real, evidencia de cada hallazgo) ver `ARCHITECTURE_v1.md`, referenciado en cada sección donde aplica.
>
> **Corte de este cierre:** compilación verificada `2026-08-07T10:54:26.779Z` — 177 entidades, 1898 relaciones, 0 errores, 11 advertencias (`knowledge/compiled/manifest.json`). Repositorio con 2 commits (`d1eb7d1`, `7391271`).

---

## 1. Resumen ejecutivo

**¿Qué es Vida Divina?** Un negocio de venta directa (multinivel) de productos de bienestar y nutrición, con una red de distribuidores. Este proyecto no es el negocio en sí — es el sistema de conocimiento y las herramientas de software que lo sostienen.

**¿Cuál es el objetivo del proyecto?** Convertir el conocimiento comercial de Vida Divina — qué productos existen, quién los necesita, cómo se conversa con un cliente real, por qué resiste, cuándo se decide qué — en una base documental explícita y modular en Markdown (`docs/`), y demostrar mediante implementación real (no solo diseño) que esa base es suficiente para sostener decisiones de recomendación de producto y simulación de conversación sin inventar información ni depender de conocimiento tácito.

**¿En qué etapa se encuentra?** Se cerró la primera gran etapa (base de conocimiento + Knowledge Compiler + Conversation Simulator + Recommendation Engine, descrita y congelada en `ARCHITECTURE_v1.md`) y, en el commit `7391271`, se cerró también la fase de "Estabilización de la Arquitectura" que ese mismo documento recomendaba en su §12: primer commit de Git, resolución de "1 archivo = 1 entidad" (61→66 productos reales), formalización del vocabulario de relaciones en el Knowledge Model, y construcción del **Decision Engine** (`decision-engine/`), que conecta Recommendation Engine y Conversation Simulator en un solo flujo — cerrando el Hallazgo 1 de `ARCHITECTURE_v1.md`. Ver el detalle de este cierre en el Adendum al final de `ARCHITECTURE_v1.md`. **Nada de esto está en producción** — todo se ejecuta localmente, por línea de comandos, sin canal real ni modelo de lenguaje involucrado. La siguiente etapa (ver §12) todavía no ha comenzado.

---

## 2. Arquitectura actual

Enumeración de los componentes existentes. Detalle completo de contratos, qué conoce/no conoce cada uno, y el diagrama de flujo real en `ARCHITECTURE_v1.md` §3–§4.

| Componente | Propósito | Estado | Ubicación | Dependencias principales |
|---|---|---|---|---|
| Base de Conocimiento | Contener el conocimiento de negocio en prosa estructurada | Validado (parcial en 2 de 6 módulos, ver §7) | `docs/` (6 módulos) | Ninguna |
| Knowledge Model | Contrato conceptual: qué entidades y relaciones existen | Diseñado, congelado (Iteración 2, sincronizado con la implementación en `7391271`) | `docs/KNOWLEDGE_MODEL.md` | Ninguna |
| Knowledge Compiler | Transforma `docs/` en datos estructurados consultables | Validado — resuelve "1 archivo = 1 entidad" (66 productos reales) | `compiler/` | Base de Conocimiento |
| Knowledge Package | Artefacto de datos regenerable (`raw/` + `compiled/`) | Implementado — 177 entidades, 1898 relaciones | `knowledge/` | Knowledge Compiler |
| Recommendation Engine | Clasifica productos por prioridad para un perfil dado | Validado, aislado | `recommendation-engine/` | Knowledge Package |
| Conversation Simulator | Ejecuta el flujo comercial de 7 pasos para un mensaje dado | Validado, aislado | `simulator/` | Knowledge Package |
| Decision Engine | Conecta Recommendation Engine y Conversation Simulator en un solo flujo de decisión, sin modificar ninguno de los dos | Implementado, verificado (6/6 casos de prueba sin excepciones) | `decision-engine/` | Recommendation Engine, Conversation Simulator |

Nota estructural (ya resuelta — detalle completo en el Adendum de `ARCHITECTURE_v1.md` y Hallazgo 1, §8 de ese documento): Recommendation Engine y Conversation Simulator siguen siendo componentes hermanos que leen `knowledge/compiled/` de forma independiente, **pero ahora `decision-engine/` los conecta** en tiempo de ejecución sin modificar ninguno de los dos — ya no son dos rutas de decisión desconectadas.

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
| Decision Engine | Fase de Estabilización de la Arquitectura, commit `7391271` | Estable | MVP funcional, reutiliza Conversation Simulator y Recommendation Engine sin modificarlos | Validado — 6/6 casos manuales (`decision-engine/main.js`) + 15/15 pruebas automatizadas (`npm test`, `node:test`) sin excepciones. Documento de cierre: [`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md) |

Ningún componente de código tiene fecha de calendario fiable de aparición (el proyecto no tiene historial de Git); se identifican por su sprint/fase, que es la unidad de trazabilidad real usada durante todo el proyecto.

---

## 4. Componentes pendientes

Ninguno de los siguientes existe en código. Se documentan, no se diseñan. Detalle completo en `ARCHITECTURE_v1.md` §7.

Decision Engine / Orchestrator **ya no está pendiente** — se construyó en `decision-engine/` (commit `7391271`). Queda fuera de esta tabla; ver su fila en §3.

| Componente | Objetivo | Prioridad | Dependencia arquitectónica |
|---|---|---|---|
| Conversation Runtime | Memoria persistente entre turnos de una misma conversación | Alta — es el siguiente paso desbloqueado del roadmap (§11, paso 6) | Dependía de que existiera primero el Decision Engine (ya existe) — dar memoria a un sistema que puede contradecirse a sí mismo habría amplificado el problema; ese riesgo ya no aplica |
| Fuente operativa de precios | Dar a `simulator/` una fuente real de precios (hoy: 0 instancias) | Media | Ninguna sobre los componentes actuales — es una integración de datos externa |
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
- [`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md) — histórico (cierre del Sprint Decision Engine, commit `7391271` + cierre de deuda posterior).

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

Solo deuda reconocida explícitamente durante los sprints. Detalle completo en `ARCHITECTURE_v1.md` §9 y su Adendum.

**Resuelta en el commit `7391271`** (se deja registro, no se elimina la traza — principio §6.11):
- ~~Catálogo de productos agrupado por archivo, no por entidad real~~ — resuelto: 66 productos reales compilados como entidades individuales (antes 61, con 7 mal-tipadas como `producto`). Ver Hallazgo 2 en `ARCHITECTURE_v1.md` §8, cerrado en el Adendum.
- ~~Vocabulario de relaciones compilado más limitado que el contemplado en el Knowledge Model~~ — resuelto: `docs/KNOWLEDGE_MODEL.md` sincronizado con el vocabulario que el compilador ya emitía.
- ~~Recommendation Engine y Conversation Simulator sin integrar~~ — resuelto: `decision-engine/` los conecta sin modificar ninguno de los dos. Ver Hallazgo 1 en `ARCHITECTURE_v1.md` §8, cerrado en el Adendum.
- ~~`git_commit` siempre `null` en el manifiesto~~ — resuelto: el repositorio tiene historial de Git (2 commits); el manifiesto ahora registra el hash del commit vigente al momento de compilar.
- ~~`decision-engine/` sin documento de cierre de sprint dedicado ni pruebas automatizadas~~ — resuelto: [`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md) + 15 pruebas automatizadas (`decision-engine/test/`, `node:test`), ambas agregadas en el cierre de este sprint. Detalle completo, incluyendo un hallazgo de regresión funcional detectado y corregido en `simulator/src/knowledgeQuery.js`, en ese mismo documento.

**Deuda vigente:**
- Sin validación automática de anclas Markdown (`#anchor`).
- Clasificación de entidades por convención de nombre/carpeta, no por análisis de contenido.
- Sin cache incremental de compilación.
- Lectores de `knowledge/compiled/` duplicados en cuatro componentes (`compiler/`, `recommendation-engine/`, `simulator/`, y `decision-engine/`, que reutiliza los lectores de los dos anteriores) en vez de una librería compartida.
- Cobertura de `NOT_RECOMMENDED` parcial (4 de 16 perfiles con datos reales).
- Cero pruebas automatizadas en `compiler/`, `recommendation-engine/` y `simulator/` — `decision-engine/` es hoy el único de los cuatro componentes de código con cobertura automatizada (ver `DECISION_ENGINE_IMPLEMENTATION.md` §4); no se extendió retroactivamente a los otros tres, fuera del alcance de este cierre.
- `docs/conversaciones/` y `docs/objeciones/` con cobertura parcial (ver §5), documentada como pendiente en cada índice, no como vacío silencioso.

---

## 8. Riesgos actuales

Solo riesgos observados durante la implementación, no teóricos. Detalle completo en `ARCHITECTURE_v1.md` §10 y su Adendum.

- ~~**Ausencia total de historial de Git.**~~ Resuelto: 2 commits (`d1eb7d1`, `7391271`).
- ~~**Doble fuente de verdad para "qué producto recomendar".**~~ Mitigado: `decision-engine/` concilia ambas fuentes y declara explícitamente cuál usa (`fuenteDeDecision` en su salida) cuando difieren — pero `simulator/src/knowledgeQuery.js` conserva su heurística propia si se invoca fuera del Decision Engine, así que la doble fuente sigue existiendo a nivel de código, solo que ahora hay un componente que la resuelve en vez de dejarla sin resolver.
- **Desincronización silenciosa entre `docs/` y `knowledge/`.** Sigue sin resolverse: nada detecta automáticamente cuándo `knowledge/compiled/` quedó desactualizado; depende de recordar recompilar manualmente.
- **Reglas transcritas a mano pueden divergir de su fuente sin aviso.** Sigue sin resolverse: `simulator/src/rules.js` y `stateMachine.js` son transcripciones manuales de `docs/proceso_de_venta/`; un cambio ahí no se propaga ni se detecta.
- ~~**`decision-engine/` sin pruebas automatizadas ni documento de cierre.**~~ Resuelto en este cierre — ver §7.

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
| Knowledge Model | Diseñado (congelado, sincronizado con la implementación) |
| Knowledge Compiler | Validado (resuelve "1 archivo = 1 entidad") |
| Knowledge Package (`knowledge/`) | Implementado (177 entidades, 1898 relaciones) |
| Recommendation Engine | Validado |
| Conversation Simulator | Validado |
| Architecture v1 | Validado (con Adendum post-cierre) |
| Decision Engine / Orchestrator | **Implementado, verificado, con pruebas automatizadas y documento de cierre** (6/6 casos manuales + 15/15 pruebas automatizadas) |
| Conversation Runtime | Pendiente — siguiente paso desbloqueado del roadmap |
| Fuente operativa de precios | Pendiente |
| Modelo de Promoción | Pendiente |
| Resource Engine | Pendiente (bloqueado: 0 instancias de `Resource` en `docs/`) |
| Integración de canal real | Pendiente |

---

## 11. Roadmap recomendado

Orden de evolución de arquitectura, no de funcionalidades. Justificación completa (por qué cada paso depende del anterior) en `ARCHITECTURE_v1.md` §12.

1. ~~**Primer commit de Git.**~~ ✅ Hecho — 2 commits en el repositorio.
2. ~~**Resolver "1 archivo = 1 entidad".**~~ ✅ Hecho en `7391271` — 66 productos reales compilados.
3. ~~**Formalizar en el Knowledge Model las relaciones tipadas perfil→producto que el compilador ya emite.**~~ ✅ Hecho en `7391271` — `docs/KNOWLEDGE_MODEL.md` sincronizado.
4. ~~**Diseñar el Decision Engine / Orchestrator.**~~ ✅ Hecho en `7391271` — `decision-engine/`, cierra el Hallazgo 1.
5. **Resource Engine**, solo cuando exista al menos un dato real de tipo `Resource`. Sigue bloqueado — 0 instancias en `docs/` hoy.
6. **Conversation Runtime** — **siguiente paso desbloqueado.** El Decision Engine (paso 4) ya existe y produce una decisión coherente por turno; ya no hay razón arquitectónica para posponer memoria persistente.
7. **Fuente operativa de precios y promociones** — integración de datos externa, no bloquea a los pasos anteriores.
8. **Integración de canal real**, deliberadamente al final: exponer a un cliente real antes de resolver los pasos 1–6 propagaría las inconsistencias ya documentadas.

---

## 12. Próxima fase recomendada

**La fase "Estabilización de la Arquitectura" (pasos 1–4 del roadmap) ya se cerró** en el commit `7391271`: higiene de Git, corrección de granularidad del catálogo, formalización del vocabulario de relaciones en el Knowledge Model, y Decision Engine conectando Recommendation Engine con Conversation Simulator. Esta sección documentaba esa fase como recomendación pendiente; se deja el texto original tachado abajo como registro histórico, y se reemplaza por la recomendación vigente.

**La deuda inmediata que dejó ese cierre — documento de cierre y pruebas automatizadas para `decision-engine/` — también quedó saldada** en un sprint de cierre posterior: ver [`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md) y §7 de este documento.

**La siguiente fase recomendada es Conversation Runtime (paso 6 del roadmap, memoria persistente entre turnos)**, ahora sin ninguna dependencia arquitectónica bloqueante: el Decision Engine que necesitaba existir para que dar memoria no amplificara inconsistencias ya existe, ya fue verificado por 6 casos manuales, y ya tiene cobertura automatizada. Es, además, el único componente pendiente de mayor valor de negocio que no depende de datos todavía inexistentes (a diferencia de Resource Engine, paso 5, bloqueado por 0 instancias de `Resource` en `docs/`).

> *Recomendación original de este documento, ahora histórica:* "La siguiente gran fase debería ser 'Estabilización de la Arquitectura', cubriendo los pasos 1 a 4 del roadmap [...]" — cumplida en `7391271`.

---

## 13. Estado general del proyecto

**🟢 Arquitectura estable, brecha principal cerrada, deuda técnica controlada.**

Sube de 🟡 a 🟢 respecto al cierre anterior de este documento: las dos condiciones que entonces impedían el 🟢 sin matices — la desconexión entre Recommendation Engine y Conversation Simulator, y la ausencia total de historial de Git — ya están resueltas (`decision-engine/` y 2 commits, respectivamente). La deuda que ese mismo cierre había introducido (`decision-engine/` sin pruebas ni documento dedicado) también quedó saldada en el sprint de cierre posterior — ver [`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md).

No es 🟢 absoluto porque persisten riesgos ya conocidos y no urgentes, sin relación con el Decision Engine: desincronización silenciosa `docs/`↔`knowledge/` y reglas transcritas a mano sin detección de divergencia (§8), además de la ausencia de pruebas automatizadas en los otros tres componentes de código (§7). Ninguno de estos es oculto: cada uno está documentado aquí con su evidencia, igual que en el cierre anterior.

---

## Cierre

Este documento se actualizó (sin reabrir ni reescribir su cierre original) en dos momentos: primero para reflejar el commit `7391271`, que cerró la fase de "Estabilización de la Arquitectura" recomendada en la versión anterior de este mismo documento (primer commit de Git, resolución de "1 archivo = 1 entidad", sincronización del Knowledge Model, y construcción del Decision Engine); después, en un sprint de cierre dedicado, para saldar la deuda que ese mismo commit había dejado — documento de cierre ([`DECISION_ENGINE_IMPLEMENTATION.md`](DECISION_ENGINE_IMPLEMENTATION.md)) y pruebas automatizadas (`decision-engine/test/`, 15/15 exitosas) para `decision-engine/`. Se verificó además, en ese mismo cierre, que `compiler/`, `simulator/` y `recommendation-engine/` siguen funcionando sin regresión (recompilación limpia: 177 entidades, 1898 relaciones, 0 errores). Ningún componente de código de negocio fue modificado — solo se agregó cobertura de pruebas y documentación reflejando trabajo ya hecho y verificado.

Una conversación nueva puede retomar el proyecto usando únicamente: este repositorio, `docs/ARCHITECTURE_v1.md` (con su Adendum) y este documento (`docs/PROJECT_STATE.md`).
