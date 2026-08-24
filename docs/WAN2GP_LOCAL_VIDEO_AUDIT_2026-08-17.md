# Auditoría Wan2GP — Generación local de video con IA
Fecha: 2026-08-18 (nombre de archivo con fecha original de la tarea: 2026-08-17)
Estado previo documentado: "VIDEO_LOCAL = NO VIABLE" → tratado como UNKNOWN al iniciar esta auditoría.

## A. Hardware exacto [VERIFICADO EN ESTA MÁQUINA]

- CPU: AMD Ryzen 7 7730U (8C/16T) — confirma el punto de partida del usuario.
- GPU: `AMD Radeon (TM) Graphics`, PNP Device ID `PCI\VEN_1002&DEV_15E7&SUBSYS_29DD1043&REV_C4`.
  DEV_15E7 corresponde al iGPU de la familia "Rembrandt/Rembrandt-R" (Ryzen 6000/7730U), conocida
  comercialmente como **Radeon 680M**, arquitectura **RDNA2** (gfx1035), 12 CUs. Driver instalado:
  31.0.21924.4004 (rama AMD Adrenalin/WHQL reciente).
- VRAM dedicada (AdapterRAM vía WMIC): 536,870,912 bytes = exactamente **512 MB**. Coincide con el dato
  de partida del usuario — no hay discrepancia entre fuentes consultadas (WMIC fue la única fuente
  practicable sin dxdiag interactivo; se documenta como fuente única).
- RAM total: 16,151,736 KB ≈ **15.4 GB** (coincide con el dato de partida).
- RAM libre en el momento de la auditoría: 984,896 KB ≈ **~0.94 GB libres**. Esto es AÚN MÁS bajo que
  el ~2 GB reportado previamente por el usuario — el sistema está bajo presión de memoria real ahora
  mismo (otras apps/navegador probablemente abiertos).
- Disco libre en C: 293,439,098,880 bytes ≈ **273 GB libres** (el punto de partida decía ~281 GB;
  diferencia normal por uso incremental, no es una discrepancia relevante).
- No se detectó GPU NVIDIA/CUDA. Confirmado: no hay backend CUDA disponible.

## B. Compatibilidad AMD de Wan2GP

[DOCUMENTADO POR WAN2GP] El repo (`deepbeepmeep/Wan2GP`, alias WanGP) publica una guía dedicada
`docs/AMD-INSTALLATION.md` con lista explícita de GPUs/arquitecturas soportadas en Windows vía "TheRock"
(paquetes ROCm para Windows):

- RDNA4 (gfx120X): RX 9060/9070 series.
- RDNA3 (gfx110X): RX 7900/7800/7700, y el iGPU **Radeon 780M** (listado explícitamente como probado).
- RDNA3.5 APU (gfx1150/1151): Strix Halo, Radeon 890M.
- RDNA2 (gfx103X): "soportado" pero **sin modelos específicos listados** — nuestro chip (Radeon 680M,
  gfx1035, Rembrandt) cae en esta categoría genérica, sin confirmación explícita de que alguien lo haya
  probado. El propio documento advierte: "si tu GPU no está en la lista, puede que TheRock no la
  soporte en Windows".

[INFERENCIA] Nuestra GPU está en zona gris: arquitectura nominalmente cubierta (RDNA2), pero sin
confirmación empírica publicada, a diferencia de sus primos RDNA3 (780M) y RDNA3.5 (890M) que sí
aparecen como casos de uso validados.

## C. Backend utilizado

[DOCUMENTADO POR WAN2GP] En Windows con AMD, el backend es **ROCm 6.5 vía wheels de TheRock**
(no DirectML, no Vulkan) — instalación de PyTorch+ROCm sobre Python 3.11/3.12/3.13. El proyecto no
menciona un fallback CPU-only explícito.
[VERIFICADO EN ESTA MÁQUINA] No se instaló ningún backend — ver sección J para el motivo de detención.

## D. Compatibilidad Wan2GP (general)

[DOCUMENTADO POR WAN2GP]
- Soporta image-to-video (además de text-to-video) en varios modelos, incluida la familia Wan 2.1/2.2.
- Soporta cuantización agresiva: int8, fp8, GGUF, NVFP4, Nunchaku — para reducir huella de VRAM.
- Soporta "hardware profiles" con distintos niveles de offload CPU/RAM↔VRAM (perfiles 1–5), incluido
  un perfil "LowRAM_LowVRAM" (carga partes del modelo bajo demanda, más lento, VRAM mínima).
- VRAM mínima documentada explícitamente: **"a partir de 6 GB de VRAM"** para los modelos más ligeros
  (ejemplo citado: variantes distiladas tipo MiniMax H3, 5-6 GB para clips cortos). No se documenta un
  modo funcional por debajo de ese umbral.

## E. Modelo mínimo viable

[DOCUMENTADO POR WAN2GP] El modelo más pequeño de la familia Wan es **Wan 2.1 T2V/I2V 1.3B**, disponible
también en checkpoints cuantizados (fp8/gguf) que ahorran ~1 GB de disco respecto al original. Aun con
cuantización agresiva, el proyecto no publica un caso validado por debajo de los ~6 GB de VRAM.

## F. Tamaño de modelo

[DOCUMENTADO POR WAN2GP / INFERENCIA] Wan 2.1 1.3B en fp8/gguf: aproximadamente 2-3 GB de checkpoint,
más pesos auxiliares (VAE, text encoder) que típicamente suman otros 1-3 GB — total estimado en el
orden de 4-6 GB de descarga. Esta cifra por sí sola era razonable dado el espacio en disco (273 GB
libres), por lo que el tamaño de descarga NO fue el motivo de detención (ver sección J).

## G. Dependencias

[DOCUMENTADO POR WAN2GP] Python 3.11 recomendado (3.12/3.13 también soportados por TheRock); el Python
3.14.3 global de esta máquina NO es compatible con las wheels de TheRock/ROCm actuales, por lo que
habría sido obligatorio un venv aislado con Python 3.11 (no se degradó ni se tocó el Python global —
esta parte del plan no llegó a ejecutarse porque la instalación se detuvo antes).

## H. Instalación — NO EJECUTADA (ver sección J)

## I. Configuración — NO EJECUTADA (ver sección J)

## J. Resultado

**No se llegó a clonar el repositorio, instalar el venv, descargar wheels de ROCm ni el modelo.**
Motivo de la decisión de detenerse en la fase de investigación, antes de la descarga pesada:

1. [VERIFICADO EN ESTA MÁQUINA] VRAM dedicada = 512 MB, un **12x por debajo** del mínimo documentado
   por el propio proyecto (6 GB) para su configuración más ligera conocida.
2. [DOCUMENTADO POR WAN2GP] El backend en Windows/AMD es ROCm vía TheRock, que en iGPUs de Windows
   típicamente solo expone el VRAM "dedicado" fijado por BIOS (nuestros 512 MB), no el pool UMA
   compartido completo — a diferencia de DirectX/DirectML, que sí puede usar memoria compartida
   dinámica. Wan2GP no ofrece backend DirectML. [INFERENCIA, no verificada empíricamente en esta
   máquina porque no se instaló el runtime].
3. [DOCUMENTADO POR WAN2GP] Nuestra GPU (Radeon 680M / RDNA2 / gfx1035) no aparece como caso validado
   en la guía AMD — solo aparece la categoría genérica "RDNA2 soportado, sin modelos listados",
   mientras que sus primos más nuevos (780M/RDNA3, 890M/RDNA3.5) sí están confirmados.
4. [VERIFICADO EN ESTA MÁQUINA] La RAM libre en el momento de la auditoría es de solo ~0.94 GB (de
   15.4 GB totales) — insuficiente incluso para el "CPU/RAM offload" que Wan2GP ofrece como paliativo
   al VRAM bajo, ya que ese modo desplaza el peso del modelo (varios GB) a RAM del sistema.

Combinados, estos cuatro factores hacen que una instalación completa (que habría tomado descargas de
varios GB de wheels ROCm + varios GB de modelo, y probablemente 1-2 horas de instalación y depuración)
tenga una probabilidad de éxito funcional muy baja, con riesgo real de agotar la RAM del sistema del
usuario durante el intento — una consecuencia que excede el alcance de "prueba mínima aislada" pedido.
Se optó por no proceder con la descarga pesada y documentar el bloqueo con la evidencia disponible,
en vez de forzar un intento con alta probabilidad de fallo por OOM/crash tras haber consumido tiempo y
ancho de banda significativos.

**No se generó ningún video real.** Esto es una limitación de esta auditoría: la clasificación de
viabilidad se basa en evidencia documental + hardware verificado, NO en una ejecución empírica completa
del pipeline de generación. Se marca explícitamente para que quede claro que no se "simuló" un resultado.

## K. Video generado
NO. No existe archivo de salida.

## L–Q. Resolución / Duración / Tiempo de generación / RAM pico / VRAM / RTF
No aplican — no se ejecutó generación.

## R. Calidad observable
No aplica.

## S. Problemas encontrados
- VRAM dedicada (512 MB) muy por debajo del mínimo documentado (6 GB).
- RAM libre insuficiente en el momento de la prueba (~0.94 GB) para sostener siquiera el modo de
  offload a RAM.
- GPU (Radeon 680M, RDNA2/gfx1035) sin confirmación empírica en la guía oficial de AMD del proyecto.
- Sin backend DirectML en Wan2GP; solo ROCm en Windows, que en iGPUs suele limitarse al VRAM fijado
  por BIOS y no al pool de memoria compartida completo.

## T. Integración opcional (VideoGenerationBackend)
**NO implementada.** Las instrucciones de la tarea solo autorizan crear esa abstracción si el
experimento demuestra viabilidad real (categorías A o B). Como no se generó video real, no se creó
código de integración, no se modificó `video-production/` ni ningún otro módulo de producción.

## U. Impacto / recomendación para Vida Divina
La conclusión previa "VIDEO_LOCAL = NO VIABLE" se sostiene, pero ahora con una base de evidencia mucho
más sólida y específica en vez de una suposición genérica: el cuello de botella no es "AMD no soportado
en general" (Wan2GP sí soporta iGPUs AMD RDNA2/3/3.5 en principio) sino el **VRAM dedicada de 512 MB de
esta máquina en particular**, un orden de magnitud por debajo de cualquier configuración documentada
como funcional, agravado por RAM libre insuficiente en el momento de la prueba. Si en el futuro se
dispusiera de una máquina con GPU AMD RDNA3+ con 6+ GB de VRAM (dedicada o UMA amplia y configurable en
BIOS) y ≥16 GB de RAM libre, valdría la pena repetir esta auditoría con una prueba empírica completa.
Con el hardware actual, no se recomienda invertir más tiempo en esta vía; el pipeline HyperFrames
existente sigue siendo la ruta de producción de video.

## V. Recomendación final
No proceder con Wan2GP en este hardware. Mantener `video-production/` sin cambios. Reevaluar solo si
cambia el hardware (GPU con ≥6 GB VRAM real) o si Wan2GP publica en el futuro un modo validado por
debajo de ese umbral con RAM offload demostrado en iGPUs de VRAM sub-1GB.
