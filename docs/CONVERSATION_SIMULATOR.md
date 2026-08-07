# Conversation Simulator MVP — Documento de Sprint
## Fase 3 · Sprint 3A

**Estado:** MVP implementado, ejecutado contra 6 conversaciones completas. Pendiente de revisión antes de modificar cualquier pieza de la arquitectura (Knowledge Model o Knowledge Compiler).
**No es un runtime de producción, no es un chatbot, no es una integración de WhatsApp.** Es una herramienta interna para responder una sola pregunta: si esta conversación la atendiera el asesor experto de Vida Divina, ¿cuál sería su siguiente decisión, y por qué?
**No usa IA, LLM, prompts ni APIs.** Toda la lógica es determinística: tablas de reglas transcritas y citadas contra su fuente en `docs/`, ejecutadas sobre el conocimiento ya compilado en `knowledge/compiled/` (Sprint 2).

---

## 1. Arquitectura

### Principio rector

*"El simulador no debe inventar un proceso comercial. Debe ejecutar fielmente el proceso comercial documentado durante la Fase 1. La tecnología se adapta al proceso comercial, nunca al revés."*

En la práctica, esto significó que **ninguna regla de decisión vive únicamente en el código** — cada tabla del simulador es una transcripción de una sección específica de `docs/proceso_de_venta/` o `docs/agente_ia/`, con la ruta exacta citada en un comentario junto a la regla. Donde el proceso comercial documentado no alcanza a cubrir una decisión (por ejemplo, cómo reconocer "diabetes" como texto libre), el simulador no improvisa una regla nueva — usa el mecanismo de texto mínimo indispensable y lo declara explícitamente como una necesidad de implementación, no como conocimiento del negocio (ver §5).

### Ubicación del código y flujo de datos

```
simulator/
├── package.json          ← cero dependencias, igual que compiler/
├── main.js                ← CLI: corre los 6 casos de prueba o un mensaje custom
└── src/
    ├── knowledgeLoader.js  ← lee knowledge/compiled/*.json (Sprint 2) — única fuente de datos de entidad
    ├── stateMachine.js      ← transcripción citada de estados_del_cliente.md (10 estados)
    ├── rules.js               ← transcripción citada de reglas_de_decision.md (ambas capas) + mapa señal→perfil
    ├── intentDetector.js       ← Pasos 1-2: detectar estado inicial + intención, aplicando rules.js en orden de prioridad
    ├── knowledgeQuery.js         ← Pasos 4-5: consultas sobre knowledge/compiled/ (perfil→productos, recursos, testimonios, promociones, precio)
    ├── responseBuilder.js         ← Paso 6: arma el borrador de respuesta (plantilla determinística, no copia literal de docs/conversaciones/)
    ├── missingFieldsTracker.js     ← acumula cada hallazgo de información faltante durante la ejecución
    └── simulator.js                ← orquesta los 7 pasos pedidos en el encargo
```

**No se leyó `docs/` en tiempo de ejecución para datos de entidad.** El simulador consulta exclusivamente `knowledge/compiled/entities.json` y `relationships.json` — es, en sí mismo, la primera prueba real de que la salida del Knowledge Compiler (Sprint 2) es consumible por algo distinto al propio compilador. `docs/` sí se leyó, manualmente, para transcribir las tablas de reglas y estados a `rules.js` y `stateMachine.js` — nunca en tiempo de ejecución del simulador.

### Los 7 pasos, tal como se pidieron

| Paso | Módulo responsable | Fuente que ejecuta |
|---|---|---|
| 1. Detectar estado inicial | `stateMachine.js` | `docs/proceso_de_venta/estados_del_cliente.md` |
| 2. Identificar intención | `intentDetector.js` | `docs/clientes/README.md` (mapa señal→perfil) + `docs/agente_ia/prioridades.md` (orden) |
| 3. Aplicar reglas del proceso comercial | `simulator.js` | `docs/proceso_de_venta/reglas_de_decision.md` + `docs/agente_ia/reglas_de_decision.md` |
| 4. Consultar conocimiento compilado | `knowledgeQuery.js` | `knowledge/compiled/entities.json` |
| 5. Seleccionar producto/testimonios/recursos/promociones | `knowledgeQuery.js` | `knowledge/compiled/relationships.json` (+ hallazgos donde no hay datos) |
| 6. Generar respuesta del asesor | `responseBuilder.js` | Plantillas citadas contra `docs/conversaciones/` |
| 7. Mostrar siguiente estado | `stateMachine.js` | `docs/proceso_de_venta/estados_del_cliente.md` |

---

## 2. Funcionamiento

Cada mensaje simulado produce una **traza** (equivalente al formato ya establecido en `docs/agente_ia/ejemplos.md` — checklist de decisiones, nunca cadena de pensamiento ni texto inventado) y un **borrador de respuesta**, claramente separados: la traza cita de dónde salió cada dato real; el borrador es una síntesis de plantilla, nunca texto copiado literal de `docs/conversaciones/`, para que no se confunda una construcción del simulador con contenido real de la base de conocimiento.

La prioridad de evaluación replica exactamente `docs/agente_ia/prioridades.md`: toda señal médica se evalúa primero y, si aparece, detiene cualquier recomendación de producto — sin excepción, sin importar qué más diga el mensaje.

---

## 3. Casos probados

Se ejecutaron 6 conversaciones completas (los 5 casos mínimos exigidos + 1 caso adicional de estado ambiguo). Resultado agregado: **6 de 6 casos completados sin excepciones, sin datos inventados, con 5 hallazgos de arquitectura únicos registrados.**

| # | Mensaje del cliente | Intención detectada | Perfil | Estado final | Producto(s) recomendado(s) |
|---|---|---|---|---|---|
| 1 | "Hola, busco bajar de peso." | `perfil_identificado` | `clientes/perder_peso` | `ProductoRecomendado` | TéDivina, Life Capsules, HCG Reactor Capsules |
| 2 | "Hola, tengo diabetes, ¿puedo tomar algo de ustedes?" | `senal_medica` | *(ninguno — por diseño)* | `ObjecionDetectada` | *(ninguno — se detiene la recomendación)* |
| 3 | "Buenas, no puedo dormir bien últimamente." | `perfil_identificado` | `clientes/descanso_sueno` | `ProductoRecomendado` | Sleep N' Lose Capsules, Eterno Capsules, Orange Genius |
| 4 | "Hola, solo quiero saber el precio del TéDivina." | `pregunta_precio` | *(ninguno)* | `Nuevo` (sin avance forzado) | *(ninguno — no se inventó precio)* |
| 5 | "Hola, me interesa el negocio, ¿cómo le hago para ganar dinero con esto?" | `perfil_identificado` | `clientes/emprendimiento` | `ProspectoDeEmprendimiento` | *(rama de negocio, no de producto)* |
| 6 | "Hola, quiero información." | `perfil_identificado` | `clientes/bienestar_general` | `ProductoRecomendado` | TéDivina, Reishi Capsules, Black |

### Lecturas destacadas de la ejecución real

- **Caso 2 (diabetes) es el más importante de los seis.** El simulador nunca llegó a consultar `knowledge/compiled/` para productos — la señal de seguridad detuvo el flujo en el Paso 3, antes del Paso 4. Es la evidencia más directa de que la arquitectura documentada (`agente_ia/prioridades.md`, nivel 1: Seguridad) se sostiene cuando se ejecuta literalmente, no solo cuando se lee.
- **Caso 3 (insomnio) expone en vivo la limitación más relevante del Sprint 2** (ya anticipada en `KNOWLEDGE_COMPILER_NOTES.md` #4): el borrador mezcla Sleep N' Lose Capsules (el único producto que `docs/clientes/descanso_sueno.md` lista bajo "Productos recomendados") con Eterno Capsules y Orange Genius (que esa misma ficha lista bajo "Productos complementarios") con el mismo peso — porque `relationships.json` no distingue el tipo de relación entre ambas secciones. Ver hallazgo #1.
- **Caso 4 (precio) y Caso 5 (distribución) demuestran que "no inventar" se sostiene bajo presión de completar la tarea.** En ambos casos el camino más fácil habría sido rellenar un número — el simulador, siguiendo el principio rector del sprint, se detiene y registra el hallazgo en vez de fabricar el dato.
- **Caso 6 no ejercitó la rama de "perfil verdaderamente ambiguo"** (`construirRespuestaAmbigua()`, código presente pero no invocado en esta corrida) — "quiero información" coincide directamente con la fila "No sabe qué quiere / cliente nuevo → Bienestar General" que ya existe en `docs/clientes/README.md`, así que se resolvió por la tabla de señales principal, no por el mecanismo de reserva. Es un resultado correcto, pero significa que la rama de reserva sigue sin validarse con un mensaje real que no coincida con ninguna de las 16 filas — una prueba pendiente, no un defecto.

---

## 4. Limitaciones

Declaradas explícitamente, no descubiertas después:

1. **La comprensión de intención es por coincidencia de palabras clave (regex), no por lectura del Knowledge Model.** Es una necesidad de cualquier simulador sin IA — está aislada en `intentDetector.js` y `rules.js`, y documentada como decisión de implementación de este sprint, no como conocimiento compilado.
2. **Las tablas de reglas están transcritas a mano, no leídas en vivo del Markdown.** Si `docs/proceso_de_venta/reglas_de_decision.md` cambia, `simulator/src/rules.js` no se actualiza solo — hay que sincronizarlo manualmente. Es exactamente el mismo gap ya señalado en `KNOWLEDGE_COMPILER_NOTES.md` #4 (falta de metadato estructurado), visto ahora desde el consumidor, no desde el compilador.
3. **Un solo mensaje por conversación.** El simulador no sostiene un intercambio de varios turnos — cada caso es "mensaje inicial → una respuesta", no una conversación completa de ida y vuelta con seguimiento real.
4. **El borrador de respuesta es una plantilla simple, no el texto real que usaría un asesor.** Sintetiza qué diría, citando de dónde sale cada dato, pero no reproduce el tono completo de `docs/conversaciones/` (eso requeriría lógica de selección de texto que este sprint deliberadamente no construyó — ver Recomendaciones).

---

## 5. Campos faltantes detectados

Cinco hallazgos únicos, cada uno con las cuatro dimensiones pedidas. Ninguno fue corregido — quedan aquí para revisión antes de tocar el Knowledge Model o el Knowledge Compiler.

### Hallazgo 1 — Distinción semántica entre producto recomendado, complementario y no prioritario

- **Qué información falta:** una relación tipada (`recomienda` / `complementa_a` / `no_prioritario`) entre Perfil y Producto — hoy `relationships.json` solo tiene `referencia` genérica.
- **En qué momento fue necesaria:** Paso 5-6, al construir la lista de productos a ofrecer primero.
- **Por qué es necesaria:** un asesor experto nunca presenta con el mismo peso un producto principal que uno complementario; la ficha de cada perfil ya distingue esto en prosa, pero la relación compilada no.
- **Dónde debería incorporarse:** `docs/KNOWLEDGE_MODEL.md` §4 (tipar la relación) + Capa 2 (`.meta.json`) del Knowledge Compiler para declararla explícitamente.
- **Evidenciado en:** Casos 1, 3 y 6.

### Hallazgo 2 — Instancias reales de la entidad Resource

- **Qué información falta:** al menos un recurso real (imagen, audio, PDF) cargado como entidad `Resource`.
- **En qué momento fue necesaria:** Paso 5, "Seleccionar recursos".
- **Por qué es necesaria:** el proceso de postventa (`docs/proceso_de_venta/postventa.md`) asume implícitamente que hay material de apoyo disponible.
- **Dónde debería incorporarse:** el esquema ya existe (`docs/KNOWLEDGE_MODEL.md` §3, §7, Iteración 2) — falta exclusivamente la carga de datos reales.
- **Evidenciado en:** Casos 1, 3 y 6 (cualquier caso que llega a "Producto Recomendado").

### Hallazgo 3 — Testimonios reales

- **Qué información falta:** testimonios de clientes capturados como `Resource` con etiqueta `testimonio`.
- **En qué momento fue necesaria:** Paso 5, "Seleccionar testimonios".
- **Por qué es necesaria:** el asesor experto usa prueba social para reforzar una recomendación, en particular ante escepticismo (`docs/objeciones/no_creo_en_suplementos.md`).
- **Dónde debería incorporarse:** `docs/conversaciones/postventa/solicitar_testimonio.md` ya define cómo pedirlo; no existe todavía dónde almacenarlo.
- **Evidenciado en:** Casos 1, 3 y 6.

### Hallazgo 4 — Lista de precios y métodos de pago vigentes

- **Qué información falta:** precios reales por producto y formas de pago.
- **En qué momento fue necesaria:** Paso 6, ante una pregunta directa de precio.
- **Por qué es necesaria:** es una decisión ya tomada y documentada desde el Sprint de Conversaciones ("no especificado en el catálogo, a propósito") — el asesor real sí lo sabe, el conocimiento compilado nunca lo tuvo.
- **Dónde debería incorporarse:** fuera del Knowledge Model de producto — requiere una fuente operativa distinta (lista de precios del negocio), posiblemente un módulo nuevo.
- **Evidenciado en:** Caso 4.

### Hallazgo 5 — Entidad "Promoción"

- **Qué información falta:** un esquema de entidad para promociones (descuento, vigencia, condiciones).
- **En qué momento fue necesaria:** Paso 5, "Seleccionar promociones".
- **Por qué es necesaria:** el propio encargo de este sprint la menciona como parte del flujo esperado, y un asesor real frecuentemente tiene una promoción vigente que ofrecer.
- **Dónde debería incorporarse:** `docs/KNOWLEDGE_MODEL.md` no define este esquema todavía (a diferencia de `Resource`, que sí se diseñó) — requeriría una decisión de arquitectura previa, no solo carga de datos.
- **Evidenciado en:** Caso 5.

---

## 6. Recomendaciones

*(Propuestas para la próxima revisión de arquitectura — no implementadas en este sprint.)*

1. **Priorizar el Hallazgo 1** antes que los demás — es el que más directamente distorsiona el criterio del asesor simulado (mezclar recomendado con complementario), y ya tiene un camino de solución identificado desde el cierre del Sprint 2 (`KNOWLEDGE_MODEL.md` §14, adopción de `.meta.json` para Producto y Perfil).
2. **Diseñar el esquema de "Promoción"** antes de intentar cargar datos — hoy no hay ni siquiera un modelo conceptual, a diferencia de `Resource`.
3. **Cargar al menos un `Resource` y un testimonio reales** como piloto, para poder validar por primera vez esa parte del pipeline con datos verdaderos en vez de confirmar, una vez más, que está vacía.
4. **No construir el Runtime de producción todavía.** Este simulador demuestra que el *proceso* (estados, prioridades, orden de consulta) se sostiene — no demuestra que la *calidad conversacional* (el tono, la naturalidad del borrador) esté lista; eso seguiría dependiendo de `docs/conversaciones/` interpretado por un humano o por un modelo de lenguaje real, algo explícitamente fuera del alcance de este sprint.
5. **Ejercitar la rama de "perfil verdaderamente ambiguo"** con un mensaje que no coincida con ninguna de las 16 señales documentadas, para confirmar que el mecanismo de reserva funciona igual de bien que el camino principal.

---

## Cierre

El criterio de éxito de este sprint no era responder perfectamente — era demostrar que la arquitectura actual puede sostener una conversación comercial completa. Las 6 conversaciones lo demuestran: el flujo de 7 pasos se ejecutó de principio a fin en cada caso, la prioridad de seguridad se respetó sin excepción, y ningún dato fue inventado donde no existía — se registró como hallazgo en su lugar.

**No se corrigió ninguna deficiencia detectada. Se espera revisión antes de modificar el Knowledge Model o el Knowledge Compiler.**
