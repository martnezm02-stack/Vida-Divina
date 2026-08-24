# Graft — flujo de trabajo estructural local (Vida Divina)

## 1. Qué es Graft en nuestro proyecto

Graft (`@nanonets/graft`) construye un grafo de código local a partir de
análisis estático (tree-sitter): funciones, clases, métodos, archivos y las
llamadas entre ellos. Genera tarjetas markdown (`graft/<misma-ruta>/archivo.md`)
con firmas y rangos de línea, más un índice estructural (`graft/.graph/wiring.json`).

## 2. Por qué lo adoptamos

Una auditoría previa (ver historial de la fase "GRAFT — Context Efficiency
Audit") confirmó que el modo estructural funciona sin credenciales, sin
llamadas externas, y permite responder preguntas de dependencias
("¿qué llama a X?", "¿qué usa Y?") leyendo tarjetas de pocas líneas en vez de
archivos completos.

## 3. Qué modo usamos

**Solo el modo estructural/local**: `graft build`, `graft check`, `graft map`,
`graft ask`, `graft callers`, `graft skeleton`. Todos estos son, según el
propio `--help` de la herramienta, "`$0, no LLM`" — gratis y sin llamada a
ningún modelo.

## 4. Qué NO usamos (y por qué)

| No usamos | Motivo |
|---|---|
| `graft init` / `graft init --global` | Instalaría hooks automáticos, statusline, MCP y modificaría `.claude/settings.json`, `.mcp.json`, `AGENTS.md`, `.cursor/` y configuración global de Codex. No lo necesitamos para el beneficio estructural. |
| `graft build --deep` | Requiere `GRAFT_API_KEY` y hace llamadas a un proveedor LLM externo (OpenAI/Anthropic/etc.) para generar resúmenes en lenguaje natural. Fuera de alcance por ahora — decisión aparte. |
| MCP de Graft | Solo se instala vía `init`, que no ejecutamos. |
| Hooks automáticos / statusline | Ídem — solo vienen con `init`. |

## 5. Cómo actualizar el grafo

Después de cambios de código importantes (nuevos archivos, refactors grandes):

```bash
npm run graft:build
```

Es incremental: solo reparsea archivos que cambiaron desde la última corrida
(comparación por hash/mtime); los demás se reutilizan desde caché.

## 6. Cómo comprobar que el grafo está sincronizado

```bash
npm run graft:check
```

Devuelve `graph check: OK` si el grafo refleja el código actual, o indica qué
quedó desincronizado. El aviso de "N nodos sin resumir" es esperado y se
refiere únicamente a la capa `--deep` (que no usamos) — no es un error.

## 7. Cómo generar el mapa del repositorio

```bash
npm run graft:map
```

Usa `--max-dirs 60` (en vez del valor por defecto, 16) para evitar que se
oculten directorios grandes del repo. Con el valor por defecto,
`voice-engine/` y otros módulos quedaban fuera del resumen de texto (seguían
indexados, solo no se listaban) — con `--max-dirs 60` aparece el repo completo
en una sola pasada.

## 8. Cómo consultar callers/dependencias

No hay script npm para esto porque llevan argumentos variables. Ver
[`scripts/graft/README.md`](../scripts/graft/README.md) para ejemplos
concretos de Vida Divina (quién llama a una función, qué depende de
`content-orchestrator`, qué usa `HyperFrames`, qué llama al Voice Engine, qué
depende de `VisualProductionPackage`). Comando base:

```bash
npx --yes @nanonets/graft callers <nombreDeFuncion>
npx --yes @nanonets/graft ask "<pregunta en lenguaje natural>" --in <ruta>
npx --yes @nanonets/graft skeleton <ruta/al/archivo.js>
```

## 9. Cómo verificar que no se requieren credenciales

`graft build`, `graft check`, `graft map`, `graft ask`, `graft callers` y
`graft skeleton` no leen `GRAFT_API_KEY` ni ninguna otra variable de
credenciales — esto se confirmó revisando que ninguno de estos comandos hizo
una petición de red durante la auditoría, y que las tarjetas generadas
(`graft/**/*.md`) contienen solo firmas de función, no valores ni secretos.
Si algún día se considera `--deep`, en ese momento (y solo en ese momento) se
volvería a evaluar el requisito de API key como una decisión separada.

## 10. Qué hacer después de cambios arquitectónicos importantes

1. `npm run graft:build` (reindexar).
2. `npm run graft:check` (confirmar sincronía).
3. `npm run graft:map` (revisar que la nueva estructura aparece donde se
   espera — por ejemplo, un módulo nuevo debe aparecer como su propio
   cluster).
4. Si se agregó una dependencia/llamada importante entre módulos, verificarla
   puntualmente con `graft callers <función>` o `graft ask "..."`.

---

### Nota sobre la cifra de "tokens ahorrados"

Graft imprime en su propia salida una estimación de tokens ahorrados frente a
leer los archivos completos (por ejemplo, "~462,327 tokens" al correr `map`
sobre las 371 tarjetas). **Esta es una estimación reportada por Graft**, no
una medición realizada sobre el uso real de Claude Code en Vida Divina. Se
documenta aquí únicamente como referencia de la propia herramienta.
