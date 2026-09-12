import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCSV,
  parseTrades,
  decodeCSV,
  stats,
  groupTrades,
  weekOf,
  type Trade,
} from './analysis.ts';
const base: Trade = {
  id: 1,
  date: '2026-08-31',
  entryDate: '2026-08-31',
  code: '1',
  name: 'Example',
  side: 'long',
  quantity: 100,
  entry: 100,
  exit: 101,
  gross: 100,
  net: 100,
  costs: 0,
  basis: 10000,
};
void test('CSV handles quoted commas, escaped quotes and embedded newlines', () => {
  assert.deepEqual(parseCSV('a,b\r\n"one,two","a""b"\r\n"new\nline",0'), [
    ['a', 'b'],
    ['one,two', 'a"b'],
    ['new\nline', '0'],
  ]);
  assert.throws(() => parseCSV('"open'), /引用符/);
});
void test('win rates count flat fills; returns use entry notional, PF and payoff differ', () => {
  const s = stats([base, { ...base, net: -50 }, { ...base, net: 0 }]);
  assert.equal(s.net, 50);
  assert.equal(s.winRate, 1 / 3);
  assert.equal(s.rate, 50 / 30000);
  assert.equal(s.pf, 2);
  assert.equal(s.draws, 1);
  assert.equal(stats([]).winRate, null);
  assert.equal(stats([]).pf, null);
  assert.equal(stats([base]).pf, Infinity);
});
void test('weeks start Monday and month boundaries are independent of weeks', () => {
  assert.equal(weekOf('2026-09-06'), '2026-08-31');
  assert.equal(weekOf('2026-09-07'), '2026-09-07');
  const rs = [base, { ...base, date: '2026-09-01', net: -20 }];
  assert.equal(groupTrades(rs, (t) => weekOf(t.date)).length, 1);
  assert.equal(groupTrades(rs, (t) => t.date.slice(0, 7)).length, 2);
});
const path = process.env.TRADE_CSV_TEST_PATH;
void test(
  'provided Shift-JIS file matches independent source totals and all grouping totals',
  { skip: !path },
  () => {
    const bytes = readFileSync(path!);
    const d = parseTrades(
      decodeCSV(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
    );
    assert.equal(d.sourceRows, 1664);
    assert.equal(d.trades.length, 840);
    assert.equal(d.zeroSettlements, 11);
    const s = stats(d.trades);
    assert.equal(s.net, 232838);
    assert.equal(s.wins, 502);
    assert.equal(s.losses, 327);
    assert.equal(s.draws, 11);
    assert.equal(stats(d.trades.filter((t) => t.side === 'long')).net, -61608);
    assert.equal(stats(d.trades.filter((t) => t.side === 'short')).net, 294446);
    for (const key of [
      (t: Trade) => t.date,
      (t: Trade) => t.code,
      (t: Trade) => weekOf(t.date),
      (t: Trade) => t.date.slice(0, 7),
    ])
      assert.equal(
        groupTrades(d.trades, key).reduce((sum, g) => sum + g.net, 0),
        s.net,
      );
    assert.equal(d.trades[0].date, '2026-07-22');
    assert.equal(d.trades.at(-1)!.date, '2026-09-11');
    const text = decodeCSV(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    assert.throws(() => parseTrades(text.replace('-138', '-')), /受渡金額/);
    assert.throws(
      () => parseTrades('注文番号,注文日時\n1,2026/9/1'),
      /列が不足/,
    );
  },
);
const sbiPath = process.env.SBI_CSV_TEST_PATH;
void test(
  'provided SBI settlement-history CSV maps credit closes without inventing entry prices',
  { skip: !sbiPath },
  () => {
    const bytes = readFileSync(sbiPath!);
    const d = parseTrades(
      decodeCSV(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ),
    );
    assert.equal(d.source, 'sbi');
    assert.equal(d.sourceRows, 7364);
    assert.equal(d.trades.length, 4121);
    assert.equal(d.unavailableSettlements, 10);
    assert.equal(d.hasEntryBasis, false);
    const s = stats(d.trades);
    assert.equal(s.net, -14681673);
    assert.equal(s.wins, 2534);
    assert.equal(s.losses, 1587);
    assert.equal(s.draws, 0);
    assert.equal(s.rate, null);
    assert.equal(
      stats(d.trades.filter((t) => t.side === 'long')).net,
      -16231811,
    );
    assert.equal(
      stats(d.trades.filter((t) => t.side === 'short')).net,
      1550138,
    );
    assert.ok(
      d.trades.every((trade) => trade.entry === 0 && trade.basis === 0),
    );
    for (const key of [
      (t: Trade) => t.date,
      (t: Trade) => t.code,
      (t: Trade) => weekOf(t.date),
      (t: Trade) => t.date.slice(0, 7),
    ])
      assert.equal(
        groupTrades(d.trades, key).reduce((sum, g) => sum + g.net, 0),
        s.net,
      );
  },
);
