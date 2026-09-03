import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Perangkat" };

export default function HalamanPerangkat() {
  return <Bagian />;
}
