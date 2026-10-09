import { forwardRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Currency = "USD" | "CLP" | "UF" | string;

const PREFIX: Record<string, string> = {
  CLP: "$",
  USD: "US$",
  UF: "UF",
};

function decimalsFor(currency: Currency) {
  return currency === "CLP" ? 0 : 2;
}

function formatDisplay(raw: string, currency: Currency): string {
  if (raw === "" || raw == null) return "";
  // Normalize: keep digits and at most one decimal separator (comma or dot)
  let s = String(raw).replace(/[^0-9.,-]/g, "");
  // Replace last comma with dot, drop other commas/dots used as thousand separators
  // Strategy: detect if user has comma as decimal (es-CL) vs dot
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart = "";
  let decPart = "";
  if (lastComma === -1 && lastDot === -1) {
    intPart = s;
  } else {
    const sepIdx = Math.max(lastComma, lastDot);
    intPart = s.slice(0, sepIdx).replace(/[.,]/g, "");
    decPart = s.slice(sepIdx + 1).replace(/[.,]/g, "");
  }
  intPart = intPart.replace(/[^0-9-]/g, "");
  const neg = intPart.startsWith("-");
  intPart = intPart.replace(/-/g, "");
  if (intPart === "" && decPart === "") return "";
  const intNum = intPart === "" ? 0 : Number(intPart);
  const intFmt = new Intl.NumberFormat("es-CL").format(intNum);
  const maxDec = decimalsFor(currency);
  let out = intFmt;
  if (maxDec > 0 && (decPart !== "" || raw.endsWith(",") || raw.endsWith("."))) {
    out += "," + decPart.slice(0, maxDec);
  }
  return (neg ? "-" : "") + out;
}

function toRaw(display: string, currency: Currency): string {
  if (!display) return "";
  const maxDec = decimalsFor(currency);
  if (maxDec === 0) {
    const neg = display.trim().startsWith("-");
    const digits = display.replace(/[^0-9]/g, "");
    if (!digits) return "";
    return (neg ? "-" : "") + digits;
  }
  const lastComma = display.lastIndexOf(",");
  const lastDot = display.lastIndexOf(".");
  let intPart = "";
  let decPart = "";
  if (lastComma === -1 && lastDot === -1) {
    intPart = display.replace(/[^0-9-]/g, "");
  } else {
    const sepIdx = Math.max(lastComma, lastDot);
    intPart = display.slice(0, sepIdx).replace(/[^0-9-]/g, "");
    decPart = display.slice(sepIdx + 1).replace(/[^0-9]/g, "");
  }
  if (intPart === "" && decPart === "") return "";
  return decPart ? `${intPart || "0"}.${decPart.slice(0, maxDec)}` : intPart || "0";
}

export interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> {
  value: string | number | null | undefined;
  onValueChange: (raw: string) => void;
  currency: Currency;
  showPrefix?: boolean;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, currency, showPrefix = true, className, ...rest }, ref) => {
    const display = useMemo(
      () => formatDisplay(value == null ? "" : String(value), currency),
      [value, currency],
    );
    const prefix = PREFIX[currency] ?? currency;
    return (
      <div className="relative">
        {showPrefix && (
          <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-xs text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          ref={ref}
          inputMode="decimal"
          type="text"
          value={display}
          onChange={(e) => onValueChange(toRaw(e.target.value, currency))}
          className={cn(showPrefix && "pl-10", className)}
          {...rest}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
