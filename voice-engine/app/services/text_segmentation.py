"""Segmentacion segura de texto largo para TTS -- puerto a Python de la
logica ya validada en `tts-text-preprocessor/src/estimacionDuracion.js` y
`tts-text-preprocessor/src/audioAssetAdapter.js#segmentarVoiceoverSeguro`
(JS, usada por el pipeline manual de Creative Intelligence). Se reimplementa
aqui en Python -- no se puede importar JS directamente desde el servicio
FastAPI -- pero la formula, los umbrales y el algoritmo de agrupacion son
IDENTICOS, para no duplicar una segunda logica divergente.

Hallazgo real (2026-09-09): el audio historico correcto de 72.4s
(`chatterbox_audio01_parts.py`, 2026-08-11) NUNCA se genero con una sola
llamada larga a `model.generate()` -- el texto se dividio a mano en 2
partes (~38s y ~34s cada una, ambas bajo el limite duro de 40s/1000 tokens)
y se concateno el WAV resultante. Subir `max_new_tokens` por si solo
(probado hoy con 1000 y 2000) NO evita la degeneracion del modelo en
textos largos -- la estrategia real que si funciono fue segmentar.

Limite duro real del motor (confirmado en el paquete instalado,
chatterbox/mtl_tts.py: generate(..., max_new_tokens=1000) por defecto,
S3Gen a 25 tokens/segundo fijos) -- 1000/25 = 40s de audio como techo
absoluto por llamada continua.

MARGEN_SEGURIDAD_SEGUNDOS ajustado a 32.0 (2026-09-09, validacion real):
con el margen original de 38s (heredado de estimacionDuracion.js, pensado
para textos ya revisados a mano por un humano antes de generar) un
segmento real llego a rozar el techo duro de 1000 tokens/40s -- la
estimacion de 0.29s/palabra subestimo ese segmento en particular, y el
mecanismo de EOS por `long_tail` lo corto justo ahi, dejando una repeticion
corta de su ultima frase antes del corte (confirmado por ASR real). Bajar
el margen a 32s deja ~8s de colchon real bajo el techo -- suficiente para
absorber esa varianza sin acercarse al punto donde aparece la
degeneracion.

SEGUNDOS_POR_PALABRA_ESTIMADO subido a 0.55 y MARGEN_SEGURIDAD_SEGUNDOS
bajado a 28.0 (2026-09-10, segunda validacion real, con la concatenacion
ya corregida): el margen de 32s NO fue suficiente -- un segmento de 82
palabras (estimado en 23.78s con 0.29s/palabra, muy por debajo del margen)
llego igual a los 1000/1000 tokens SIN que el EOS se activara nunca (ni
natural ni por token_repetition), dejando ~2s de sonido no-verbal
(respiracion/gemido) en su cola antes del corte por techo duro (confirmado
por ASR real). Medida su duracion real contra los otros dos segmentos de
esa misma corrida (94 palabras -> 683 tokens/25fps = 27.32s real, tasa
0.2906s/palabra; 84 palabras -> 516 tokens/25fps = 20.64s real, tasa
0.2457s/palabra), el segmento problematico tuvo una tasa real de AL MENOS
0.4878s/palabra (limite inferior -- se trunco al llegar al techo, así que
la duracion real que hubiera necesitado pudo ser mayor) -- casi el doble
de la estimacion de 0.29s/palabra. La causa mas probable es la densidad de
pausas: ese segmento tenia 6 oraciones cortas en 82 palabras (~13.7
palabras/oracion) frente a las 3 oraciones largas de los otros dos
segmentos (~28-31 palabras/oracion) -- mas puntos y comas por palabra
implican mas pausas reales, y el modelo de estimacion es puramente lineal
por palabra, sin contar pausas. Sin abandonar ese modelo lineal (tal como
se pidio: no inventar una segunda estrategia de segmentacion), la
correccion sube la tasa asumida al peor caso real observado mas un
colchon (0.4878 -> 0.55, ~13% extra, porque el valor real medido es solo
un piso, no el valor exacto) y ademas baja el margen de 32s a 28s (70% del
techo duro de 40s, en vez del 80% anterior) como colchon adicional ante
textos con aun mas densidad de pausas que el peor caso ya visto. Con estos
valores, el mismo segmento de 82 palabras que fallo ahora se estima en
45.1s (>= 28s) y se subdivide mas -- validado en la reejecucion real del
mismo texto de 1489 caracteres (7 segmentos en vez de 3, ninguno alcanzo
los 1000 tokens).
"""
import re

SEGUNDOS_POR_PALABRA_ESTIMADO = 0.55
LIMITE_DURO_SEGUNDOS = 40.0
MARGEN_SEGURIDAD_SEGUNDOS = 28.0

# CIERRES CORTOS AISLADOS (2026-09-10, cuarta correccion real): hallazgo
# real con el texto de 1489 caracteres -- el segmento 5 terminaba en
# "¿de acuerdo?" (cierre/confirmacion corta de la oracion anterior) justo
# como ULTIMA palabra hablada de esa llamada a generate(). Se probaron ya
# tres correcciones en el motor (gate de token_repetition por
# self.complete, margen de 40 frames, margen de 80 frames) sin exito --
# el audio de esa cola quedo bit-identico en los tres casos (confirmado
# por hash/ASR real): el modelo simplemente no llega a pronunciar esa
# frase cuando es lo ultimo de un segmento. La causa real esta aqui, en la
# segmentacion: nada impedia que una pregunta corta de cierre quedara como
# remate solitario de un segmento. Regla ESTRUCTURAL (no una lista fija de
# frases, para no atarla a este texto): una "unidad" corta (<=4 palabras)
# que termina en "?" (cierre/confirmacion tipo "¿de acuerdo?", "¿verdad?",
# "¿si?", "¿no?", "¿vale?", etc.) nunca debe quedar como la ULTIMA unidad
# de un segmento cuando hay mas texto despues -- se traslada al siguiente
# segmento, antepuesta a lo que sigue, en vez de rematar el segmento
# actual.
PALABRAS_MAX_CIERRE_CORTO = 4


def estimar_segundos(texto: str) -> float:
    palabras = len([p for p in re.split(r"\s+", texto.strip()) if p])
    return round(palabras * SEGUNDOS_POR_PALABRA_ESTIMADO, 2)


def excede_limite_seguro(texto: str) -> bool:
    return estimar_segundos(texto) >= MARGEN_SEGURIDAD_SEGUNDOS


def _dividir_en_parrafos(texto: str) -> list[str]:
    partes = re.split(r"\n\s*\n", texto)
    return [p.strip() for p in partes if p.strip()]


def _dividir_en_oraciones(texto: str) -> list[str]:
    partes = re.findall(r"[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$", texto)
    return [p.strip() for p in partes if p.strip()]


def _es_cierre_corto(unidad: str) -> bool:
    """Pregunta corta de cierre/confirmacion (p.ej. '¿de acuerdo?',
    '¿verdad?', '¿si?') -- regla ESTRUCTURAL (pregunta de <=4 palabras),
    no una lista fija de frases, para que la regla sea general y no quede
    atada a un texto en particular (ver constante mas arriba)."""
    u = unidad.strip()
    if not u.endswith("?"):
        return False
    palabras = len([p for p in re.split(r"\s+", u) if p])
    return palabras <= PALABRAS_MAX_CIERRE_CORTO


def segmentar_texto_seguro(texto: str) -> list[str]:
    """Divide `texto` en segmentos aptos para llamadas independientes a
    `model.generate()`, cada uno por debajo de MARGEN_SEGURIDAD_SEGUNDOS.
    Prioridad de corte: parrafo (linea en blanco) -> oracion -- nunca a
    mitad de una palabra ni de una oracion. Si el texto completo ya cabe
    bajo el margen, devuelve `[texto]` sin tocarlo (mismo comportamiento
    que hoy para textos cortos)."""
    texto = texto.strip()
    if not texto:
        return []
    if not excede_limite_seguro(texto):
        return [texto]

    parrafos = _dividir_en_parrafos(texto) or [texto]

    unidades: list[str] = []
    for parrafo in parrafos:
        if excede_limite_seguro(parrafo):
            unidades.extend(_dividir_en_oraciones(parrafo))
        else:
            unidades.append(parrafo)

    segmentos: list[str] = []
    actual: list[str] = []
    for unidad in unidades:
        candidato = f"{' '.join(actual)} {unidad}".strip() if actual else unidad
        if actual and excede_limite_seguro(candidato):
            # Antes de cerrar el segmento: si la ULTIMA unidad ya agregada
            # es un cierre corto (ver _es_cierre_corto), no debe quedar
            # como remate solitario de este segmento -- se traslada al
            # segmento siguiente, antepuesta a la unidad que provoco el
            # corte (regla general, no especifica de este texto).
            if len(actual) > 1 and _es_cierre_corto(actual[-1]):
                cierre = actual.pop()
                segmentos.append(" ".join(actual))
                actual = [cierre, unidad]
            else:
                segmentos.append(" ".join(actual))
                actual = [unidad]
        else:
            actual.append(unidad)
    if actual:
        segmentos.append(" ".join(actual))
    return segmentos
