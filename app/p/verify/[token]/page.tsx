import type { Metadata } from "next";
import VerifiedResumePage from "@/components/VerifiedResumePage";
import "./passport.css";

export const metadata: Metadata = {
  title: "Verified Resume — Credentia",
  description: "Attested career record for recruiters. View-only.",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VerifiedResumePage token={token} />;
}
