/**
 * Importação e exportação de planilhas.
 *
 * A exportação gera um arquivo com a mesma organização da planilha original
 * (abas Cadastros / Lançamentos / Análise), para que quem já usava o Excel
 * reconheça o resultado. A importação, por sua vez, aceita tanto esse layout
 * quanto arquivos mais simples, detectando as colunas pelo cabeçalho.
 *
 * O ExcelJS pesa quase 1 MB e só é necessário quando o usuário importa ou
 * exporta algo, então é carregado sob demanda: quem apenas abre o painel não
 * paga esse custo no bundle inicial.
 */
import type ExcelJSTypes from 'exceljs'
import type { EntryWithRelations, MonthlyCashflow } from '@/lib/types'
import { formatDate, toDateOnly } from '@/lib/format'
import type { DreRow, MonthPoint } from '@/lib/analytics'

/** Carrega o ExcelJS apenas quando alguma operação de planilha acontece. */
async function loadExcelJS(): Promise<typeof ExcelJSTypes> {
  const mod = await import('exceljs')
  return mod.default
}

/* ========================================================================== */
/* Exportação                                                                  */
/* ========================================================================== */

interface ExportPayload {
  organization: string
  from: string
  to: string
  series: MonthPoint[]
  entries: EntryWithRelations[]
  dre: DreRow[]
}

const HEADER_FILL_STYLE = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2421' },
} as const

const HEADER_FONT_STYLE = {
  color: { argb: 'FFFFFFFF' },
  bold: true,
  size: 11,
} as const

const MONEY_FORMAT = 'R$ #,##0.00'
const DATE_FORMAT = 'dd/mm/yyyy'

function styleHeaderRow(
  row: ExcelJSTypes.Row,
  columns: number,
) {
  row.height = 20
  for (let i = 1; i <= columns; i += 1) {
    const cell = row.getCell(i)
    cell.fill = HEADER_FILL_STYLE
    cell.font = HEADER_FONT_STYLE
    cell.alignment = { vertical: 'middle' }
  }
}

/** Gera e baixa o arquivo .xlsx com o fluxo de caixa do período. */
export async function exportCashflowWorkbook(payload: ExportPayload) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Fluxo de Caixa'
  workbook.created = new Date()

  /* -- Aba Resumo -------------------------------------------------------- */

  const summary = workbook.addWorksheet('Resumo', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  summary.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
  ]

  summary.mergeCells('A1:E1')
  const titleCell = summary.getCell('A1')
  titleCell.value = `Fluxo de caixa — ${payload.organization}`
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF1F2421' } }
  summary.getRow(1).height = 24

  summary.mergeCells('A2:E2')
  summary.getCell('A2').value = `Período: ${formatDate(payload.from)} a ${formatDate(payload.to)}`
  summary.getCell('A2').font = { size: 10, color: { argb: 'FF737373' } }

  const summaryHeader = summary.addRow([
    'Mês',
    'Entradas',
    'Saídas',
    'Resultado',
    'Saldo acumulado',
  ])
  styleHeaderRow(summaryHeader, 5)

  for (const month of payload.series) {
    summary.addRow([
      month.key,
      month.income,
      month.expense,
      month.result,
      month.accumulated,
    ])
  }

  // Formata as colunas monetárias e aplica totais.
  for (let rowIndex = 4; rowIndex <= summary.rowCount; rowIndex += 1) {
    for (let col = 2; col <= 5; col += 1) {
      summary.getRow(rowIndex).getCell(col).numFmt = MONEY_FORMAT
    }
  }

  const totalRow = summary.addRow([
    'Total',
    payload.series.reduce((s, m) => s + m.income, 0),
    payload.series.reduce((s, m) => s + m.expense, 0),
    payload.series.reduce((s, m) => s + m.result, 0),
    null,
  ])
  totalRow.font = { bold: true }
  for (let col = 2; col <= 5; col += 1) {
    totalRow.getCell(col).numFmt = MONEY_FORMAT
    totalRow.getCell(col).border = { top: { style: 'thin' } }
  }

  /* -- Aba Lançamentos --------------------------------------------------- */

  const entriesSheet = workbook.addWorksheet('Lançamentos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  entriesSheet.columns = [
    { header: 'Data', key: 'date', width: 13 },
    { header: 'Descrição', key: 'description', width: 40 },
    { header: 'Plano de Conta', key: 'account', width: 26 },
    { header: 'Coluna1', key: 'kind', width: 10 },
    { header: 'Conta', key: 'wallet', width: 22 },
    { header: 'Cliente/Fornecedor', key: 'party', width: 26 },
    { header: 'Valor', key: 'amount', width: 16 },
    { header: 'Pago', key: 'paid', width: 10 },
    { header: 'Liquidação', key: 'settled', width: 13 },
    { header: 'Documento', key: 'reference', width: 20 },
  ]

  styleHeaderRow(entriesSheet.getRow(1), 10)

  for (const entry of payload.entries) {
    const row = entriesSheet.addRow({
      date: entry.issued_on,
      description: entry.description,
      account: entry.chart_of_accounts?.name ?? '',
      // Mantém a convenção E/S da planilha original.
      kind: entry.kind === 'entrada' ? 'E' : 'S',
      wallet: entry.wallets?.name ?? '',
      party: entry.parties?.name ?? '',
      amount: Number(entry.amount),
      paid: entry.status === 'pago' ? 'TRUE' : 'FALSE',
      settled: entry.settled_on ?? '',
      reference: entry.reference ?? '',
    })

    row.getCell('date').numFmt = DATE_FORMAT
    row.getCell('amount').numFmt = MONEY_FORMAT
    row.getCell('settled').numFmt = DATE_FORMAT

    // Saídas em vermelho, entradas em verde — leitura imediata.
    row.getCell('amount').font = {
      color: { argb: entry.kind === 'entrada' ? 'FF1C7A50' : 'FFB0402A' },
    }
  }

  // Filtro automático no cabeçalho.
  entriesSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 10 },
  }

  /* -- Aba DRE ----------------------------------------------------------- */

  const dreSheet = workbook.addWorksheet('DRE')
  dreSheet.columns = [
    { width: 36 },
    { width: 18 },
    { width: 14 },
  ]

  dreSheet.mergeCells('A1:C1')
  dreSheet.getCell('A1').value = 'DRE gerencial — base caixa'
  dreSheet.getCell('A1').font = { size: 13, bold: true }
  dreSheet.getRow(1).height = 22

  const dreHeader = dreSheet.addRow(['Descrição', 'Valor', '% da receita'])
  styleHeaderRow(dreHeader, 3)

  for (const row of payload.dre) {
    const added = dreSheet.addRow([row.label, row.value, row.share / 100])
    added.getCell(2).numFmt = MONEY_FORMAT
    added.getCell(3).numFmt = '0.0%'
    if (row.emphasis) added.font = { bold: true }
  }

  /* -- Download ---------------------------------------------------------- */

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const slug = payload.organization
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/(^-|-$)/g, '')

  triggerDownload(blob, `fluxo-de-caixa-${slug}-${payload.to.slice(0, 7)}.xlsx`)
}

/** Exporta apenas a série mensal — usado pelo atalho do dashboard. */
export async function exportMonthlyCashflow(
  organization: string,
  series: MonthPoint[],
) {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Fluxo mensal')

  sheet.columns = [
    { header: 'Mês', key: 'month', width: 14 },
    { header: 'Entradas', key: 'income', width: 18 },
    { header: 'Saídas', key: 'expense', width: 18 },
    { header: 'Resultado', key: 'result', width: 18 },
    { header: 'Saldo acumulado', key: 'accumulated', width: 20 },
  ]

  styleHeaderRow(sheet.getRow(1), 5)

  for (const month of series) {
    const row = sheet.addRow(month)
    for (const col of ['income', 'expense', 'result', 'accumulated']) {
      row.getCell(col).numFmt = MONEY_FORMAT
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  triggerDownload(blob, `fluxo-mensal-${organization.replace(/\s+/g, '-')}.xlsx`)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Libera a memória do blob depois que o download inicia.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ========================================================================== */
/* Importação                                                                  */
/* ========================================================================== */

export interface ParsedEntry {
  date: string
  description: string
  accountName: string
  kind: 'entrada' | 'saida'
  amount: number
  paid: boolean
  reference: string | null
}

export interface ParseResult {
  entries: ParsedEntry[]
  /** Contas distintas encontradas, com a natureza detectada. */
  accounts: { name: string; kind: 'receita' | 'despesa' }[]
  skipped: number
  /** Nomes de colunas reconhecidos, para exibir no resumo da importação. */
  columns: string[]
}

/** Natureza padrão quando a planilha não traz a coluna E/S. */
const DEFAULT_EXPENSE_HINTS = [
  'fornecedor',
  'despesa',
  'imposto',
  'contador',
  'salario',
  'salário',
  'pessoal',
  'administrativa',
  'retirada',
  'saída',
  'saida',
  'financeira',
  'transferência',
  'transferencia',
]

/**
 * Lê um arquivo .xlsx e devolve os lançamentos normalizados.
 *
 * Aceita tanto o layout da planilha original (aba "Lançamentos" com as
 * colunas Data / Plano de Conta / Valor / Pago / Coluna1) quanto planilhas
 * próprias do usuário, localizando as colunas pelo nome do cabeçalho.
 */
export async function parseEntriesWorkbook(file: File): Promise<ParseResult> {
  const ExcelJS = await loadExcelJS()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  // Prefere a aba "Lançamentos"; se não existir, usa a primeira com dados.
  const sheet =
    workbook.getWorksheet('Lançamentos') ??
    workbook.getWorksheet('Lancamentos') ??
    workbook.worksheets.find((ws) => ws.rowCount > 1) ??
    workbook.worksheets[0]

  if (!sheet) {
    throw new Error('A planilha não contém nenhuma aba com dados.')
  }

  // Localiza a linha de cabeçalho nas primeiras 20 linhas.
  let headerRowNumber = -1
  let columns: Record<string, number> = {}

  for (let r = 1; r <= Math.min(20, sheet.rowCount); r += 1) {
    const row = sheet.getRow(r)
    const found: Record<string, number> = {}

    row.eachCell((cell, colNumber) => {
      const text = String(cell.value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

      if (text === 'data') found.date = colNumber
      else if (text.includes('plano de conta') || text === 'categoria' || text === 'conta') {
        found.account ??= colNumber
      } else if (text === 'valor' || text === 'amount' || text === 'valor_analise') {
        found.amount = colNumber
      } else if (text === 'pago' || text === 'situacao' || text === 'status') {
        found.paid = colNumber
      } else if (text === 'coluna1' || text === 'tipo' || text === 'e/s') {
        found.kind = colNumber
      } else if (text === 'descricao' || text === 'historico' || text === 'descrição') {
        found.description = colNumber
      } else if (text.includes('documento') || text.includes('referencia') || text.includes('nf')) {
        found.reference = colNumber
      }
    })

    // A linha só vale como cabeçalho se tiver Data + Valor.
    if (found.date && found.amount) {
      headerRowNumber = r
      columns = found
      break
    }
  }

  if (headerRowNumber === -1) {
    throw new Error(
      'Não encontrei as colunas "Data" e "Valor" na planilha. Verifique se o cabeçalho está presente.',
    )
  }

  const entries: ParsedEntry[] = []
  const accountKinds = new Map<string, 'receita' | 'despesa'>()
  let skipped = 0

  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)

    const rawDate = readCell(row, columns.date)
    const rawAmount = readCell(row, columns.amount)
    const rawAccount = readCell(row, columns.account)

    if (rawDate === null || rawAmount === null) {
      skipped += 1
      continue
    }

    const date = normalizeDate(rawDate)
    const amount = normalizeAmount(rawAmount)
    const accountName = String(rawAccount ?? '').trim() || 'Não classificada'

    // Linhas vazias ou com valor zerado não entram.
    if (!date || amount === null || amount === 0) {
      skipped += 1
      continue
    }

    // Natureza: coluna E/S quando existir; senão, heurística pelo nome da conta.
    let kind: 'entrada' | 'saida'
    const rawKind = String(readCell(row, columns.kind) ?? '').trim().toUpperCase()

    if (rawKind === 'E' || rawKind === 'ENTRADA') {
      kind = 'entrada'
    } else if (rawKind === 'S' || rawKind === 'SAIDA' || rawKind === 'SAÍDA') {
      kind = 'saida'
    } else {
      const normalized = accountName.toLowerCase()
      const looksExpense = DEFAULT_EXPENSE_HINTS.some((hint) =>
        normalized.includes(hint),
      )
      kind = looksExpense ? 'saida' : 'entrada'
    }

    const rawPaid = readCell(row, columns.paid)
    const paid =
      rawPaid === null ||
      rawPaid === true ||
      String(rawPaid).toUpperCase() === 'TRUE' ||
      String(rawPaid).toLowerCase() === 'pago' ||
      String(rawPaid).trim() === '1'

    const description =
      String(readCell(row, columns.description) ?? '').trim() ||
      `Importado de planilha — ${accountName}`

    const reference = columns.reference
      ? String(readCell(row, columns.reference) ?? '').trim() || null
      : null

    entries.push({
      date,
      description,
      accountName,
      kind,
      amount: Math.abs(amount),
      paid,
      reference,
    })

    accountKinds.set(
      accountName,
      kind === 'entrada' ? 'receita' : 'despesa',
    )
  }

  if (!entries.length) {
    throw new Error(
      'Nenhum lançamento válido encontrado. Confira se as datas e os valores estão preenchidos.',
    )
  }

  return {
    entries,
    accounts: [...accountKinds.entries()].map(([name, kind]) => ({ name, kind })),
    skipped,
    columns: Object.keys(columns),
  }
}

function readCell(row: ExcelJSTypes.Row, columnNumber: number | undefined) {
  if (!columnNumber) return null
  const value = row.getCell(columnNumber).value
  if (value === null || value === undefined || value === '') return null

  // Células de fórmula vêm como objeto; usamos o resultado calculado.
  if (typeof value === 'object' && 'result' in value) {
    return (value as ExcelJSTypes.CellFormulaValue).result ?? null
  }
  if (value instanceof Date) return value

  return value as string | number | boolean
}

/** Aceita Date, serial do Excel ou texto em pt-BR / ISO. */
function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toDateOnly(value)
  }

  if (typeof value === 'number') {
    // Serial do Excel: dia 1 = 1900-01-01 (com o bug do ano bissexto de 1900).
    const millis = Math.round((value - 25569) * 86_400_000)
    const date = new Date(millis)
    return Number.isNaN(date.getTime()) ? null : toDateOnly(date)
  }

  const text = String(value).trim()

  // dd/mm/aaaa ou dd-mm-aaaa
  const brMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (brMatch) {
    const day = Number(brMatch[1])
    const month = Number(brMatch[2])
    let year = Number(brMatch[3])
    if (year < 100) year += 2000
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return toDateOnly(new Date(year, month - 1, day))
  }

  // ISO aaaa-mm-dd
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return isoMatch[0]

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed)
}

/** Aceita 1234.56, "1.234,56" ou "R$ 1.234,56". */
function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const text = String(value).replace(/[^\d,.-]/g, '').trim()
  if (!text) return null

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')

  let normalized = text
  if (lastComma > lastDot) {
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma && text.length - lastDot - 1 === 3) {
    normalized = text.replace(/\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** Resumo legível da importação, para o aviso de confirmação. */
export function describeImport(result: ParseResult): string {
  const parts = [
    `${result.entries.length} lançamento${result.entries.length === 1 ? '' : 's'}`,
    `${result.accounts.length} conta${result.accounts.length === 1 ? '' : 's'}`,
  ]
  if (result.skipped > 0) {
    parts.push(`${result.skipped} linha${result.skipped === 1 ? '' : 's'} ignorada${result.skipped === 1 ? '' : 's'}`)
  }
  return parts.join(' · ')
}

/** Converte a série mensal exportável em CSV, usada em testes e integrações. */
export function seriesToCsv(series: MonthlyCashflow[] | MonthPoint[]): string {
  const header = 'mes;entradas;saidas;resultado'
  const lines = series.map((row) => {
    const month = 'key' in row ? row.key : row.month.slice(0, 7)
    const income = 'income' in row ? row.income : 0
    const expense = 'expense' in row ? row.expense : 0
    return `${month};${income};${expense};${Number(income) - Number(expense)}`
  })
  return [header, ...lines].join('\n')
}
