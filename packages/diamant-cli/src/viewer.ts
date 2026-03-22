import chalk from 'chalk';
import type { RowData, ColumnRecord, LinkConfig } from 'diamant';
import { formatCellValue } from './display.js';

// --- ANSI helpers ---
const ESC = '\x1b[';
const ALTERNATE_ON = `${ESC}?1049h`;
const ALTERNATE_OFF = `${ESC}?1049l`;
const CURSOR_HIDE = `${ESC}?25l`;
const CURSOR_SHOW = `${ESC}?25h`;
const CLEAR = `${ESC}2J${ESC}H`;

function moveTo(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(s: string): number {
  return stripAnsi(s).length;
}

function padOrTruncate(s: string, width: number): string {
  const vLen = visibleLength(s);
  if (vLen <= width) return s + ' '.repeat(width - vLen);
  let vis = 0;
  let result = '';
  let inEsc = false;
  for (const ch of s) {
    if (ch === '\x1b') { inEsc = true; result += ch; continue; }
    if (inEsc) { result += ch; if (ch === 'm') inEsc = false; continue; }
    if (vis >= width - 1) { result += '…'; break; }
    result += ch;
    vis++;
  }
  return result;
}

function sliceVisible(s: string, start: number, maxWidth: number): string {
  let vis = 0;
  let idx = 0;
  let inEsc = false;
  const chars = [...s];

  while (idx < chars.length && vis < start) {
    const ch = chars[idx];
    if (ch === '\x1b') { inEsc = true; idx++; continue; }
    if (inEsc) { idx++; if (ch === 'm') inEsc = false; continue; }
    vis++;
    idx++;
  }

  let collected = '';
  let colLen = 0;
  inEsc = false;
  while (idx < chars.length && colLen < maxWidth) {
    const ch = chars[idx];
    if (ch === '\x1b') { inEsc = true; collected += ch; idx++; continue; }
    if (inEsc) { collected += ch; idx++; if (ch === 'm') inEsc = false; continue; }
    collected += ch;
    colLen++;
    idx++;
  }
  return collected;
}

// --- Types ---
type Mode = 'normal' | 'select' | 'detail' | 'lookup';

interface TableHandle {
  listColumns(): ColumnRecord[];
  getRows(opts: { resolveLinks: boolean }): RowData[];
  getRow(id: string, opts: { resolveLinks: boolean }): RowData;
  updateRow(id: string, data: Record<string, unknown>): RowData;
  deleteRow(id: string): void;
  addRow(data: Record<string, unknown>): RowData;
  readonly name: string;
  readonly id: string;
}

type GetTableFn = (tableId: string) => TableHandle;

interface DetailEntry {
  table: TableHandle;
  columns: ColumnRecord[];
  row: RowData;
  rawRow: RowData; // row without resolveLinks, for link IDs
  focusedField: number;
  scroll: number;
}

const COL_MIN_WIDTH = 8;
const COL_MAX_WIDTH = 30;

const EDITABLE_TYPES = new Set([
  'text', 'number', 'checkbox', 'singleSelect', 'multiSelect',
  'date', 'email', 'url', 'phone', 'currency', 'percent',
  'duration', 'rating', 'richText',
]);

function totalTableWidth(colWidths: number[]): number {
  if (colWidths.length === 0) return 0;
  return colWidths.reduce((a, b) => a + b, 0) + 3 * (colWidths.length - 1);
}

function parseInputValue(answer: string, col: ColumnRecord): unknown {
  if (col.type === 'number' || col.type === 'percent' || col.type === 'duration' || col.type === 'rating') {
    return Number(answer);
  } else if (col.type === 'checkbox') {
    return answer.toLowerCase() === 'true' || answer === '1';
  } else if (col.type === 'multiSelect' || col.type === 'link') {
    try { return JSON.parse(answer); } catch { return answer.split(',').map((s) => s.trim()); }
  } else if (col.type === 'currency') {
    try { return JSON.parse(answer); } catch { return undefined; }
  }
  return answer;
}

export function openViewer(table: TableHandle, getTable?: GetTableFn): Promise<void> {
  return new Promise<void>((resolve) => { void (async () => {
    let cleanedUp = false;
    let statusTimeout: ReturnType<typeof setTimeout> | null = null;

    let columns: ColumnRecord[];
    let rows: RowData[];
    let mode: Mode = 'normal';
    let scrollRow = 0;
    let scrollCol = 0;
    let selectedRow = 0;
    let statusMessage = '';
    let lookupQuery = '';
    let lookupMatches: number[] = []; // indices into rows[]
    let lookupMatchIdx = 0; // which match is selected

    // Detail navigation — back/forward stacks (like browser history)
    let detailStack: DetailEntry[] = [];
    let forwardStack: DetailEntry[] = [];
    let tableReturnMode: 'normal' | 'select' | 'lookup' = 'select';

    function currentDetail(): DetailEntry | null {
      return detailStack.length > 0 ? detailStack[detailStack.length - 1] : null;
    }

    function loadData(): void {
      columns = table.listColumns();
      rows = table.getRows({ resolveLinks: true });
    }

    loadData();

    function pushDetail(tbl: TableHandle, rowId: string): void {
      const cols = tbl.listColumns();
      const row = tbl.getRow(rowId, { resolveLinks: true });
      const rawRow = tbl.getRow(rowId, { resolveLinks: false });
      detailStack.push({ table: tbl, columns: cols, row, rawRow, focusedField: -1, scroll: 0 });
      forwardStack = []; // clear forward history on new navigation
      mode = 'detail';
    }

    function popDetail(): void {
      const popped = detailStack.pop();
      if (popped) forwardStack.push(popped);
      if (detailStack.length === 0) {
        mode = tableReturnMode;
        // Re-run lookup matching in case data changed
        if (mode === 'lookup') {
          updateLookupMatches();
          selectLookupMatch();
        }
      }
    }

    function goForward(): void {
      if (forwardStack.length === 0) return;
      const entry = forwardStack.pop()!;
      // Refresh the entry data in case it changed
      try {
        entry.row = entry.table.getRow(entry.row.id, { resolveLinks: true });
        entry.rawRow = entry.table.getRow(entry.row.id, { resolveLinks: false });
        entry.columns = entry.table.listColumns();
      } catch {
        showStatus('Forward record no longer exists');
        return;
      }
      detailStack.push(entry);
      mode = 'detail';
    }

    function refreshDetail(): void {
      const d = currentDetail();
      if (!d) return;
      try {
        d.row = d.table.getRow(d.row.id, { resolveLinks: true });
        d.rawRow = d.table.getRow(d.row.id, { resolveLinks: false });
        d.columns = d.table.listColumns();
      } catch {
        popDetail();
      }
    }

    // Build the detail lines with field indices for focus tracking
    // Returns { lines, fieldLineMap } where fieldLineMap[fieldIdx] = first line index of that field
    function buildDetailLines(d: DetailEntry, width: number): { lines: string[]; fieldLineMap: number[] } {
      const lines: string[] = [];
      const fieldLineMap: number[] = [];

      lines.push('');
      lines.push(`  ${chalk.bold('ID')}         ${chalk.dim(d.row.id)}`);
      lines.push(`  ${chalk.bold('Created')}    ${d.row.createdAt}`);
      lines.push(`  ${chalk.bold('Updated')}    ${d.row.updatedAt}`);
      lines.push('');
      lines.push('  ' + chalk.dim('─'.repeat(Math.min(60, width - 4))));
      lines.push('');

      for (let fi = 0; fi < d.columns.length; fi++) {
        const col = d.columns[fi];
        const value = d.row.cells[col.name];
        const formatted = formatCellValue(value, col);
        fieldLineMap[fi] = lines.length;

        const isLink = col.type === 'link';
        const isFocused = d.focusedField === fi;
        const marker = isFocused ? chalk.cyan('▸ ') : '  ';
        const linkHint = isLink ? chalk.dim(' [Enter: follow]') : '';
        const editHint = isFocused && EDITABLE_TYPES.has(col.type) ? chalk.dim(' [e: edit]') : '';

        if (isFocused) {
          lines.push(`${marker}${chalk.bold.cyan(col.name)} ${chalk.dim(`‹${col.type}›`)}${linkHint}${editHint}`);
          lines.push(`${marker}  ${formatted}`);
        } else {
          lines.push(`${marker}${chalk.bold(col.name)} ${chalk.dim(`‹${col.type}›`)}${linkHint}`);
          lines.push(`${marker}  ${formatted}`);
        }
        lines.push('');
      }

      return { lines, fieldLineMap };
    }

    function computeColWidths(): number[] {
      return columns.map((col) => {
        let max = visibleLength(col.name);
        for (const row of rows) {
          const val = formatCellValue(row.cells[col.name], col);
          max = Math.max(max, visibleLength(val));
        }
        return Math.max(COL_MIN_WIDTH, Math.min(COL_MAX_WIDTH, max));
      });
    }

    function showStatus(msg: string): void {
      statusMessage = msg;
      if (statusTimeout) clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => { statusMessage = ''; render(); }, 2000);
    }

    function render(): void {
      if (cleanedUp) return;
      const width = process.stdout.columns || 80;
      const height = process.stdout.rows || 24;

      let out = CLEAR;

      const d = currentDetail();
      if (mode === 'detail' && d) {
        out += renderDetailScreen(d, width, height);
      } else {
        out += renderTableScreen(width, height);
      }

      // Show lookup input bar over the title when in lookup mode
      if (mode === 'lookup') {
        const firstCol = columns.length > 0 ? columns[0].name : 'value';
        const prompt = ` lookup ${firstCol}: ${lookupQuery}█`;
        const matchInfo = lookupMatches.length > 0
          ? chalk.green(` (${lookupMatchIdx + 1}/${lookupMatches.length})`)
          : (lookupQuery.length > 0 ? chalk.red(' (no match)') : '');
        out += moveTo(1, 1) + chalk.bgYellow.black(padOrTruncate(prompt + stripAnsi(matchInfo), width));
        // Re-render matchInfo with color (padOrTruncate strips it, so append after)
        const promptVis = visibleLength(prompt);
        const matchInfoStr = matchInfo;
        if (matchInfoStr) {
          out += moveTo(1, promptVis + 1) + matchInfoStr;
        }
      }

      process.stdout.write(out);
    }

    function renderTableScreen(width: number, height: number): string {
      const colWidths = computeColWidths();
      const headerHeight = 2;
      const footerHeight = 1;
      const bodyHeight = height - headerHeight - footerHeight;

      let out = '';

      const title = ` ${table.name} (${rows.length} rows)`;
      out += moveTo(1, 1) + chalk.bgBlue.white.bold(padOrTruncate(title, width));

      const headerLine = buildRowLine(
        columns.map((c) => chalk.bold(c.name)),
        colWidths,
        scrollCol,
        width
      );
      out += moveTo(2, 1) + chalk.inverse(padOrTruncate(headerLine, width));

      const visibleRows = rows.slice(scrollRow, scrollRow + bodyHeight);
      for (let i = 0; i < bodyHeight; i++) {
        const row = visibleRows[i];
        const screenLine = i + headerHeight + 1;
        if (!row) {
          out += moveTo(screenLine, 1) + ' '.repeat(width);
          continue;
        }

        const cells = columns.map((col) => formatCellValue(row.cells[col.name], col));
        let line = buildRowLine(cells, colWidths, scrollCol, width);
        line = padOrTruncate(line, width);

        const globalIdx = scrollRow + i;
        if ((mode === 'select' || mode === 'lookup') && globalIdx === selectedRow) {
          out += moveTo(screenLine, 1) + chalk.bgWhite.black(stripAnsi(line));
        } else if (i % 2 === 1) {
          out += moveTo(screenLine, 1) + chalk.dim(line);
        } else {
          out += moveTo(screenLine, 1) + line;
        }
      }

      if (rows.length > bodyHeight) {
        const scrollPct = rows.length > 1 ? scrollRow / (rows.length - 1) : 0;
        const barPos = Math.round(scrollPct * (bodyHeight - 1));
        for (let i = 0; i < bodyHeight; i++) {
          const screenLine = i + headerHeight + 1;
          out += moveTo(screenLine, width) + (i === barPos ? chalk.bgWhite(' ') : chalk.dim('│'));
        }
      }

      const footer = buildFooter();
      out += moveTo(height, 1) + chalk.bgBlue.white(padOrTruncate(footer, width));

      return out;
    }

    function buildRowLine(cells: string[], colWidths: number[], hScroll: number, viewWidth: number): string {
      const parts: string[] = [];
      for (let i = 0; i < cells.length; i++) {
        parts.push(padOrTruncate(cells[i], colWidths[i]));
      }
      const full = parts.join(chalk.dim(' │ '));
      if (hScroll === 0) return full;
      return sliceVisible(full, hScroll, viewWidth);
    }

    function buildFooter(): string {
      if (statusMessage) return ` ${statusMessage}`;
      if (mode === 'lookup') {
        return ` Type to search │ ↑↓: prev/next match │ Enter: open │ Esc: cancel`;
      }
      if (mode === 'select') {
        return ` SELECT │ ↑↓: navigate │ Enter: open │ Esc: back │ d: delete │ D: duplicate`;
      }
      return ` q: quit │ r: refresh │ s: select │ l: lookup │ ←→↑↓: scroll`;
    }

    function renderDetailScreen(d: DetailEntry, width: number, height: number): string {
      let out = '';

      const depth = detailStack.length;
      const breadcrumb = depth > 1 ? chalk.dim(` (depth ${depth})`) : '';
      const title = ` ${d.table.name} — ${d.row.id}${breadcrumb}`;
      out += moveTo(1, 1) + chalk.bgMagenta.white.bold(padOrTruncate(title, width));

      const { lines, fieldLineMap } = buildDetailLines(d, width);

      const bodyHeight = height - 2;
      const maxScroll = Math.max(0, lines.length - bodyHeight);
      if (d.scroll > maxScroll) d.scroll = maxScroll;

      // Auto-scroll to keep focused field visible
      if (d.focusedField >= 0 && d.focusedField < fieldLineMap.length) {
        const fieldLine = fieldLineMap[d.focusedField];
        if (fieldLine < d.scroll) d.scroll = fieldLine;
        if (fieldLine + 2 > d.scroll + bodyHeight) d.scroll = fieldLine + 2 - bodyHeight;
        if (d.scroll > maxScroll) d.scroll = maxScroll;
        if (d.scroll < 0) d.scroll = 0;
      }

      const visible = lines.slice(d.scroll, d.scroll + bodyHeight);
      for (let i = 0; i < bodyHeight; i++) {
        const line = visible[i] ?? '';
        out += moveTo(i + 2, 1) + padOrTruncate(line, width);
      }

      let footer: string;
      if (statusMessage) {
        footer = ` ${statusMessage}`;
      } else if (d.focusedField >= 0) {
        const col = d.columns[d.focusedField];
        const parts = ['Tab/↑↓: fields', '[]: back/fwd', 'Esc: up'];
        if (col?.type === 'link') parts.push('Enter: follow link');
        if (col && EDITABLE_TYPES.has(col.type)) parts.push('e: edit field');
        parts.push('d: delete', 'D: dup', 'r: refresh');
        footer = ` ${parts.join(' │ ')}`;
      } else {
        footer = ` Tab: focus fields │ []: back/fwd │ Esc: up │ r: refresh │ d: delete │ D: dup │ ↑↓: scroll`;
      }
      out += moveTo(height, 1) + chalk.bgMagenta.white(padOrTruncate(footer, width));

      return out;
    }

    function cleanup(): void {
      if (cleanedUp) return;
      cleanedUp = true;
      if (statusTimeout) clearTimeout(statusTimeout);
      process.stdout.write(ALTERNATE_OFF + CURSOR_SHOW);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode!(false);
        process.stdin.removeListener('keypress', handleKey);
      }
      process.stdout.removeListener('resize', render);
      resolve();
    }

    function handleKey(str: string | undefined, key: { name?: string; ctrl?: boolean; shift?: boolean; sequence?: string }): void {
      if (!key) return;
      if (key.ctrl && key.name === 'c') { cleanup(); return; }

      if (mode === 'detail') {
        handleDetailKey(str, key);
      } else if (mode === 'lookup') {
        handleLookupKey(str, key);
      } else if (mode === 'select') {
        handleSelectKey(str, key);
      } else {
        handleNormalKey(str, key);
      }
    }

    function handleNormalKey(str: string | undefined, key: { name?: string }): void {
      const bodyHeight = (process.stdout.rows || 24) - 3;

      switch (key.name) {
        case 'q':
          cleanup();
          return;
        case 'r':
          loadData();
          showStatus('✓ Refreshed');
          render();
          return;
        case 's':
          mode = 'select';
          selectedRow = scrollRow;
          render();
          return;
        case 'l':
          mode = 'lookup';
          lookupQuery = '';
          lookupMatches = [];
          lookupMatchIdx = 0;
          render();
          return;
        case 'up':
          if (scrollRow > 0) { scrollRow--; render(); }
          return;
        case 'down':
          if (scrollRow < rows.length - 1) { scrollRow++; render(); }
          return;
        case 'left':
          if (scrollCol > 0) { scrollCol = Math.max(0, scrollCol - 4); render(); }
          return;
        case 'right': {
          const colWidths = computeColWidths();
          const tw = totalTableWidth(colWidths);
          const termCols = process.stdout.columns || 80;
          if (scrollCol < tw - termCols) { scrollCol += 4; render(); }
          return;
        }
        case 'pageup':
          scrollRow = Math.max(0, scrollRow - bodyHeight);
          render();
          return;
        case 'pagedown':
          scrollRow = Math.min(Math.max(0, rows.length - 1), scrollRow + bodyHeight);
          render();
          return;
      }

      if (str === ']' && forwardStack.length > 0) {
        goForward();
        render();
        return;
      }
    }

    function updateLookupMatches(): void {
      if (!lookupQuery || columns.length === 0) {
        lookupMatches = [];
        return;
      }
      const q = lookupQuery.toLowerCase();
      const firstCol = columns[0];
      lookupMatches = [];
      for (let i = 0; i < rows.length; i++) {
        const val = formatCellValue(rows[i].cells[firstCol.name], firstCol);
        if (stripAnsi(val).toLowerCase().includes(q)) {
          lookupMatches.push(i);
        }
      }
      // Clamp match index
      if (lookupMatchIdx >= lookupMatches.length) lookupMatchIdx = Math.max(0, lookupMatches.length - 1);
    }

    function selectLookupMatch(): void {
      if (lookupMatches.length > 0) {
        selectedRow = lookupMatches[lookupMatchIdx];
        const bodyHeight = (process.stdout.rows || 24) - 3;
        // Scroll to keep selected row visible
        if (selectedRow < scrollRow) scrollRow = selectedRow;
        if (selectedRow >= scrollRow + bodyHeight) scrollRow = selectedRow - bodyHeight + 1;
      }
    }

    function handleLookupKey(str: string | undefined, key: { name?: string }): void {
      switch (key.name) {
        case 'escape':
          mode = 'normal';
          lookupQuery = '';
          lookupMatches = [];
          render();
          return;
        case 'return':
          if (lookupMatches.length > 0) {
            selectedRow = lookupMatches[lookupMatchIdx];
            // Open detail, but remember we came from lookup
            tableReturnMode = 'lookup';
            const row = rows[selectedRow];
            if (row) {
              try {
                detailStack = [];
                forwardStack = [];
                pushDetail(table, row.id);
              } catch (e: any) {
                showStatus(`Error: ${e.message}`);
              }
            }
          } else {
            mode = 'normal';
            lookupQuery = '';
            lookupMatches = [];
          }
          render();
          return;
        case 'backspace':
          if (lookupQuery.length > 0) {
            lookupQuery = lookupQuery.slice(0, -1);
            updateLookupMatches();
            selectLookupMatch();
          }
          render();
          return;
        case 'up':
          if (lookupMatches.length > 1) {
            lookupMatchIdx = (lookupMatchIdx - 1 + lookupMatches.length) % lookupMatches.length;
            selectLookupMatch();
          }
          render();
          return;
        case 'down':
          if (lookupMatches.length > 1) {
            lookupMatchIdx = (lookupMatchIdx + 1) % lookupMatches.length;
            selectLookupMatch();
          }
          render();
          return;
      }

      // Printable character — append to query
      if (str && str.length === 1 && str >= ' ') {
        lookupQuery += str;
        lookupMatchIdx = 0;
        updateLookupMatches();
        selectLookupMatch();
        render();
      }
    }

    function handleSelectKey(str: string | undefined, key: { name?: string }): void {
      const bodyHeight = (process.stdout.rows || 24) - 3;

      switch (key.name) {
        case 'escape':
          mode = 'normal';
          render();
          return;
        case 'q':
          cleanup();
          return;
        case 'up':
          if (selectedRow > 0) {
            selectedRow--;
            if (selectedRow < scrollRow) scrollRow = selectedRow;
            render();
          }
          return;
        case 'down':
          if (selectedRow < rows.length - 1) {
            selectedRow++;
            if (selectedRow >= scrollRow + bodyHeight) scrollRow = selectedRow - bodyHeight + 1;
            render();
          }
          return;
        case 'return': {
          const row = rows[selectedRow];
          if (row) {
            try {
              tableReturnMode = 'select';
              detailStack = [];
              forwardStack = [];
              pushDetail(table, row.id);
              render();
            } catch (e: any) {
              showStatus(`Error: ${e.message}`);
              render();
            }
          }
          return;
        }
        case 'pageup':
          selectedRow = Math.max(0, selectedRow - bodyHeight);
          if (selectedRow < scrollRow) scrollRow = selectedRow;
          render();
          return;
        case 'pagedown':
          selectedRow = Math.min(rows.length - 1, selectedRow + bodyHeight);
          if (selectedRow >= scrollRow + bodyHeight) scrollRow = selectedRow - bodyHeight + 1;
          render();
          return;
      }

      if (str === 'd' && key.name === 'd') {
        const row = rows[selectedRow];
        if (row) {
          try {
            table.deleteRow(row.id);
            loadData();
            if (selectedRow >= rows.length) selectedRow = Math.max(0, rows.length - 1);
            showStatus(`✓ Deleted row ${row.id.slice(0, 8)}`);
            render();
          } catch (e: any) {
            showStatus(`Error: ${e.message}`);
            render();
          }
        }
        return;
      }

      if (str === 'D') {
        const row = rows[selectedRow];
        if (row) {
          try {
            const newRow = table.addRow({ ...row.cells });
            loadData();
            showStatus(`✓ Duplicated → ${newRow.id.slice(0, 8)}`);
            render();
          } catch (e: any) {
            showStatus(`Error: ${e.message}`);
            render();
          }
        }
        return;
      }

      if (str === ']' && forwardStack.length > 0) {
        goForward();
        render();
        return;
      }
    }

    function handleDetailKey(str: string | undefined, key: { name?: string }): void {
      const d = currentDetail();
      if (!d) return;

      switch (key.name) {
        case 'escape':
          if (d.focusedField >= 0) {
            // Unfocus field first
            d.focusedField = -1;
            render();
          } else {
            popDetail();
            if (mode !== 'detail') {
              // Back to select — also refresh table data
              loadData();
            }
            render();
          }
          return;

        case 'q':
          cleanup();
          return;

        case 'tab': {
          if (d.columns.length === 0) return;
          if (d.focusedField < 0) {
            d.focusedField = 0;
          } else {
            d.focusedField = (d.focusedField + 1) % d.columns.length;
          }
          render();
          return;
        }

        case 'up':
          if (d.focusedField > 0) {
            d.focusedField--;
            render();
          } else if (d.focusedField < 0) {
            if (d.scroll > 0) { d.scroll--; render(); }
          }
          return;

        case 'down':
          if (d.focusedField >= 0) {
            if (d.focusedField < d.columns.length - 1) {
              d.focusedField++;
              render();
            }
          } else {
            d.scroll++;
            render();
          }
          return;

        case 'return':
          if (d.focusedField >= 0) {
            const col = d.columns[d.focusedField];
            if (col.type === 'link') {
              followLink(d, col);
            }
          }
          return;

        case 'r':
          refreshDetail();
          loadData();
          showStatus('✓ Refreshed');
          render();
          return;

        case 'e':
          if (d.focusedField >= 0) {
            const col = d.columns[d.focusedField];
            if (EDITABLE_TYPES.has(col.type)) {
              editSingleField(d, col);
            } else {
              showStatus(`Field "${col.name}" (${col.type}) is not editable`);
              render();
            }
          }
          return;
      }

      // '[' go back, ']' go forward
      if (str === '[') {
        popDetail();
        if (mode !== 'detail') {
          loadData();
        }
        render();
        return;
      }
      if (str === ']') {
        if (forwardStack.length > 0) {
          goForward();
          render();
        } else {
          showStatus('No forward history');
          render();
        }
        return;
      }

      // 'd' for delete
      if (str === 'd' && key.name === 'd') {
        try {
          const id = d.row.id;
          d.table.deleteRow(id);
          loadData();
          if (selectedRow >= rows.length) selectedRow = Math.max(0, rows.length - 1);
          popDetail();
          showStatus(`✓ Deleted row ${id.slice(0, 8)}`);
          render();
        } catch (e: any) {
          showStatus(`Error: ${e.message}`);
          render();
        }
        return;
      }

      // 'D' for duplicate
      if (str === 'D') {
        try {
          const newRow = d.table.addRow({ ...d.rawRow.cells });
          loadData();
          // Navigate to the new row's detail
          pushDetail(d.table, newRow.id);
          showStatus(`✓ Duplicated → ${newRow.id.slice(0, 8)}`);
          render();
        } catch (e: any) {
          showStatus(`Error: ${e.message}`);
          render();
        }
        return;
      }

      // Shift+Tab to go backwards
      if (str === '\x1b[Z') { // shift+tab sequence
        if (d.columns.length === 0) return;
        if (d.focusedField <= 0) {
          d.focusedField = d.columns.length - 1;
        } else {
          d.focusedField--;
        }
        render();
        return;
      }
    }

    function followLink(d: DetailEntry, col: ColumnRecord): void {
      if (!getTable) {
        showStatus('Link navigation not available');
        render();
        return;
      }

      const config = col.config as LinkConfig | undefined;
      if (!config?.linkedTableId) {
        showStatus('No linked table configured');
        render();
        return;
      }

      // Get raw link IDs from the unresolved row
      const rawIds = d.rawRow.cells[col.name];
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        showStatus('No linked records');
        render();
        return;
      }

      let linkedTable: TableHandle;
      try {
        linkedTable = getTable(config.linkedTableId);
      } catch (e: any) {
        showStatus(`Error: ${e.message}`);
        render();
        return;
      }

      if (rawIds.length === 1) {
        // Single link — navigate directly
        try {
          pushDetail(linkedTable, rawIds[0] as string);
          render();
        } catch (e: any) {
          showStatus(`Error: ${e.message}`);
          render();
        }
      } else {
        // Multiple links — show selector
        showLinkSelector(linkedTable, rawIds as string[], d.row.cells[col.name] as string[]);
      }
    }

    async function showLinkSelector(linkedTable: TableHandle, ids: string[], displayValues: string[]): Promise<void> {
      // Temporarily leave raw mode for inquirer select
      process.stdout.write(ALTERNATE_OFF + CURSOR_SHOW);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode!(false);
        process.stdin.removeListener('keypress', handleKey);
      }

      try {
        const { select } = await import('@inquirer/prompts');

        const choices = ids.map((id, i) => ({
          name: `${displayValues?.[i] ?? id.slice(0, 8)} ${chalk.dim(`(${id.slice(0, 8)})`)}`,
          value: id,
        }));

        const ac = new AbortController();
        const onKeypress = (_ch: string, k: { name?: string }) => {
          if (k?.name === 'escape') ac.abort();
        };
        process.stdin.on('keypress', onKeypress);

        let selectedId: string | null = null;
        try {
          selectedId = await select(
            { message: `Select linked ${linkedTable.name} record`, choices },
            { signal: ac.signal },
          );
        } catch {
          // cancelled
        }
        process.stdin.removeListener('keypress', onKeypress);

        // Restore viewer
        await restoreRawMode();

        if (selectedId) {
          try {
            pushDetail(linkedTable, selectedId);
          } catch (e: any) {
            showStatus(`Error: ${e.message}`);
          }
        }
        render();
      } catch (e: any) {
        await restoreRawMode();
        showStatus(`Error: ${e.message}`);
        render();
      }
    }

    async function editSingleField(d: DetailEntry, col: ColumnRecord): Promise<void> {
      // Temporarily leave alternate screen for readline input
      process.stdout.write(ALTERNATE_OFF + CURSOR_SHOW);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode!(false);
        process.stdin.removeListener('keypress', handleKey);
      }

      const readlineModule = await import('readline');
      const rl = readlineModule.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((res) => rl.question(q, res));

      const current = formatCellValue(d.row.cells[col.name], col);
      console.log('');
      console.log(chalk.bold(`Editing: ${col.name}`) + chalk.dim(` (${col.type})`));
      console.log(chalk.dim('Press Enter with no input to cancel.\n'));

      const answer = await ask(`${chalk.bold(col.name)} [${stripAnsi(current)}]: `);
      rl.close();

      if (answer.trim() !== '') {
        const parsed = parseInputValue(answer, col);
        if (parsed !== undefined) {
          try {
            d.table.updateRow(d.row.id, { [col.name]: parsed });
            console.log(chalk.green('✓ Updated'));
          } catch (e: any) {
            console.log(chalk.red(`Error: ${e.message}`));
          }
        }
      } else {
        console.log(chalk.dim('Cancelled.'));
      }

      await new Promise((r) => setTimeout(r, 400));
      await restoreRawMode();

      // Refresh the detail entry
      try {
        d.row = d.table.getRow(d.row.id, { resolveLinks: true });
        d.rawRow = d.table.getRow(d.row.id, { resolveLinks: false });
      } catch {
        popDetail();
      }
      loadData();
      render();
    }

    async function restoreRawMode(): Promise<void> {
      process.stdout.write(ALTERNATE_ON + CURSOR_HIDE);
      if (process.stdin.isTTY) {
        const rlMod = await import('readline');
        rlMod.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode!(true);
        process.stdin.resume();
        process.stdin.on('keypress', handleKey);
      }
    }

    // --- Start ---
    process.stdout.write(ALTERNATE_ON + CURSOR_HIDE);

    if (process.stdin.isTTY) {
      const readlineModule = await import('readline');
      readlineModule.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode!(true);
      process.stdin.resume();
      process.stdin.on('keypress', handleKey);
    } else {
      process.stdout.write(ALTERNATE_OFF + CURSOR_SHOW);
      console.log(`Not a TTY — use a terminal to launch the viewer.`);
      resolve();
      return;
    }

    process.stdout.on('resize', render);
    render();
  })(); });
}
