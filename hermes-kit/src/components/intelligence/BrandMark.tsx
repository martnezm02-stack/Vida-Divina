import { DEFAULT_BRAND_CONFIG, type BrandConfig } from "@/lib/intelligence/dashboard/brandConfig";

/**
 * Emblema "A" formado por tres cintas en gradiente cian/azul/violeta --
 * placeholder aislado y reemplazable: si más adelante existe un asset de
 * logo real (brand.logoUrl), este componente pasa a renderizar esa imagen
 * en su lugar, sin que ningún otro componente cambie.
 */
function RibbonEmblem({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="intel-ribbon-1" x1="4" y1="34" x2="30" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4f7cff" />
        </linearGradient>
        <linearGradient id="intel-ribbon-2" x1="10" y1="34" x2="36" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4f7cff" />
          <stop offset="1" stopColor="#a56bff" />
        </linearGradient>
        <linearGradient id="intel-ribbon-3" x1="20" y1="34" x2="20" y2="4" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a56bff" />
        </linearGradient>
      </defs>
      <path d="M20 4 L6 34 L14 34 L20 20 L26 34 L34 34 Z" fill="url(#intel-ribbon-3)" opacity="0.35" />
      <path d="M20 4 L8 32 L15 32 Z" fill="url(#intel-ribbon-1)" />
      <path d="M20 4 L32 32 L25 32 Z" fill="url(#intel-ribbon-2)" />
    </svg>
  );
}

interface BrandMarkProps {
  size?: number;
  brand?: BrandConfig;
  showTagline?: boolean;
}

export function BrandMark({ size = 32, brand = DEFAULT_BRAND_CONFIG, showTagline = true }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-3">
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- next/image optimizer devuelve 400 bajo el basePath /hermes (bug ya diagnosticado en Logo.tsx); mismo workaround aquí.
        <img src={brand.logoUrl} alt={brand.productName} width={size} height={size} className="rounded-md object-contain" />
      ) : (
        <RibbonEmblem size={size} />
      )}
      <div className="leading-tight">
        <div className="flex items-baseline gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <span className="intel-gradient-text">{brand.productName}</span>
          <span className="text-intel-muted text-[13px]">{brand.productSubtitle}</span>
        </div>
        {showTagline && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-intel-muted">{brand.tagline}</div>
        )}
      </div>
    </div>
  );
}
