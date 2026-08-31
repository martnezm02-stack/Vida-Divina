# Vida Divina — Integración Marketing Intelligence → Creative Strategy

**Fecha:** 31 de agosto de 2026
**Alcance:** puente controlado entre la inteligencia de mercado ya almacenada (`snapshot-2026-08-31`, commits `f2e9507` y `bf73a13`) y el Creative Pipeline existente (Creative Director, `autonomousCreate.js`). **No se ejecutó ninguna investigación externa en esta tarea** — ver "Confirmación" al final.

---

## 1. Principio fundamental

> Marketing Intelligence es una **INPUT STRATEGIC SIGNAL**, nunca una **COPY SOURCE** ni una **CLAIM AUTHORITY**.

Esta integración **nunca genera** directamente claims, hooks finales, scripts finales, prompts finales, ni decisiones médicas/regulatorias. Solo selecciona y compacta señales **ya almacenadas y ya evidenciadas** para que el pipeline creativo las pueda **consultar** — la generación real de copy sigue viniendo exclusivamente de `productFacts` (Product Knowledge) vía Claim Relevance/Claim Safety, sin cambios.

---

## 2. Context Builder

`content-orchestrator/src/creativeIntelligenceContext.js` — `buildCreativeIntelligenceContext({ productId, audience, category, userInstruction, primaryAngle, secondaryAngle, snapshotId })`.

Mismo criterio que el precedente ya existente en el repo, `strategyContext.js` (`content-orchestrator/src/strategyContext.js`): una capa **pequeña, ADITIVA y OPCIONAL** que solo lee lo ya persistido (aquí, `marketingIntelligence/queryService.js` — síncrono, sin red) y nunca lanza por ausencia de datos (`applied:false` es un resultado válido).

```js
import { buildCreativeIntelligenceContext } from 'content-orchestrator/src/creativeIntelligenceContext.js';
const ctx = buildCreativeIntelligenceContext({ productId: 'venus-capsules', audience: 'mujeres-bienestar-hormonal' });
```

### Forma del contexto (encargo §4)

```js
{
  applied, product, audience, category, snapshotId, intelligenceVersion, generatedAt,
  trends, pains, desires, objections, hookPatterns, contentPatterns,
  competitorSignals, creatorSignals, purchaseTriggers, regulatoryRisks,
  creativeOpportunities, confidence, sources,
}
```

Cada señal dentro de un bucket es una **proyección compacta** (nunca el registro completo del store): `signalId, type, title, source, sourceUrl, rawReference, evidenceLevel, confidence, claimType, productFit, whyItMatters, intelligenceScore, relevanceToCampaign, creativeContextScore`. Nunca incluye un campo `claim`/`approvedClaim` — verificado por test.

---

## 3. Ranking — reutilizado, nunca duplicado (encargo §7)

`intelligenceScore` (calidad/ranking de la señal en abstracto) viene **sin cambios** de `marketingIntelligence/ranking.js` (Fase MVP) — este puente **nunca lo recalcula**. Se añade un segundo score, **deliberadamente separado** (encargo §37):

- **`relevanceToCampaign`** (0–1) — qué tan útil es esa señal para ESTA campaña concreta. Determinista: base 0.5 (ya pasó el filtro de `productFit`) + 0.3 si `audience` coincide exactamente + 0.1 si `category` coincide + 0.1 si el ángulo (`primaryAngle`/`secondaryAngle`) comparte palabras con el título/tags/categoría de la señal + 0.05 si `userInstruction` comparte palabras con el título/observación. Guard de género: si campaña y señal tienen audiencia explícitamente opuesta (`mujeres-...` vs `hombres-...`), `relevanceToCampaign = 0` (exclusión dura).
- **`creativeContextScore`** — score de selección de contexto ÚNICAMENTE, `relevanceToCampaign×0.6 + intelligenceScore×0.4` (pesos centralizados en `CREATIVE_INTELLIGENCE_CONFIG`, un único archivo). Se usa para ordenar y truncar — **nunca sobrescribe** `intelligenceScore` en el objeto devuelto.

### Product Fit — prioridad DIRECT_PRODUCT > CATEGORY > GENERAL (encargo §5)

Reutiliza `marketingIntelligence/ranking.js#determineProductFit` sin reimplementarlo. Una señal de `cafe-divina` nunca aparece en un contexto de `venus-capsules` (categoría distinta); señales transversales (regulatorio, marca, patrones de hook/contenido genéricos) sí aparecen como `GENERAL`, con menor peso.

### Audience Fit — guard de género (encargo §6)

Solo actúa cuando **ambos lados** están explícitamente clasificados por género en el vocabulario del schema (`mujeres-.../hombres-...`) — nunca adivina género de texto libre, nunca excluye por ausencia de dato. Durante esta integración se descubrió y corrigió una fuga real: 4 `CreatorSignal` (Oso Trava, Dr. Luis Gutierrez, @xiomisamaniego95, @yenygarcia00) tenían nicho explícitamente de un género en su descripción pero sin campo `audience` estructurado — se corrigió en `seedData/snapshot-2026-08-31.js` (dato real, no inventado: el género ya estaba documentado en el reporte de investigación, solo faltaba estructurarlo).

### Límite y umbral (encargo §10, §11)

Centralizados en `CREATIVE_INTELLIGENCE_CONFIG`: `maxPerBucket: 5`, `relevanceThreshold: 0.35`. Nunca se devuelven las 105 señales completas — verificado por test (`ctx` total < 105, cada bucket ≤ 5).

---

## 4. Claim Safety — muro infranqueable (encargo §13, §14)

Este puente **nunca toca** `video-production/src/hyperframesRenderer.js` (`FORBIDDEN_PRODUCT_CLAIMS`, `assertNoForbiddenProductClaims`) ni `content-orchestrator/src/brandVisualSystem.js` (`BRAND_AVOID`, `assertBrandAvoidCompliance`). El flujo correcto se mantiene intacto:

```
Market Signal → creativeIntelligenceContext (esta integración) → [Claim Relevance + Claim Safety, sin cambios] → contenido aprobado
```

**Caso real verificado por test:** el dataset curado contiene una señal real que menciona "testosterona" (`competitorSignals`, patrón viral de Tongkat Ali). `"testosterona"` está literalmente en `FORBIDDEN_PRODUCT_CLAIMS`. El test confirma: (1) la señal SÍ llega al `creativeIntelligenceContext` (es información de mercado real, útil para saber qué NO imitar), (2) si ese texto se intentara usar como claim, `assertNoForbiddenProductClaims` (gate existente, sin modificar) lo **bloquea** con una excepción real.

---

## 5. Prioridad de conflicto (encargo §19, §34, §35)

```js
export const CREATIVE_CONTEXT_PRIORITY_ORDER = [
  'CLAIM_SAFETY', 'PRODUCT_KNOWLEDGE', 'USER_INSTRUCTION', 'CAMPAIGN_CONTEXT', 'CREATIVE_INTELLIGENCE', 'DEFAULTS',
];
```

Documental y estructuralmente garantizado por diseño, no por una función de "resolución de conflicto" que reinterprete texto: `creativeIntelligenceContext` **nunca se pasa** a `copyProvider.generate()` (la función que sí genera copy/hook/script), así que no puede sobrescribir `userInstruction` — no porque algo lo "detecte y descarte" en tiempo de ejecución, sino porque el dato nunca llega al lugar donde podría hacerlo. Verificado por test: `userIntent` se preserva byte-a-byte en `buildCreativeProposal`.

---

## 6. Wiring — dónde se conectó (encargo §22, §29)

### `autonomousCreate.js#buildCreativeProposal`
Nuevo parámetro opcional `marketingIntelligenceSnapshotId = undefined` (mismo criterio que `strategyStore` ya existente: override solo para tests/casos especiales). `marketingIntelligenceContext` se calcula una vez apenas se resuelve `productId` real, y se adjunta como campo nuevo en **los tres** desenlaces donde ya se conoce el producto: `PROPOSAL_READY`, `HYPOTHESIS_EXPERIMENT_READY` (el desenlace real más común hoy para Venus/Tongkat Ali — limitarlo solo a `PROPOSAL_READY` lo habría dejado ausente casi siempre) y `MISSING_CREATIVE_MATCH`. Sin cambios en `MISSING_PRODUCT`/`VALIDATION_FAILED` (ahí no hay producto todavía). **No** se calcula `audience` automáticamente desde `resolution.persona` — ese vocabulario (texto libre) no tiene mapeo confiable hoy al vocabulario de audiencia de `marketingIntelligence/` (slugs `mujeres-.../hombres-...`); inventar ese mapeo habría sido exactamente el tipo de relación no evidenciada que el encargo prohíbe (§18). El filtrado en este wiring automático queda en `productId`/categoría (mismo vocabulario real en ambos sistemas, confirmado con los mismos slugs de `docs/productos/`).

### `creativeDirector.js#buildVisualStrategy` / `#previewVisualRecommendation`
Nuevo parámetro opcional `creativeIntelligenceContext = null`, **pass-through puro** — este archivo nunca lo calcula ni lo interpreta, solo lo expone en la salida (mismo objeto recibido, nunca recalculado) para trazabilidad/explicabilidad. Nunca escribe en `visualPrompt`/`generatedPrompt` — Visual Scene Brief sigue siendo la única fuente estructurada de eso, sin cambios.

### Qué **no** se tocó (deliberadamente, encargo §15-18)
`creativeAngleSelector.js`, `hookIntelligence.js`, `creativeStructureEngine.js`, `visualSceneBrief.js`, `hypothesisCopyProvider.js` (generación real de copy vía LLM) — **ninguno fue modificado**. El encargo repite en varias secciones "sigue siendo responsable"/"no sustituirlo" para cada uno de estos sistemas; tocarlos habría significado reimplementar lógica de selección ya probada y tested, con riesgo real de regresión, fuera del alcance declarado ("no rehacer estos sistemas"). El `creativeIntelligenceContext` queda disponible como señal consultable para una fase futura que sí quiera usarlo para nudgear esos selectores — ver sección 9.

---

## 7. Snapshot y reproducibilidad (encargo §53, §54, §55)

`snapshotId` se conserva en el contexto devuelto (`ctx.snapshotId`, ej. `"snapshot-2026-08-31"`). `intelligenceVersion` (`"1.0.0"`, `CREATIVE_INTELLIGENCE_VERSION`) versiona el schema de **este puente**, independiente de la versión del snapshot de datos — permite en el futuro cambiar el algoritmo de ranking del puente sin romper la interpretación de propuestas históricas. Determinismo verificado por test: mismos inputs + mismo snapshot → mismos `signalIds` en el mismo orden, en corridas repetidas.

---

## 8. Explainability (encargo §50-52)

`creativeIntelligenceContext` está diseñado para responder, con lenguaje de PATRÓN, nunca de atribución literal a una publicación externa:

> ✅ "Patrón detectado: preguntas directas muestran alta señal." (`hookPatterns[0].whyItMatters`)
> ❌ "Tu hook fue generado por esta publicación externa." — nunca se construye este tipo de frase; no existe ningún campo que vincule un hook FINAL generado a una `rawReference` externa (el copy real no consume `creativeIntelligenceContext` en absoluto, ver sección 6).

No se construyó un dashboard nuevo ni una vista nueva en `dashboard/` para esta integración específica — sección 9 explica por qué y qué extensión futura lo haría natural.

---

## 9. Extensión futura (NO implementada aquí)

- **Nudging de selección** (encargo §30-33): `selectCreativeAngle`/`selectHook`/`recommendStructure` podrían, en una fase futura, aceptar `creativeIntelligenceContext` como señal adicional de scoring (ej. dar un pequeño bonus determinista a un candidato QUESTION-hook si `hookPatterns` marca ese patrón como alta señal) — sin nunca inventar un candidato nuevo ni copiar texto externo. No implementado en esta fase por el riesgo de regresión en selectores ya probados, fuera del alcance declarado.
- **Mapeo audience real ↔ slug de marketingIntelligence/**: hoy `resolution.persona`/`campaignIntent.targetAudience` (texto libre) y los slugs `mujeres-.../hombres-...` de `marketingIntelligence/` son vocabularios distintos sin traducción confiable. Una fase futura podría construir ese mapeo explícito (con revisión humana, no automático) para permitir audience-fit automático en `buildCreativeProposal`.
- **Vista mínima en Dashboard**: el `dashboard/` existente es una SPA de un solo archivo grande (`public/app.js`) — agregar una vista de "Inteligencia utilizada" (top signals/opportunities/confidence, sin las 105 señales completas) es viable pero requiere editar ese archivo compartido; se dejó fuera de esta integración por el mismo criterio de riesgo/beneficio ya documentado en `docs/research/marketing-intelligence-mvp.md` sección 8.
- **Snapshot refresh**: cuando exista un `snapshot-YYYY-MM-DD` más reciente, `buildCreativeIntelligenceContext` ya lo usaría automáticamente sin cambios de código (resuelve el snapshot más reciente por defecto) — la única pieza faltante es el script de ingesta de ese nuevo snapshot, explícitamente fuera de alcance de esta tarea.

---

## 10. Governance — invariantes verificadas por test

- `claimType` nunca se degrada ni asciende (se preserva del store, sección `TEST GOVERNANCE`).
- `confidence` nunca se recalcula — mismo valor fijo de `schema.js` en todo el pipeline (Fase 1 → MVP → este puente).
- Ninguna señal produce un campo `claim`/`approvedClaim`.
- Toda señal usada es trazable: `signalId → source → rawReference` (verificado que cada `rawReference` apunta al reporte real).
- `CatalogDiscrepancy` y `RegulatoryRisk` siguen consultables tal cual (aunque no forman parte de los 10 buckets del contrato conceptual §4 — `CatalogDiscrepancy` en particular es un tipo de registro, no de mercado, así que no se proyecta en `creativeIntelligenceContext`; sigue accesible vía `getProductIntelligence` directamente).

---

## Confirmación

- **last30days executed in this task:** NO
- **external research executed in this task:** NO
- **new snapshot created:** NO — todo se construye sobre `snapshot-2026-08-31`, sin modificarlo (solo se corrigió, dentro de `seedData/`, un campo `audience` faltante en 4 `CreatorSignal` cuyo género ya estaba documentado en el texto original del reporte — dato real estructurado, no una nueva investigación).

*No se modificó `docs/productos/`, Claim Safety (`FORBIDDEN_PRODUCT_CLAIMS`/`BRAND_AVOID`), `marketing-intelligence/`, `marketing-intelligence-engine/`, ni la skill `last30days`. `creativeAngleSelector.js`, `hookIntelligence.js`, `creativeStructureEngine.js` y `visualSceneBrief.js` quedaron intactos.*
