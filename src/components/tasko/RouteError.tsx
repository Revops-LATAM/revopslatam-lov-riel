import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center text-center px-6 py-16 h-full"
    >
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-medium">Algo no salió bien</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md break-words">
        {(error instanceof Error && error.message) || "Ocurrió un error inesperado."}
      </p>
      <Button
        size="sm"
        className="mt-4"
        onClick={() => {
          reset?.();
          router.invalidate();
        }}
      >
        Reintentar
      </Button>
    </div>
  );
}

export function RouteNotFound({ title = "No encontrado", description }: { title?: string; description?: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 h-full">
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>
      )}
      <Button size="sm" variant="outline" className="mt-4" onClick={() => router.history.back()}>
        Volver
      </Button>
    </div>
  );
}
