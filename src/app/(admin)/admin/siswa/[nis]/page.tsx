import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Detail siswa" };

export default async function HalamanDetailSiswa({ params }: { params: Promise<{ nis: string }> }) {
  const { nis } = await params;
  return <Bagian nis={nis} />;
}
