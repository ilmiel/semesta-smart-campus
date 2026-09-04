import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Loker" };

export default function HalamanLoker() {
  return <Bagian />;
}
