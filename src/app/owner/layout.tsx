import type { Metadata } from "next";
import { OwnerShell } from "./owner-shell";

export const metadata: Metadata = {
  title: {
    default: "بوابة المالك",
    template: "%s | بوابة المالك",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <OwnerShell>{children}</OwnerShell>;
}
