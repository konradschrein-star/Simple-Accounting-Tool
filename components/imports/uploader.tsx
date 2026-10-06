"use client"

import { FileSpreadsheetIcon, FileTextIcon, UploadCloudIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { importErrorMessage } from "@/lib/import-errors"
import { cn } from "@/lib/utils"

export function StatementUploader({ pdfRemaining }: { pdfRemaining: number }) {
  const router = useRouter()
  const [uploading, setUploading] = useState<string | null>(null)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    maxSize: 10 * 1024 * 1024,
    accept: { "text/csv": [".csv", ".txt", ".tsv"], "application/pdf": [".pdf"] },
    onDropRejected: ([rejection]) =>
      toast.error(importErrorMessage(rejection?.errors[0]?.code === "file-too-large" ? "FILE_TOO_LARGE" : "UNSUPPORTED_TYPE")),
    onDropAccepted: async ([file]) => {
      setUploading(file.name)
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/imports", { method: "POST", body })
      const json = await response.json().catch(() => ({}))
      setUploading(null)
      if (!response.ok) return void toast.error(importErrorMessage(json.code))
      router.push(`/imports/${json.id}`)
    },
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-12 text-center transition-colors hover:border-primary/60",
        isDragActive && "border-primary bg-primary/5",
      )}
    >
      <input {...getInputProps()} />
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {uploading ? <Spinner className="size-5" /> : <UploadCloudIcon className="size-6" />}
      </div>
      <div>
        <p className="font-medium">{uploading ? `Uploading ${uploading}…` : "Drop a bank statement here, or click to browse"}</p>
        <p className="mt-1 text-sm text-muted-foreground">No bank login needed — just the export from your online banking.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileSpreadsheetIcon className="size-4" /> CSV export · unlimited
        </span>
        <span className="flex items-center gap-1.5">
          <FileTextIcon className="size-4" /> PDF statement · AI reader · {pdfRemaining} left this month
        </span>
      </div>
    </div>
  )
}
