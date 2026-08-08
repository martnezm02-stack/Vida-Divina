# Decision Engine — Documento de Sprint
## Fase de Estabilización de la Arquitectura · Cierre commit `7391271`

**Estado:** implementado y verificado — 6/6 casos manuales de `decision-engine/main.js` sin excepciones, más 15/15 pruebas automatizadas nuevas (`npm test` en `decision-engine/`, `node:test`). Este documento se escribe como cierre retroactivo del sprint que construyó el componente (commit `7391271`) y como parte del sprint de cierre posterior que le agregó pruebas automatizadas y esta misma documentación.
**No reemplaza ni modifica** `simulator/` ni `recommendation-engine/` — los reutiliza tal cual están, importando sus funciones exportadas directamente.
**No introduce IA, LLM, base de datos ni dependencias externas** — mismo runtime que el resto del proyecto (Node.js puro).

---

## 1. Objetivo

Resolver el Hallazgo 1 documentado en `docs/ARCHITECTURE_v1.md` §8: el Conversation Simulator (Sprint 3A) y el Recommendation Engine (Sprint 3B) fueron validados cada uno por separado, pese a que el segundo se construyó específicamente para corregir una limitación detectada en el primero (la heurística de "primeros N productos" no distinguía prioridad real). Nunca quedaron conectados — cada uno podía responder "¿qué producto recomiendo para este perfil?" de forma distinta para el mismo caso.

El Decision Engine responde una sola pregunta: *dado un mensaje de cliente, ¿cuál es la decisión final coherente, usando lo mejor de ambos componentes ya validados, sin reconstruir ninguno de los dos?*

## 2. Responsabilidades

- **Sí hace:** orquestar una llamada al Conversation Simulator, decidir si aplica una recomendación de producto, y si aplica, consultar al Recommendation Engine y usar su clasificación (PRIMARY primero) como fuente final de qué producto ofrecer.
- **Sí hace:** declarar explícitamente de dónde salió cada decisión (`fuenteDeDecision`) y si hubo una discrepancia entre lo que el simulador habría ofrecido y lo que el Recommendation Engine clasifica como PRIMARY (`discrepancia`).
- **No hace:** no reimplementa el flujo de 7 pasos del simulador, no reimplementa la clasificación PRIMARY/OPTIONAL/COMPLEMENTARY/NOT_RECOMMENDED, no detecta intención por su cuenta, no selecciona recursos ni testimonios (siguen sin existir, ver `ARCHITECTURE_v1.md` §7).
- **No hace:** no persiste estado entre turnos — cada llamada a `decidir()` es independiente, igual que el simulador que orquesta (Conversation Runtime, paso 6 del roadmap, sigue sin construirse).

## 3. Arquitectura implementada

### Ubicación del código

```
decision-engine/
├── package.json          ← metadato, cero dependencias — igual que los otros tres componentes
├── main.js                ← CLI: corre los mismos 6 casos de prueba del Conversation Simulator, o un mensaje custom
├── src/
│   └── decisionEngine.js   ← única lógica propia: decidir() + dos funciones internas de apoyo
└── test/
    └── decisionEngine.test.js  ← pruebas automatizadas (node:test), agregadas en este cierre
```

`decisionEngine.js` no tiene lógica de negocio propia más allá de la conciliación — importa directamente:

- `simularConversacion` de `simulator/src/simulator.js`
- `loadCompiledKnowledge` de `simulator/src/knowledgeLoader.js` (para el simulador)
- `construirRespuestaPerfilIdentificado` de `simulator/src/responseBuilder.js`
- `loadCompiledKnowledge` de `recommendation-engine/src/knowledgeLoader.js` (lector independiente, no el mismo módulo que el anterior — ver §7, Decisiones técnicas)
- `recomendarProductos` de `recommendation-engine/src/recommendationEngine.js`

### Flujo de `decidir(nombreCaso, mensajeCliente)`

1. Carga el conocimiento compilado con el lector del simulador y ejecuta `simularConversacion()` — el flujo completo de 7 pasos, sin alterar su comportamiento.
2. Evalúa `aplicaRecomendacion`: verdadero únicamente si `resultadoSimulador.intencion === 'perfil_identificado'` **y** el perfil no es `clientes/emprendimiento` (la misma rama que el propio simulador ya excluye de recomendación de producto — no es una decisión nueva de este componente, es respetar un límite de negocio ya vigente en `docs/proceso_de_venta/emprendimiento.md`).
3. Si no aplica (señal médica, pregunta de precio, emprendimiento, o intención ambigua), devuelve la respuesta del simulador tal cual, con `recomendacion: null`, `discrepancia: null`, y `fuenteDeDecision` declarando por qué no hubo nada que conciliar.
4. Si aplica, carga el conocimiento compilado con el lector del Recommendation Engine y ejecuta `recomendarProductos(kb, perfilId)`.
5. Si el Recommendation Engine no encuentra el perfil (caso defensivo, no debería ocurrir porque el detector de intención del simulador solo devuelve perfiles reales), cae de vuelta a la respuesta del simulador y declara explícitamente por qué — nunca inventa una recomendación.
6. Si lo encuentra, compara (`compararSeleccion`) el primer producto que el simulador habría ofrecido contra el primer producto `PRIMARY` del Recommendation Engine, y construye la respuesta final (`construirRespuestaCorregida`) reutilizando el mismo constructor de texto del simulador (`construirRespuestaPerfilIdentificado`), pero alimentado con la lista ya priorizada (`PRIMARY` + `OPTIONAL`, en ese orden) en vez de la heurística de orden de aparición del simulador.

La comparación es deliberadamente parcial — solo el primer producto de cada lado, no un diff exhaustivo — porque es el dato que determina "qué dice el asesor primero", que es lo que el Hallazgo 1 identificó como el problema real.

## 4. Casos verificados

### Manuales (`node decision-engine/main.js`) — los mismos 6 casos del Conversation Simulator

| # | Mensaje | Intención | Perfil | ¿Hubo recomendación? | ¿Discrepancia con la heurística del simulador? |
|---|---|---|---|---|---|
| 1 | "Hola, busco bajar de peso." | `perfil_identificado` | `clientes/perder_peso` | Sí | No |
| 2 | "Hola, tengo diabetes, ¿puedo tomar algo de ustedes?" | `senal_medica` | *(ninguno)* | No aplica | No aplica |
| 3 | "Buenas, no puedo dormir bien últimamente." | `perfil_identificado` | `clientes/descanso_sueno` | Sí | No |
| 4 | "Hola, solo quiero saber el precio del TéDivina." | `pregunta_precio` | *(ninguno)* | No aplica | No aplica |
| 5 | "Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?" | `perfil_identificado` | `clientes/emprendimiento` | No (rama excluida) | No aplica |
| 6 | "Hola, quiero información." | `perfil_identificado` (vía fallback de perfil, no de intención `ambiguo`) | `clientes/bienestar_general` | Sí | No |

Resultado agregado: **6/6 casos completados sin excepciones. 0 discrepancias encontradas** entre la heurística del simulador y la clasificación del Recommendation Engine en los casos probados — ver Hallazgo 1 de este documento (§6) sobre por qué esto es así y qué significa.

### Automatizadas (`npm test` en `decision-engine/`, `node:test`) — agregadas en este cierre

15 pruebas, 15 exitosas, 0 fallidas. Cobertura:

- **Funcionamiento correcto:** los casos de pérdida de peso e insomnio producen una decisión con `recomendacion` no nula, `perfilEncontrado: true`, `fuenteDeDecision` iniciando con "Decision Engine", y `respuestaFinal` mencionando el producto `PRIMARY` real.
- **Caso Insomnio explícito:** confirma que `discrepancia.hayDiferencia === false` contra el conocimiento compilado vigente (ver Hallazgo 1).
- **Ramas especiales:** señal médica, pregunta de precio, emprendimiento — las tres devuelven `recomendacion: null`, `discrepancia: null`, `fuenteDeDecision` iniciando con "Conversation Simulator".
- **Rama ambigua real** (mensaje sin coincidencia con ninguna de las 16 señales de perfil, ej. `"xkjqz wblorp fnstv"`): confirma que `intencion === 'ambiguo'` y `perfilIdentificado === null` a nivel del resultado del simulador, aun cuando `intentDetector.js` resuelve internamente `clientes/bienestar_general` como fallback — esta rama nunca había sido ejercitada con un mensaje real en ningún sprint anterior (señalado como "prueba pendiente" en `docs/CONVERSATION_SIMULATOR.md` §3).
- **Ausencia de excepciones:** los 7 mensajes usados en todo el documento (los 6 casos estándar + el mensaje ambiguo) se ejecutan sin lanzar, con verificación de forma de salida en cada uno.
- **Consistencia de salida:** cuando hay recomendación, `perfilEncontrado` es siempre `true` — nunca se acepta un perfil inventado.

## 5. Decisiones técnicas

| Decisión | Justificación |
|---|---|
| No compartir un solo `knowledgeLoader.js` entre simulador y Recommendation Engine | Cada uno mantiene su lector independiente (decisión ya tomada en el Sprint 3B, deuda aceptada en `ARCHITECTURE_v1.md` §9) — el Decision Engine importa ambos por separado en vez de forzar una fusión que no le corresponde decidir a este sprint |
| No modificar `simulator/src/knowledgeQuery.js` para que use `recomendarProductos` internamente | Habría resuelto el Hallazgo 1 "desde adentro" del simulador, pero eso es exactamente lo que el Sprint 3B ya decidió no hacer (`docs/RECOMMENDATION_ENGINE.md` §9, recomendación 4: "no conectarlos todavía es una decisión de arquitectura pendiente"). El Decision Engine resuelve la conexión por composición externa, sin tocar ningún componente existente |
| Excluir `clientes/emprendimiento` de la conciliación | No es una regla nueva — replica la exclusión que el propio simulador ya aplica (rama de negocio, no de producto, `docs/proceso_de_venta/emprendimiento.md`). Aplicar el Recommendation Engine a ese perfil habría sido incorrecto por diseño de negocio, no por limitación técnica |
| Comparar solo el primer producto (`PRIMARY` vs. heurística), no un diff completo de listas | Es el dato que determina qué diría el asesor primero — mantiene la conciliación simple y legible en vez de un diff exhaustivo que nadie pidió |
| Pruebas con `node:test` + `node:assert/strict`, sin framework externo | Coherente con la Decisión congelada §11.6 de `ARCHITECTURE_v1.md` ("Node.js sin dependencias externas como runtime único") — ningún otro componente introduce una dependencia de testing, y este tampoco debía hacerlo |
| Probar solo el contrato público (`decidir()`), sin exportar funciones internas para facilitar el testeo | Exportar `compararSeleccion` o `construirRespuestaCorregida` solo para pruebas habría cambiado la superficie pública del componente — instrucción explícita de este cierre de sprint era no alterar el comportamiento ni el contrato existente |

## 6. Hallazgos encontrados durante la implementación

**Hallazgo 1 — La divergencia que motivó el Hallazgo 1 original de `ARCHITECTURE_v1.md` no se manifestó en los casos probados, porque el fix de granularidad del catálogo (Hallazgo 2, mismo commit) ya resolvió gran parte de su causa raíz.** El Decision Engine sí implementa la conciliación completa (`discrepancia.hayDiferencia`) y está preparado para reportar y corregir una divergencia real si aparece — pero en los 6 casos manuales y las pruebas automatizadas de este cierre, la heurística del simulador y la clasificación `PRIMARY` del Recommendation Engine coincidieron en el primer producto en todos los casos. Antes del fix de "1 archivo = 1 entidad", el caso de Salud Visual exponía justamente lo contrario (`docs/RECOMMENDATION_ENGINE.md` §7-8: el simulador no distinguía "Sight Capsules" del archivo de categoría completo). Con 66 productos reales ya resueltos individualmente, ese síntoma específico desapareció. La conciliación del Decision Engine sigue siendo necesaria como mecanismo — no se puede garantizar que coincidan siempre para perfiles no probados (ej. perfiles con muchos productos en "Productos recomendados", donde `getProductosRecomendados` del simulador puede tomar en su límite de `maxResultados: 3` un producto que no es el primero real de la sección) — pero no hubo evidencia de divergencia real en este cierre.

**Hallazgo 2 — `simulator/src/knowledgeQuery.js` tenía una regresión funcional real, causada indirectamente por el propio fix del catálogo, y se corrigió en el mismo commit `7391271`.** `getProductosRecomendados()` filtraba históricamente las relaciones Perfil→Producto por `tipo_relacion === 'referencia'`. Desde el Sprint 3B el compilador tipa esos enlaces como `recomienda_primario` / `recomienda_opcional` / `recomienda_complementario` / `no_recomendado` — el filtro por `'referencia'` dejó de encontrar resultados y la función devolvía silenciosamente una lista vacía. Se corrigió quitando el filtro por tipo (toma cualquier producto sin importar `tipo_relacion`), restaurando el comportamiento original de "heurística de orden de aparición" sin implementar la priorización real dentro del propio simulador — esa priorización real solo existe hoy a través del Decision Engine. Este hallazgo no fue introducido por el sprint del Decision Engine en sí, pero se detectó *al construirlo* (ejecutar `decidir()` exponía la lista vacía antes del fix) — se documenta aquí porque es exactamente el tipo de acoplamiento silencioso entre componentes que la arquitectura busca evitar y que en este caso sí ocurrió.

## 7. Limitaciones conocidas

1. **Sin Conversation Runtime.** Cada llamada a `decidir()` es un turno aislado — no hay memoria entre mensajes de una misma conversación. Es la misma limitación que ya tenía el Conversation Simulator; el Decision Engine no la resuelve ni pretende hacerlo (paso 6 del roadmap, `docs/PROJECT_STATE.md` §11).
2. **`simulator/src/knowledgeQuery.js` conserva su heurística propia si se invoca fuera del Decision Engine.** La doble fuente de verdad para "qué producto recomendar" (Riesgo, `ARCHITECTURE_v1.md` §10) está mitigada cuando se pasa por `decision-engine/`, pero no eliminada del código — cualquier script futuro que llame a `simularConversacion()` directamente seguirá recibiendo la selección no priorizada.
3. **Sin recursos, testimonios, precios ni promociones** — el Decision Engine hereda exactamente las mismas ausencias de datos que ya tenía el simulador (`getRecursosDeApoyo`, `getTestimonios`, `getPromociones`, `getPrecio` siguen devolviendo vacío). No estaba en el alcance de este sprint resolverlo.
4. **Cobertura de pruebas automatizadas limitada a los perfiles y mensajes usados en este cierre.** No se probaron los 16 perfiles de cliente ni casos con múltiples productos en `PRIMARY`/`OPTIONAL` con divergencia real forzada — porque no existe hoy un caso real de la base de conocimiento que produzca esa divergencia (ver Hallazgo 1). Si aparece uno en el futuro, debería agregarse como caso de prueba explícito.
5. **Sin documento de decisión formal sobre si esta forma de integración (conciliación en tiempo de ejecución) es suficiente o si eventualmente se necesitará un cambio de contrato entre `simulator/` y `recommendation-engine/`.** `docs/ARCHITECTURE_v1.md` §13 lo deja como criterio abierto para una eventual revisión de Architecture v2 — este sprint no lo resuelve, solo aporta la primera evidencia real.

## 8. Relación con los demás componentes

- **Conversation Simulator (`simulator/`):** consumido sin modificación de comportamiento — la única corrección aplicada (Hallazgo 2, §6) restaura el comportamiento que ya tenía antes del Sprint 3B, no agrega capacidad nueva al simulador en sí.
- **Recommendation Engine (`recommendation-engine/`):** consumido sin ninguna modificación — se usa exactamente `recomendarProductos(kb, perfilId)` tal como quedó validado en el Sprint 3B.
- **Knowledge Compiler / Knowledge Package:** el Decision Engine no lee `docs/` ni `knowledge/` directamente — depende por completo de que ambos componentes que orquesta ya sepan leer `knowledge/compiled/` por su cuenta.
- **Conversation Runtime (futuro, pendiente):** el roadmap (`docs/PROJECT_STATE.md` §11, paso 6) señala al Decision Engine como el prerrequisito que debía existir antes de dar memoria persistente al sistema — ya existe y ya está probado, por lo que ese paso queda desbloqueado a partir del cierre de este documento.

## 9. Estado final del componente

**Implementado, verificado, con pruebas automatizadas y documento de cierre — deuda de sprint anterior saldada.** `decision-engine/` deja de ser el único componente de código sin pruebas ni documento de cierre dedicado (la brecha que señalaba `docs/PROJECT_STATE.md` antes de este cierre). No se modificó `compiler/`, `simulator/` (salvo la corrección de regresión ya explicada, hecha en el commit original `7391271`, no en este cierre), `recommendation-engine/`, ni ningún archivo de `docs/` de conocimiento de negocio.

---

## Cierre

El criterio de éxito de este sprint de cierre no era construir capacidad nueva — era dejar `decision-engine/` en el mismo nivel de rigor documental y de pruebas que los tres componentes que conecta, sin alterar su comportamiento. Las 15 pruebas automatizadas y los 6 casos manuales lo confirman: el componente funciona, no lanza excepciones, y su salida es consistente en todas las ramas del flujo (recomendación aplicada, señal médica, pregunta de precio, emprendimiento, y la rama ambigua real, ejercitada aquí por primera vez en la historia del proyecto).

**No se modificó ningún componente existente más allá de lo ya descrito. No se inicia Conversation Runtime ni ningún desarrollo nuevo. Se considera cerrado el sprint del Decision Engine.**
