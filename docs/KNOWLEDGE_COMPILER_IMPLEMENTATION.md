# Knowledge Compiler MVP — Documento de Implementación
## Fase 2 · Sprint 2

**Estado:** MVP implementado, ejecutado y validado contra los 6 módulos de `docs/`. Pendiente de revisión de arquitectura antes del siguiente sprint (no se continúa con nuevos desarrollos, conforme al encargo).
**Contrato de origen:** `docs/KNOWLEDGE_MODEL.md` (Iteración 2, aprobado). No fue modificado.
**Objetivo cumplido:** demostrar que la arquitectura del Knowledge Model puede ejecutarse correctamente — no construir un agente, ni MCP, ni integración de WhatsApp.

---

## 1. Arquitectura implementada

### Runtime y lenguaje

**Node.js, sin dependencias externas** (solo módulos nativos: `node:fs`, `node:path`, `node:crypto`, `node:url`, `node:child_process`). Decisión tomada empíricamente, no por preferencia: se verificó la máquina de desarrollo antes de elegir — Python no está instalado (solo el stub de Microsoft Store), Node.js v24 sí lo está. Cero dependencias además evita necesitar un paso de instalación (`npm install`) en un proyecto que hoy no tiene ninguna infraestructura de gestión de paquetes.

### Ubicación del código

```
compiler/                  ← código fuente (nuevo)
├── package.json           ← metadato only, cero dependencias
├── main.js                ← punto de entrada CLI
└── src/
    ├── config.js           ← toda la configuración declarativa (rutas, tablas de clasificación)
    ├── models.js            ← formas de datos compartidas (EntityRecord, Relationship, ValidationIssue)
    ├── pathUtils.js          ← utilidades de rutas (POSIX, derivación de id)
    ├── discovery.js           ← Pasos 1-2: descubrir módulos y documentos
    ├── classifier.js           ← Paso 3: clasificar entidades
    ├── extractor.js             ← Paso 4: extraer metadatos del contenido
    ├── references.js             ← Paso 5: detectar y resolver referencias
    ├── relationships.js           ← Paso 6: construir relaciones verificables
    ├── validator.js                ← Paso 7: validar consistencia (8 chequeos)
    ├── artifacts.js                 ← Paso 8: escritura a disco (única capa con I/O de salida)
    ├── statistics.js                 ← Paso 9: agregación de estadísticas
    ├── manifest.js                    ← Paso 10: manifiesto de la corrida
    ├── pipeline.js                     ← orquesta pasos 1-7 (función pura, testeable en memoria)
    └── logger.js                       ← logging hacia knowledge/logs/

knowledge/                 ← salida (nuevo, generado por el compilador; nunca editado a mano)
├── raw/                    ← *.meta.json, uno por documento, replicando la ruta de docs/
├── compiled/                ← index.json, entities.json, relationships.json, catalog.json, statistics.json, manifest.json
├── logs/                     ← compilation.log, errors.log, warnings.log
└── cache/                     ← carpeta preparada, sin lógica de cache implementada (fuera de alcance de este sprint)
```

`docs/` no fue modificado en ningún momento — el código incluye una salvaguarda explícita (`assertNeverWritesToDocs` en `artifacts.js`) que lanza una excepción si cualquier ruta de escritura cae dentro de `docs/`, además de que ninguna función de escritura recibe `DOCS_ROOT` como destino.

### Principios de diseño aplicados (SOLID)

- **Responsabilidad única:** cada archivo de `compiler/src/` corresponde a exactamente un paso del pipeline de 10 pasos definido en el encargo. Ninguno hace más de una cosa.
- **Bajo acoplamiento:** todas las etapas salvo `artifacts.js` y `logger.js` son funciones puras — reciben datos, devuelven datos, no leen ni escriben el sistema de archivos directamente (excepto `discovery.js` y `extractor.js`, cuya única responsabilidad es precisamente leer). Esto las hace testeables con fixtures en memoria, sin necesidad de un `docs/` real.
- **Alta cohesión:** `config.js` centraliza toda decisión de clasificación en tablas de datos, no en condicionales dispersos por el código — agregar un módulo nuevo o un tipo de archivo nuevo es agregar una línea de configuración, no reescribir lógica.
- **Abierto/cerrado:** el descubrimiento de módulos (`discovery.js`) es genérico — no contiene el nombre de ningún módulo. Un módulo nuevo (`docs/casos_reales/`, por ejemplo) se compilaría automáticamente sin cambiar código, con tipo de entidad genérico (`documento`) hasta que se agregue su configuración específica.

---

## 2. Decisiones tomadas

| Decisión | Justificación |
|---|---|
| Node.js puro, cero dependencias | Único runtime disponible en la máquina de desarrollo; coherente con la restricción de no introducir bases de datos, IA ni librerías externas |
| Id de entidad = ruta relativa sin extensión (ej. `productos/01-control-de-peso/tedivina`) | Determinista, único por construcción (las rutas de archivo ya son únicas), trazable a simple vista hacia el archivo fuente |
| `.meta.json` en `knowledge/raw/`, replicando la estructura de `docs/`, nunca junto al `.md` original | La única interpretación compatible con "nunca modificar ni escribir sobre `docs/`" — coincide con la decisión de Archivo Paralelo ya tomada en `docs/KNOWLEDGE_MODEL.md` §6 (Iteración 2) |
| Clasificación por tabla de configuración (módulo → tipo, nombre de archivo → tipo) en vez de inferencia de contenido | Es la opción honesta para un MVP: analizar el contenido de cada plantilla para inferir tipo sin metadato estructurado es frágil y es exactamente el problema que este compilador existe para resolver — no se optimiza prematuramente (instrucción explícita del encargo) |
| Un archivo = una entidad (sin dividir por anclas `<a id="...">`) | Simplicidad de MVP; el costo se documenta explícitamente como limitación (§3) en vez de ocultarse |
| Solo dos tipos de relación (`referencia`, `pertenece_a_categoria`) | Son las únicas verificables sin metadato estructurado — cumple estrictamente "no debe inventar relaciones, únicamente registrar relaciones verificables" (`docs/KNOWLEDGE_MODEL.md` §4) |
| Validar primero contra `docs/productos/` antes de generalizar | Siguiendo la instrucción explícita del encargo. Ver §4 para el detalle de qué se encontró y corrigió en esa validación antes de ejecutar contra los 6 módulos |
| `git_commit: null` en el manifiesto | El repositorio no tiene commits (`docs/FASE_1_AUDITORIA_TECNICA.md` §14) — se registra honestamente en vez de omitir el campo o inventar un valor |

---

## 3. Validación: primero `productos/`, luego generalización

Siguiendo la instrucción explícita de validar primero el caso más representativo:

**Primera corrida (`node main.js --modules=productos`):** reveló un defecto de diseño real, no un bug menor — `docs/productos.md` (el índice del módulo, ubicado fuera de la carpeta `productos/` por una excepción histórica ya documentada) había sido excluido del pipeline junto con documentos de arquitectura genuinamente ajenos al conocimiento del negocio. Esto generó 134 advertencias de "relación no verificable" — cada uno de los 67 archivos de producto enlaza dos veces hacia su índice. Se corrigió con una tabla de configuración explícita (`MODULE_ROOT_INDEX_FILE`) y una re-ejecución bajó las advertencias de 134 a 1 (la restante, correcta: una referencia hacia `proceso_de_venta/`, módulo no incluido en esa corrida filtrada).

**Segunda corrida (`node main.js`, sin filtro, los 6 módulos):** 165 entidades — coincide exactamente con el conteo de archivos `.md` de la auditoría de Fase 1. 1.886 relaciones. 0 errores. 11 advertencias, todas del mismo tipo y todas legítimas: archivos de `agente_ia/` que enlazan a secciones de `CLAUDE.md`, el cual vive fuera de `docs/` y por lo tanto fuera del alcance que el encargo definió para este compilador — no es una falla de la documentación ni del compilador, es un límite de alcance correctamente detectado y reportado, no silenciado.

### Resultado agregado de la corrida completa

```
Módulos: 6 · Entidades: 165 · Relaciones: 1.886 · Advertencias: 11 · Errores: 0
```

| Módulo | Documentos | Tipos de entidad presentes |
|---|---|---|
| productos | 68 | indice_modulo, indice_categoria, producto |
| clientes | 17 | indice_modulo, perfil |
| conversaciones | 47 | indice_modulo, indice_categoria, conversacion |
| objeciones | 5 | indice_modulo, objecion |
| proceso_de_venta | 12 | indice_modulo, etapa_proceso, estado_cliente, regla_decision (capa: negocio), documento_proceso |
| agente_ia | 16 | indice_modulo, principio, regla_seguridad, regla_decision (capa: cognitiva), herramienta, metrica, ejemplo_razonamiento, documento_cognitivo |

La distinción `capa: "negocio" | "cognitiva"` para `regla_decision` — anticipada en `docs/KNOWLEDGE_MODEL.md` §3 — se verificó correctamente en ambos archivos reales.

---

## 4. Limitaciones del MVP

Documentadas explícitamente, no ocultas:

1. **Un archivo = una entidad, sin excepción.** Los 7 archivos de categoría de producto que agrupan varios productos mediante anclas HTML (ej. `docs/productos/04-funcion-cognitiva.md`, con 2 productos) se compilan como **una sola entidad `producto`** por archivo. Resultado medible: 66 productos reales → 61 entidades `producto` compiladas. No se pierde información (el `.meta.json` de esos archivos existe y es válido), pero no hay una entidad individual por cada producto agrupado.
2. **Sin validación de anclas (`#seccion`).** Igual que las verificaciones manuales hechas a lo largo de todo el proyecto hasta ahora, el compilador valida que el **archivo** destino de un enlace exista, no que el ancla específica dentro de ese archivo sea válida.
3. **Clasificación por convención, no por contenido.** Un módulo nuevo sin entrada en `config.js` se clasifica genéricamente (`documento`) con advertencia — funciona (no rompe la compilación) pero no es tan preciso como sería un análisis del contenido real del archivo.
4. **Solo dos tipos de relación verificable** (`referencia`, `pertenece_a_categoria`). Las relaciones semánticamente más ricas del Knowledge Model (`recomienda`, `complementa_a`, `deriva_hacia`, etc.) requieren la Capa 2 de metadato estructurado (`.meta.json` con relaciones declaradas explícitamente), que este sprint no implementó — es, correctamente, la capa que el propio Knowledge Model reserva para después del compilador base.
5. **Sin cache inteligente.** `knowledge/cache/` existe como carpeta preparada; cada corrida recompila los 165 documentos desde cero (175ms en la máquina de desarrollo — no es un problema de rendimiento hoy, pero no hay compilación incremental).
6. **`git_commit` siempre `null` hasta que exista al menos un commit** en el repositorio.
7. **La entidad `Resource`** (agregada en la Iteración 2 del Knowledge Model) no tiene ninguna instancia real que compilar — el código de clasificación existe pero no fue ejercitado contra un caso real.

Ver `docs/KNOWLEDGE_COMPILER_NOTES.md` para el análisis de por qué cada una de estas limitaciones existe y qué implicaría resolverla.

---

## 5. Mejoras propuestas para la siguiente iteración

*(Propuestas únicamente — no implementadas en este sprint, conforme a la instrucción de no optimizar prematuramente.)*

1. **Extracción de sub-entidades por ancla HTML** dentro de los 7 archivos de categoría de producto de archivo único — cerraría la brecha de 61 vs. 66 productos.
2. **Adopción incremental de `.meta.json` paralelos** (§6 de `docs/KNOWLEDGE_MODEL.md`), empezando por `Producto` y `Perfil` — desbloquearía relaciones semánticas más allá de `referencia` y `pertenece_a_categoria`.
3. **Cache real basado en checksum:** comparar el checksum ya calculado de cada documento contra la corrida anterior (`knowledge/cache/`) para recompilar solo lo que cambió — la carpeta y el propósito ya están documentados, falta la lógica.
4. **Validación de anclas**, no solo de archivos, para enlaces internos (`#seccion`).
5. **Modo `--watch`** que recompile automáticamente ante cambios en `docs/`, una vez exista integración continua (hueco ya señalado en la auditoría de Fase 1).
6. **Persistir `knowledge/compiled/` en Git o tratarlo como artefacto de build** — decisión que `docs/KNOWLEDGE_MODEL.md` §11 dejó explícitamente abierta y que este sprint no necesitó resolver, pero que la siguiente iteración sí debería.

---

## 6. Cómo ejecutar el compilador

```bash
cd compiler
node main.js                     # compila los 6 módulos descubiertos en docs/
node main.js --modules=productos # compila únicamente el módulo indicado (o una lista separada por comas)
```

No requiere `npm install` (cero dependencias). Requiere Node.js ≥ 18.

---

## Cierre

El objetivo del sprint — demostrar que la arquitectura del Knowledge Model puede ejecutarse correctamente — se cumplió: el compilador recorrió los 6 módulos, clasificó 165 documentos, detectó 1.886 relaciones verificables, no inventó ninguna, no modificó `docs/`, y terminó sin errores. No se construyó agente, MCP ni integración de WhatsApp, conforme al alcance del sprint.

**No se continúa con nuevos desarrollos. Se espera una revisión de arquitectura antes del siguiente sprint.**
