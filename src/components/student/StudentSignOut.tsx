"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function StudentSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/student/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="btn-secondary px-3 py-2"
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        <LogOut size={16} aria-hidden="true" />
      )}
      خروج
    </button>
  );
}
