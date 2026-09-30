import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'RelayDesk — Reliable email delivery', template: '%s · RelayDesk' },
  description: 'Reliable email delivery, without the guesswork.',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='%232563EB'/><path d='M9 11l7 5.5L23 11' stroke='white' stroke-width='2' fill='none' stroke-linecap='round'/></svg>" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
