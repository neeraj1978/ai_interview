"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";

export function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
