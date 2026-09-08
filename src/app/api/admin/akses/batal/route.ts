/**
 * POST / GET /api/admin/akses/batal
 * Mengakhiri mode impersonasi pengecekan dan menghapus cookienya.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { catatAudit } from "@/server/audit";
import { ok, tangani } from "@/server/http";
import { aktor, COOKIE_IMPERSONASI, principalDariRequest } from "@/server/sesi";

export const GET = async (req: Request) => {
  const p = await principalDariRequest(req);
  if (p?.impersonasi) {
    await catatAudit(
      aktor(p),
      p.peran.join(","),
      "admin_impersonasi_selesai",
      `${p.impersonasi.tipe}:${p.impersonasi.targetId}`,
      { target: p.impersonasi.targetNama },
      p.ip
    );
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_IMPERSONASI);

  const url = new URL("/admin/akses", req.url);
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_IMPERSONASI);
  return res;
};

export const POST = tangani(async (req) => {
  const p = await principalDariRequest(req);
  if (p?.impersonasi) {
    await catatAudit(
      aktor(p),
      p.peran.join(","),
      "admin_impersonasi_selesai",
      `${p.impersonasi.tipe}:${p.impersonasi.targetId}`,
      { target: p.impersonasi.targetNama },
      p.ip
    );
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_IMPERSONASI);

  const res = ok({ redirect: "/admin/akses" });
  res.headers.append("set-cookie", `${COOKIE_IMPERSONASI}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
});
