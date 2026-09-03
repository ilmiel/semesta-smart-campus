/**
 * Better Auth — login untuk dashboard admin & portal.
 *
 *  - Staf & siswa : Google Workspace sekolah (SSO), domain dibatasi.
 *  - Orang tua    : magic link ke email yang terdaftar di tabel `wali`.
 *
 * Better Auth HANYA menjawab "siapa ini" (email terverifikasi). "Boleh apa"
 * ditentukan tabel sekolah (staf.peran, siswa.email, wali.email) di sesi.ts.
 * Tidak ada pendaftaran bebas: akun hanya dibuat kalau emailnya sudah dikenal
 * sekolah (databaseHooks.user.create.before).
 *
 * Tabel milik Better Auth (user, session, account, verification) dibuat dengan
 * CLI resminya, bukan lewat db/migrate.sh:  npx @better-auth/cli migrate
 */
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { pool, satu } from "./db";
import { kirimEmail } from "./notifikasi";

const DOMAIN_SEKOLAH = (process.env.DOMAIN_SEKOLAH ?? "semesta.sch.id").toLowerCase();

/** Email dikenal sekolah? (staf aktif / siswa / wali) */
export async function emailDikenal(email: string): Promise<{ staf: boolean; siswa: boolean; wali: boolean }> {
  const e = email.toLowerCase();
  const r = await satu<{ staf: boolean; siswa: boolean; wali: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM staf  WHERE email = $1 AND aktif)                       AS staf,
            EXISTS (SELECT 1 FROM siswa WHERE lower(email) = $1 AND status IN ('aktif','cuti')) AS siswa,
            EXISTS (SELECT 1 FROM wali  WHERE lower(email) = $1)                          AS wali`,
    [e],
  );
  return r ?? { staf: false, siswa: false, wali: false };
}

export const auth = betterAuth({
  appName: "Semesta Smart Campus",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 hari
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      prompt: "select_account",
      // batasi ke Workspace sekolah di layar Google (hd) — pertahanan pertama;
      // pertahanan sesungguhnya ada di hook di bawah.
      ...(DOMAIN_SEKOLAH ? { hd: DOMAIN_SEKOLAH } : {}),
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Tolak pembuatan akun untuk email yang tidak dikenal sekolah.
        before: async (user) => {
          const email = String(user.email ?? "").toLowerCase();
          const d = await emailDikenal(email);
          if (d.staf || d.siswa || d.wali) return;
          console.warn(`[auth] login ditolak — email tidak terdaftar: ${email}`);
          return false;
        },
      },
    },
  },
  plugins: [
    magicLink({
      // Hanya untuk WALI. Untuk email asing kita diam (tidak memberi tahu
      // apakah email itu ada) — mencegah enumerasi.
      //
      // Audit §2.7: staf sengaja TIDAK boleh masuk lewat magic link. Peran
      // diturunkan murni dari email (sesi.ts), jadi magic link ke email staf
      // = sesi admin_it/keuangan penuh tanpa Google 2FA. Guru yang juga orang
      // tua tidak dirugikan: sesi Google-nya sudah membawa peran DAN wali.
      sendMagicLink: async ({ email, url }) => {
        const d = await emailDikenal(email);
        if (!d.wali || d.staf) return;
        await kirimEmail({
          ke: email,
          judul: "Tautan masuk Portal Orang Tua — Semesta Smart Campus",
          teks: `Klik tautan berikut untuk masuk (berlaku 5 menit):\n${url}\n\nJika Anda tidak meminta ini, abaikan email ini.`,
        });
      },
      expiresIn: 60 * 5,
    }),
    nextCookies(), // harus terakhir
  ],
});

export type Sesi = typeof auth.$Infer.Session;
