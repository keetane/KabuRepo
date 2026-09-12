export type Trade = {
  id: number;
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
export function parseTrades(text: string) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''));
  const headers = rows.shift() ?? [];
  const required = [
    '約定日',
    '銘柄コード',
    '銘柄名',
    '取引区分',
    '売買区分',
    '数量［株］',
    '単価［円］',
    '建単価［円］',
    '建約定日',
    '受渡金額［円］',
    '諸費用［円］',
    '手数料［円］',
    '税金等［円］',
    '建手数料［円］',
    '建手数料消費税［円］',
  ];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new Error(
      'tradehistory CSVの列が不足しています: ' + missing.join('、'),
    );
  let zeroSettlements = 0;
  const trades: Trade[] = [];
  rows.forEach((row, i) => {
    if (row.length !== headers.length)
      throw new Error(`${i + 2}行目の列数が一致しません。`);
    const r = Object.fromEntries(headers.map((h, j) => [h, row[j].trim()]));
    if (r['取引区分'] === '信用新規') return;
    if (r['取引区分'] !== '信用返済')
      throw new Error(`${i + 2}行目: 現在は信用取引のCSVに対応しています。`);
    const side =
      r['売買区分'] === '売埋'
        ? 'long'
        : r['売買区分'] === '買埋'
          ? 'short'
          : null;
    const quantity = number(r['数量［株］']),
      entry = number(r['建単価［円］']),
      exit = number(r['単価［円］']);
    if (
      !side ||
      !quantity ||
      quantity < 0 ||
      !entry ||
      entry < 0 ||
      !exit ||
      exit < 0
    )
      throw new Error(`${i + 2}行目の売買区分・数量・価格を確認してください。`);
    const gross =
      Math.round(
        (side === 'long' ? exit - entry : entry - exit) * quantity * 100,
      ) / 100;
    let net = number(r['受渡金額［円］']);
    if (net === null) {
      const feeKeys = [
        '諸費用［円］',
        '手数料［円］',
        '税金等［円］',
        '建手数料［円］',
        '建手数料消費税［円］',
      ];
      if (gross !== 0 || feeKeys.some((k) => number(r[k]) !== 0))
        throw new Error(`${i + 2}行目の受渡金額が未確定です。`);
      net = 0;
      zeroSettlements++;
    }
    trades.push({
      id: i + 2,
      date: date(r['約定日']),
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
  if (!trades.length) throw new Error('決済済みの信用返済明細がありません。');
  return {
    trades: trades.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    sourceRows: rows.length,
    zeroSettlements,
  };
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
