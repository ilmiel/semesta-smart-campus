import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Portal Siswa" };

export default function PortalSiswa() {
  return <Bagian />;
}
