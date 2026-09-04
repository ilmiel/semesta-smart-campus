import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Jejak audit" };

export default function HalamanAudit() {
  return <Bagian />;
}
