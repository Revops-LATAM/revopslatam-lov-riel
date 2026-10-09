type ContractType = "implementation" | "recurrente";

const LABEL: Record<ContractType, string> = {
  implementation: "Proyecto",
  recurrente: "Recurrente",
};

const COLOR: Record<ContractType, string> = {
  implementation: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  recurrente: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export function ContractTypeBadge({ type }: { type: ContractType }) {
  return (
    <span
      className={`text-[10px] uppercase rounded px-1.5 py-0.5 border ${COLOR[type]}`}
    >
      {LABEL[type]}
    </span>
  );
}
