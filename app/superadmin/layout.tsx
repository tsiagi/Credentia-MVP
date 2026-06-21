// Superadmin route tree shell. Server-side role re-check (defense in depth on
// top of middleware.ts) before rendering the platform-operator shell.
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    redirect(profile?.role === "admin" ? "/admin/dashboard" : "/");
  }

  return (
    <AdminShell variant="superadmin" userName={profile?.full_name}>
      {children}
    </AdminShell>
  );
}
