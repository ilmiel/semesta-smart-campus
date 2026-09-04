import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Kantin" };

export default function HalamanKantin() {
  return <Bagian />;
}
