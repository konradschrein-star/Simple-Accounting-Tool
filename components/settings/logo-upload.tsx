"use client"

import { ImageIcon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { removeLogo } from "@/server/actions/settings"

export function LogoUpload({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [version, setVersion] = useState(0)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] },
    maxFiles: 1,
    maxSize: 1024 * 1024,
    onDropRejected: () => toast.error("Use a PNG or JPG under 1 MB"),
    onDropAccepted: async ([file]) => {
      setUploading(true)
      try {
        const body = new FormData()
        body.set("logo", file)
        const response = await fetch("/api/settings/logo", { method: "POST", body })
        if (!response.ok) return void toast.error((await response.json().catch(() => ({}))).error ?? "Upload failed")
      } catch {
        return void toast.error("Upload failed — check your connection and try again.")
      } finally {
        setUploading(false)
      }
      toast.success("Logo updated")
      setVersion((v) => v + 1)
      router.refresh()
    },
  })

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        {...getRootProps()}
        className={cn(
          "flex h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors",
          isDragActive && "border-primary bg-primary/5"
        )}
      >
        <input {...getInputProps()} />
        {uploading ? <Spinner /> : <UploadIcon className="size-5" />}
        <span>Drop your logo here or click to upload</span>
        <span className="text-xs">PNG or JPG, max 1 MB</span>
      </div>
      <div className="flex h-28 w-48 items-center justify-center rounded-lg border bg-white p-3">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, per-tenant image
          <img src={`/api/settings/logo?v=${version}`} alt="Your logo" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="size-6 text-gray-400" />
        )}
      </div>
      {hasLogo ? (
        <form action={removeLogo}>
          <Button variant="ghost" size="sm">
            Remove
          </Button>
        </form>
      ) : null}
    </div>
  )
}
