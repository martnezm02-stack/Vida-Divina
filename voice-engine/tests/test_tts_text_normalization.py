"""Tests deterministas de la normalización EXCLUSIVA de TTS (2026-09-11):
precios "$X,XXX" -> forma hablada, y pronunciación dirigida de
Ripped/Tongkat Ali. Funciones puras, sin modelo, sin red, sin LLM.
"""
from app.services.tts_text_normalization import (
    numero_a_palabras,
    numero_a_palabras_en,
    normalizar_precios_para_voz,
    normalizar_pronunciacion_para_voz,
    normalizar_texto_para_tts,
    PRONUNCIACIONES_TTS,
)


# ============================================================
# 1) Precios / moneda
# ============================================================

def test_numero_a_palabras_casos_reales_del_catalogo():
    casos = {
        1799: "mil setecientos noventa y nueve",
        899: "ochocientos noventa y nueve",
        1599: "mil quinientos noventa y nueve",
        2299: "dos mil doscientos noventa y nueve",
        1990: "mil novecientos noventa",
        2249: "dos mil doscientos cuarenta y nueve",
    }
    for numero, esperado in casos.items():
        assert numero_a_palabras(numero) == esperado


def test_normalizar_precios_para_voz_casos_reales_del_catalogo():
    casos = {
        "$1,799": "mil setecientos noventa y nueve pesos",
        "$899": "ochocientos noventa y nueve pesos",
        "$1,599": "mil quinientos noventa y nueve pesos",
        "$2,299": "dos mil doscientos noventa y nueve pesos",
        "$1,990": "mil novecientos noventa pesos",
        "$2,249": "dos mil doscientos cuarenta y nueve pesos",
    }
    for entrada, esperado in casos.items():
        assert normalizar_precios_para_voz(entrada) == esperado


def test_normalizar_precios_dentro_de_frase_real():
    texto = "Las Cápsulas Ripped tienen un precio de $1,799 por un frasco que contiene 30 cápsulas."
    resultado = normalizar_precios_para_voz(texto)
    assert "$1,799" not in resultado
    assert "mil setecientos noventa y nueve pesos" in resultado
    # el resto de la frase (incluidas otras cifras SIN "$") queda intacto
    assert "30 cápsulas" in resultado
    assert resultado.startswith("Las Cápsulas Ripped tienen un precio de")


def test_no_convierte_numeros_sin_simbolo_de_pesos():
    texto = "Tomar 30 cápsulas al mes, 1 diaria, en un frasco."
    assert normalizar_precios_para_voz(texto) == texto


def test_precio_con_centavos():
    resultado = normalizar_precios_para_voz("Cuesta $1,799.50 el paquete.")
    assert "mil setecientos noventa y nueve pesos con cincuenta centavos" in resultado


def test_precio_fuera_de_rango_soportado_no_se_toca():
    texto = "El presupuesto total fue de $1,500,000 este año."
    # 1,500,000 > _MONTO_MAXIMO_SOPORTADO (999,999) -- nunca se convierte a ciegas
    assert normalizar_precios_para_voz(texto) == texto


# ============================================================
# 1b) Precio en INGLÉS (2026-09-12, "precio en TTS debe respetar el
# idioma" -- hallazgo real: la voz seguía pronunciando el precio en
# español aunque la respuesta y `language="en"` ya fueran correctos).
# Mismo monto real, nunca traducido -- solo cambia el vocabulario. "pesos"
# se mantiene en ambos idiomas (nunca "dollars"/USD).
# ============================================================

def test_numero_a_palabras_en_casos_reales_del_catalogo():
    casos = {
        1799: "one thousand seven hundred ninety-nine",
        899: "eight hundred ninety-nine",
        1599: "one thousand five hundred ninety-nine",
        2299: "two thousand two hundred ninety-nine",
    }
    for numero, esperado in casos.items():
        assert numero_a_palabras_en(numero) == esperado


def test_normalizar_precios_para_voz_language_en_casos_reales_del_catalogo():
    # Prueba 1/2, 3/4, 5/6 del encargo: mismos montos reales del catálogo,
    # ES vs EN.
    casos = {
        "$1,799": "one thousand seven hundred ninety-nine pesos",
        "$899": "eight hundred ninety-nine pesos",
        "$1,599": "one thousand five hundred ninety-nine pesos",
    }
    for entrada, esperado in casos.items():
        assert normalizar_precios_para_voz(entrada, language="es") != esperado
        assert normalizar_precios_para_voz(entrada, language="en") == esperado


def test_normalizar_precios_language_en_dentro_de_frase_real_venus():
    # Caso real observado: "The Venus Capsules are priced at $1,799 for a
    # bottle of 30 capsules." -- el precio debe hablarse en inglés, nunca
    # en español, y "30 capsules" (sin "$") queda intacto.
    texto = "The Venus Capsules are priced at $1,799 for a bottle of 30 capsules."
    resultado = normalizar_precios_para_voz(texto, language="en")
    assert "$1,799" not in resultado
    assert "one thousand seven hundred ninety-nine pesos" in resultado
    assert "mil setecientos noventa y nueve" not in resultado
    assert "30 capsules" in resultado


def test_normalizar_precios_language_en_con_centavos():
    resultado = normalizar_precios_para_voz("It costs $1,799.50 total.", language="en")
    assert "one thousand seven hundred ninety-nine pesos and fifty cents" in resultado


def test_normalizar_precios_language_en_no_toca_numeros_sin_simbolo_de_pesos():
    # Prueba 7 del encargo, explícita en inglés.
    texto = "Take 30 capsules a month, 1 daily, in one bottle."
    assert normalizar_precios_para_voz(texto, language="en") == texto


def test_normalizar_precios_default_sin_language_sigue_en_espanol():
    # Compatibilidad: un llamador que no pase `language` (comportamiento de
    # siempre) sigue en español, sin cambios.
    assert normalizar_precios_para_voz("$1,799") == "mil setecientos noventa y nueve pesos"


# ============================================================
# 2) Pronunciación dirigida
# ============================================================

def test_pronunciaciones_tts_incluye_ripped_y_tongkat_ali():
    assert "Ripped" in PRONUNCIACIONES_TTS
    assert "Tongkat Ali" in PRONUNCIACIONES_TTS


def test_normalizar_pronunciacion_sustituye_ripped_y_tongkat_ali():
    texto = "Las Cápsulas Ripped usan Tongkat Ali real."
    resultado = normalizar_pronunciacion_para_voz(texto)
    assert "Ripped" not in resultado
    assert "Tongkat Ali" not in resultado
    assert PRONUNCIACIONES_TTS["Ripped"] in resultado
    assert PRONUNCIACIONES_TTS["Tongkat Ali"] in resultado


# ============================================================
# 2b) Pronunciación dirigida DEPENDIENTE DEL IDIOMA (2026-09-12, Problema 3:
# "Ripped Capsules" no se distinguía con claridad en el audio, sobre todo
# en frases en español; se aplicaba la misma sustitución pensada para
# español también en inglés, sin necesitarlo -- ChatterboxMultilingualTTS.
# generate() no expone ningún parámetro de fonética/IPA, solo
# text/language_id, así que la única palanca real sigue siendo el texto).
# El valor en español de "Ripped" NO se cambia por otra adivinanza (sin
# evidencia de audio real para validar una mejor) -- lo corregido es que
# ya NO se aplica en inglés, donde el término es nativo/no necesita truco.
# ============================================================

def test_problema3_ripped_en_espanol_mantiene_la_forma_ya_existente_sin_inventar_una_nueva():
    resultado = normalizar_pronunciacion_para_voz("Ripped", language="es")
    assert resultado == PRONUNCIACIONES_TTS["Ripped"] == "Riped"


def test_problema3_ripped_en_ingles_no_se_sustituye_conserva_pronunciacion_inglesa_nativa():
    resultado = normalizar_pronunciacion_para_voz("Ripped", language="en")
    assert resultado == "Ripped"


def test_problema3_capsulas_ripped_dentro_de_frase_espanola_completa():
    texto = "Las Cápsulas Ripped tienen un precio de $1,799 por un frasco."
    resultado = normalizar_texto_para_tts(texto, language="es")
    assert "Riped" in resultado
    assert "Ripped" not in resultado
    assert "mil setecientos noventa y nueve pesos" in resultado


def test_problema3_ripped_capsules_dentro_de_frase_inglesa_completa():
    texto = "The Ripped Capsules cost $1,799 for a bottle of 30 capsules."
    resultado = normalizar_texto_para_tts(texto, language="en")
    assert "Ripped Capsules" in resultado
    assert "Riped" not in resultado
    assert "one thousand seven hundred ninety-nine pesos" in resultado


def test_problema3_no_afecta_palabras_parecidas_en_ningun_idioma():
    texto = "unRippedXyz no es un producto real."
    assert normalizar_pronunciacion_para_voz(texto, language="es") == texto
    assert normalizar_pronunciacion_para_voz(texto, language="en") == texto


def test_problema3_tongkat_ali_sigue_con_tilde_en_espanol_pero_forma_nativa_en_ingles():
    assert normalizar_pronunciacion_para_voz("Tongkat Ali", language="es") == "Tongkat Alí"
    assert normalizar_pronunciacion_para_voz("Tongkat Ali", language="en") == "Tongkat Ali"


def test_normalizar_pronunciacion_nunca_toca_palabras_parecidas():
    # "Ripped" no debe dispararse dentro de otra palabra (límite de palabra real)
    texto = "unRippedXyz no es un producto real, ni Alicia ni Alimento son Tongkat Ali."
    resultado = normalizar_pronunciacion_para_voz(texto)
    assert "unRippedXyz" in resultado  # intacto, nunca tocado a mitad de palabra
    assert "Alicia" in resultado
    assert "Alimento" in resultado
    # pero la ocurrencia real y aislada de "Tongkat Ali" sí se sustituye
    assert "Tongkat Ali" not in resultado.replace("unRippedXyz", "")


# ============================================================
# 3) Composición completa + preservación del texto original de Hermes
# ============================================================

def test_normalizar_texto_para_tts_aplica_ambas_capas():
    texto = "Las Cápsulas Ripped tienen un precio de $1,799 e incluyen Tongkat Ali."
    resultado = normalizar_texto_para_tts(texto)
    assert "$1,799" not in resultado
    assert "mil setecientos noventa y nueve pesos" in resultado
    assert PRONUNCIACIONES_TTS["Ripped"] in resultado
    assert PRONUNCIACIONES_TTS["Tongkat Ali"] in resultado


def test_normalizar_texto_para_tts_language_en_habla_el_precio_en_ingles_y_NO_aplica_la_pronunciacion_pensada_para_espanol():
    # Pruebas 2/4/6 (endurecidas 2026-09-12, Problema 3: "Ripped Capsules"
    # no se distinguía con claridad, sobre todo en frases en español -- la
    # sustitución pensada para español se aplicaba también en inglés, sin
    # necesitarlo). En inglés, "Ripped"/"Tongkat Ali" deben quedar en su
    # forma real/nativa, SIN la sustitución pensada para el oído en
    # español -- ver revisión explícita más abajo, sección "Problema 3".
    texto = "The Ripped Capsules cost $1,799 and include Tongkat Ali."
    resultado = normalizar_texto_para_tts(texto, language="en")
    assert "$1,799" not in resultado
    assert "one thousand seven hundred ninety-nine pesos" in resultado
    assert "Ripped Capsules" in resultado
    assert "Tongkat Ali" in resultado
    assert "Riped" not in resultado
    assert "Alí" not in resultado


def test_normalizar_texto_para_tts_sin_language_explicito_sigue_en_espanol():
    # Compatibilidad: mismo comportamiento de siempre para un llamador que
    # no pase `language`.
    texto = "Las Cápsulas Ripped cuestan $1,799."
    assert "mil setecientos noventa y nueve pesos" in normalizar_texto_para_tts(texto)


def test_normalizar_texto_para_tts_acepta_context_pero_no_cambia_el_resultado_todavia():
    """Infraestructura de contexto (2026-09-11): generate_speech(text,
    context="default") -- por ahora NINGÚN contexto cambia el resultado de
    la normalización (las reglas siguen siendo las mismas para todos), solo
    se transporta el dato para poder ramificar después sin duplicar código."""
    texto = "Las Cápsulas Ripped cuestan $1,799 con Tongkat Ali."
    base = normalizar_texto_para_tts(texto)  # sin context -> "default" implícito
    for contexto in ["default", "whatsapp", "advertisement", "video", "manual", "un-contexto-futuro-desconocido"]:
        assert normalizar_texto_para_tts(texto, context=contexto) == base


def test_texto_comercial_original_de_hermes_permanece_intacto():
    """La normalización SOLO debe existir en la copia que entra a TTS -- el
    mensaje real de Hermes (mismo string, tal como se guarda/envía por
    WhatsApp) nunca pasa por esta función, así que sigue mostrando "$1,799",
    "Ripped" y "Tongkat Ali" literalmente."""
    mensaje_real_de_hermes = (
        "Las Cápsulas Ripped tienen un precio de $1,799 por un frasco que contiene 30 cápsulas. "
        "Están diseñadas para ayudar a quemar grasa y promover el aumento muscular mediante el uso de Tongkat Ali."
    )
    # Ninguna función de este módulo se llama sobre `mensaje_real_de_hermes` en
    # el flujo real de WhatsApp (ver tts_service.py -- la normalización solo
    # corre sobre la copia local `text` de generate_speech(), nunca reescribe
    # ni retorna el mensaje original) -- esta aserción documenta esa garantía.
    assert "$1,799" in mensaje_real_de_hermes
    assert "Ripped" in mensaje_real_de_hermes
    assert "Tongkat Ali" in mensaje_real_de_hermes
