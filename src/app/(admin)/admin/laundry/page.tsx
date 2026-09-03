import type { Metadata } from "next";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Laundry" };

export default function HalamanLaundry() {
  return <Bagian />;
}
