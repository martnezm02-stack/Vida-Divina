# Wan2GP — Log de decisión (2026-08-18)

Este experimento se detuvo ANTES de la fase de descarga/instalación pesada (venv, TheRock/ROCm wheels,
modelo Wan 2.1 1.3B) tras completar la investigación de hardware y de compatibilidad documentada de
Wan2GP. Motivo: la combinación de evidencia hace que una instalación completa tenga una probabilidad de
éxito funcional extremadamente baja, y el sistema está actualmente bajo presión real de memoria
(~940 MB de RAM libre de 15.4 GB en el momento de la auditoría), lo que añade riesgo de inestabilidad del
sistema del usuario (fuera del alcance permitido) si se intenta cargar un runtime de PyTorch + ROCm más un
checkpoint de varios GB.

No se descargó ningún wheel de TheRock/ROCm ni checkpoint de modelo. No se clonó el repositorio Wan2GP.
Ver `docs/WAN2GP_LOCAL_VIDEO_AUDIT_2026-08-17.md` en la raíz del repo para el razonamiento completo,
etiquetado por fuente.
