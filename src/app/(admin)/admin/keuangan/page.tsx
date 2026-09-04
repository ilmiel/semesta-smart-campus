import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Keuangan" };

export default function HalamanKeuangan() {
  return <Bagian />;
}
