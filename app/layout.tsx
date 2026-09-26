import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Base | Home eligibility check', description: 'Guided home photo check — interactive prototype.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
