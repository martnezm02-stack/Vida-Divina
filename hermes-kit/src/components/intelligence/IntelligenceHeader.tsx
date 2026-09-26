interface IntelligenceHeaderProps {
  title: string;
  subtitle?: string;
}

export function IntelligenceHeader({ title, subtitle }: IntelligenceHeaderProps) {
  return (
    <header className="border-b border-intel-border bg-intel-bg-elevated px-6 py-4">
      <h1 className="font-display text-xl font-semibold text-intel-text">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-intel-muted">{subtitle}</p>}
    </header>
  );
}
