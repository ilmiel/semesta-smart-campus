/**
 * Pengganti src/server/auth.ts saat uji: sesi ditentukan header `x-uji-email`.
 * Semua logika peran (sesi.ts) tetap berjalan nyata terhadap tabel staf/siswa/wali.
 */
export const auth = {
  api: {
    async getSession({ headers }: { headers: Headers }) {
      const email = headers.get("x-uji-email");
      if (!email) return null;
      return { user: { id: "uji", email, name: email.split("@")[0] }, session: { id: "s", expiresAt: new Date(Date.now() + 3600e3) } };
    },
  },
};
export async function emailDikenal() { return { staf: true, siswa: false, wali: false }; }
