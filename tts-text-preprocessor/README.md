# TTS Text Preprocessor

Revisión lingüística del texto del agente comercial **antes** de que llegue al motor TTS (Chatterbox es-MX-LatAm). Prepara el texto para ser hablado de forma natural — no genera contenido, no genera audio, no envía nada.

## Alcance actual (fase experimental)

```
TEXTO ORIGINAL → TTS PREPROCESSOR → TEXTO REVISADO
```

**No implementado todavía (fuera de alcance de esta fase):** integración con el motor comercial, integración con Chatterbox/Voice Engine, integración con WhatsApp, generación de audio.

## Qué hace

1. **Ortografía** (`src/ortografia.js` + `src/diccionarioOrtografico.js`): restaura acentos faltantes usando un diccionario curado manualmente de correcciones **seguras** (nunca palabras genuinamente ambiguas), más un puñado de correcciones de concordancia evidentes (ej. "la primer semana" → "la primera semana"). Nunca toca cifras ni nombres de producto.
2. **Puntuación mecánica** (`src/normalizacion.js`): espacios múltiples, espacio antes/después de puntuación, apertura de `¿` faltante. No reestructura oraciones.
3. **Números y símbolos** (`src/numeros.js`): convierte `%` → "por ciento" (única transformación automática); reporta como advertencia rangos, decimales y abreviaturas sin transformarlos.
4. **Palabras ambiguas** (`src/deteccionAmbiguas.js` + `PALABRAS_AMBIGUAS` en `src/diccionarioOrtografico.js`): detecta, como advertencia, palabras cuya forma sin acento y con acento son ambas válidas según el rol gramatical — **nunca las corrige automáticamente**. Lista completa incluida actualmente: `si/sí`, `tu/tú`, `mas/más`, `aun/aún`, `solo/sólo`, `esta/está`, `estas/estás`, `continuo/continúo`.
   Deliberadamente **excluidas** (para no generar advertencias masivas de poco valor): `de/dé`, `se/sé`, `te/té`, `mi/mí` — en español comercial/hablado normal la forma sin acento es la correcta en más del 99% de los casos; incluirlas produciría una advertencia en casi cada oración sin señal útil real.
5. **Análisis estructural** (`src/analisisEstructural.js`): detecta y **advierte** (nunca reescribe) patrones ya identificados experimentalmente en este proyecto como asociados a sensación de lectura/publicidad — oraciones de 1-2 palabras, cadenas de oraciones cortas consecutivas, posibles fragmentos gramaticalmente dependientes separados con punto, oraciones muy largas sin pausas.
6. **Verificación de conservación de significado** (`src/verificacionSemantica.js`): compara números, signos de pregunta, número de oraciones y conteo de palabras entre el texto original y el preparado. Si algo no cuadra, marca `requiereRevision: true`.

## Por qué no reescribe puntuación/estructura automáticamente

Este proyecto ya probó experimentalmente (ver `voice-engine`, documentos en `~/vida-divina-voice-engine-data/voice-reference/` fuera de este repositorio) que fragmentar texto automáticamente para "mejorar" la prosodia produjo resultados peores (sensación de voz publicitaria, pausas artificiales). Por eso este módulo separa claramente:

- Lo que es **mecánicamente seguro de corregir** (ortografía sin ambigüedad, espaciado) → se corrige.
- Lo que **requiere criterio semántico** (dónde poner una coma para sonar natural, si fusionar dos oraciones) → se **advierte**, nunca se decide automáticamente.

## Uso

```js
import { prepararTextoParaTTS } from './src/preprocessor.js';

const resultado = prepararTextoParaTTS(textoOriginal);
// { textoOriginal, textoPreparado, cambios, advertencias, verificacion, requiereRevision }
```

## Pruebas

```
npm test
```
