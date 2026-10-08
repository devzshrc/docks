"use client"

import { useWindowVirtualizer } from "@tanstack/react-virtual"
import { useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react"

/**
 * A table body that only mounts the rows near the viewport (the page scrolls in the window, so this uses the window
 * virtualiser). Each item is its own <tbody>, which lets a line's comment threads or composer sit below it and be
 * measured with the row. Spacer rows above and below keep the scrollbar the length of the whole file.
 */
export function VirtualTable({
  count,
  estimate = 20,
  overscan = 40,
  colSpan,
  className,
  renderItem,
  handle,
}: {
  count: number
  estimate?: number
  overscan?: number
  colSpan: number
  className?: string
  renderItem: (index: number) => ReactNode
  /** Lets a caller scroll to an item that may not be mounted (jump to a hunk). */
  handle?: Ref<{ scrollTo: (index: number) => void }>
}) {
  const table = useRef<HTMLTableElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    if (table.current) setMargin(table.current.getBoundingClientRect().top + window.scrollY)
  }, [])
  const v = useWindowVirtualizer({ count, estimateSize: () => estimate, overscan, scrollMargin: margin })
  useImperativeHandle(handle, () => ({ scrollTo: (i: number) => v.scrollToIndex(i, { align: "center" }) }), [v])
  const items = v.getVirtualItems()
  const top = items.length ? items[0]!.start - margin : 0
  const bottom = items.length ? v.getTotalSize() - (items[items.length - 1]!.end - margin) : 0
  return (
    <table ref={table} className={className}>
      <tbody aria-hidden>
        <tr style={{ height: Math.max(0, top) }}>
          <td colSpan={colSpan} className="p-0" />
        </tr>
      </tbody>
      {items.map((it) => {
        return (
          <tbody key={it.key} data-index={it.index} ref={v.measureElement}>
            {renderItem(it.index)}
          </tbody>
        )
      })}
      <tbody aria-hidden>
        <tr style={{ height: Math.max(0, bottom) }}>
          <td colSpan={colSpan} className="p-0" />
        </tr>
      </tbody>
    </table>
  )
}
