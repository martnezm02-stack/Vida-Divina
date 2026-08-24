# Checkpoint — Persistencia de Production Artifacts y Visual Production Packages

**Fecha:** 2026-08-17. Continúa directamente desde `docs/PROJECT_STATE_CHECKPOINT_2026-08-17_CONTENT_ORCHESTRATOR.md` (cierre previo, `PHASE_STATUS = CLOSED`).

> Convención: **[VERIFICADO]** = comando/prueba re-ejecutado en esta sesión con evidencia real. **[REPORTADO]** = afirmación no re-verificada literalmente en esta sesión (no aplica en este checkpoint — todo lo de abajo fue verificado).

## 1. Estado previo

Al cierre de la fase anterior existían: Creative Intelligence completo, Content Request, Content Orchestrator, Campaign Mode, Direct Instruction Mode, Asset Package, Brand Visual System, Output Profiles (13, multiplataforma), PostProduction (`local_ffmpeg`), y Graft en modo estructural-local (`graft/`, `scripts` en `package.json` raíz, `docs/GRAFT_CONTEXT_WORKFLOW.md`) — construido entre la fase anterior y esta, confirmado real por inspección directa al inicio de esta sesión.

**Limitación identificada y ahora resuelta:** `ProductionArtifact` y `VisualProductionPackage` no tenían persistencia propia — solo vivían en memoria del proceso que los creaba.

## 2. Orientación con Graft — [VERIFICADO]

`npm run graft:check` → `graph check: OK` (grafo ya sincronizado antes de tocar código). `npx @nanonets/graft callers createProductionArtifact` y `callers createVisualProductionPackage` confirmaron que **ningún módulo del repositorio los llamaba salvo sus propios tests** — no existía ninguna implementación parcial de store que reutilizar. Confirmado además con `grep` estructural (`ProductionArtifactStore|VisualProductionPackageStore`) — cero resultados salvo el checkpoint anterior, que solo lo mencionaba como trabajo futuro documentado.

Modo usado: **estructural/local únicamente** (`graft:build`, `graft:check`, `graft callers`, `graft skeleton`). No se ejecutó `graft init`, `graft build --deep`, ni nada que requiera `GRAFT_API_KEY` o MCP.

## 3. ProductionArtifactStore

**Archivo:** `creative-intelligence/production/productionArtifactStore.js`.

Mismo patrón que `orchestrator/cycleStore.js` (reutilizado, no reinventado): identity-addressed por `productionArtifactId` (el UUID real ya generado por `createProductionArtifact()` — el store nunca genera uno nuevo), inmutable una vez guardado (escritura exclusiva `wx`), `DATA_ROOT` **importado directamente de `cycleStore.js`** (no reimplementado). Persiste en `creative-intelligence/data/productionArtifacts/<id>.json`.

Contrato: `saveProductionArtifact`, `getProductionArtifact`, `productionArtifactExists`, `listProductionArtifacts`, `deleteProductionArtifact`. Sin `update` — el modelo de dominio actual no define ninguna transición de estado real sobre un `ProductionArtifact` ya construido (siempre `DRAFT_FOR_REVIEW`, sin función `approve()`/similar en el código), así que agregar `update` habría sido una operación inventada sin caso de uso real. `delete` sí se incluyó (a diferencia de `cycleStore`, que no lo tiene): un borrador de producción es legítimamente descartable por un humano, a diferencia de un ciclo estratégico histórico.

Validación en `save`: estructural únicamente (forma real del objeto — `productionArtifactId`, `status === 'DRAFT_FOR_REVIEW'`, `creativeCellCandidateId`, `hypothesisRef`, `variants.length >= 2`), nunca reglas de compliance — esas ya corrieron una vez dentro de `createProductionArtifact()` sobre un objeto que llega aquí ya congelado (mismo criterio que `cycleOutput.schema.js` separa `createCycleOutput` de `validateCycleOutput`/`assertValidShape`).

## 4. VisualProductionPackageStore

**Archivo:** `creative-intelligence/production/visualProductionPackageStore.js`. Mismo patrón, identity-addressed por `visualProductionPackageId`, persiste en `creative-intelligence/data/visualProductionPackages/<id>.json`.

**Trazabilidad real, no solo declarada:** `saveVisualProductionPackage()` verifica que el `productionArtifactId` referenciado exista realmente en `productionArtifactStore` — si no, lanza "relación rota" (mismo espíritu que `resolveRef()` en `cycleOrchestrator.js`). Confirmado con test: guardar un paquete cuyo artifact nunca se persistió falla explícitamente.

Contrato: `saveVisualProductionPackage`, `getVisualProductionPackage`, `visualProductionPackageExists`, `listVisualProductionPackages`, `deleteVisualProductionPackage`, y `listVisualProductionPackagesByProductionArtifact` (proyección de trazabilidad inversa, no un store nuevo).

## 5. Formato y ubicación de almacenamiento — [VERIFICADO]

JSON plano en filesystem, mismo patrón ya usado por `cycleStore.js` — **no se introdujo PostgreSQL ni ninguna base de datos nueva**. Local, determinista, recuperable, versionable (archivos de texto), fácil de inspeccionar (`cat`/editor). Ambos directorios comparten `DATA_ROOT` con los ciclos, bajo `creative-intelligence/data/`.

## 6. Integración con Content Orchestrator — [VERIFICADO]

`content-orchestrator/src/contentOrchestrator.js`:
- Nueva función `persistProductionAssets({ productionArtifact, visualProductionPackage })` — persiste los objetos reales si se proveen; idempotente (si el id ya existe, reporta `alreadyExisted: true` en vez de lanzar).
- `renderAndPostProduce()` extendido con parámetros opcionales `productionArtifact`/`visualProductionPackage`: si se proveen, se persisten y sus ids reales (no un string aparte) viajan al render; si no se proveen (ej. Direct Instruction Mode, que nunca pasa por Creative Intelligence), el comportamiento previo se conserva exactamente igual — verificado: los 10 tests preexistentes de `contentOrchestrator.test.js` (que no pasan estos objetos) siguen pasando sin cambios.
- Campaign Mode y Direct Instruction Mode **no fueron modificados** — la conexión ocurre enteramente en `contentOrchestrator.js`, el coordinador.

## 7. Trazabilidad — [VERIFICADO]

Cadena real probada de punta a punta: CreativeCell (ya real, de un ciclo persistido) → `hypothesisRef` → `ProductionArtifact` (con `creativeCellCandidateId`) → `VisualProductionPackage` (con `productionArtifactId`) → Store → recuperación. Ningún campo se pierde: `deepEqual` exacto entre el objeto original y el recuperado, en todos los tests. `listVisualProductionPackagesByProductionArtifact()` confirma la relación inversa real.

## 8. Idempotencia — [VERIFICADO]

Un segundo `save` con el mismo id lanza explícitamente (`ya existe... son inmutables`), nunca crea un segundo archivo ni sobrescribe — confirmado contando archivos en disco tras el intento fallido. `persistProductionAssets()` (capa de integración) trata esto como caso esperado, no como error: reporta `alreadyExisted: true`.

## 9. Pruebas unitarias — [VERIFICADO]

`creative-intelligence/test/productionArtifactStore.test.js` (11 tests) y `visualProductionPackageStore.test.js` (9 tests): create, get, exists, list, delete, idempotencia, objeto inexistente, integridad de datos, trazabilidad rota. Todos en directorio temporal aislado (`CREATIVE_INTELLIGENCE_DATA_ROOT`), nunca tocan `creative-intelligence/data/` real.

## 10. Pruebas de integración — [VERIFICADO]

`creative-intelligence/test/visualProductionPackageStore.test.js` incluye la cadena completa ProductionArtifact→Store→VisualProductionPackage→Store→recuperación. `content-orchestrator/test/productionStoresIntegration.test.js` (4 tests) prueba `persistProductionAssets()` y `renderAndPostProduce()` con objetos reales, incluyendo un render HyperFrames real completo con persistencia real de ambos objetos.

## 11. Prueba real de persistencia + recuperación entre procesos — [VERIFICADO]

`creative-intelligence/test/real-cross-process-recovery-demo-write.mjs` (Proceso A, `node` independiente) crea y guarda un ProductionArtifact + VisualProductionPackage reales en el `data/` **real** del paquete (sin aislar directorio) y escribe un marcador. `real-cross-process-recovery-demo-read.mjs` (Proceso B, **segundo proceso `node` separado**, sin memoria compartida) lee el marcador y recupera ambos objetos desde disco. Resultado real obtenido en esta sesión: **6/6 verificaciones PASS** (ids, `hook.text`, `createdAt`, `voiceover` completo, referencia cruzada). Limpieza real confirmada: ambos directorios de datos quedaron vacíos tras el borrado (`deleteProductionArtifact`/`deleteVisualProductionPackage`).

## 12. Archivos creados

```
creative-intelligence/production/productionArtifactStore.js
creative-intelligence/production/visualProductionPackageStore.js
creative-intelligence/test/productionArtifactStore.test.js
creative-intelligence/test/visualProductionPackageStore.test.js
creative-intelligence/test/real-cross-process-recovery-demo-write.mjs
creative-intelligence/test/real-cross-process-recovery-demo-read.mjs
content-orchestrator/test/productionStoresIntegration.test.js
docs/PROJECT_STATE_CHECKPOINT_2026-08-17_PRODUCTION_STORES.md (este archivo)
```

## 13. Archivos modificados

```
content-orchestrator/src/contentOrchestrator.js — +persistProductionAssets(), renderAndPostProduce() extendido (parámetros opcionales, retrocompatible)
```

## 14. Tests — antes / nuevos / total — [VERIFICADO, re-ejecutado en esta sesión]

| Suite | Antes de esta fase | Nuevos | Total ahora |
|---|---|---|---|
| `creative-intelligence` | 389 | +20 | **409** |
| `content-orchestrator` | 74 | +4 | **78** |
| `video-production` | 30 | +0 | **30** |
| `tts-text-preprocessor` | 49 | +0 | **49** |
| **TOTAL** | 542 | +24 | **566** |

0 fail en las 4 suites.

## 15. Checkpoint

Este documento. Distingue explícitamente lo verificado en esta sesión (todo el contenido de arriba) — no se reporta nada sin haberlo corrido.

## 16. Limitaciones

1. **Sin `update`** — deliberado, el modelo de dominio no define ninguna transición de estado real todavía (ver sección 3).
2. **La integración con Content Orchestrator es aditiva, no obligatoria** — Campaign Mode sigue sin construir automáticamente un `ProductionArtifact`/`VisualProductionPackage` real (sigue exigiendo copy explícito, sin cambios esta fase); la persistencia solo se activa si el llamador provee esos objetos.
3. **Sin límite de retención ni compactación** — igual que `cycleStore.js`, no hay política de archivado; queda fuera de alcance.
4. Content Generation Engine, copy autónomo, `graft --deep`, MCP, hooks, Meta, WhatsApp, CRM — **no iniciados**, según lo pedido.

## 17. Siguiente fase (documentada, no implementada)

Content Generation Engine — construir sobre ProductionArtifactStore/VisualProductionPackageStore ya reales para permitir que Campaign Mode recupere paquetes ya aprobados entre sesiones sin volver a pedir el copy cada vez.

---

```
GRAFT_USED_FOR_ORIENTATION = YES
GRAFT_MODE = STRUCTURAL_LOCAL_ONLY
PHASE_STATUS = CLOSED
```
