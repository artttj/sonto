// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

const CODE_PLACEHOLDER = '\uE000';

function stripLeadingNumber(s: string): string {
  let t = s.trim();
  let prev = '';
  while (t !== prev) {
    prev = t;
    t = t.replace(/^\d+\.\s+/, '').trim();
  }
  return t || s;
}

export function renderMarkdown(raw: string): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const codeBlocks: string[] = [];
  const text = esc(raw).replace(/```(?:\w*)\n?([\s\S]*?)```/g, (_: string, code: string) => {
    codeBlocks.push(`<pre><code>${code.trimEnd()}</code></pre>`);
    return `${CODE_PLACEHOLDER}CODE${codeBlocks.length - 1}${CODE_PLACEHOLDER}`;
  });

  const inline = (s: string): string =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>');

  const parseTableRows = (rows: string[]): string => {
    const cells = (row: string) =>
      row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const isSep = (row: string) => /^\|?[\s|:-]+\|?$/.test(row) && row.includes('-');

    const sepIdx = rows.findIndex(isSep);
    if (sepIdx < 1) return rows.map(r => `${inline(r)}<br>`).join('');

    const headers = cells(rows[0]);
    const body = rows.slice(sepIdx + 1);

    const th = headers.map(h => `<th>${inline(h)}</th>`).join('');
    const trs = body.map(r => {
      const tds = cells(r).map(c => `<td>${inline(c)}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
  };

  const lines = text.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let tableLines: string[] = [];

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  const flushTable = () => {
    if (tableLines.length) {
      out.push(parseTableRows(tableLines));
      tableLines = [];
    }
  };

  const codePlaceholderRegex = new RegExp(
    `^${CODE_PLACEHOLDER}CODE(\\d+)${CODE_PLACEHOLDER}$`
  );

  for (const line of lines) {
    const codeMatch = codePlaceholderRegex.exec(line.trim());
    if (codeMatch) {
      flushTable();
      closeList();
      out.push(codeBlocks[parseInt(codeMatch[1], 10)]);
      continue;
    }

    if (/^\|.+/.test(line)) {
      closeList();
      tableLines.push(line);
      continue;
    }

    flushTable();

    const ul = /^[-*] (.+)$/.exec(line);
    if (ul) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    const ol = /^(\d+)\. (.+)$/.exec(line);
    if (ol) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      const listContent = stripLeadingNumber(ol[2]);
      out.push(`<li>${inline(listContent)}</li>`);
      continue;
    }

    closeList();

    const heading = /^#{1,3} (.+)$/.exec(line);
    if (heading) {
      out.push(`<strong>${inline(heading[1])}</strong><br>`);
      continue;
    }

    if (line.trim() === '') {
      if (!inUl && !inOl) out.push('<br>');
      continue;
    }

    out.push(`${inline(line)}<br>`);
  }

  flushTable();
  closeList();
  return out.join('').replace(/(<br>){3,}/g, '<br><br>');
}