import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  icons: { icon: './favicon.svg' },
  title: 'Trade Analysis | 取引分析',
  description: 'CSVから日別・銘柄別損益とロング・ショートの取引成績を分析。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
