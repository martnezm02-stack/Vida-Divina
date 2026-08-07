# Knowledge Compiler — Notas de Arquitectura Detectadas Durante la Implementación

**No modifica `docs/KNOWLEDGE_MODEL.md`.** Este documento registra oportunidades de mejora arquitectónica que aparecieron al construir el Knowledge Compiler MVP contra la documentación real — quedan documentadas para una revisión de arquitectura futura, no implementadas aquí.

---

## 1. El Knowledge Model no anticipaba el caso "índice de módulo fuera de la carpeta del módulo"

`docs/productos.md` es el índice del módulo `productos/`, pero vive en la raíz de `docs/`, no dentro de `docs/productos/` — una excepción histórica ya documentada tanto en `CLAUDE.md` como en `docs/KNOWLEDGE_MODEL.md` §6 ("por razones históricas usa `docs/productos.md`"). El Knowledge Model no especificaba cómo el compilador debía tratar esta excepción al descubrir módulos.

**Cómo se resolvió en esta implementación:** una tabla de configuración explícita (`MODULE_ROOT_INDEX_FILE` en `compiler/src/config.js`) que mapea `nombre_de_módulo -> archivo suelto en docs/`. Es extensible (una línea nueva por excepción) y no requiere lógica condicional dispersa. Sin este ajuste, las ~134 referencias que cada archivo de `productos/` hace hacia su índice se habrían reportado como "relación no verificable" — un falso positivo sistemático, no un problema real de la documentación.

**Sugerencia para una futura revisión del Knowledge Model:** documentar esta convención explícitamente en §6 o §7, no solo dejarla implícita en la nota de "excepción histórica" de `CLAUDE.md`.

## 2. Los archivos de "categoría de archivo único" contienen más de una entidad

Siete archivos de `docs/productos/` (ej. `04-funcion-cognitiva.md`) agrupan entre 2 y 3 productos cada uno usando anclas HTML (`<a id="...">`) dentro de un mismo documento — una decisión de organización tomada en la Fase 1 para categorías con pocos productos. El Knowledge Model (§3, §7) modela `Producto` como una entidad con un archivo propio, sin prever esta relación 1-archivo-a-N-entidades.

**Impacto medido:** de 66 productos reales documentados, el compilador MVP produce 61 entidades de tipo `producto` — los 12 productos contenidos en esos 7 archivos se compilan como 7 entidades (una por archivo, no una por producto). Ver limitación explícita en `KNOWLEDGE_COMPILER_IMPLEMENTATION.md`.

**Sugerencia:** para una v2 del compilador, extraer sub-entidades por bloque `<a id="...">` dentro de un mismo archivo. Esto no requiere cambiar el Knowledge Model — es una mejora de la etapa de extracción, no del esquema conceptual.

## 3. La distinción "capa: negocio | cognitiva" de Regla de Decisión funcionó, pero depende de inferencia por módulo

El Knowledge Model (§3, nota sobre "Regla de Decisión") ya anticipaba correctamente que ambas capas comparten tipo de entidad. La implementación infiere `capa` a partir del nombre del módulo (`proceso_de_venta` → negocio, `agente_ia` → cognitiva) en vez de leerlo de un campo explícito — funciona hoy porque cada capa vive en un módulo distinto, pero es una inferencia estructural, no una declaración. Si en el futuro apareciera una tercera capa, o una regla de decisión fuera de esos dos módulos, la inferencia dejaría de ser suficiente (el compilador ya contempla ese caso con `capa: "desconocida"` + advertencia, no falla).

## 4. Las relaciones semánticas ricas de §4 del Knowledge Model no son derivables solo de enlaces Markdown

El grafo conceptual de `docs/KNOWLEDGE_MODEL.md` §4 define relaciones con significado propio (`recomienda`, `complementa_a`, `deriva_hacia`, `tiene_diálogo`, `pertenece_a_categoria`). El compilador MVP, al no tener metadato estructurado que declarar estas relaciones (esa es justamente la Capa 2 — archivo `.meta.json` paralelo — que el Knowledge Model reserva para una fase posterior), solo puede producir dos tipos genéricos: `referencia` (cualquier enlace Markdown verificado) y `pertenece_a_categoria` (inferido de la estructura de carpetas). Esto es exactamente lo esperado según la propia secuencia de capas del Knowledge Model, no una desviación — se documenta aquí para que quede explícito el puente entre "lo que el compilador puede hacer con Markdown solo" y "lo que requiere `.meta.json`".

## 5. Gap ya identificado en el Knowledge Model se confirma en la práctica: `Perfil → Objeción`

`docs/KNOWLEDGE_MODEL.md` §4 y §13 ya señalaban que la relación `Perfil → Objeción` ("Objeciones comunes") es hoy texto libre, sin enlace formal. La ejecución del compilador lo confirma empíricamente: ningún perfil de `docs/clientes/` genera una relación verificable hacia `docs/objeciones/`, pese a que la sección de prosa existe en los 16 archivos. Es evidencia adicional a favor de la recomendación ya hecha en el Knowledge Model de formalizar ese enlace.

## 6. La entidad `Resource` no tiene ningún caso real que validar todavía

El compilador implementa correctamente la clasificación de todos los tipos de entidad definidos en el Knowledge Model, pero `Resource` (§3, agregada en la Iteración 2) no tiene ninguna instancia en `docs/` — no hay archivos de audio, video, imagen o PDF gestionados. El código de clasificación para esta entidad no pudo ejercitarse contra un caso real en este sprint. No es un defecto de la implementación, es un reflejo honesto de que la entidad sigue siendo estructural, tal como ya lo señalaba el propio Knowledge Model.

---

*Ninguna de estas notas fue incorporada a `docs/KNOWLEDGE_MODEL.md` en este sprint, conforme a la restricción explícita del encargo.*
