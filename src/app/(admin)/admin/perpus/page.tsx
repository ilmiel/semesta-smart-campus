import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Perpustakaan" };

export default function HalamanPerpus() {
  return <Bagian />;
}
