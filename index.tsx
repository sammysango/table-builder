import React, { useLayoutEffect, useMemo, useRef } from 'react'
import styles from './styles.module.css'
import Translate from '@docusaurus/Translate'

type WidthMode = 'equal' | 'content' // 'equal' = even split, 'content' = browser auto

// color presets authors can pick per column in MDX
type PresetName = 'default' | 'purple' | 'blue' | 'green' | 'orange'

// font weight per column
type FontWeight = 'normal' | 'bold' | number

type ColAlign = 'left' | 'center' | 'right'

type ColumnColor = {
  bodyBg?: string
  bodyText?: string
  headBg?: string
  headText?: string
}

type DataTableProps = {
  id?: string
  caption?: React.ReactNode
  headers: React.ReactNode[]

  /* A) explicit CSS widths ('25%', 'clamp(20%, 22ch, 32%)', 'auto', etc etc) */
  colWidths?: string[]

  /* B) ratios ([1,2,1] => 25% / 50% / 25%) */
  colRatios?: number[]

  widthMode?: WidthMode

  /* per-column colour presets */
  colPresets?: PresetName[]

  compact?: boolean
  unboldFirstCol?: boolean
  className?: string

  /* manual per-column color overrides */
  columnColors?: ColumnColor[]

  /* bold-or-not column */
  colWeights?: FontWeight[]

  /* text alignment inside the cell */
  colAligns?: ColAlign[]

  /* prevent uggo mid-word breaks by enforcing per-column min width */
  protectWords?: boolean // default: true
  /* ipper bound for per-column min width (based on longest word) */
  maxWordCh?: number // default: 26

  children: React.ReactNode
}

type RowProps = { children: React.ReactNode; unbold?: boolean }
type CellProps = { children: React.ReactNode; span?: number; align?: 'left' | 'center' | 'right' }

// colour presets
const PRESETS: Record<PresetName, ColumnColor> = {
  default: {
    headBg: 'var(--chart-header)',
    headText: 'var(--chart-header-text)',
    bodyBg: 'var(--connect-card)',
    bodyText: 'inherit',
  },
  purple: {
    headBg: 'var(--consumer-purple-dark)',
    headText: 'var(--consumer-purple-light)',
    bodyBg: 'rgb(208 117 255 / 10%)',
    bodyText: 'inherit',
  },
  blue: {
    headBg: 'var(--consumer-blue-dark)',
    headText: 'var(--consumer-blue-light)',
    bodyBg: 'rgb(22 127 255 / 10%)',
    bodyText: 'inherit',
  },
  green: {
    headBg: 'var(--consumer-green-dark)',
    headText: 'var(--consumer-green-light)',
    bodyBg: 'rgb(94 242 74 / 10%)',
    bodyText: 'inherit',
  },
  orange: {
    headBg: 'var(--consumer-orange-dark)',
    headText: 'var(--consumer-orange-light)',
    bodyBg: 'rgb(255 92 22 / 10%)',
    bodyText: 'inherit',
  },
}

export default function DataTable({
  id,
  caption,
  headers,
  colWidths,
  colRatios,
  widthMode = 'equal',
  colPresets,
  compact,
  unboldFirstCol,
  className,
  columnColors,
  colWeights,
  colAligns,
  protectWords = true,
  maxWordCh = 26,
  children,
}: DataTableProps) {
  const tableRef = useRef<HTMLTableElement>(null)

  // 1. build inline css vars for per-column header/body colours
  const colorVars = useMemo(() => {
    const vars: React.CSSProperties = {}

    // apply presets first
    colPresets?.forEach((name, i) => {
      const preset = PRESETS[name as PresetName]
      if (!preset) return
      const n = i + 1
      if (preset.bodyBg) {
        ;(vars as any)[`--col${n}-bg`] = preset.bodyBg
      }
      if (preset.bodyText) {
        ;(vars as any)[`--col${n}-text`] = preset.bodyText
      }
      if (preset.headBg) {
        ;(vars as any)[`--head${n}-bg`] = preset.headBg
      }
      if (preset.headText) {
        ;(vars as any)[`--head${n}-text`] = preset.headText
      }
    })

    // manual overrides last
    columnColors?.forEach((c, i) => {
      const n = i + 1
      if (c.bodyBg) {
        ;(vars as any)[`--col${n}-bg`] = c.bodyBg
      }
      if (c.bodyText) {
        ;(vars as any)[`--col${n}-text`] = c.bodyText
      }
      if (c.headBg) {
        ;(vars as any)[`--head${n}-bg`] = c.headBg
      }
      if (c.headText) {
        ;(vars as any)[`--head${n}-text`] = c.headText
      }
    })

    if (colWeights && colWeights.length) {
      colWeights.forEach((w, i) => {
        const n = i + 1
        const val = typeof w === 'number' ? String(w) : w === 'bold' ? '700' : '400' // 'normal'
        ;(vars as any)[`--w${n}`] = val
      })
    }

    if (colAligns && colAligns.length) {
      colAligns.forEach((a, i) => {
        const n = i + 1
        const val = a === 'center' || a === 'right' ? a : 'left'
        ;(vars as any)[`--a${n}`] = val
      })
    }

    return vars
  }, [colPresets, columnColors, colWeights, colAligns])

  // 2. Column width strategy
  const widths = useMemo(() => {
    if (colRatios && colRatios.length === headers.length) {
      const total = colRatios.reduce((a, b) => a + (isFinite(b) ? b : 0), 0) || 1
      return colRatios.map(r => `${(Math.max(0, r) / total) * 100}%`)
    }
    if (colWidths && colWidths.length === headers.length) {
      return colWidths
    }
    if (widthMode === 'content') {
      return new Array(headers.length).fill('auto')
    }
    const equal = 100 / Math.max(1, headers.length)
    return new Array(headers.length).fill(`${equal}%`)
  }, [colRatios, colWidths, headers.length, widthMode])

  // 3. word-protection (stop words being cut part-way with calculated min width)
  useLayoutEffect(() => {
    if (!protectWords) return
    const table = tableRef.current
    if (!table) return

    const colCount = headers.length
    const perColMax: number[] = new Array(colCount).fill(0)

    const measureWordLen = (text: string) => {
      const tokens = (text || '').split(/\s+/)
      let max = 0
      for (const t of tokens) {
        const core = t.replace(/^[^\w@:/]+|[^\w)]+$/g, '')
        if (core.length > max) max = core.length
      }
      return Math.min(max || 0, maxWordCh)
    }

    const compute = () => {
      perColMax.fill(0)
      const rows = table.tBodies?.[0]?.rows || []
      for (const row of Array.from(rows)) {
        const cells = Array.from(row.cells)
        for (let i = 0; i < Math.min(cells.length, colCount); i++) {
          const text = cells[i].textContent || ''
          perColMax[i] = Math.max(perColMax[i], measureWordLen(text))
        }
      }
      const style = table.style as any
      perColMax.forEach((len, i) => {
        style.setProperty(`--c${i + 1}-min`, len > 0 ? `${len + 1}ch` : '0')
      })
    }

    compute()

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute())
      ro.observe(table)
    } else {
      const onResize = () => compute()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }
    return () => ro?.disconnect()
  }, [headers.length, protectWords, maxWordCh, children])

  // 4. compose className
  const sizeClass = compact ? styles.compact : ''
  const boldControl = unboldFirstCol ? styles.unboldFirstCol : ''
  const tableClass = [styles.table, styles.dataTable, sizeClass, boldControl, className].filter(Boolean).join(' ')

  // 5. render
  return (
    <div className={styles.scrollWrap} tabIndex={0} aria-label="Scrollable table">
      <table id={id} className={tableClass} ref={tableRef} style={colorVars}>
        {caption ? <caption className={styles.visuallyHidden}>{caption}</caption> : null}

        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>

        <thead>
          <tr className={styles.mainHeader}>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Row({ children, unbold }: RowProps) {
  return <tr className={unbold ? styles.unbold : undefined}>{children}</tr>
}

function Cell({ children, span = 1, align = 'left' }: CellProps) {
  return (
    <td colSpan={span} style={{ textAlign: align }}>
      {children}
    </td>
  )
}

function TwoColRow({ left, right, unbold }: { left: React.ReactNode; right: React.ReactNode; unbold?: boolean }) {
  return (
    <Row unbold={unbold}>
      <Cell>{left}</Cell>
      <Cell>{right}</Cell>
    </Row>
  )
}

DataTable.Row = Row
DataTable.Cell = Cell
DataTable.TwoColRow = TwoColRow
