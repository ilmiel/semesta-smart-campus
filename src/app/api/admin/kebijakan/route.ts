/**
 * GET /api/admin/kebijakan — semua nilai + keterangan.
 * PUT /api/admin/kebijakan { kunci, nilai } | { ambang_pin_rp } — tercatat di audit (F-49, §12-5).
 * Ambang PIN & limit offline hanya bisa diubah bersama (F-33).
 */
import { q, skalar } from "@/server/db";
import { HttpError, ok, tangani } from "@/server/http";
import { aktor, wajibPeran } from "@/server/sesi";
import { bacaBody, v } from "@/server/validasi";

export const GET = tangani(async (req) => {
  await wajibPeran(req);
  return ok({ kebijakan: await q(`SELECT kunci, nilai, keterangan, diubah, diubah_oleh FROM kebijakan ORDER BY kunci`) });
});

export const PUT = tangani(async (req) => {
  const p = await wajibPeran(req, "admin_it", "manajemen", "keuangan");
  const b = await bacaBody(req, v.obj({ kunci: v.str({ max: 40 }).opsional(), nilai: v.apa().opsional(), ambang_pin_rp: v.rupiah().opsional() }));
  if (b.ambang_pin_rp !== undefined) {
    await skalar("kebijakan_set_ambang_pin", [b.ambang_pin_rp, aktor(p)]);
    return ok({ ambang_pin_rp: b.ambang_pin_rp, limit_offline_rp: b.ambang_pin_rp });
  }
  if (!b.kunci || b.nilai === undefined) throw new HttpError(400, "VALIDASI", "kunci & nilai wajib");
  await skalar("kebijakan_set", [b.kunci, JSON.stringify(b.nilai), aktor(p)]);
  return ok({ kunci: b.kunci, nilai: b.nilai });
});
