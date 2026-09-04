import type { Metadata } from "next";
import { headers } from "next/headers";
import { principalDariHeaders } from "@/server/sesi";
import Bagian from "./bagian";

export const metadata: Metadata = { title: "Vending" };

/**
 * Peran dibaca di server dan diteruskan sebagai prop supaya layar bisa
 * menjelaskan aksi mana yang bukan milik peran ini — bukan supaya menjadi
 * penjaganya. Penjaganya tetap `wajibPeran()` di route API; tombol yang
 * disembunyikan tidak menghalangi siapa pun yang memanggil API langsung.
 */
export default async function HalamanVending() {
  const p = await principalDariHeaders(await headers());
  return <Bagian peran={p?.peran ?? []} />;
}
