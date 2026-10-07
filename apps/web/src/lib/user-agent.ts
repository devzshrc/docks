export type DeviceKind = "desktop" | "phone" | "tablet"

/** Browser, OS and device class from a User-Agent string. Deliberately small: enough to label a session row. */
export function parseUserAgent(ua: string | null | undefined): { device: DeviceKind; browser?: string; os?: string } {
  const s = ua ?? ""
  const device: DeviceKind = /iPad|Tablet/i.test(s) ? "tablet" : /Mobi|iPhone|Android/i.test(s) ? "phone" : "desktop"

  // Order matters: Edge and Opera also say Chrome, Chrome also says Safari.
  const browser =
    /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /Firefox\//.test(s) || /FxiOS/.test(s) ? "Firefox"
    : /Chrome\/|CriOS/.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari"
    : /curl\//i.test(s) ? "curl"
    : undefined

  const os =
    /Windows NT 10/.test(s) ? "Windows"
    : /Windows/.test(s) ? "Windows"
    : /iPhone|iPad|iPod/.test(s) ? "iOS"
    : /Android/.test(s) ? "Android"
    : /Mac OS X|Macintosh/.test(s) ? "macOS"
    : /CrOS/.test(s) ? "ChromeOS"
    : /Linux/.test(s) ? "Linux"
    : undefined

  return { device, browser, os }
}
