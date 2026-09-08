/**
 * POST / GET /api/admin/akses/batal
 * Mengakhiri mode impersonasi pengecekan dan menghapus cookienya.
 */
import { NextResponse } from "next/server";
import { skalar } from "@/server/db";
import { ok, tangani } from "@/server/http";
import { aktor, COOKIE_IMPERSONASI, principalDariRequest } from "@/server/sesi";

export const GET = async (req: Request) => {
  const p = await principalDariRequest(req);
  if (p?.impersonasi) {
    await skalar("audit_catat", [
      aktor(p),
      "admin_impersonasi_selesai",
      `Selesai pengecekan ${p.impersonasi.tipe}: ${p.impersonasi.targetNama}`,
      p.ip,
    ]).catch(() => {});
  }

  const url = new URL("/admin/akses", req.url);
  const res = NextResponse.redirect(url);
  res.cookies.set(COOKIE_IMPERSONASI, "", { path: "/", maxAge: 0 });
  return res;
};

export const POST = tangani(async (req) => {
  const p = await principalDariRequest(req);
  if (p?.impersonasi) {
    await skalar("audit_catat", [
      aktor(p),
      "admin_impersonasi_selesai",
      `Selesai pengecekan ${p.impersonasi.tipe}: ${p.impersonasi.targetNama}`,
      p.ip,
    ]).catch(() => {});
  }

  const res = ok({ ok: true, redirect: "/admin/akses" });
  res.headers.append("set-cookie", `${COOKIE_IMPERSONASI}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
});
