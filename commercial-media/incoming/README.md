# Commercial Media — Carpeta de entrada

Coloca aquí archivos de media comercial propio (testimonios en video, videos
de modelo de negocio, audios oficiales, etc.) que Vida Divina quiera poder
enviar después por WhatsApp.

## Uso

1. Copia el archivo aquí (`.mp4`, `.mp3`, `.m4a`, `.ogg`, `.opus`, `.aac`,
   `.wav`, `.jpg`, `.jpeg`, `.png`).
2. Desde `commercial-media/`, ejecuta:

   ```
   node scan-commercial-media.mjs
   ```

   (o `node scan-commercial-media.mjs --dry-run` para ver qué haría sin
   registrar nada todavía).

3. El sistema intenta reconocer automáticamente, desde el propio nombre del
   archivo, qué es y para qué producto es (ver ejemplos abajo). No necesitas
   conocer rutas internas, hashes, ni la API de WhatsApp.

## Nomenclatura reconocida automáticamente

| Ejemplo de nombre de archivo | Se reconoce como |
|---|---|
| `Venus_menopausia_testimonio.mp4` | Testimonio de Cápsulas Venus, necesidad "menopause" |
| `Modelo_negocio_Vida_Divina.mp4` | Video de modelo de negocio (distribución) |
| `audio_presentacion_venus.mp3` | Audio oficial de Cápsulas Venus |

Si el nombre no es reconocible (ej. `video_01.mp4`) o el producto es
ambiguo, el archivo queda registrado como **NEEDS_METADATA** — no se envía
por WhatsApp hasta que completes su información.

## Para casos ambiguos: `manifest.json`

Crea (o edita) `commercial-media/incoming/manifest.json` con un arreglo de
entradas, una por archivo que necesite información explícita:

```json
[
  {
    "file": "video_01.mp4",
    "mediaType": "VIDEO_TESTIMONIAL",
    "businessIntent": "CONSUMPTION",
    "productId": "venus-capsules",
    "needTags": ["menopause"],
    "audience": "female",
    "displayName": "Cápsulas Venus — Testimonio — Menopausia"
  }
]
```

El manifest siempre tiene prioridad sobre la clasificación automática.
