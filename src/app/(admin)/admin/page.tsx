import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Beranda" };

export default function BerandaAdmin() {
  return <Bagian />;
}
