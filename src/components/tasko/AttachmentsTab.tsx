import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTaskAttachments, registerTaskAttachment } from "@/lib/api/tasko.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, Download, Eye } from "lucide-react";

import { toast } from "sonner";

export function AttachmentsTab({
  taskId,
  uploadSignal,
}: {
  taskId: string;
  uploadSignal?: number;
}) {
  const qc = useQueryClient();
  const fetchAttachments = useServerFn(listTaskAttachments);
  const registerAtt = useServerFn(registerTaskAttachment);

  const attachmentsQuery = useQuery({
    queryKey: ["attachments", taskId],
    queryFn: () => fetchAttachments({ data: { taskId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["attachments", taskId] });

  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (uploadSignal && fileInput.current) fileInput.current.click();
  }, [uploadSignal]);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("task-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      await registerAtt({
        data: {
          taskId,
          filePath: path,
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
        },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Archivo subido");
    },
    onError: (err: Error) => toast.error("Error al subir", { description: err.message }),
    onSettled: () => {
      if (fileInput.current) fileInput.current.value = "";
    },
  });

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
  };

  return (
    <div className="space-y-3">
      <div>
        <input ref={fileInput} type="file" className="hidden" onChange={onUpload} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploadMut.isPending}
        >
          <Paperclip className="w-3.5 h-3.5 mr-1" />
          {uploadMut.isPending ? "Subiendo..." : "Subir archivo"}
        </Button>
      </div>
      <div className="divide-y divide-border">
        {(attachmentsQuery.data ?? []).map((a) => (
          <div key={a.id} className="py-2 flex items-center gap-2 group">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm flex-1 truncate">{a.file_name}</span>
            {a.size && (
              <span className="text-xs text-muted-foreground">{(a.size / 1024).toFixed(1)} KB</span>
            )}
            {a.url && (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="w-7 h-7"
                aria-label={`Abrir ${a.file_name}`}
              >
                <a href={a.url} target="_blank" rel="noopener">
                  <Eye className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}
            {a.downloadUrl && (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="w-7 h-7"
                aria-label={`Descargar ${a.file_name}`}
              >
                <a href={a.downloadUrl} download={a.file_name}>
                  <Download className="w-3.5 h-3.5" />
                </a>
              </Button>
            )}
          </div>
        ))}
        {(attachmentsQuery.data ?? []).length === 0 && (
          <div className="flex flex-col items-center text-center py-6 text-muted-foreground">
            <Paperclip className="w-5 h-5 mb-1.5 opacity-60" aria-hidden="true" />
            <span className="text-xs">Sin adjuntos</span>
          </div>
        )}
      </div>
    </div>
  );
}
