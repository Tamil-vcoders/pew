// web/app/layout.tsx
import { Inter, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/features/auth/useAuth";
import { ToastProvider } from "@/shared/ui/Toast";
import "./globals.css";

// docs/prototype.jsx loads these same two families (Inter for UI text, JetBrains Mono for
// anything monospace) via a Google Fonts <link> tag; next/font/google is the idiomatic
// Next.js equivalent -- it self-hosts the font files (no external request at runtime) and
// exposes them as CSS variables consumed by app/globals.css.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "Prompt Evaluation Workbench",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
