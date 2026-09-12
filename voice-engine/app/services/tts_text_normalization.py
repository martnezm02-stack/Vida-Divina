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


# "$1,799", "$899", "$1,799.50" -- exige el símbolo "$" explícito para no
# tocar jamás un número que no sea un precio (cantidades, presentaciones,
# porcentajes ya los maneja/reporta numeros.js por su cuenta, sin tocar esto).
_PRECIO_REGEX = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})*)(?:\.(\d{1,2}))?")


def normalizar_precios_para_voz(texto: str) -> str:
    """Reemplaza cada "$X,XXX[.CC]" real del texto por su forma hablada
    ("mil setecientos noventa y nueve pesos[ con NN centavos]"). Nunca toca
    números sin "$" delante. Monto fuera del rango soportado -> se deja
    intacto (nunca una conversión a ciegas)."""

    def _reemplazar(m: "re.Match[str]") -> str:
        entero_str = m.group(1).replace(",", "")
        try:
            entero = int(entero_str)
        except ValueError:
            return m.group(0)
        if entero < 0 or entero > _MONTO_MAXIMO_SOPORTADO:
            return m.group(0)

        palabras = numero_a_palabras(entero)
        centavos_str = m.group(2)
        sufijo = ""
        if centavos_str and centavos_str.rstrip("0"):
            centavos = int(centavos_str.ljust(2, "0"))
            sufijo = f" con {numero_a_palabras(centavos)} centavos"
        return f"{palabras} pesos{sufijo}"

    return _PRECIO_REGEX.sub(_reemplazar, texto)


# ============================================================
# 2) Pronunciación dirigida -- tabla de sustituciones SOLO para TTS, nunca
#    para el texto real de Hermes/WhatsApp. Estructura deliberadamente
#    simple y ampliable: agregar una entrada nueva es una línea.
#
#    IMPORTANTE (ver encargo): las formas de abajo son una PRIMERA
#    aproximación conservadora, no una pronunciación validada por escucha
#    real -- no había evidencia de audio suficiente en esta tarea para
#    afinarlas más. Ajustar tras oír el resultado real con el modelo/perfil
#    de voz actual, sin tocar la estructura de sustitución en sí.
# ============================================================

PRONUNCIACIONES_TTS: dict[str, str] = {
    # "Ripped" (marca en inglés) se escuchó como "Repeat" en modo español --
    # forma alternativa que conserva el sonido real, más legible para un
    # modelo en modo español que el original.
    "Ripped": "Riped",
    # "Tongkat Ali" (término malayo) se escuchó como "toncat ali" -- se
    # marca la sílaba tónica final con tilde (regla ortográfica española de
    # acentuación) sin cambiar ninguna letra real de la palabra.
    "Tongkat Ali": "Tongkat Alí",
}

# Compilado una sola vez: alternancia de las claves reales (más larga
# primero, para que "Tongkat Ali" no quede partida por una entrada más
# corta que pudiera solaparse en el futuro), con \b en los bordes para
# nunca disparar dentro de otra palabra (ver encargo: "no afectar palabras
# similares accidentalmente" -- ej. nunca debe tocar "Ripped" dentro de
# "unRippedXyz", ni "Ali" suelto en otro contexto).
_CLAVES_ORDENADAS = sorted(PRONUNCIACIONES_TTS.keys(), key=len, reverse=True)
_PRONUNCIACION_REGEX = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in _CLAVES_ORDENADAS) + r")\b",
    re.IGNORECASE,
)


def normalizar_pronunciacion_para_voz(texto: str) -> str:
    """Sustituye cada término de PRONUNCIACIONES_TTS por su forma definida,
    solo en límites de palabra reales. Case-insensitive en la búsqueda,
    pero siempre emite la forma exacta de la tabla (nunca intenta preservar
    mayúsculas/minúsculas originales -- la tabla ya define la forma final)."""
    if not PRONUNCIACIONES_TTS:
        return texto

    def _reemplazar(m: "re.Match[str]") -> str:
        clave = next(k for k in _CLAVES_ORDENADAS if k.lower() == m.group(0).lower())
        return PRONUNCIACIONES_TTS[clave]

    return _PRONUNCIACION_REGEX.sub(_reemplazar, texto)


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


def normalizar_texto_para_tts(texto: str, context: str = "default") -> str:
    """Punto de entrada único: aplica precios y luego pronunciación. Nunca
    modifica el texto original que ya viajó por WhatsApp -- se llama SOLO
    sobre la copia que entra a generate_speech(), justo antes de segmentar.

    `context` identifica al consumidor real (ver CONTEXTOS_CONOCIDOS) pero
    hoy NO cambia el resultado -- se acepta y se ignora a propósito: esta
    función sigue siendo la única fuente de verdad de la normalización
    (nunca se duplica por consumidor). Cuando se decida una regla
    específica por contexto, se agrega AQUÍ (ej. un branch sobre `context`
    antes de aplicar las transformaciones), nunca en un wrapper nuevo."""
    texto = normalizar_precios_para_voz(texto)
    texto = normalizar_pronunciacion_para_voz(texto)
    return texto
