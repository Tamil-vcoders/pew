// web/app/layout.tsx
import { AuthProvider } from "@/features/auth/useAuth";

export const metadata = {
  title: "Prompt Evaluation Workbench",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
