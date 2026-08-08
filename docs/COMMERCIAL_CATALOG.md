# Catálogo Comercial — Vida Divina

> **Esta capa no es arquitectura técnica.** No participa en `compiler/`, no la lee `knowledge/`, no la consume `recommendation-engine/` ni `decision-engine/`, y no está referenciada desde `docs/KNOWLEDGE_MODEL.md`. Es un documento de presentación comercial — vive en `docs/` por convención de repositorio único, no porque el Knowledge Compiler necesite procesarlo. De hecho, al ser un archivo suelto en la raíz de `docs/` (igual que `ARCHITECTURE_v1.md` o `PROJECT_STATE.md`), el compilador ya lo excluye automáticamente del pipeline — confirmado por su propio log: *"Documentos sueltos en docs/ excluidos del pipeline (documentos de arquitectura, no de módulo)"*. No hace falta ninguna regla nueva para mantener este aislamiento; ya existe.
>
> **Este documento no modifica, sustituye ni reinterpreta** `docs/productos.md`, ninguna ficha de `docs/productos/`, `docs/KNOWLEDGE_MODEL.md`, el Knowledge Compiler, el Recommendation Engine ni el Decision Engine. La categoría oficial de cada producto sigue siendo, exclusivamente, la que aparece en `docs/productos.md`.

---

## 1. Objetivo

Definir cómo se presentan los productos de Vida Divina a un cliente final en catálogos de venta directa (WhatsApp Business, Facebook, Instagram) — organizados por **necesidad del cliente**, no por la carpeta interna donde vive cada ficha de producto.

El catálogo técnico responde "¿qué es este producto y dónde vive en la documentación?". El catálogo comercial responde una pregunta distinta: **"¿qué está buscando el cliente, y qué le muestro primero?"** Son dos preguntas legítimas y ninguna reemplaza a la otra.

## 2. Taxonomía técnica vs. taxonomía comercial

| | Taxonomía técnica | Taxonomía comercial |
|---|---|---|
| **Dónde vive** | `docs/productos.md` + `docs/productos/` | Este documento |
| **Quién la usa** | Knowledge Compiler, Recommendation Engine, Decision Engine | Catálogos de WhatsApp Business, Facebook, Instagram |
| **Categorías** | 13 fijas, una por producto (ej. "Café Divina — Bebidas Funcionales") | Por necesidad del cliente (ej. "Energía"), no fijas ni excluyentes |
| **¿Un producto puede tener varias?** | No — cada producto vive en exactamente una carpeta | Sí — un producto puede aparecer en varias categorías comerciales si hay evidencia que lo respalde (ver §5) |
| **Fuente de verdad** | La ficha del producto en `docs/productos/` | La misma ficha — la taxonomía comercial no tiene datos propios, solo reorganiza los que ya existen |
| **¿Se compila?** | Sí, `compiler/` la procesa | No — excluido del pipeline por ser archivo suelto de raíz |

Ninguna de las dos taxonomías es "más correcta" que la otra — resuelven preguntas distintas. La técnica optimiza para mantenimiento y consistencia del conocimiento; la comercial optimiza para que un cliente entienda en dos segundos, desde el celular, qué le conviene.

## 3. Principios de la capa comercial

1. **Nunca inventar un beneficio que no esté ya documentado en la ficha del producto.** La taxonomía comercial reorganiza texto existente — no genera afirmaciones nuevas.
2. **Toda categoría comercial debe poder señalar la frase exacta, en la ficha del producto, que la justifica.** Si no existe esa frase, el producto no entra en esa categoría, sin importar cuánto "tenga sentido" comercialmente.
3. **La identidad del producto nunca se adivina.** Si un nombre comercial es ambiguo entre varias fichas reales (ej. "Reishi" puede ser 5 productos distintos), el producto queda fuera del catálogo hasta confirmar cuál es, no se elige el candidato más conveniente.
4. **Un producto inexistente no se sustituye por el más parecido.** Si el nombre solicitado no existe en `docs/productos/`, se reporta como ausente — no se inventa ni se asume.
5. **Ningún dato de clasificación interna (ver §6, última regla) se muestra al cliente.** El cliente ve únicamente nombre y descripción — nunca por qué un producto está en esa categoría ni si el beneficio es principal o secundario.
6. **La taxonomía comercial es prescindible.** Puede borrarse por completo sin que ningún componente de código dependiente se rompa — es la prueba de que está correctamente aislada de la arquitectura técnica.

## 4. Reglas para clasificar productos comercialmente

- Un producto entra en una categoría comercial si su propia ficha (`docs/productos/.../*.md`, campo "Beneficios" u "Objetivo principal") contiene una frase explícita que sostiene esa categoría. Una mención incidental cuenta igual que una mención principal para efectos de **inclusión** — la diferencia entre principal y secundaria se registra solo como nota interna (§6), nunca se le oculta al cliente ni se le exagera.
- Si dos productos con el mismo nombre comercial aparente corresponden en realidad a fichas distintas (ej. "Black" vs. "Sculpt Black"), se tratan como productos independientes, cada uno evaluado por su propia evidencia.
- La categoría comercial no necesita coincidir con la categoría técnica. Que coincidan o no es irrelevante para la decisión — lo único relevante es si el texto de la ficha respalda la categoría comercial propuesta.

## 5. Regla de multi-categoría

**Un producto puede aparecer en más de una categoría comercial cuando existan, en su propia ficha, frases distintas que respalden cada categoría por separado.**

Ejemplo aplicado: la ficha de Sculpt Black documenta tanto *"control del peso"* como *"sustenta la energía natural"* — dos frases distintas, dos beneficios reales, dos categorías comerciales legítimas (Control de Peso y Energía). No es la misma frase reinterpretada dos veces; son dos evidencias independientes.

Esta regla tiene un límite explícito: **una sola frase no se estira para justificar dos categorías.** Si la única evidencia disponible es una frase, el producto entra en una sola categoría — la que esa frase respalda directamente.

## 6. Reglas para descripciones cortas

- Longitud ideal: **15–30 caracteres.** Máximo absoluto: **35 caracteres.**
- Frase corta, sin verbos innecesarios — preferir construcciones nominales ("Control de peso") sobre oraciones completas ("Te ayuda a controlar tu peso").
- Una sola idea por descripción. No enumerar beneficios.
- Sin emojis, sin signos de admiración, sin lenguaje médico, sin nombres de enfermedades, sin promesas de curación, sin exageración.
- La descripción se redacta a partir de la frase de evidencia citada en la clasificación (§4) — no es libre; es una compresión de un texto que ya existe en la ficha del producto.
- **Nunca debe aparecer en la descripción, ni en ningún texto visible al cliente, la palabra "secundario" ni ninguna variante que indique que un beneficio es menor.** Esa distinción es una nota de trabajo interna (uso del equipo de contenido, no del cliente) — ver la tabla de evidencia en §12.

## 7. Convenciones para WhatsApp Business

- WhatsApp Business Catalog comparte el mismo Commerce Manager de Meta que Facebook e Instagram Shopping — un producto cargado una vez puede reutilizarse en los tres canales sin duplicar trabajo.
- La vista de catálogo en WhatsApp se consulta mayoritariamente desde el teléfono, dentro del chat — el nombre y la descripción deben leerse completos sin necesidad de expandir texto. Priorizar descripciones cortas por encima de todo (§6).
- El catálogo se navega por categorías dentro del chat — cada categoría comercial de este documento corresponde a una colección dentro del catálogo de WhatsApp.
- No incluir precio, promoción, ni presentación en la descripción corta — esa información, cuando exista, va en los campos dedicados del catálogo (precio, disponibilidad), nunca mezclada en el texto de la descripción.

## 8. Convenciones para Facebook

- Facebook Shop usa el mismo catálogo de productos que WhatsApp Business — no se redacta contenido nuevo, se reutiliza el mismo nombre y descripción corta definidos aquí.
- Facebook permite descripciones más largas que WhatsApp en la ficha ampliada del producto, pero la descripción corta de este documento sigue siendo la que aparece en listados y resultados de búsqueda dentro de Facebook Shop — se mantiene el límite de 35 caracteres definido en §6 para esa pieza específica.
- Las categorías comerciales de este documento pueden usarse directamente como "colecciones" dentro de Facebook Shop.

## 9. Convenciones para Instagram

- Instagram Shopping también consume el catálogo de Commerce Manager — mismo nombre, misma descripción corta, sin adaptación adicional.
- En Instagram el producto suele descubrirse primero por imagen (etiquetas de producto en publicaciones o reels) y el texto se lee después, en la ficha del producto — la descripción corta debe funcionar como confirmación rápida de lo que la imagen ya sugirió, no como la primera fuente de información.
- Evitar que la descripción dependa del contexto de la categoría para tener sentido (un cliente puede llegar al producto directamente desde una etiqueta, sin haber visto la categoría) — por eso cada descripción, aunque corta, debe ser autosuficiente.

## 10. Ejemplos

| Nombre | Descripción | Caracteres |
|---|---|---|
| TéDivina | Digestión saludable | 19 |
| Black | Café digestivo | 14 |
| Mars Capsules | Energía masculina | 17 |
| Sculpt Max | Control de peso | 15 |

---

## 11. Catálogo Comercial v1 — vista cliente

Esta es la única sección pensada para copiarse directamente al catálogo de WhatsApp Business, Facebook o Instagram. No incluye ninguna nota de evidencia ni clasificación interna — eso vive exclusivamente en §12.

### 🍃 Digestión

**TéDivina**
Digestión saludable

**Black**
Café digestivo

**Sculpt Max**
Apoyo digestivo

### ⚖️ Control de Peso

**Sculpt Max**
Control de peso

**Sculpt Black**
Peso bajo control

**Ripped Capsules**
Quema de grasa

### 💪 Energía

**TéDivina**
Más energía

**Sculpt Black**
Energía natural

**Mars Capsules**
Energía masculina

---

## 12. Evidencia y notas internas (no mostrar al cliente)

Tabla de trabajo del equipo de contenido — justifica cada inclusión de §11 contra la ficha real del producto. Nada de esta tabla se publica en ningún catálogo.

| Producto | Categoría comercial | Frase de evidencia (ficha del producto) | Nota interna |
|---|---|---|---|
| TéDivina | Digestión | "mejora el tránsito intestinal" (`tedivina.md`) | Beneficio principal |
| TéDivina | Energía | "promueve la energía" (`tedivina.md`) | Beneficio principal (ficha lista ambos como beneficios directos) |
| Black | Digestión | "ayuda en la digestión" (`black.md`) | Beneficio principal |
| Sculpt Max | Digestión | "puede ayudar al sistema digestivo a expulsar toxinas con el tiempo" (`sculpt-max.md`) | Beneficio secundario — mención de paso, no protagónica en la ficha original |
| Sculpt Max | Control de Peso | "Formulado... para el control de peso" (`sculpt-max.md`) | Beneficio principal — coincide además con la categoría técnica |
| Sculpt Black | Control de Peso | "control del peso" (`sculpt-black.md`) | Beneficio principal |
| Sculpt Black | Energía | "sustenta la energía natural" (`sculpt-black.md`) | Beneficio principal — frase distinta e independiente de la anterior (cumple la regla de §5) |
| Ripped Capsules | Control de Peso | "Quemar grasa y promover el aumento muscular" (`07-rendimiento-fisico.md`) | Categoría técnica real: Rendimiento Físico y Fuerza. Se incluye en Control de Peso solo por evidencia textual directa (§4) |
| Mars Capsules | Energía | "mejora la energía y resistencia" (`08-intimidad-libido.md`) | Categoría técnica real: Intimidad y Libido (masculina). Enfoque principal de la ficha es libido, no energía — se incluye en Energía solo por esta frase puntual |

### Productos evaluados y no incluidos (bloqueo por existencia o identidad, no por categoría)

| Producto solicitado | Motivo |
|---|---|
| Reishi | Ambiguo entre 5 fichas reales (Reishi Capsules, Extracto de Reishi, Aceite de Esporas de Reishi, Reishi Soap, Reishi Toothpaste). Ninguna de las 5 documenta un beneficio de digestión. Bloqueado por identidad y por falta de evidencia — pendiente de confirmación. |
| Fiber Plus | No existe ningún producto con ese nombre en `docs/productos/`. |
| Café Tonkat Ali | Ambiguo entre 2 fichas reales (Tongkat Ali (Café), Sculpt Tongkat Ali). Ninguna de las 2 usa la palabra "energía" en sus beneficios documentados. Bloqueado por identidad y por falta de evidencia. |
| Venus Capsules | Ficha completa revisada — ningún beneficio documentado (libido, menopausia, ciclo menstrual) respalda ninguna de las tres categorías comerciales vigentes. No es un bloqueo de identidad, es ausencia real de evidencia. |

---

## Mantenimiento

- Al agregar una categoría comercial nueva o un producto nuevo a una categoría existente, la fila correspondiente debe agregarse primero en §12 (evidencia) y solo después reflejarse en §11 (vista cliente) — nunca al revés, para que ningún producto entre al catálogo sin evidencia registrada.
- Si una ficha de producto en `docs/productos/` cambia, este documento no se actualiza automáticamente — a diferencia de `knowledge/compiled/`, esta capa no se compila. Revisar manualmente si el cambio afecta alguna fila de §12.
- Este documento no tiene versión compilada ni entra en `knowledge/`. Su única forma de quedar desactualizado es que alguien edite una ficha de producto sin revisar si esta capa comercial sigue siendo consistente con ella.
