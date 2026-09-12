"""Normalización de texto EXCLUSIVA para TTS (2026-09-11, diagnóstico real:
"$1,799" se escuchaba como "somos 799"; "Ripped"/"Tongkat Ali" se
pronunciaban de forma poco natural en modo español).

Se aplica UNA sola vez, al texto que entra a generate_speech(), ANTES de
segmentar_texto_seguro() -- nunca toca el mensaje real que Hermes ya envió
por WhatsApp (eso vive en hermes-kit, un proceso y una capa completamente
distintos; este módulo ni siquiera es importable desde ahí). No usa LLM:
todo es determinista, basado en tablas/reglas fijas.

Por qué se reimplementa aquí en vez de reutilizar
tts-text-preprocessor/src/numeros.js: ese archivo NO tiene un conversor de
número->palabras (solo normaliza "%" -> "por ciento" y señala advertencias
sin corregirlas) -- no existe lógica real que reutilizar para este caso, y
aunque existiera, es JS y este servicio es Python/FastAPI (ver
text_segmentation.py, cabecera: "no se puede importar JS directamente desde
el servicio FastAPI"). Se replica aquí SOLO la lógica mínima necesaria
(número entero -> palabras en español), no el archivo completo.
"""
import re

# ============================================================
# 1) Precios/moneda -- SOLO montos con "$" explícito (nunca números sueltos:
#    el propio numeros.js ya documenta que el modelo lee bien los dígitos
#    normales por su cuenta; esto evita tocar cualquier cifra que no sea un
#    precio real).
# ============================================================

_UNIDADES = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]
_DIEZ_A_DIECINUEVE = [
    "diez", "once", "doce", "trece", "catorce", "quince",
    "dieciséis", "diecisiete", "dieciocho", "diecinueve",
]
_VEINTIALGO = [
    "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
    "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
]
_DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
_CENTENAS = [
    "", "ciento", "doscientos", "trescientos", "cuatrocientos",
    "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos",
]

# Idioma (2026-09-12, "precio en TTS debe respetar el idioma" -- hallazgo
# real: la respuesta textual y `language` ya llegaban correctos en inglés,
# pero el precio se seguía pronunciando en español porque esta conversión
# número->palabras nunca miraba el idioma). Tabla EN paralela, mismo
# algoritmo (unidades/decenas/centenas/miles), nunca una traducción -- el
# monto real (el entero) es idéntico en ambos idiomas, solo cambia el
# vocabulario.
_UNIDADES_EN = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
_DIEZ_A_DIECINUEVE_EN = [
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
]
_DECENAS_EN = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

# Rango soportado: precios reales de Vida Divina son de 2-4 cifras; se
# admite hasta 999,999 con margen amplio. Fuera de este rango, NUNCA se
# transforma (se deja el texto tal cual) -- mejor no tocarlo que arriesgar
# una conversión incorrecta para un caso no previsto/no probado.
_MONTO_MAXIMO_SOPORTADO = 999_999


def _dos_digitos_a_palabras(n: int) -> str:
    if n < 10:
        return _UNIDADES[n]
    if n < 20:
        return _DIEZ_A_DIECINUEVE[n - 10]
    if n < 30:
        return _VEINTIALGO[n - 20]
    decena, unidad = divmod(n, 10)
    base = _DECENAS[decena]
    return base if unidad == 0 else f"{base} y {_UNIDADES[unidad]}"


def _tres_digitos_a_palabras(n: int) -> str:
    if n == 0:
        return ""
    if n == 100:
        return "cien"
    centena, resto = divmod(n, 100)
    partes = []
    if centena:
        partes.append(_CENTENAS[centena])
    if resto:
        partes.append(_dos_digitos_a_palabras(resto))
    return " ".join(partes)


def numero_a_palabras(n: int) -> str:
    """Entero no negativo -> su forma hablada en español (México). Determinista,
    sin dependencias externas, sin LLM. Válido para el rango de precios reales
    del catálogo (hasta 999,999)."""
    if n == 0:
        return "cero"
    if n < 0:
        return f"menos {numero_a_palabras(-n)}"
    if n < 1000:
        return _tres_digitos_a_palabras(n)
    miles, resto = divmod(n, 1000)
    parte_miles = "mil" if miles == 1 else f"{_tres_digitos_a_palabras(miles)} mil"
    if resto == 0:
        return parte_miles
    return f"{parte_miles} {_tres_digitos_a_palabras(resto)}"


def _dos_digitos_a_palabras_en(n: int) -> str:
    if n < 10:
        return _UNIDADES_EN[n]
    if n < 20:
        return _DIEZ_A_DIECINUEVE_EN[n - 10]
    decena, unidad = divmod(n, 10)
    base = _DECENAS_EN[decena]
    return base if unidad == 0 else f"{base}-{_UNIDADES_EN[unidad]}"


def _tres_digitos_a_palabras_en(n: int) -> str:
    if n == 0:
        return ""
    centena, resto = divmod(n, 100)
    partes = []
    if centena:
        partes.append(f"{_UNIDADES_EN[centena]} hundred")
    if resto:
        partes.append(_dos_digitos_a_palabras_en(resto))
    return " ".join(partes)


def numero_a_palabras_en(n: int) -> str:
    """Mismo entero real que numero_a_palabras() -- nunca una traducción,
    el mismo algoritmo determinista pero en inglés. Válido para el mismo
    rango real de precios (hasta 999,999)."""
    if n == 0:
        return "zero"
    if n < 0:
        return f"minus {numero_a_palabras_en(-n)}"
    if n < 1000:
        return _tres_digitos_a_palabras_en(n)
    miles, resto = divmod(n, 1000)
    parte_miles = "one thousand" if miles == 1 else f"{_tres_digitos_a_palabras_en(miles)} thousand"
    if resto == 0:
        return parte_miles
    return f"{parte_miles} {_tres_digitos_a_palabras_en(resto)}"


# "$1,799", "$899", "$1,799.50" -- exige el símbolo "$" explícito para no
# tocar jamás un número que no sea un precio (cantidades, presentaciones,
# porcentajes ya los maneja/reporta numeros.js por su cuenta, sin tocar esto).
_PRECIO_REGEX = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})*)(?:\.(\d{1,2}))?")


def normalizar_precios_para_voz(texto: str, language: str = "es") -> str:
    """Reemplaza cada "$X,XXX[.CC]" real del texto por su forma hablada --
    en español ("mil setecientos noventa y nueve pesos[ con NN centavos]")
    o en inglés ("one thousand seven hundred ninety-nine pesos[ and NN
    cents]") según `language` (2026-09-12, hallazgo real: la voz seguía
    pronunciando el precio en español aunque la respuesta y `language` ya
    fueran correctos en inglés). "pesos" NUNCA se traduce a "dollars" en
    ningún idioma -- sigue siendo la moneda real de Vida Divina, mismo
    criterio ya exigido en el texto/prompt (nunca USD). El monto entero
    real es idéntico en ambos idiomas; solo cambia el vocabulario. Nunca
    toca números sin "$" delante. Monto fuera del rango soportado -> se
    deja intacto (nunca una conversión a ciegas)."""
    en_ingles = language == "en"

    def _reemplazar(m: "re.Match[str]") -> str:
        entero_str = m.group(1).replace(",", "")
        try:
            entero = int(entero_str)
        except ValueError:
            return m.group(0)
        if entero < 0 or entero > _MONTO_MAXIMO_SOPORTADO:
            return m.group(0)

        centavos_str = m.group(2)
        if en_ingles:
            palabras = numero_a_palabras_en(entero)
            sufijo = ""
            if centavos_str and centavos_str.rstrip("0"):
                centavos = int(centavos_str.ljust(2, "0"))
                sufijo = f" and {numero_a_palabras_en(centavos)} cents"
            return f"{palabras} pesos{sufijo}"

        palabras = numero_a_palabras(entero)
        sufijo = ""
        if centavos_str and centavos_str.rstrip("0"):
            centavos = int(centavos_str.ljust(2, "0"))
            sufijo = f" con {numero_a_palabras(centavos)} centavos"
        return f"{palabras} pesos{sufijo}"

    return _PRECIO_REGEX.sub(_reemplazar, texto)


# ============================================================
# 2) Pronunciación dirigida -- tabla de sustituciones SOLO para TTS, nunca
#    para el texto real de Hermes/WhatsApp, ni para el catálogo, ni para
#    productKnowledge/"Nombre visible" (esos siguen exactamente igual).
#    Estructura deliberadamente simple y ampliable: agregar una entrada
#    nueva es una línea.
#
#    Por idioma (2026-09-12, hallazgo real: "Ripped Capsules" no se
#    distinguía con claridad en el audio, sobre todo en frases en español;
#    la sustitución se aplicaba ANTES sin mirar `language`, así que el
#    inglés recibía el mismo truco pensado para español). Inspeccionado
#    ChatterboxMultilingualTTS.generate() (paquete instalado): no expone
#    ningún parámetro de fonética/IPA/SSML, solo `text` y `language_id` --
#    la única palanca real disponible sigue siendo re-escribir el texto
#    mismo, igual que ya hacía este módulo; no se inventa infraestructura
#    nueva.
#
#    IMPORTANTE -- limitación real, sin resolver por falta de evidencia:
#    Chatterbox es un modelo end-to-end (no usa un fonemizador/G2P por
#    reglas), así que qué tan bien pronuncia una re-escritura concreta NO
#    es deducible de las reglas ortográficas del español por sí solas --
#    solo se confirma escuchando audio real, y esta tarea no tiene esa
#    evidencia (ver encargo: "si no es posible determinar una
#    representación fonética claramente mejor sin escuchar audio real, NO
#    introduzcas una modificación arbitraria"). Por eso el valor en
#    español de "Ripped" NO cambia aquí (sigue siendo "Riped", la misma
#    aproximación conservadora ya documentada, ni mejor ni peor
#    confirmada) -- lo que SÍ se corrige, con evidencia de diseño real
#    (nunca de audio): en INGLÉS no se aplica ninguna sustitución para
#    estos términos -- "Ripped"/"Tongkat Ali" ya son la forma inglesa
#    real/nativa (o el préstamo tal cual), no necesitan ningún truco
#    pensado para el oído en español, y aplicárselo ahí era exactamente el
#    mismo tipo de error ya corregido en el precio (ver
#    normalizar_precios_para_voz): una transformación pensada para un
#    idioma, filtrándose sin querer al otro.
PRONUNCIACIONES_TTS_POR_IDIOMA: dict[str, dict[str, str]] = {
    "es": {
        # "Ripped" (marca en inglés) se escuchó como "Repeat" en modo
        # español -- forma alternativa que conserva el sonido real, más
        # legible para un modelo en modo español que el original. SIN
        # VALIDAR por escucha real (ver nota arriba) -- se conserva tal
        # cual, no se reemplaza por otra adivinanza sin evidencia.
        "Ripped": "Riped",
        # "Tongkat Ali" (término malayo) se escuchó como "toncat ali" -- se
        # marca la sílaba tónica final con tilde (regla ortográfica
        # española de acentuación) sin cambiar ninguna letra real de la
        # palabra.
        "Tongkat Ali": "Tongkat Alí",
    },
    # Inglés: sin entradas -- "Ripped"/"Tongkat Ali" se pronuncian con su
    # forma real nativa/de préstamo, sin ninguna sustitución pensada para
    # español.
    "en": {},
}

# Alias retro-compatible: código/tests que importaban la tabla plana
# anterior siguen viendo la variante en español (la única que existía
# antes de esta fase) -- nunca se elimina el comportamiento ya existente.
PRONUNCIACIONES_TTS: dict[str, str] = PRONUNCIACIONES_TTS_POR_IDIOMA["es"]


def _compilar_regex_pronunciacion(tabla: dict[str, str]) -> "re.Pattern[str] | None":
    if not tabla:
        return None
    # Claves más largas primero (para que "Tongkat Ali" no quede partida
    # por una entrada más corta que pudiera solaparse en el futuro), con
    # \b en los bordes para nunca disparar dentro de otra palabra (ver
    # encargo: "no afectar palabras similares accidentalmente" -- ej.
    # nunca debe tocar "Ripped" dentro de "unRippedXyz", ni "Ali" suelto en
    # otro contexto).
    claves_ordenadas = sorted(tabla.keys(), key=len, reverse=True)
    return re.compile(r"\b(" + "|".join(re.escape(k) for k in claves_ordenadas) + r")\b", re.IGNORECASE)


_REGEX_POR_IDIOMA: dict[str, "re.Pattern[str] | None"] = {
    idioma: _compilar_regex_pronunciacion(tabla) for idioma, tabla in PRONUNCIACIONES_TTS_POR_IDIOMA.items()
}


def normalizar_pronunciacion_para_voz(texto: str, language: str = "es") -> str:
    """Sustituye cada término de la tabla real de `language` por su forma
    definida, solo en límites de palabra reales. Case-insensitive en la
    búsqueda, pero siempre emite la forma exacta de la tabla (nunca intenta
    preservar mayúsculas/minúsculas originales). Un idioma sin tabla
    (ej. "en" hoy) devuelve el texto intacto -- nunca aplica por defecto la
    tabla de otro idioma."""
    tabla = PRONUNCIACIONES_TTS_POR_IDIOMA.get(language, PRONUNCIACIONES_TTS_POR_IDIOMA["es"])
    regex = _REGEX_POR_IDIOMA.get(language)
    if not tabla or not regex:
        return texto

    claves_ordenadas = sorted(tabla.keys(), key=len, reverse=True)

    def _reemplazar(m: "re.Match[str]") -> str:
        clave = next(k for k in claves_ordenadas if k.lower() == m.group(0).lower())
        return tabla[clave]

    return regex.sub(_reemplazar, texto)


# Contextos reales conocidos hoy (2026-09-11, "contexto de generación de
# voz") -- string libre, no un enum cerrado: un contexto nuevo que no esté
# en esta lista simplemente cae en el mismo comportamiento por defecto,
# nunca rompe la llamada. Documentado aquí solo como referencia de los
# consumidores reales ya mapeados (ver auditoría de consumidores):
#   "whatsapp"      -- Hermes / notas de voz de WhatsApp
#   "advertisement" -- Content Plan/campañas, Creative Director/anuncios
#   "video"         -- Crear contenido (Reels), Video Workspace
#   "manual"        -- generador manual de voz del Dashboard
#   "default"       -- cualquier llamador que no pase contexto (compatibilidad)
CONTEXTOS_CONOCIDOS = frozenset({"default", "whatsapp", "advertisement", "video", "manual"})


def normalizar_texto_para_tts(texto: str, context: str = "default", language: str = "es") -> str:
    """Punto de entrada único: aplica precios y luego pronunciación. Nunca
    modifica el texto original que ya viajó por WhatsApp -- se llama SOLO
    sobre la copia que entra a generate_speech(), justo antes de segmentar.

    `context` identifica al consumidor real (ver CONTEXTOS_CONOCIDOS) pero
    hoy NO cambia el resultado -- se acepta y se ignora a propósito: esta
    función sigue siendo la única fuente de verdad de la normalización
    (nunca se duplica por consumidor). Cuando se decida una regla
    específica por contexto, se agrega AQUÍ (ej. un branch sobre `context`
    antes de aplicar las transformaciones), nunca en un wrapper nuevo.

    `language` (2026-09-12) decide en qué idioma se pronuncia el precio
    (ver normalizar_precios_para_voz) Y qué tabla de pronunciación dirigida
    se aplica (ver normalizar_pronunciacion_para_voz) -- en español
    conserva exactamente el mismo comportamiento de siempre (Ripped/
    Tongkat Ali); en inglés ya no aplica ninguna sustitución pensada para
    español."""
    texto = normalizar_precios_para_voz(texto, language=language)
    texto = normalizar_pronunciacion_para_voz(texto, language=language)
    return texto
