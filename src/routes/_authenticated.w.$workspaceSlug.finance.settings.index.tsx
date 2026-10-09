import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt, FileText, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/w/$workspaceSlug/finance/settings/")({
  component: FinanceSettingsIndex,
});

function FinanceSettingsIndex() {
  const { workspaceSlug } = Route.useParams();
  const base = `/w/${workspaceSlug}/finance/settings`;

  const cards = [
    {
      to: `${base}/emisor`,
      icon: <FileText className="w-5 h-5" />,
      title: "Datos del emisor",
      desc: "Razón social, RUT, dirección y giro que aparece en cada DTE.",
    },
    {
      to: `${base}/dte`,
      icon: <Receipt className="w-5 h-5" />,
      title: "Facturación electrónica",
      desc: "API key de OpenFactura, ambiente (sandbox/producción) y folios.",
    },
    {
      to: `${base}/costs`,
      icon: <DollarSign className="w-5 h-5" />,
      title: "Costos por hora",
      desc: "Costo interno por miembro para calcular margen en proyectos.",
    },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <p className="text-sm text-muted-foreground mb-6">
        Configuración exclusiva del espacio de Finanzas.
      </p>
      <div className="grid gap-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="flex items-start gap-3 p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors"
          >
            <div className="mt-0.5 text-primary">{c.icon}</div>
            <div>
              <div className="text-sm font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground">{c.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
