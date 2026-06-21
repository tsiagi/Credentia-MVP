// Company-admin route tree shell. Server-side role re-check (defense in depth on
// top of middleware.ts) and org branding lookup before rendering the shell.
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, org_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect(profile?.role === "superadmin" ? "/superadmin/dashboard" : "/");
  }

  let orgName: string | null = null;
  let orgLogoUrl: string | null = null;
  if (profile?.org_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", profile.org_id)
      .single();
    orgName = org?.name ?? null;
    orgLogoUrl = org?.logo_url ?? null;
  }

  return (
    <AdminShell variant="admin" userName={profile?.full_name} orgName={orgName} orgLogoUrl={orgLogoUrl}>
      {children}
    </AdminShell>
  );
}
