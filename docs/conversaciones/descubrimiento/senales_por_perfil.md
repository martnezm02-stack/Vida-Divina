# Descubrimiento — Señales por Perfil

# Objetivo
Servir como tabla de referencia rápida para traducir lo que dice un cliente durante el descubrimiento en un perfil concreto de [`docs/clientes/`](../../clientes/README.md).

# Momento del embudo
Descubrimiento → puente directo hacia [Recomendación](../recomendacion/index.md)

# Perfil de cliente relacionado
Los 16 perfiles de `docs/clientes/` — este archivo los cubre todos como tabla de mapeo, no como conversación única.

# Productos relacionados
Ninguno directamente — ver la ficha de cada perfil en `docs/clientes/` para sus productos recomendados.

# Contexto
Se usa inmediatamente después de las [preguntas generales](./preguntas_generales.md), una vez que el cliente respondió qué le gustaría mejorar.

# Tabla de señales → perfil

| El cliente dice algo como... | Perfil correspondiente |
|---|---|
| "Quiero bajar de peso", "controlar el apetito", "hacer trampa en la dieta" | [Pérdida de Peso](../../clientes/perder_peso.md) |
| "Cuidar mi azúcar", "tengo antecedentes de glucosa" | [Control de Glucosa](../../clientes/control_glucosa.md) |
| "Me siento pesado/a después de comer", "voy mal al baño" | [Salud Digestiva](../../clientes/salud_digestiva.md) |
| "Ando muy cansado/a", "necesito más energía", "quiero dejar el café normal" | [Energía](../../clientes/energia.md) |
| "Entreno y quiero recuperarme mejor", "quiero ganar músculo" | [Rendimiento Deportivo](../../clientes/rendimiento_deportivo.md) |
| "Me enfermo mucho", "quiero subir mis defensas" | [Sistema Inmunológico](../../clientes/sistema_inmunologico.md) |
| "Quiero envejecer bien", "más vitalidad a mi edad" (generalmente 40+) | [Longevidad](../../clientes/longevidad.md) |
| "No me puedo concentrar", "se me olvidan las cosas" | [Salud Cognitiva](../../clientes/salud_cognitiva.md) |
| "Me duelen las articulaciones/músculos", "tengo inflamación" | [Dolor y Articulaciones](../../clientes/dolor_articulaciones.md) |
| "Se me cansa la vista", "paso muchas horas en pantallas" | [Salud Visual](../../clientes/salud_visual.md) |
| "Quiero más energía/deseo en pareja", síntomas de menopausia | [Salud Íntima y Libido](../../clientes/salud_intima_libido.md) |
| "No duermo bien", "me cuesta conciliar el sueño" | [Descanso y Sueño](../../clientes/descanso_sueno.md) |
| "Busco algo natural para piel/cabello/higiene" (sin mencionar arrugas) | [Cuidado Personal](../../clientes/cuidado_personal.md) |
| "Quiero cuidar mi rostro", "las arrugas", "verme más joven" | [Belleza y Anti-Edad](../../clientes/belleza_anti_edad.md) |
| "Me interesa ganar dinero con esto", "cómo se hace para vender" | [Emprendimiento](../../clientes/emprendimiento.md) |
| "No sé bien, solo quiero cuidarme más" / respuesta vaga | [Bienestar General](../../clientes/bienestar_general.md) |

# Conversación ejemplo

Cliente:
La verdad es que últimamente ando súper hinchada y pesada después de comer.

Asesor:
*(Internamente: "pesado/a después de comer" → perfil Salud Digestiva)*
Te entiendo perfectamente, es más común de lo que parece 🙌 ¿Dirías que es más digestión lenta, o también sientes que vas mal al baño?

# Variantes de respuesta
No aplica de la misma forma que otros archivos — esta ficha es una tabla de consulta, no un guion de mensajes.

# Qué hacer después
1. Ubicar la fila correspondiente en la tabla.
2. Abrir la ficha del perfil en `docs/clientes/` para ver productos recomendados, objeciones típicas y argumentos de venta específicos de ese perfil.
3. Si existe un archivo construido en [`recomendacion/`](../recomendacion/index.md) para ese perfil, usarlo como base de la siguiente conversación. Si no existe todavía, construir la recomendación directamente desde la ficha de `docs/clientes/` siguiendo el mismo tono del resto del módulo.

# Qué NO decir
- No forzar a un cliente dentro de un perfil si su respuesta es ambigua — en ese caso, hacer una pregunta más de precisión antes de asumir.
- No mezclar dos perfiles en la misma recomendación inicial (por ejemplo, ofrecer productos de Pérdida de Peso y de Belleza al mismo tiempo) — es preferible cerrar uno y hacer venta cruzada después, en [Postventa](../postventa/index.md).

# Notas comerciales
*(Recomendación comercial, no médica)* Muchos clientes mencionan más de una señal a la vez (por ejemplo, cansancio y peso). En esos casos, priorizar el perfil que el cliente mencionó primero o con más énfasis, y guardar el segundo interés para una venta cruzada futura.

---
[⬅ Descubrimiento](./index.md) · [🏠 Índice general](../README.md)
