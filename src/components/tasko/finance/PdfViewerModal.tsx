import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getInvoicePdf } from "@/lib/api/dte.functions";

// react-pdf depends on browser-only APIs (DOMMatrix, canvas). Load it lazily
// so it never touches the SSR bundle.
const PdfDocument = lazy(async () => {
  const mod = await import("react-pdf");
  await import("react-pdf/dist/Page/AnnotationLayer.css");
  await import("react-pdf/dist/Page/TextLayer.css");
  mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
  return { default: mod.Document };
});
const PdfPage = lazy(async () => {
  const mod = await import("react-pdf");
  return { default: mod.Page };
});

interface PdfViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  invoiceId?: string | null;
  title?: string;
}

export function PdfViewerModal({
  open,
  onOpenChange,
  pdfUrl,
  invoiceId,
  title = "Documento",
}: PdfViewerModalProps) {
  const [isClient, setIsClient] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [retryNonce, setRetryNonce] = useState(0);
  const blobUrlRef = useRef<string | null>(null);
  const fetchInvoicePdf = useServerFn(getInvoicePdf);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!pdfUrl || !open) {
      setBlobUrl(null);
      setError(null);
      setPageNumber(1);
      setNumPages(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    const fetchPdf = async () => {
      try {
        if (invoiceId) {
          const result = await fetchInvoicePdf({ data: { invoiceId } });
          const binary = atob(result.base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes], { type: result.contentType }));
          blobUrlRef.current = url;
          setBlobUrl(url);
          return;
        }

        const headers: HeadersInit = {};
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const apikey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
          import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
        const isSupabaseUrl = !!supabaseUrl && pdfUrl.startsWith(supabaseUrl);

        if (isSupabaseUrl) {
          // Supabase edge functions need apikey + Authorization headers
          // even when the function authenticates via a token query param.
          const { data: { session } } = await supabase.auth.getSession();
          if (apikey) headers["apikey"] = apikey;
          headers["Authorization"] = `Bearer ${session?.access_token ?? apikey ?? ""}`;
        }

        const response = await fetch(pdfUrl, {
          signal: controller.signal,
          headers,
        });
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const blob = await response.blob();
        const pdfBlob =
          blob.type === "application/pdf"
            ? blob
            : new Blob([blob], { type: "application/pdf" });
        const url = URL.createObjectURL(pdfBlob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          console.error("PDF fetch error:", err);
          setError(err instanceof Error ? err.message : "Error al cargar PDF");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPdf();

    return () => {
      controller.abort();
    };
  }, [fetchInvoicePdf, invoiceId, pdfUrl, open, retryNonce]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  if (!pdfUrl) return null;

  const handleDownload = () => {
    if (!blobUrl) return;
    const sanitized = title.replace(/[<>:"/\\|?*]/g, "").trim();
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${sanitized}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExternal = () => {
    if (blobUrl) window.open(blobUrl, "_blank");
  };

  const loadingFallback = (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-2 text-sm text-muted-foreground">Cargando PDF…</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-3 border-b flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center justify-between pr-10">
            <div className="flex flex-col">
              <DialogTitle className="text-sm font-semibold tracking-tight">{title}</DialogTitle>
              <DialogDescription className="sr-only">Vista previa del PDF de la factura</DialogDescription>
              {numPages > 0 && (
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Página {pageNumber} de {numPages} · {Math.round(scale * 100)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {numPages > 0 && (
                <>
                  <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                      disabled={pageNumber <= 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                      disabled={pageNumber >= numPages}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
                      disabled={scale <= 0.5}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
                      disabled={scale >= 2.5}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="h-5 w-px bg-border mx-1" />
                </>
              )}
              <Button variant="ghost" size="sm" className="h-8" onClick={handleDownload} disabled={!blobUrl}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar
              </Button>
              <Button variant="ghost" size="sm" className="h-8" onClick={handleOpenExternal} disabled={!blobUrl}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-[hsl(var(--muted))] flex justify-center items-start">
          {loading && loadingFallback}
          {error && (
            <div className="flex flex-col items-center justify-center h-full text-destructive">
              <AlertCircle className="h-8 w-8 mb-2" />
              <span className="text-sm">Error: {error}</span>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setRetryNonce((n) => n + 1)}
              >
                Reintentar
              </Button>
            </div>
          )}
          {isClient && blobUrl && !loading && !error && (
            <Suspense fallback={loadingFallback}>
              <PdfDocument
                file={blobUrl}
                onLoadSuccess={({ numPages }: { numPages: number }) => {
                  setNumPages(numPages);
                  setPageNumber(1);
                }}
                onLoadError={(e: unknown) => {
                  console.error("PDF load error:", e);
                  setError("Error al renderizar el PDF");
                }}
                loading={loadingFallback}
                className="py-6"
              >
                <PdfPage
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer
                  renderAnnotationLayer
                  className="shadow-2xl ring-1 ring-border/50 rounded-sm overflow-hidden"
                />
              </PdfDocument>
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
