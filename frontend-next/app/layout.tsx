import "./globals.css";

export const metadata = { title: "Tempo Lab", description: "F1 race intelligence workspace" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
