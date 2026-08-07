# Recommendation Engine — Documento de Sprint
## Fase 3 · Sprint 3B

**Estado:** implementado y validado contra los perfiles de los casos del Sprint 3A. Pendiente de revisión de arquitectura antes de avanzar al siguiente sprint.
**No selecciona recursos, no genera respuestas, no conversa.** Su única responsabilidad es establecer el orden de recomendación entre productos para un perfil.
**No incorpora todavía** audios, videos, testimonios, imágenes, PDFs ni promociones — quedan para un sprint posterior, conforme a la restricción explícita de este encargo.

---

## 1. Objetivo

Responder, para un perfil ya identificado, la misma pregunta que se hace el mejor asesor comercial de Vida Divina: *de todo lo que podría ofrecer, ¿qué recomienda primero, qué queda como alternativa, qué agrega después como venta cruzada, y qué evita mencionar?* El Sprint 3A demostró que el sistema ya sabía *qué* productos estaban relacionados con un perfil, pero no *en qué orden de importancia* — este sprint cierra esa brecha específica, sin tocar ninguna otra capa de la arquitectura.

## 2. Principios de decisión

- **El criterio comercial ya estaba escrito — no se inventó ninguno nuevo.** Cada perfil de `docs/clientes/*.md` ya distingue tres secciones con intención comercial distinta: "Productos recomendados", "Productos complementarios" y "Productos que NO son prioridad". El Recommendation Engine no decide qué es prioritario — lee la decisión que ya tomó quien escribió cada ficha de perfil en la Fase 1.
- **La tecnología se adapta al proceso, no al revés.** Se descartó cualquier heurística "inteligente" (conteo de coincidencias, ranking automático) a favor de leer literalmente la estructura que el asesor experto ya dejó por escrito.
- **Nunca inventar una categoría donde no hay evidencia.** Donde la fuente no permite distinguir con certeza (ver §3), el motor declara la ambigüedad como una decisión de diseño explícita, no la resuelve por adivinanza.

## 3. Criterios de priorización

Se leyeron directamente (no de memoria) `docs/clientes/descanso_sueno.md` y `docs/clientes/perder_peso.md`, entre otros, antes de diseñar cualquier regla. Hallazgo clave: las tres secciones **sí** usan enlaces Markdown reales a productos individuales — son extraíbles de forma determinista. Se verificó además, contra los 16 archivos completos, que:

| Sección | Perfiles con al menos un enlace real | Cobertura |
|---|---|---|
| "Productos recomendados" | 15 de 15 (perfiles reales; excluye `clientes/README.md`, que no es un perfil) | Completa |
| "Productos complementarios" | 14 de 15 (`clientes/emprendimiento.md` no tiene esta sección) | Casi completa |
| "Productos que NO son prioridad" | 4 de 15 | Parcial — el resto menciona categorías completas en prosa ("Línea Radien y Cuidado Personal"), sin enlazar productos individuales |

**Regla de PRIMARY vs. OPTIONAL — declarada como inferencia, no como dato preexistente:** ningún documento de `docs/clientes/` distingue explícitamente "el producto principal" dentro de su lista de "Productos recomendados" (varios perfiles listan hasta 7 productos ahí, con el mismo peso aparente). El motor asume que **el primer producto enlazado en esa sección es el que el asesor lideraría** — es una inferencia de orden de lectura, razonable porque coincide con cómo están redactadas las fichas (el producto de menor compromiso o más representativo aparece primero, según se observó en `perder_peso.md`: TéDivina — "punto de partida" — encabeza la lista), pero **no es una regla que exista ya escrita en ningún documento**. Se declara así, sin disfrazarla de conocimiento compilado preexistente.

## 4. Tipos de recomendación

Los cuatro solicitados, más un quinto **propuesto y no implementado**:

| Categoría | Fuente en `docs/clientes/*.md` | Implementada |
|---|---|---|
| `PRIMARY` | Primer enlace de "Productos recomendados" | Sí |
| `OPTIONAL` | Resto de los enlaces de "Productos recomendados" | Sí |
| `COMPLEMENTARY` | Todo enlace de "Productos complementarios" | Sí |
| `NOT_RECOMMENDED` | Todo enlace de "Productos que NO son prioridad" | Sí (cobertura parcial — ver §3 y §8) |
| `BUNDLE` *(propuesta)* | "Kits recomendados" | **No** — ver justificación abajo |

**Por qué se propone `BUNDLE` pero no se implementa:** un kit no es "un producto mejor rankeado que otro" — es una sugerencia de compra conjunta, semánticamente distinta de las cuatro categorías anteriores (que ordenan productos individuales entre sí). Confirmado contra los 16 perfiles: **ningún archivo usa enlaces Markdown dentro de "Kits recomendados"** — los productos se mencionan como texto plano ("Kit 'Inicio de Programa': TéDivina + Life Capsules + Vida Fuel"), no como `[TéDivina](...)`. No hay dato extraíble con el mecanismo actual; implementar `BUNDLE` ahora significaría o bien inventar la relación, o bien re-escribir la prosa de 16 archivos de perfil para agregar enlaces — ninguna de las dos es aceptable en este sprint. Queda documentado como hallazgo para revisión (§9).

## 5. Cambios necesarios en el Knowledge Model

**No se modificó `docs/KNOWLEDGE_MODEL.md`.** Se documenta aquí, exactamente, qué cambiaría si se aprobara:

- **§4 (Relaciones entre entidades):** la relación `Perfil --recomienda--> Producto (N:M)` debería declararse con sub-tipos explícitos: `recomienda_primario`, `recomienda_opcional`, `recomienda_complementario`, `no_recomendado` — tal como el Knowledge Compiler ya los emite desde este sprint (§6). Hoy el Knowledge Model solo declara una relación genérica sin sub-tipo.
- **§3 (Inventario de entidades) o una nueva sección:** documentar formalmente que la posición del primer enlace dentro de "Productos recomendados" se interpreta como el producto principal — hoy esa regla vive únicamente en `compiler/src/config.js` (código), no en el contrato de arquitectura.
- **Candidato a evaluar, no decidido aquí:** si `BUNDLE`/Kit merece entidad propia (§4 del sprint anterior de Kit ya lo dejaba abierto) — este sprint aporta evidencia nueva (0 de 16 perfiles tienen kits enlazados) que debería pesar en esa decisión.

## 6. Cambios necesarios en el Knowledge Compiler

**Sí se modificó**, con justificación explícita, conforme lo autorizaba el encargo ("salvo que sea estrictamente necesario"). Cambios exactos:

- `compiler/src/references.js`: cada referencia detectada ahora incluye un campo `seccion` — el encabezado `## ` más cercano que la precede en el documento. Es un dato adicional, no se removió ningún campo existente.
- `compiler/src/config.js`: nueva tabla `SECCION_A_TIPO_RELACION_PRODUCTO`, mapeando el texto de la sección a un `tipo_relacion` específico.
- `compiler/src/relationships.js`: cuando el origen de una relación es `tipo_entidad === "perfil"` y el destino `tipo_entidad === "producto"`, se consulta esa tabla para asignar el `tipo_relacion` específico; en cualquier otro caso (el 99% del grafo), el comportamiento es idéntico al Sprint 2 — se conserva `referencia` genérica.
- **Por qué era necesario y no evitable:** la clasificación que pide este sprint depende de *dónde* aparece un enlace dentro del documento — un dato que Sprint 2 nunca capturó porque no lo necesitaba. No había forma de producir `PRIMARY`/`COMPLEMENTARY`/`OPTIONAL`/`NOT_RECOMMENDED` sin que el compilador supiera de qué sección viene cada enlace.
- **Verificación de que nada más cambió:** se recompiló contra los 6 módulos — 165 entidades, 1.886 relaciones, 0 errores, 11 advertencias, exactamente los mismos números que al cierre del Sprint 2. Las únicas relaciones que cambiaron de tipo son las 124 que van de un perfil a un producto (`recomienda_primario`: 16, `recomienda_opcional`: 49, `recomienda_complementario`: 54, `no_recomendado`: 5); las 1.762 relaciones restantes conservan `referencia` o `pertenece_a_categoria` sin alteración.

## 7. Casos de validación

Se reconstruyeron los perfiles resueltos por el Conversation Simulator en sus 6 casos del Sprint 3A, más dos perfiles adicionales para ampliar la evidencia (uno con un solo producto recomendado, otro con varios). El motor es independiente del simulador — no se le llamó ni se leyó su código; se reutilizó únicamente el *resultado* documentado en `docs/CONVERSATION_SIMULATOR.md`.

### Caso Insomnio (`clientes/descanso_sueno`) — el caso de ejemplo del encargo

```
PRIMARY
  - Sleep N' Lose Capsules

COMPLEMENTARY
  - Eterno Capsules
  - Orange Genius

OPTIONAL
  (sin productos en esta categoría para este perfil)

NOT_RECOMMENDED
  (sin productos en esta categoría para este perfil)
```

**Diferencia honesta con el ejemplo ilustrativo del encargo:** el encargo mostraba Orange Genius como `OPTIONAL`. La fuente real (`docs/clientes/descanso_sueno.md`, líneas 34-36) tiene **tanto Eterno como Orange Genius dentro de la misma sección "Productos complementarios"** — no hay ninguna distinción escrita entre ambos. El motor se mantuvo fiel a la fuente documentada en vez de forzar el resultado para igualar el ejemplo del encargo.

### Caso Pérdida de Peso (`clientes/perder_peso`)

```
PRIMARY: TéDivina
OPTIONAL: Life Capsules, HCG Reactor Capsules, Atom Capsules, Cheat Capsules, CX/90, Sculpt Max, Sculpt Black
COMPLEMENTARY: Vida Fuel, Vida Pure, Sleep N' Lose Capsules, Ignite Capsules, Mundo Rojo, Mundo Verde
NOT_RECOMMENDED: (vacío para este perfil — ver §3, cobertura parcial)
```

### Caso Emprendimiento (`clientes/emprendimiento`)

```
PRIMARY: TéDivina
OPTIONAL: Black, Latte, Reishi Capsules
COMPLEMENTARY: (vacío — este perfil no tiene sección "Productos complementarios")
```

### Caso adicional — Salud Visual (`clientes/salud_visual`, un solo producto en el catálogo)

```
PRIMARY: "Categoría: Salud Visual" (productos/06-salud-visual)
COMPLEMENTARY: Inflam-X Capsules, Eterno Capsules
```

Este resultado expone directamente el Hallazgo 1 de este sprint — ver §8.

**Resumen agregado de la corrida completa:** 6 perfiles evaluados, 0 excepciones, 0 categorías inventadas. Todo producto mostrado proviene de una relación verificable en `knowledge/compiled/relationships.json`.

## 8. Limitaciones

1. **Colisión con la limitación ya documentada en `KNOWLEDGE_COMPILER_NOTES.md` #2 (un archivo = una entidad).** El caso de Salud Visual lo expone con datos reales por primera vez: `docs/clientes/salud_visual.md` enlaza a `productos/06-salud-visual.md#sight-capsules` (un ancla dentro de un archivo de categoría que agrupa un solo producto en este caso, pero hasta 3 en otros). El compilador resuelve el enlace al **archivo completo**, no a la entidad "Sight Capsules" específica — por eso `PRIMARY` muestra el título del archivo ("Categoría: Salud Visual") en vez del nombre real del producto. No es un defecto de este sprint; es la limitación de Sprint 2 propagándose a un nuevo consumidor.
2. **`PRIMARY` es una inferencia de orden de lectura, no una regla documentada previamente** (ver §3). Es razonable y consistente con cómo están redactadas las fichas, pero se declara explícitamente como tal, no como conocimiento que "ya existía".
3. **`NOT_RECOMMENDED` tiene cobertura parcial (4 de 15 perfiles) por diseño de la fuente**, no por una falla del extractor — la mayoría de esa sección referencia categorías completas en prosa, no productos individuales enlazados.
4. **`BUNDLE`/Kits no implementado** — 0 de 16 perfiles tienen datos extraíbles (§4).
5. **Sigue sin resolver el Hallazgo 4 y 5 del Sprint 3A** (precios y promociones) — están explícitamente fuera de alcance de este sprint.

## 9. Recomendaciones para el siguiente sprint

1. **Resolver primero la limitación de "un archivo = una entidad"** antes de seguir construyendo capacidades sobre el conocimiento compilado — es la segunda vez que aparece (Sprint 3A y ahora 3B) y cada sprint nuevo que se apoye en `knowledge/compiled/` va a volver a tropezar con ella.
2. **Llevar la propuesta de §5 a una revisión formal del Knowledge Model** — la relación tipada ya se implementó en el compilador; falta que el contrato de arquitectura la reconozca oficialmente.
3. **Decidir si `BUNDLE` merece diseño propio** o si los kits quedan permanentemente como sugerencia comercial no estructurada — es una decisión de negocio, no solo técnica.
4. **No conectar todavía el Recommendation Engine al Conversation Simulator.** Este sprint los mantuvo deliberadamente separados; integrarlos es una decisión de arquitectura pendiente de aprobación, no una consecuencia automática de que ambos ya funcionen por separado.
5. **Evaluar una librería compartida de `knowledgeLoader.js`** — hoy existe una copia casi idéntica en `simulator/`, `compiler/` (parcialmente) y `recommendation-engine/`. Se mantuvo la duplicación deliberadamente para preservar la independencia de cada módulo en este sprint, pero es una deuda técnica menor a revisar.

---

## Cierre

El criterio de éxito de este sprint no era recomendar más productos — era demostrar una jerarquía de recomendación consistente con el criterio del asesor experto. El caso de Insomnio lo demuestra con datos reales, incluyendo la honestidad de discrepar del ejemplo ilustrativo del encargo cuando la fuente documentada decía algo distinto.

**No se implementó ninguna regla que no existiera ya en la documentación o que no se declarara explícitamente como inferencia. No se modificó el Knowledge Model, el Conversation Simulator ni el Runtime. Se espera revisión de arquitectura antes de avanzar al siguiente sprint.**
