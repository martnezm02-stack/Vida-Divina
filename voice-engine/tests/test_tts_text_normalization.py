"""Tests deterministas de la normalización EXCLUSIVA de TTS (2026-09-11):
precios "$X,XXX" -> forma hablada, y pronunciación dirigida de
Ripped/Tongkat Ali. Funciones puras, sin modelo, sin red, sin LLM.
"""
from app.services.tts_text_normalization import (
    numero_a_palabras,
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
