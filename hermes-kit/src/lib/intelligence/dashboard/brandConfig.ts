// brandConfig.ts — Configuración white-label del producto "AI Marketing
// Intelligence & Growth OS". "Hermes" es el nombre de la plataforma interna
// (infraestructura); NUNCA se muestra como marca principal en esta
// superficie -- solo puede aparecer en `platformName` (sitios secundarios:
// About/Configuración). Cambiar estos valores personaliza la marca visible
// sin tocar ningún componente.
export interface BrandConfig {
  productName: string;
  productSubtitle: string;
  tagline: string;
  /** Nombre técnico de la plataforma subyacente -- solo visible en contextos secundarios (Configuración/Acerca de). */
  platformName: string;
  /** Ruta al logo real, cuando exista. null -> se usa el BrandMark generado (ribbon "A" en SVG). */
  logoUrl: string | null;
}

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  productName: "AI Marketing Intelligence",
  productSubtitle: "& Growth OS",
  tagline: "INSIGHT · STRATEGY · CREATIVE · GROWTH",
  platformName: "Hermes",
  logoUrl: null,
};
