export type Trade = {
  id: string;
  sourceRow: number;
  date: string;
  entryDate: string;
  code: string;
  name: string;
  side: 'long' | 'short';
  quantity: number;
  entry: number;
  exit: number;
  gross: number;
  net: number;
  costs: number;
  basis: number;
};

type ParsedTrades = {
  trades: Trade[];
  sourceRows: number;
  zeroSettlements: number;
  unavailableSettlements: number;
  unmatchedCashSellQuantity: number;
  unsupportedTransactions: number;
  hasEntryBasis: boolean;
  source: 'tradehistory' | 'sbi';
};
type CashLot = {
  date: string;
  code: string;
  name: string;
  quantity: number;
  entry: number;
  cost: number;
};
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ',') {
      row.push(value);
      value = '';
    } else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  row.push(value);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
function number(v: string): number | null {
  if (!v || v === '-') return null;
  const n = Number(v.replaceAll(',', ''));
  return Number.isFinite(n) ? n : null;
}
function date(v: string) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(v);
  if (!m) throw new Error('日付形式が不正です: ' + v);
  const s = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s)
    throw new Error('存在しない日付です');
  return s;
}
function parseTradeHistory(rows: string[][]): ParsedTrades {
  const headers = rows.shift() ?? [];
  const required = [
    '約定日',
    '銘柄コード',
    '銘柄名',
    '取引区分',
    '売買区分',
    '数量［株］',
    '単価［円］',
    '受渡金額［円］',
  ];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new Error(
      'tradehistory CSVの列が不足しています: ' + missing.join('、'),
    );
  let zeroSettlements = 0;
  let unavailableSettlements = 0;
  let unmatchedCashSellQuantity = 0;
  let unsupportedTransactions = 0;
  const trades: Trade[] = [];
  const cashLots = new Map<string, CashLot[]>();
  const records = rows.map((row, i) => {
    if (row.length !== headers.length)
      throw new Error(`${i + 2}行目の列数が一致しません。`);
    return {
      r: Object.fromEntries(headers.map((h, j) => [h, row[j].trim()])),
      sourceRow: i + 2,
    };
  });
  records
    .sort(
      (a, b) =>
        date(a.r['約定日']).localeCompare(date(b.r['約定日'])) ||
        a.sourceRow - b.sourceRow,
    )
    .forEach(({ r, sourceRow }) => {
    const transaction = r['取引区分'];
    const quantity = number(r['数量［株］']);
    const exit = number(r['単価［円］']);
    const settlement = number(r['受渡金額［円］']);
    const tradeDate = date(r['約定日']);
    const addCashLot = (cost: number) => {
      if (!quantity || quantity < 0 || exit === null || exit < 0 || cost < 0)
        throw new Error(`${sourceRow}行目の数量・価格・受渡金額を確認してください。`);
      cashLots.set(r['銘柄コード'], [
        ...(cashLots.get(r['銘柄コード']) ?? []),
        {
          date: tradeDate,
          code: r['銘柄コード'],
          name: r['銘柄名'],
          quantity,
          entry: exit,
          cost,
        },
      ]);
    };
    if (transaction === '現物' && r['売買区分'] === '買付') {
      if (settlement === null)
        throw new Error(`${sourceRow}行目の受渡金額が未確定です。`);
      addCashLot(Math.abs(settlement));
      return;
    }
    if (transaction === '現引') {
      if (settlement === null)
        throw new Error(`${sourceRow}行目の受渡金額が未確定です。`);
      addCashLot(Math.abs(settlement));
      return;
    }
    if (transaction === '現物' && r['売買区分'] === '売付') {
      if (!quantity || quantity < 0 || exit === null || exit < 0 || settlement === null)
        throw new Error(`${sourceRow}行目の数量・価格・受渡金額を確認してください。`);
      let remaining = quantity;
      let allocation = 0;
      const lots = cashLots.get(r['銘柄コード']) ?? [];
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const matched = Math.min(remaining, lot.quantity);
        const cost = (lot.cost * matched) / lot.quantity;
        const proceeds = (Math.abs(settlement) * matched) / quantity;
        const gross = Math.round((exit - lot.entry) * matched * 100) / 100;
        trades.push({
          id: `${sourceRow}:cash:${allocation++}`,
          sourceRow,
          date: tradeDate,
          entryDate: lot.date,
          code: r['銘柄コード'],
          name: r['銘柄名'],
          side: 'long',
          quantity: matched,
          entry: lot.entry,
          exit,
          gross,
          net: Math.round((proceeds - cost) * 100) / 100,
          costs: Math.round((gross - (proceeds - cost)) * 100) / 100,
          basis: lot.entry * matched,
        });
        lot.quantity -= matched;
        lot.cost -= cost;
        remaining -= matched;
        if (lot.quantity === 0) lots.shift();
      }
      unmatchedCashSellQuantity += remaining;
      return;
    }
    if (transaction === '信用新規') return;
    if (transaction !== '信用返済') {
      unsupportedTransactions++;
      return;
    }
    const side =
      r['売買区分'] === '売埋'
        ? 'long'
        : r['売買区分'] === '買埋'
          ? 'short'
          : null;
    const entry = number(r['建単価［円］']);
    if (!side || !quantity || quantity < 0 || exit === null || exit < 0)
      throw new Error(`${sourceRow}行目の売買区分・数量・価格を確認してください。`);
    if (entry === null || r['建約定日'] === '-') {
      if (settlement === null) {
        unavailableSettlements++;
        return;
      }
      throw new Error(`${sourceRow}行目の建単価・建約定日を確認してください。`);
    }
    const gross =
      Math.round(
        (side === 'long' ? exit - entry : entry - exit) * quantity * 100,
      ) / 100;
    let net = settlement;
    if (net === null) {
      const feeKeys = [
        '諸費用［円］',
        '手数料［円］',
        '税金等［円］',
        '建手数料［円］',
        '建手数料消費税［円］',
      ];
      if (gross !== 0 || feeKeys.some((k) => number(r[k]) !== 0))
        throw new Error(`${sourceRow}行目の受渡金額が未確定です。`);
      net = 0;
      zeroSettlements++;
    }
    trades.push({
      id: `${sourceRow}:credit`,
      sourceRow,
      date: tradeDate,
      entryDate: date(r['建約定日']),
      code: r['銘柄コード'],
      name: r['銘柄名'],
      side,
      quantity,
      entry,
      exit,
      gross,
      net,
      costs: Math.round((gross - net) * 100) / 100,
      basis: entry * quantity,
    });
  });
  if (!trades.length) throw new Error('集計可能な信用返済または現物売却明細がありません。');
  return {
    trades: trades.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    sourceRows: rows.length,
    zeroSettlements,
    unavailableSettlements,
    unmatchedCashSellQuantity,
    unsupportedTransactions,
    hasEntryBasis: true,
    source: 'tradehistory',
  };
}

function parseSbi(rows: string[][], headerIndex: number): ParsedTrades {
  const headers = rows[headerIndex];
  const dataRows = rows
    .slice(headerIndex + 1)
    .filter((row) => row.length === headers.length && row[0]);
  const required = [
    '約定日',
    '銘柄',
    '銘柄コード',
    '取引',
    '約定数量',
    '約定単価',
    '受渡金額/決済損益',
  ];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length)
    throw new Error(
      'SBIの約定履歴CSVの列が不足しています: ' + missing.join('、'),
    );
  let unavailableSettlements = 0;
  const trades: Trade[] = [];
  dataRows.forEach((row, index) => {
    const record = Object.fromEntries(
      headers.map((header, column) => [header, row[column].trim()]),
    );
    const side =
      record['取引'] === '信用返済売'
        ? 'long'
        : record['取引'] === '信用返済買'
          ? 'short'
          : null;
    if (!side) return;
    const quantity = number(record['約定数量']),
      exit = number(record['約定単価']),
      net = number(record['受渡金額/決済損益']);
    if (!quantity || quantity < 0 || exit === null || exit < 0)
      throw new Error(
        `${headerIndex + index + 2}行目の数量・価格を確認してください。`,
      );
    if (net === null) {
      unavailableSettlements++;
      return;
    }
    trades.push({
      id: `sbi:${headerIndex + index + 2}`,
      sourceRow: headerIndex + index + 2,
      date: date(record['約定日']),
      entryDate: '',
      code: record['銘柄コード'],
      name: record['銘柄'],
      side,
      quantity,
      entry: 0,
      exit,
      gross: 0,
      net,
      costs: 0,
      basis: 0,
    });
  });
  if (!trades.length)
    throw new Error('SBI CSVに決済損益が記録された信用返済明細がありません。');
  return {
    trades: trades.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    sourceRows: dataRows.length,
    zeroSettlements: 0,
    unavailableSettlements,
    unmatchedCashSellQuantity: 0,
    unsupportedTransactions: 0,
    hasEntryBasis: false,
    source: 'sbi',
  };
}

export function parseTrades(text: string) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  const sbiHeaderIndex = rows.findIndex(
    (row) =>
      row.includes('約定日') &&
      row.includes('銘柄コード') &&
      row.includes('約定数量') &&
      row.includes('受渡金額/決済損益'),
  );
  return sbiHeaderIndex >= 0
    ? parseSbi(rows, sbiHeaderIndex)
    : parseTradeHistory(rows);
}
export function decodeCSV(buffer: ArrayBuffer) {
  let text = new TextDecoder('utf-8').decode(buffer);
  if (!text.includes('約定日'))
    text = new TextDecoder('shift_jis').decode(buffer);
  return text;
}
export function stats(trades: Trade[]) {
  const wins = trades.filter((t) => t.net > 0),
    losses = trades.filter((t) => t.net < 0);
  const sum = (ts: Trade[], key: 'net' | 'basis' | 'costs') =>
    ts.reduce((s, t) => s + t[key], 0);
  const net = sum(trades, 'net'),
    profit = sum(wins, 'net'),
    loss = -sum(losses, 'net'),
    basis = sum(trades, 'basis');
  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    draws: trades.length - wins.length - losses.length,
    net,
    profit,
    loss,
    basis,
    costs: sum(trades, 'costs'),
    winRate: trades.length ? wins.length / trades.length : null,
    rate: basis ? net / basis : null,
    pf: loss ? profit / loss : profit ? Infinity : null,
    averageWin: wins.length ? profit / wins.length : null,
    averageLoss: losses.length ? loss / losses.length : null,
    payoff:
      wins.length && losses.length
        ? profit / wins.length / (loss / losses.length)
        : null,
  };
}
export function groupTrades(trades: Trade[], key: (t: Trade) => string) {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = key(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, items, ...stats(items) }));
}
export function weekOf(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
