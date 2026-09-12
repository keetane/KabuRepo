'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Rectangle,
  type RectangleProps,
} from 'recharts';
import {
  Upload,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  decodeCSV,
  parseTrades,
  stats,
  groupTrades,
  weekOf,
} from '@/lib/analysis';

const colors = [
  '#2dd4bf',
  '#f6ba64',
  '#9f8cff',
  '#64b5f6',
  '#f783ac',
  '#c6de76',
  '#ef976b',
  '#76d2e3',
  '#cb91df',
  '#a7bacc',
  '#f3d575',
  '#92cf9b',
];
const money = (n: number) =>
  new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 }).format(n);
const yen = (n: number) => (n > 0 ? '+' : '') + money(n) + '円';
const percent = (n: number | null) =>
  n === null ? '—' : (n * 100).toFixed(1) + '%';
const ratio = (n: number | null) =>
  n === null ? '—' : n === Infinity ? '∞' : n.toFixed(2);
const tone = (n: number) => (n > 0 ? 'positive' : n < 0 ? 'negative' : '');
type Dataset = ReturnType<typeof parseTrades>;

function japanDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function weekStart(date: string) {
  const value = new Date(`${date}T00:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export default function Home() {
  const [data, setData] = useState<Dataset | null>(null),
    [fileName, setFileName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [symbol, setSymbol] = useState('all'),
    [side, setSide] = useState('all'),
    [chartMode, setChartMode] = useState('net'),
    [period, setPeriod] = useState('week'),
    [range, setRange] = useState('all'),
    [language, setLanguage] = useState('ja');
  const en = language === 'en';
  const t = (ja: string, english: string) => (en ? english : ja);
  const load = (text: string, name: string) => {
    const parsed = parseTrades(text);
    setData(parsed);
    setFileName(name);
    setStart(parsed.trades[0].date);
    setEnd(parsed.trades.at(-1)!.date);
    setRange('all');
    setSymbol('all');
    setSide('all');
    setError('');
  };
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const symbols = useMemo(
    () =>
      data
        ? groupTrades(data.trades, (x) => x.code).map((x) => ({
            code: x.key,
            name: x.items[0].name,
          }))
        : [],
    [data],
  );
  const rows = useMemo(
    () =>
      data?.trades.filter(
        (x) =>
          (!start || x.date >= start) &&
          (!end || x.date <= end) &&
          (symbol === 'all' || x.code === symbol) &&
          (side === 'all' || x.side === side),
      ) ?? [],
    [data, start, end, symbol, side],
  );
  const summary = stats(rows),
    long = stats(rows.filter((x) => x.side === 'long')),
    short = stats(rows.filter((x) => x.side === 'short'));
  const daily = groupTrades(rows, (x) => x.date);
  const chartData = daily.map((g, index) => {
    const cumulative = daily
      .slice(0, index + 1)
      .reduce((sum, x) => sum + x.net, 0);
    const result: Record<string, string | number> = {
      date: g.key,
      net: g.net,
      cumulative,
    };
    for (const s of symbols)
      result[s.code] = g.items
        .filter((x) => x.code === s.code)
        .reduce((n, x) => n + x.net, 0);
    return result;
  });
  const ranked = groupTrades(rows, (x) => x.code).sort((a, b) => b.net - a.net);
  const periods = groupTrades(rows, (x) =>
    period === 'week' ? weekOf(x.date) : x.date.slice(0, 7),
  ).reverse();
  const choose = (
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    label: string,
  ) => (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="filter-select">
        <SelectValue>
          {options.find((x) => x.value === value)?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((x) => (
          <SelectItem key={x.value} value={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const selectRange = (nextRange: 'all' | 'today' | 'week' | 'month') => {
    if (!data) return;
    const today = japanDate();
    if (nextRange === 'all') {
      setStart(data.trades[0].date);
      setEnd(data.trades.at(-1)!.date);
    } else if (nextRange === 'today') {
      setStart(today);
      setEnd(today);
    } else if (nextRange === 'week') {
      setStart(weekStart(today));
      setEnd(today);
    } else {
      setStart(`${today.slice(0, 7)}-01`);
      setEnd(today);
    }
    setRange(nextRange);
  };
  const tooltipStyle = {
    background: '#143246',
    border: '1px solid #426176',
    borderRadius: 12,
    color: '#eff6fc',
  };
  const grid = (
    <CartesianGrid stroke="#284657" strokeDasharray="3 5" vertical={false} />
  );
  const axis = (
    <YAxis
      tickFormatter={(v) =>
        Math.abs(v) >= 10000 ? `${v / 10000}万` : money(v)
      }
      width={65}
      tick={{ fill: '#a5bccc', fontSize: 12 }}
      axisLine={false}
      tickLine={false}
    />
  );
  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="Trade Analysis">
          <Activity size={26} />
          <span>
            TRADE<span className="brand-light"> / ANALYSIS</span>
          </span>
        </a>
        <div className="top-actions">
          <button
            className="language"
            onClick={() => setLanguage(en ? 'ja' : 'en')}
          >
            {en ? '日本語' : 'EN'}
          </button>
          <label className="upload">
            <Upload size={17} />
            {t('CSVを読み込む', 'Import CSV')}
            <input
              aria-label={t('CSVを読み込む', 'Import CSV')}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  load(decodeCSV(await file.arrayBuffer()), file.name);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>
      </header>
      <div className="workspace" id="overview">
        <div className="source-line">
          <span className="status-dot" />
          {busy
            ? t('読み込み中…', 'Loading…')
            : t('取引レポート', 'Trading report')}
          <span className="source-file">{fileName}</span>
          <span className="local-tag">
            {t('ローカル分析', 'Local analysis')}
          </span>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <section className="filters" aria-label={t('分析条件', 'Filters')}>
          <div className="range-field">
            <span>{t('レポート範囲', 'Report range')}</span>
            <div className="range-options">
              {[
                ['all', t('全期間', 'All time')],
                ['today', t('今日', 'Today')],
                ['week', t('今週', 'This week')],
                ['month', t('今月', 'This month')],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={range === value ? 'active' : ''}
                  onClick={() =>
                    selectRange(value as 'all' | 'today' | 'week' | 'month')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label>
            {t('開始日', 'From')}
            <input
              aria-label="開始日 / From"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setRange('custom');
              }}
            />
          </label>
          <span className="date-dash">—</span>
          <label>
            {t('終了日', 'To')}
            <input
              aria-label="終了日 / To"
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setRange('custom');
              }}
            />
          </label>
          <div className="filter-field">
            <span>{t('銘柄', 'Symbol')}</span>
            {choose(
              symbol,
              setSymbol,
              [
                { value: 'all', label: t('すべての銘柄', 'All symbols') },
                ...symbols.map((x) => ({
                  value: x.code,
                  label: x.code + ' ' + x.name,
                })),
              ],
              t('銘柄', 'Symbol'),
            )}
          </div>
          <div className="filter-field">
            <span>{t('売買方向', 'Direction')}</span>
            {choose(
              side,
              setSide,
              [
                { value: 'all', label: t('ロング + ショート', 'Long + Short') },
                { value: 'long', label: t('ロング', 'Long') },
                { value: 'short', label: t('ショート', 'Short') },
              ],
              t('売買方向', 'Direction'),
            )}
          </div>
          <button
            className="reset"
            onClick={() => {
              selectRange('all');
              setSymbol('all');
              setSide('all');
            }}
          >
            {t('条件をリセット', 'Reset filters')}
          </button>
        </section>
        {start > end && end && (
          <p role="alert" className="error">
            {t(
              '開始日を終了日以前に設定してください。',
              'Start date must be before end date.',
            )}
          </p>
        )}
        {!busy && !rows.length && (
          <div className="empty">
            <FileSpreadsheet size={30} />
            {data
              ? t(
                  'この条件に該当する決済明細はありません。',
                  'No closed trades match these filters.',
                )
              : t(
                  '「CSVを読み込む」から tradehistory のCSVを選択してください。',
                  'Choose a tradehistory CSV using Import CSV.',
                )}
          </div>
        )}
        <div className="metrics">
          <section className="metric main-metric">
            <span>{t('期間確定損益', 'Realized P&L')}</span>
            <strong className={tone(summary.net)}>
              {summary.net > 0 ? '+' : ''}
              {money(summary.net)}
              <small> JPY</small>
            </strong>
            <p>
              {t(
                '受渡金額ベース・諸費用反映',
                'Settlement amounts, including trading costs',
              )}
            </p>
          </section>
          <section className="metric">
            <span>{t('勝率', 'Win rate')}</span>
            <strong>{percent(summary.winRate)}</strong>
            <p>
              {summary.wins} {t('勝', 'wins')} / {summary.losses}{' '}
              {t('敗', 'losses')} / {summary.draws} {t('分', 'flat')}
            </p>
          </section>
          <section className="metric">
            <span>{t('プロフィットファクター', 'Profit factor')}</span>
            <strong>{ratio(summary.pf)}</strong>
            <p>{t('総利益 ÷ 総損失', 'Gross profit / gross loss')}</p>
          </section>
          <section className="metric">
            <span>{t('決済明細数', 'Closed fills')}</span>
            <strong>
              {money(summary.count)}
              <small> {t('件', 'fills')}</small>
            </strong>
            <p>
              {daily.length} {t('取引日', 'trading days')}
            </p>
          </section>
        </div>
        <Tabs defaultValue="dashboard" className="view-tabs">
          <TabsList className="main-tabs">
            <TabsTrigger value="dashboard">
              {t('損益ダッシュボード', 'Dashboard')}
            </TabsTrigger>
            <TabsTrigger value="trades">
              {t('決済明細', 'Closed trades')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <div className="chart-grid">
              <section className="panel equity">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PERFORMANCE</span>
                    <h2>
                      {t('累積確定損益の推移', 'Cumulative realized P&L')}
                    </h2>
                  </div>
                  <TrendingUp className="accent" size={23} />
                </div>
                <div className="chart">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    initialDimension={{ width: 320, height: 260 }}
                    minWidth={0}
                  >
                    <AreaChart
                      data={chartData}
                      margin={{ top: 15, right: 15, bottom: 5, left: 0 }}
                    >
                      {grid}
                      <defs>
                        <linearGradient
                          id="equityFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#2dd4bf"
                            stopOpacity={0.32}
                          />
                          <stop
                            offset="100%"
                            stopColor="#2dd4bf"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => v.slice(5).replace('-', '/')}
                        tick={{ fill: '#a5bccc', fontSize: 12 }}
                        minTickGap={24}
                        axisLine={false}
                        tickLine={false}
                      />
                      {axis}
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => [
                          yen(Number(v)),
                          t('累積損益', 'Cumulative P&L'),
                        ]}
                      />
                      <ReferenceLine y={0} stroke="#638092" />
                      <Area
                        type="linear"
                        dataKey="cumulative"
                        dot={chartData.length === 1}
                        stroke="#2dd4bf"
                        strokeWidth={3}
                        fill="url(#equityFill)"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="chart-note">
                  {t(
                    '選択期間の開始時点を0円として集計。入出金・含み損益は含みません。',
                    'Starts at zero for the selected period. Excludes deposits, withdrawals and unrealized P&L.',
                  )}
                </p>
              </section>
              <section className="panel win-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">WIN / LOSS</span>
                    <h2>{t('勝率分析', 'Win rate analysis')}</h2>
                  </div>
                </div>
                <figure
                  className="donut"
                  aria-label={`${summary.wins} wins, ${summary.losses} losses, ${summary.draws} flat`}
                  style={{
                    background: summary.count
                      ? `conic-gradient(#ff626b 0 ${(summary.wins / summary.count) * 100}%, #40b2ef 0 ${((summary.wins + summary.losses) / summary.count) * 100}%, #688091 0)`
                      : '#284657',
                  }}
                >
                  <div>
                    <span>{t('明細単位の勝率', 'Fill win rate')}</span>
                    <strong>{percent(summary.winRate)}</strong>
                  </div>
                </figure>
                <div className="win-legend">
                  <span>
                    <i style={{ background: '#ff626b' }} />
                    {t('勝ち', 'Win')} {summary.wins}
                  </span>
                  <span>
                    <i style={{ background: '#40b2ef' }} />
                    {t('負け', 'Loss')} {summary.losses}
                  </span>
                  <span>
                    <i style={{ background: '#688091' }} />
                    {t('引分', 'Flat')} {summary.draws}
                  </span>
                </div>
              </section>
            </div>
            <section className="panel daily-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">DAILY BREAKDOWN</span>
                  <h2>{t('日別損益', 'Daily P&L')}</h2>
                </div>
                <Tabs
                  value={chartMode}
                  onValueChange={(v) => setChartMode(String(v))}
                >
                  <TabsList className="segmented">
                    <TabsTrigger value="net">{t('合計', 'Total')}</TabsTrigger>
                    <TabsTrigger value="stacked">
                      {t('銘柄別積み上げ', 'By symbol')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="chart daily-chart">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  initialDimension={{ width: 320, height: 290 }}
                  minWidth={0}
                >
                  <BarChart
                    data={chartData}
                    stackOffset="sign"
                    margin={{ top: 12, right: 15, bottom: 5, left: 0 }}
                  >
                    {grid}
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => v.slice(5).replace('-', '/')}
                      tick={{ fill: '#a5bccc', fontSize: 12 }}
                      minTickGap={24}
                      axisLine={false}
                      tickLine={false}
                    />
                    {axis}
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v, name) => [yen(Number(v)), name]}
                      cursor={{ fill: '#ffffff09' }}
                    />
                    <ReferenceLine y={0} stroke="#638092" />
                    {chartMode === 'net' ? (
                      <Bar
                        dataKey="net"
                        name={t('日別損益', 'Daily P&L')}
                        isAnimationActive={false}
                        shape={(props: unknown) => {
                          const { payload, ...rect } =
                            props as RectangleProps & {
                              payload: { net: number };
                            };
                          return (
                            <Rectangle
                              {...rect}
                              fill={payload.net >= 0 ? '#ff626b' : '#40b2ef'}
                            />
                          );
                        }}
                      />
                    ) : (
                      symbols
                        .filter((s) => symbol === 'all' || s.code === symbol)
                        .map((s) => (
                          <Bar
                            key={s.code}
                            dataKey={s.code}
                            name={s.name}
                            stackId="symbols"
                            fill={colors[symbols.indexOf(s) % colors.length]}
                            isAnimationActive={false}
                          />
                        ))
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {chartMode === 'stacked' && (
                <>
                  <div className="symbol-legend">
                    {symbols
                      .filter((s) => symbol === 'all' || s.code === symbol)
                      .map((s) => (
                        <span key={s.code}>
                          <i
                            style={{
                              background:
                                colors[symbols.indexOf(s) % colors.length],
                            }}
                          />
                          {s.name}
                        </span>
                      ))}
                  </div>
                  <p className="chart-note">
                    {t(
                      '各銘柄の日次純損益を、プラス・マイナスに分けて積み上げ表示。',
                      'Each symbol’s daily net P&L is stacked separately above or below zero.',
                    )}
                  </p>
                </>
              )}
            </section>
            <div className="direction-grid">
              {[
                { s: long, label: t('ロング', 'Long'), icon: <ArrowUpRight /> },
                {
                  s: short,
                  label: t('ショート', 'Short'),
                  icon: <ArrowDownRight />,
                },
              ].map(({ s, label, icon }) => (
                <section className="panel direction" key={label}>
                  <div className="panel-heading">
                    <h2>
                      {icon}
                      {label}
                    </h2>
                    <span>
                      {s.count} {t('明細', 'fills')}
                    </span>
                  </div>
                  <div className="direction-numbers">
                    <div>
                      <span>{t('確定損益', 'Realized P&L')}</span>
                      <strong className={tone(s.net)}>{yen(s.net)}</strong>
                    </div>
                    <div>
                      <span>{t('勝率', 'Win rate')}</span>
                      <strong>{percent(s.winRate)}</strong>
                    </div>
                    <div>
                      <span>
                        {data?.hasEntryBasis
                          ? t('利益率', 'Return on entry value')
                          : t('利益率', 'Return unavailable')}
                      </span>
                      <strong
                        className={data?.hasEntryBasis ? tone(s.net) : ''}
                      >
                        {data?.hasEntryBasis ? percent(s.rate) : '—'}
                      </strong>
                    </div>
                  </div>
                  <div className="mini-stats">
                    <span>
                      PF <b>{ratio(s.pf)}</b>
                    </span>
                    <span>
                      {t('ペイオフレシオ', 'Payoff ratio')}{' '}
                      <b>{ratio(s.payoff)}</b>
                    </span>
                    <span>
                      {t('平均利益', 'Avg. win')}{' '}
                      <b className="positive">
                        {s.averageWin === null ? '—' : yen(s.averageWin)}
                      </b>
                    </span>
                    <span>
                      {t('平均損失', 'Avg. loss')}{' '}
                      <b className="negative">
                        {s.averageLoss === null ? '—' : yen(-s.averageLoss)}
                      </b>
                    </span>
                  </div>
                </section>
              ))}
            </div>
            <div className="bottom-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">SYMBOL CONTRIBUTION</span>
                    <h2>{t('銘柄別期間損益', 'P&L by symbol')}</h2>
                  </div>
                  <span>
                    {ranked.length} {t('銘柄', 'symbols')}
                  </span>
                </div>
                <div className="ranking">
                  {ranked.map((g, i) => (
                    <button
                      className="rank-row"
                      key={g.key}
                      onClick={() => setSymbol(g.key)}
                    >
                      <span className="rank-index">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="rank-name">
                        <strong>{g.items[0].name}</strong>
                        <span>
                          {g.key} · {g.count} {t('明細', 'fills')} ·{' '}
                          {t('勝率', 'Win rate')} {percent(g.winRate)}
                        </span>
                        <div className="rank-track">
                          <i
                            style={{
                              width:
                                Math.max(
                                  2,
                                  (Math.abs(g.net) /
                                    Math.max(
                                      ...ranked.map((x) => Math.abs(x.net)),
                                      1,
                                    )) *
                                    100,
                                ) + '%',
                              background: g.net >= 0 ? '#ff626b' : '#40b2ef',
                            }}
                          />
                        </div>
                      </div>
                      <strong className={tone(g.net)}>{yen(g.net)}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">PERIOD SUMMARY</span>
                    <h2>{t('期間サマリー', 'Period summary')}</h2>
                  </div>
                  <Tabs
                    value={period}
                    onValueChange={(v) => setPeriod(String(v))}
                  >
                    <TabsList className="segmented">
                      <TabsTrigger value="week">
                        {t('週次', 'Weekly')}
                      </TabsTrigger>
                      <TabsTrigger value="month">
                        {t('月次', 'Monthly')}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('期間', 'Period')}</TableHead>
                      <TableHead>{t('損益', 'P&L')}</TableHead>
                      <TableHead>{t('勝率', 'Win rate')}</TableHead>
                      <TableHead>{t('件数', 'Fills')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periods.map((g) => (
                      <TableRow key={g.key}>
                        <TableCell>
                          {g.key}
                          {period === 'week' ? ' 〜' : ''}
                        </TableCell>
                        <TableCell className={tone(g.net)}>
                          {yen(g.net)}
                        </TableCell>
                        <TableCell>{percent(g.winRate)}</TableCell>
                        <TableCell>{g.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="chart-note">
                  {t(
                    '週は月曜始まり。選択した期間・銘柄・方向で集計。',
                    'Weeks start Monday. All selected filters apply.',
                  )}
                </p>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="trades">
            <section className="panel">
              <div className="panel-heading">
                <h2>{t('決済明細', 'Closed trades')}</h2>
                <span>
                  {rows.length} {t('件', 'fills')}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      t('元CSV行', 'CSV row'),
                      t('決済日', 'Close date'),
                      t('銘柄', 'Symbol'),
                      t('方向', 'Side'),
                      t('数量', 'Quantity'),
                      data?.hasEntryBasis
                        ? t('建単価', 'Entry')
                        : t('建単価', 'Entry unavailable'),
                      t('決済単価', 'Exit'),
                      t('損益', 'Net P&L'),
                      t('利益率', 'Return'),
                    ].map((x) => (
                      <TableHead key={x}>{x}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...rows].reverse().map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.id}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        {r.code} {r.name}
                      </TableCell>
                      <TableCell>
                        {r.side === 'long'
                          ? t('ロング', 'Long')
                          : t('ショート', 'Short')}
                      </TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell>
                        {data?.hasEntryBasis ? r.entry.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>{r.exit.toLocaleString()}</TableCell>
                      <TableCell className={tone(r.net)}>
                        {yen(r.net)}
                      </TableCell>
                      <TableCell>
                        {data?.hasEntryBasis ? percent(r.net / r.basis) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </TabsContent>
        </Tabs>
        <details className="method">
          <summary>
            {t('集計方法・データについて', 'Calculation methodology')}
          </summary>
          <p>
            {data?.source === 'sbi'
              ? t(
                  'SBIの「信用返済売」をロング、「信用返済買」をショートとして、決済損益が記録された明細を1件ずつ集計します。SBIのCSVには建単価がないため、利益率と明細の建単価は表示しません。',
                  'SBI credit-close sells are long and credit-close buys are short. Only rows with recorded realized P&L are counted. SBI CSVs do not contain entry prices, so return and entry price are unavailable.',
                )
              : t(
                  '信用返済の各CSV明細を1件として集計。勝率は利益明細数 ÷ 全決済明細数（引き分けを含む）。同一注文の分割約定も個別に数えます。利益率は純損益合計 ÷ 決済対象の建約定金額合計で、口座資産や証拠金に対する収益率ではありません。',
                  'Each credit-close CSV row is one fill. Win rate includes flat fills in the denominator. Split fills count separately. Return is total net P&L divided by closed entry notional, not account equity or margin.',
                )}
          </p>
          <p>
            {t(
              '純損益はCSVの受渡金額を採用し、費用を二重控除しません。源泉徴収後の口座残高との一致は保証されません。資産総額・含み損益・株価チャートは、このCSVだけでは算出できません。',
              'Net P&L uses settlement amounts without deducting costs again. Account balances after withholding may differ. Total assets, unrealized P&L and historical market prices are unavailable from this CSV.',
            )}
          </p>
          <p>
            {data &&
              `${data.sourceRows} ${t('元明細', 'source rows')} / ${data.trades.length} ${t('決済明細', 'closed fills')}${data.source === 'sbi' ? ` / ${data.unavailableSettlements} ${t('件は決済損益未記録のため除外', 'fills excluded because P&L is unavailable')}` : ` / ${data.zeroSettlements} ${t('件は建値決済・費用ゼロを確認して0円として集計', 'flat fills verified with zero costs')}`}`}
          </p>
          <p>
            {t(
              '読み込んだCSVはブラウザ内で処理されます。再読み込み後はCSVを再選択してください。',
              'Imported CSVs are processed in your browser. After reloading, choose the CSV again.',
            )}
          </p>
        </details>
        <footer>
          TRADE / ANALYSIS
          <span>
            {t(
              'CSVはブラウザ内で処理・サーバー送信なし',
              'CSV processing stays in your browser',
            )}
          </span>
        </footer>
      </div>
    </main>
  );
}
