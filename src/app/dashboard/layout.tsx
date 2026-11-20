import type { ReactNode } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { permissionsFor, requirePermission, type AppRole } from "@/lib/auth";

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "المدرس (صاحب الحساب)",
  admin: "مساعد - مدير",
  grader: "مساعد - مصحح",
  receptionist: "مساعد - استقبال",
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await requirePermission("dashboard.view");
  const permissions = [...permissionsFor(auth.role)];

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col bg-surface-muted lg:flex-row">
      <Sidebar
        userName={auth.name}
        roleLabel={ROLE_LABELS[auth.role]}
        permissions={permissions}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-page">{children}</div>
      </main>
    </div>
  );
}
