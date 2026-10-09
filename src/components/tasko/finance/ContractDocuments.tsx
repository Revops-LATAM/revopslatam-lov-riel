import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listContractDocuments,
  getContractDocumentUrl,
  deleteContractDocument,
} from "@/lib/api/contract-documents.functions";

interface Props {
  workspaceId: string;
  contractId: string;
}

interface Doc {
  name: string;
  path: string;
  size: number;
  createdAt: string | null;
}

export function ContractDocuments({ workspaceId, contractId }: Props) {
  const list = useServerFn(listContractDocuments);
  const getUrl = useServerFn(getContractDocumentUrl);
  const del = useServerFn(deleteContractDocument);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      const r = await list({ data: { workspaceId, contractId } });
      setDocs(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, contractId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${workspaceId}/${contractId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("contract-documents")
        .upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      toast.success("Documento subido");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error subiendo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const { url } = await getUrl({ data: { path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await del({ data: { path } });
      toast.success("Eliminado");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Documentos del contrato</h3>
          <p className="text-xs text-muted-foreground">
            PDF, anexos, órdenes de compra. Visibles solo para miembros del workspace.
          </p>
        </div>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-3 mr-1" />
            {uploading ? "Subiendo…" : "Subir documento"}
          </Button>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
          Aún no hay documentos.
        </div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {docs.map((d) => (
            <div key={d.path} className="flex items-center gap-2 px-3 py-2 text-xs">
              <FileText className="size-3 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate">{d.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(d.size / 1024).toFixed(1)} KB
                  {d.createdAt
                    ? ` · ${new Date(d.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })}`
                    : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDownload(d.path)}>
                <Download className="size-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(d.path)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
