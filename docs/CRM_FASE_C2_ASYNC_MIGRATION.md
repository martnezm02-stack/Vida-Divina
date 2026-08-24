# Fase C.2 — Async Migration + CRM Context Storage

[🏠 Índice de Documentación](./PROJECT_STATE.md)

> **Estado:** Completa y validada con PostgreSQL 18.6 real. `simulator/src/contextoStorage.js` delega en `crm/index.js`; PostgreSQL es la fuente de verdad activa; JSON queda retenido como infraestructura legacy sin escrituras nuevas. 145 tests reales en verde (63 `crm/` + 31 `simulator/` + 51 `whatsapp-adapter/`), estable en múltiples corridas consecutivas.
>
> Esta fase tuvo tres sub-fases: **C.2** (intento inicial — bloqueado por incompatibilidad sync/async, documentado y no implementado), **C.2A** (auditoría de la migración async, sin código), **C.2B** (implementación, este documento).

---

## 1. Por qué existió un bloqueo (C.2 original)

`contextoStorage.js` era 100% síncrono; la API de C.1 (`crm/context/`) es necesariamente asíncrona (PostgreSQL vía `pg`). Toda la cadena real de consumidores (`flujoVentaReal.js`, `conversationRouter.js`, `main.js`) también era síncrona, y `whatsapp-adapter/test/whatsappAdapter.test.js` afirmaba esa sincronía como contrato explícito (`assert.equal(resultado instanceof Promise, false)`). Convertir solo `contextoStorage.js` sin propagar `async`/`await` hacia arriba habría roto en silencio a cada consumidor. Se detuvo esa fase y se documentó el bloqueo en vez de improvisar (dual-write, `worker_threads`+`Atomics.wait`, caché síncrona — las tres evaluadas y descartadas).

## 2. Decisiones aprobadas por el propietario (C.2A → C.2B)

1. **`whatsappAdapter.test.js:354`** — se autorizó invertir `instanceof Promise` a `true`; la protección real (ausencia de scheduler) permanece cubierta por otros tests (I/J del mismo archivo).
2. **Transacciones** — no agrupar los pasos `*Persistente` de un mismo turno en una mega-transacción; se mantiene la infraestructura de C.1 tal cual, con la ventana de concurrencia entre pasos documentada como limitación conocida.
3. **`main()` (CLI demo)** — se autorizó convertir a async verificando solo consumidores reales del repositorio (ninguno la ejecuta programáticamente).

## 3. Alcance implementado

| Archivo | Cambio |
|---|---|
| `simulator/src/contextoStorage.js` | Reescrito para delegar en `crm/index.js` (`contextExists/projectContext/persistContext/updateContext`). 4 funciones públicas ahora `async`. Infraestructura JSON legacy (`nombreDeArchivo`, `rutaContexto`, `asegurarDirectorio`) retenida como código muerto documentado, no eliminada. `CONTEXTOS_ROOT` sigue exportado. |
| `simulator/src/flujoVentaReal.js` | 10 funciones convertidas a `async` (`abrirContexto`, `cerrarContexto` privadas + 8 `*Persistente`/`registrarHandoffEnContexto`). Las 10 funciones puras (`crearContextoConversacion`, `iniciarConversacion`, etc.) sin ningún cambio. |
| `whatsapp-adapter/src/conversationRouter.js` | Las 10 funciones del archivo, `async`. Ninguna regla de decisión, mensaje comercial ni clasificación tocada. |
| `whatsapp-adapter/main.js` | `procesarEventoWebhook` y `main()` (CLI demo), `async`. |
| `whatsapp-adapter/src/httpServer.js` | 1 línea — `await` agregado antes de `procesarEventoWebhook(...)` (la función que lo envuelve, `manejarEvento`, ya era `async`). |

## 4. Hallazgos reales encontrados durante la validación (no anticipados en la auditoría C.2A, corregidos con evidencia)

La ejecución real contra PostgreSQL reveló 5 problemas genuinos — todos diagnosticados antes de corregir, ninguno oculto:

**Hallazgo 1 — `opportunities.estado` es `NOT NULL` pero el contrato permite `guardarContexto` con `productoId` sin `estado`.** Fixtures de test (llamadas directas a `guardarContexto`, fuera del flujo `*Persistente`) exponían esto — bajo JSON nunca importó porque no había constraint. Corregido en `crm/context/disassemble.js`: se usa `''` como relleno explícito (nunca un nombre de estado inventado) cuando no hay estado disponible; ese valor nunca se lee de vuelta hacia el contexto plano (no participa en `assemble.js`), así que no tiene efecto observable. Documentado como limitación de schema a revisar cuando una fase futura pueda tocar migraciones.

**Hallazgo 2 — `ultimaInteraccion` se perdía en escrituras directas.** `conversations.ultima_interaccion` es `NOT NULL DEFAULT now()`; el `UPDATE`/`INSERT` original usaba `now()` incondicional, pisando en silencio cualquier valor explícito que el llamador diera (incluido `null`, el default de `crearContextoConversacion()`). Corregido con `COALESCE($n, now())` en `crm/repositories/conversationRepository.js` (`createConversation`, `updateEstadoActual`, `touchUltimaInteraccion`), respetando el valor dado cuando existe. Cuando el valor dado es `null`, PostgreSQL sigue estampando `now()` — a diferencia de JSON, la columna no puede representar una ausencia real; los dos tests afectados se ajustaron para reflejar esto explícitamente (documentado en el propio archivo de test).

**Hallazgo 3 — Campos "transportados" (`precioUtilizado`, etc.) se perdían si no acompañaban un cambio de estado real.** Un fixture de test seteaba `precioUtilizado` sin `estado` — como esos campos solo se snapshotean en `state_transitions.metadata` cuando hay una transición real (por diseño de C.1, documentado), el valor se perdía. No es un bug de `crm/`: el fixture no era fiel a cómo el motor real siempre acompaña estos campos con un cambio de estado en la misma llamada (verificado). Se corrigió el fixture del test, no `crm/`.

**Hallazgo 4 — Condición de carrera de `pool.end()` entre archivos de test.** `node --test` corre cada archivo en un subproceso distinto; con dos archivos escribiendo a la misma base de test sin coordinación, el segundo veía residuos del primero. Corregido agregando `resetDatabase()` en un `before()` de cada archivo + ejecución con `--test-concurrency=1` (mismo patrón que Fase B).

**Hallazgo 5 — El proceso de test no terminaba (colgado).** `contextoStorage.js` usa el pool de `crm/index.js` (`DATABASE_URL`); el helper de test usa un pool *distinto* (`TEST_DATABASE_URL`) — aunque ambas variables apuntaran a la misma base en esta corrida, son dos objetos `pg.Pool` separados. Cerrar solo uno dejaba conexiones inactivas vivas indefinidamente. Corregido cerrando ambos pools explícitamente en cada `after()`.

**Hallazgo 6 — `whatsappAdapter.test.js`, "Revisión funcional D" dependía del mecanismo de archivo** (comparaba `fs.readdirSync(CONTEXTOS_ROOT)` antes/después). No estaba nombrado explícitamente en las Decisiones aprobadas, pero es de la misma categoría ya documentada en C.2A §7. Se ajustó para verificar la intención real ("un mensaje entrante solo afecta al contexto de su propio id") vía `existeContexto`, no vía el filesystem — documentado en el propio archivo.

## 5. PostgreSQL como fuente de verdad

Confirmado con el test end-to-end (`whatsapp-adapter/test/e2ePostgres.test.js`): un turno completo de conversación queda verificable en PostgreSQL por dos vías independientes (a través de `contextoStorage.js` y directamente contra `crm/index.js`/tablas), y `data/conversaciones/` no recibe ningún archivo nuevo — ni para el id de la prueba ni para ningún otro. No existe escritura dual en ningún punto del código.

## 6. Estado del JSON legacy

`data/conversaciones/` permanece intacto (vacío, igual que antes de esta fase). `CONTEXTOS_ROOT` sigue exportado desde `contextoStorage.js`. Las tres funciones privadas de manejo de archivo (`nombreDeArchivo`, `rutaContexto`, `asegurarDirectorio`) siguen en el archivo, documentadas como código muerto — no se eliminan (regla explícita de esta fase; la eliminación queda para una fase posterior, tras validar estabilidad en producción).

## 7. Límite de concurrencia (Decisión 2, ya conocido, no resuelto aquí)

Cada operación `*Persistente` sigue abriendo y cerrando su propia transacción en `crm/` — un turno de `conversationRouter.js` que encadena varios pasos (ej. `procesarNecesidadYPrecioPersistente` → `procesarOfertaYCierrePersistente`) no está protegido por una única transacción que abarque todo el turno. Documentado, no implementado — instrucción explícita del propietario.

## 8. Tests

| Suite | Resultado |
|---|---|
| `crm/` (Fase B + C.1) | 63/63 |
| `simulator/` (`contextoStorage.test.js` 10, `flujoVentaRealPersistente.test.js` 9, `ventaReal.test.js` 13, sin cambios) | 31/31 |
| `whatsapp-adapter/` (`whatsappAdapter.test.js` 19, `httpServer.test.js` 12 sin modificar, `graphApiSender.test.js` 19 sin modificar, `e2ePostgres.test.js` 1 nuevo) | 51/51 |
| **Total** | **145/145**, estable en 2 corridas consecutivas completas |

---
[🏠 Índice de Documentación](./PROJECT_STATE.md)
