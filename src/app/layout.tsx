import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import { Manrope, JetBrains_Mono, Geist } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import QueryProvider from '@/components/query-provider';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Пофиксим - тренировка грамотности',
  description: 'Подтяни орфографию, пунктуацию и грамматическое чутье',
};

const THEME_INIT_SCRIPT = `
(() => {
  try {
    const cookieTheme = document.cookie
      .split('; ')
      .find((row) => row.startsWith('theme='))
      ?.split('=')[1];
    const saved = localStorage.getItem('theme');
    const theme = saved === 'dark' || (!saved && cookieTheme === 'dark') ? 'dark' : 'light';
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = theme;
    document.cookie = 'theme=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax';
  } catch {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme')?.value;
  const initialTheme = themeCookie === 'dark' ? 'dark' : 'light';

  return (
    <html
      lang="ru"
      className={cn("h-full", "antialiased", initialTheme === 'dark' && 'dark', manrope.variable, jetbrainsMono.variable, "font-sans", geist.variable)}
      style={{ colorScheme: initialTheme }}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <QueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
