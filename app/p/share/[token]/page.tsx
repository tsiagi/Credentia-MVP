import type { Metadata } from "next";
import ShareableProfilePage from "@/components/ShareableProfilePage";

export const metadata: Metadata = {
  title: "Verified Profile — Core-Roborate",
  description: "Shareable verified achievements. View-only.",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareableProfilePage token={token} />;
}
