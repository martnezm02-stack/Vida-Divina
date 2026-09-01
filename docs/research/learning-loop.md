# Vida Divina — Learning Loop (Market + Performance + Attribution → Creative Strategy)

**Fecha:** 31 de agosto / 1 de septiembre de 2026
**Alcance:** capa que correlaciona inteligencia de mercado externa (`marketingIntelligence/`) con desempeño propio ya mecanizado (`learning-strategy-engine/`, `marketing-intelligence-engine/`, `attribution-engine/`) para producir `Learning` y `CreativeRecommendation`, extendiendo `creativeIntelligenceContext` con `validatedLearningContext`. **No se ejecutó ninguna investigación externa en esta tarea** — ver "Confirmación" al final.

---

## 1. Por qué esta capa es nueva y qué NO se duplicó

Antes de escribir código se investigó a fondo el estado real de `learning-strategy-engine/`, `strategy-decision-engine/`, `content-strategy/src/performanceAnalysis/`, `attribution-engine/` y `marketing-intelligence-engine/`. Hallazgo central: **ya existe una cadena completa para desempeño propio** —

```
PublishedContent → PerformanceObservation → MarketingInsight → LearningRecord → StrategyFeedback → StrategyDecision → StrategyContext → Content
```

(`LearningRecord`, `learning-strategy-engine/src/learningRecord.js`; `MarketingInsight`, `marketing-intelligence-engine/src/marketingInsight.js`; ambos ya persistidos en el store compartido `performance-learning-intelligence/src/store.js`, consumido vía `content-strategy/src/performanceLearningStoreInstance.js`). **Ninguno de estos archivos se modificó.**

Lo que **no existía en ningún punto del repo**: un puente que correlacione esa cadena de desempeño propio con la inteligencia de mercado externa (`marketingIntelligence/`, poblada por `last30days` en fases anteriores). Confirmado por grep cruzado: cero referencias en ambas direcciones antes de esta tarea. Ese es exactamente el vacío que `content-orchestrator/src/learningLoop/` llena — no reemplaza `LearningRecord`, lo **consume por id** (`performanceIds`), igual que `strategyContext.js` ya consume `StrategyDecision`/`StrategyFeedback` por id sin duplicarlos.

**Vocabulario deliberadamente distinto:** `LEARNING_TYPES` de `learning-strategy-engine/` (`CONTENT_LEARNING`, `FORMAT_LEARNING`, etc.) es analítico/orientado a performance. `CREATIVE_LEARNING_TYPES` de este módulo (`HOOK_LEARNING`, `ANGLE_LEARNING`, `STRUCTURE_LEARNING`, etc. — los 12 exactos del encargo) es orientado a estrategia creativa. Un mapeo documentado y auditable (`refreshLearnings.js#PERFORMANCE_TYPE_MAP`) traduce entre ambos.

---

## 2. Entidad `Learning`

`content-orchestrator/src/learningLoop/schema.js#createLearning()`. Campos: `id, title, description, learningType, sourceTypes[], combinedSourceType, signalIds[], performanceIds[], contentIds[], publicationIds[], attributionIds[], scopeType, productId, category, audience, evidenceLevel, confidence, evidenceCount, supportingRuns, impact, relevance, creativeImplication, status, contradicts[], contradictedBy[], fingerprint, createdAt, updatedAt`.

Lanza si `title`/`creativeImplication` faltan, o si **ninguna** lista de evidencia tiene al menos un elemento — nunca existe un Learning huérfano.

### Confidence / evidenceLevel — reutilizados, nunca inventados
`evidenceLevel` reutiliza literalmente `EVIDENCE_LEVELS` y `confidenceFromEvidenceLevel()` de `marketingIntelligence/schema.js` (mismo mapeo fijo: HIGH=0.8, MEDIUM-HIGH=0.65, MEDIUM=0.5, LOW-MEDIUM=0.35, LOW=0.2). Para traducir el `confidence` de 4 niveles de `learning-strategy-engine/marketing-intelligence-engine` (HIGH/MEDIUM/LOW/UNKNOWN) al de 5 niveles de este módulo, `evidenceLevelFromMarketingConfidence()` usa un mapeo fijo y **conservador**: `UNKNOWN → LOW` (nunca se traduce ausencia de evidencia real a algo mejor que el nivel más bajo).

### Combinación de evidenceLevel (sección 9 del encargo)
`combineEvidenceLevels(levelA, levelB)`: cuando un Learning tiene evidencia MARKET **y** PERFORMANCE independientes, el `evidenceLevel` combinado sube **un solo escalón** por encima del mejor de los dos insumos — nunca fabrica una certeza absoluta, nunca combina más de un nivel.

### No causalidad (secciones 9-10)
`buildCreativeImplication()` es una plantilla determinista (nunca LLM) que siempre usa "la evidencia sugiere"/"asociado con" — nunca "causó"/"probó que". `LearningRecord` de origen ya tiene su propio guard de lenguaje causal (`assertNoCausalLanguage`, `learning-strategy-engine/src/learningRecord.js`) — este módulo hereda esa disciplina, nunca la relaja.

---

## 3. Correlación MARKET + PERFORMANCE (sección 9) — `refreshLearnings.js`

1. **Candidatos MARKET**: se leen señales del snapshot de mercado más reciente vía `marketingIntelligence/queryService.js#getMarketingIntelligence()` (`HookPattern→HOOK_LEARNING`, `CreativeAngleSignal→ANGLE_LEARNING`, `AudienceSignal→AUDIENCE_LEARNING`, `Objection→OBJECTION_LEARNING`, `ContentPattern→` clasificado por keywords en `FORMAT_LEARNING`/`TIMING_LEARNING`/`STRUCTURE_LEARNING`/`CONTENT_LEARNING`, `PurchaseTrigger→CTA_LEARNING` solo si menciona CTA/WhatsApp/compra, `PainPoint`/`DesireSignal`/`TrendSignal`→`PRODUCT_LEARNING` solo con producto/categoría real, `CreativeOpportunity→CREATIVE_LEARNING`).
2. **Candidatos PERFORMANCE**: se leen `LearningRecord` reales vía `learning-strategy-engine/src/learningService.js#listLearningRecords()`, traducidos por `PERFORMANCE_TYPE_MAP` (`DATA_QUALITY_LEARNING` excluido a propósito: es señal sobre la calidad del propio pipeline de datos, no implicación creativa).
3. **Correlación**: para cada candidato MARKET, se buscan candidatos PERFORMANCE del mismo `learningType` + mismo scope (mismo `productId`, o misma categoría, o ambos `GENERAL`) + solapamiento real de tokens del patrón. Si coincide y la polaridad (positiva/negativa, detectada por keywords) es compatible, se fusionan en un candidato `COMBINED` con evidencia de ambas fuentes.
4. **Contradicción** (sección 17, 63): si la polaridad es opuesta, **no se fusionan** — se registran como par contradictorio, ambos se conservan (nunca se elimina ninguno).

**Traducción slug ↔ nombreComercial**: `LearningRecord.product` siempre guarda el nombre comercial real (ej. "Divina Venus Capsules"), `marketingIntelligence/` siempre guarda el slug (`venus-capsules`) — mismo problema que `strategyContext.js` ya resolvió una vez. `refreshLearnings.js` construye el mapeo inverso una sola vez, perezosamente, desde hechos reales de `productMatcher.js` (nunca una tabla inventada a mano).

### Estado real del entorno (documentado, no idealizado)
`learning-strategy-engine/` hoy solo tiene confidence MEDIUM/UNKNOWN (nunca HIGH/LOW reales) y `attribution-engine/` está 100% en `UNKNOWN` (sin revenue real) — la mayoría de los Learning producidos hoy son MARKET-only o PERFORMANCE-only, `PRELIMINARY`. Es correcto y honesto, no un defecto: el mecanismo de correlación está listo para cuando exista más evidencia propia real. Verificado con un caso de correlación real construido deliberadamente en tests (ver sección 8).

---

## 4. Deduplicación, refuerzo, contradicción, staleness

### Fingerprint (sección 50)
`computeLearningFingerprint()`: hash de `learningType + scopeType + productId/category/audience + tokens normalizados del patrón`. El mismo learning real encontrado dos veces produce el mismo fingerprint.

### Idempotencia real (sección 49, 68)
`upsertLearning()` en `learningStore.js`: si el fingerprint ya existe, se compara la evidencia entrante contra la ya registrada — si **toda** la evidencia nueva ya estaba presente, es un no-op exacto (mismo `evidenceCount`, mismo `updatedAt`). Solo se refuerza (`evidenceCount++`, `supportingRuns++`) cuando llega evidencia **genuinamente nueva**. Ejecutar `refreshLearnings()` dos veces seguidas sobre el mismo estado produce el mismo `learningCount`/`recommendationCount` — verificado por test.

### Contradicción (sección 17, 51)
`markContradiction()`: bidireccional, nunca elimina, solo agrega referencia cruzada (`contradictedBy`). También idempotente: un par ya marcado no se vuelve a contar en `contradictionsDetected` en una corrida posterior sin cambios.

### Freshness / staleness (sección 18)
`learningRanking.js#classifyLearningFreshness()`: `ACTIVE` (≤60 días desde `updatedAt`) / `STALE` (≤180 días) / `ARCHIVED` (más). Nunca borra — solo clasifica y penaliza en el ranking.

### MIN_LEARNING_SAMPLE (sección 14)
Centralizado en `schema.js`: `MIN_LEARNING_SAMPLE = 2`. Un Learning con `evidenceCount < 2` queda `PRELIMINARY`; al alcanzar 2 pasa a `CONFIRMED` automáticamente (nunca se "fuerza" con una sola pieza de evidencia).

---

## 5. Ranking — `learningScore`, separado de `intelligenceScore`

`learningRanking.js#computeLearningScore()`. Pesos centralizados en `LEARNING_RANKING_CONFIG` (relevance 0.25, confidence 0.25, recency 0.15, evidenceCount 0.15, performanceSupport 0.10, marketSupport 0.10) — **un único archivo**, nunca repartidos. **Nunca reemplaza** `intelligenceScore` de `marketingIntelligence/ranking.js` — mide una cosa distinta: qué tan útil es un Learning **ya correlacionado** para una consulta dada, no la calidad de una señal individual.

---

## 6. `CreativeRecommendation`

`schema.js#createCreativeRecommendation()`: `learningIds[], productId, audience, angle, hookPattern, structurePattern, contentPattern, evidenceLevel, confidence, rationale, priority`. Lanza sin `learningIds` reales — nunca huérfana. Se generan automáticamente en `refreshLearnings()` solo para Learnings `CONFIRMED` de tipos elegibles (`HOOK_LEARNING`, `ANGLE_LEARNING`, `STRUCTURE_LEARNING`, `CREATIVE_LEARNING`, `CONTENT_LEARNING`) — `angle`/`hookPattern`/`structurePattern`/`contentPattern` son **etiquetas** (el título ya-parafraseado del Learning), nunca copy final ni texto externo literal (sección 33: "NO copiar el texto original").

---

## 7. Query API (interna, sin HTTP — sección 45)

```js
import { getRelevantLearnings, getCreativeRecommendations, getValidatedLearningContext, refreshLearnings } from 'content-orchestrator/src/learningLoop/queryService.js';

refreshLearnings({ marketingSnapshotId, performanceStore });  // analiza datos ya persistidos, nunca last30days
getRelevantLearnings({ productId, audience, category, learningType, limit });
getCreativeRecommendations({ productId, audience, limit });
getValidatedLearningContext({ productId, audience, category, limit });  // SOLO CONFIRMED + ACTIVE + compatibles
```

Ninguna de estas funciones ejecuta `last30days`, `WebSearch` ni ninguna llamada externa — solo leen `content-orchestrator/data/learning-loop/` (gitignored, regenerable con `refreshLearnings()`) y los stores ya persistidos de `learning-strategy-engine/`/`performance-learning-intelligence/`. Verificado por escaneo de fuente en tests (sección 47, 67).

---

## 8. Integración con Creative Strategy — `validatedLearningContext`

`content-orchestrator/src/creativeIntelligenceContext.js` (construido en la integración anterior) se **extendió**, no se duplicó: `buildCreativeIntelligenceContext()` ahora incluye un campo nuevo `validatedLearningContext` (secciones 23-24), calculado internamente vía `getValidatedLearningContext()` — solo Learnings `CONFIRMED`, `ACTIVE`, compatibles con `productId`/`audience`/`category`. Nunca lanza (envuelto en `safeGetValidatedLearningContext()`), nunca bloquea el resto del contexto de mercado si el Learning Loop falla.

`autonomousCreate.js#buildCreativeProposal` sigue exponiendo esto sin cambios adicionales — ya incluye `creativeIntelligenceContext` completo (incluido `validatedLearningContext`) bajo el campo `marketingIntelligenceContext` de la propuesta, desde la integración anterior.

### Prioridad de conflicto (sección 22, mismo orden ya documentado en la integración anterior)
```
Claim Safety > Product Knowledge > User Instruction > Campaign Context > Learning > Default
```
Estructuralmente garantizado: `validatedLearningContext` **nunca** se pasa a `copyProvider.generate()` — solo se adjunta al resultado para trazabilidad/explicabilidad, igual que el resto de `creativeIntelligenceContext`.

---

## 9. Caso de correlación real verificado (Venus)

Construido deliberadamente en tests (`test/learningLoop.test.js`) para demostrar el mecanismo con datos controlados, dado que la evidencia real hoy es demasiado escasa para producir un `COMBINED_LEARNING` de forma natural:

1. Señal de mercado sintética: `PainPoint`, `productId: 'venus-capsules'`, "Rutina matutina funciona mejor para energía sostenida".
2. `LearningRecord` sintético: `PRODUCT_LEARNING`, `product: 'Divina Venus Capsules'`, patrón "rutina matutina energía sostenida" (tokens solapados).
3. `refreshLearnings()` los fusiona en un `Learning` `COMBINED` con `evidenceLevel` superior a cualquiera de los dos insumos por separado, `sourceTypes: ['MARKET', 'PERFORMANCE']`.
4. Un tercer `LearningRecord` sintético (mismo scope/patrón, polaridad "escepticismo") se registra como **contradicción** contra la señal de mercado — ambos se conservan, marcados `CONTRADICTED`.

---

## 10. Governance — invariantes verificadas por test

- Ningún `Learning`/`CreativeRecommendation` tiene campo `claim`/`approvedClaim`.
- Un `Learning` real que menciona "testosterona" (palabra literal en `FORBIDDEN_PRODUCT_CLAIMS`) llega al sistema como dato, pero es bloqueado por el gate existente (`hyperframesRenderer.js`, sin modificar) si se intentara usar como claim.
- `productId` de Venus nunca contamina Tongkat Ali y viceversa (verificado con datos reales de ambos productos).
- Todo Learning es trazable: `source → signal/performance/attribution → evidence`.
- `refreshLearnings()` nunca escribe en el store compartido de `performance-learning-intelligence/` — solo lee (verificado comparando el directorio antes/después).

---

## Confirmación

- **last30days executed in this task:** NO
- **external research executed in this task:** NO
- **new snapshot created:** NO — `refreshLearnings()` opera sobre `snapshot-2026-08-31` (marketingIntelligence) y los `LearningRecord`/`MarketingInsight`/`AttributionRecord` ya persistidos; produce su propio `learningSnapshotId` (`learning-loop-v1`, `v2`, ...) como versión monotónica del **estado correlacionado**, no como una nueva investigación.

*No se modificó `docs/productos/`, Claim Safety, `marketing-intelligence/`, `marketing-intelligence-engine/`, `learning-strategy-engine/`, `strategy-decision-engine/`, `attribution-engine/`, `content-strategy/`, ni la skill `last30days`. Creative Director, Hook Intelligence, Claim Relevance, Creative Structure y Visual Scene Brief quedaron intactos — `validatedLearningContext` es información disponible para una fase futura, no una conexión activa hoy.*
