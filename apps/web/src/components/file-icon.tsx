import {
  CssFile01Icon,
  DocumentCodeIcon,
  File01Icon,
  FileLockIcon,
  HtmlFile01Icon,
  Image01Icon,
  JavaScriptIcon,
  PythonIcon,
  SqlIcon,
  Typescript01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

type IconDef = typeof File01Icon

/** Extension → icon and a quiet tint, so files read as files at a glance. */
function iconFor(path: string): { icon: IconDef; tint: string } {
  const name = path.split("/").pop()!.toLowerCase()
  if (/(^|\.)(lock|lockb)$|^pnpm-lock\.yaml$|^package-lock\.json$|^go\.sum$/.test(name)) {
    return { icon: FileLockIcon, tint: "text-muted-foreground" }
  }
  const ext = name.includes(".") ? name.split(".").pop()! : ""
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return { icon: Typescript01Icon, tint: "text-sky-600 dark:text-sky-400" }
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { icon: JavaScriptIcon, tint: "text-amber-600 dark:text-amber-400" }
    case "css":
    case "scss":
      return { icon: CssFile01Icon, tint: "text-violet-600 dark:text-violet-400" }
    case "html":
      return { icon: HtmlFile01Icon, tint: "text-orange-600 dark:text-orange-400" }
    case "py":
      return { icon: PythonIcon, tint: "text-emerald-600 dark:text-emerald-400" }
    case "sql":
      return { icon: SqlIcon, tint: "text-teal-600 dark:text-teal-400" }
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "env":
      return { icon: DocumentCodeIcon, tint: "text-muted-foreground" }
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return { icon: Image01Icon, tint: "text-pink-600 dark:text-pink-400" }
    default:
      return { icon: File01Icon, tint: "text-muted-foreground" }
  }
}

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const { icon, tint } = iconFor(path)
  return <HugeiconsIcon icon={icon} size={16} className={cn("shrink-0", tint, className)} aria-hidden />
}
