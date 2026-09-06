// web/app/layout.tsx
import { AuthProvider } from "@/features/auth/useAuth";
import { ToastProvider } from "@/shared/ui/Toast";

export const metadata = {
  title: "Prompt Evaluation Workbench",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
