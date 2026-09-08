/**
 * Identitas & Logo Sekolah (Portrait & Landscape)
 *
 * Mengelola nama sekolah, nama brand sistem, serta logo portrait (kotak/avatar)
 * dan logo landscape (banner horisontal) yang disimpan di tabel `kebijakan`.
 */

export interface IdentitasSekolah {
  nama: string;
  nama_singkat: string;
  logo_portrait: string | null;
  logo_landscape: string | null;
}

export const DEFAULT_IDENTITAS: IdentitasSekolah = {
  nama: "Semesta Bilingual Boarding School",
  nama_singkat: "Smart Campus",
  logo_portrait: null,
  logo_landscape: null,
};

/**
 * Kompresi gambar logo di sisi browser (HTML5 Canvas).
 * Mempertahankan transparansi (PNG/WEBP) dan meresize ke resolusi optimal
 * agar ukuran file ringan (<60 KB) saat disimpan ke database.
 */
export function kompresLogo(
  file: File,
  tipe: "portrait" | "landscape"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (tipe === "portrait") {
          // Logo portrait / square: max 400x400
          const maxDim = 400;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
        } else {
          // Logo landscape: max 800x240
          const maxWidth = 800;
          const maxHeight = 240;
          if (width > maxWidth || height > maxHeight) {
            const ratioW = maxWidth / width;
            const ratioH = maxHeight / height;
            const ratio = Math.min(ratioW, ratioH);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(e.target?.result as string);

        // Pertahankan transparansi
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Jika file asli JPEG, gunakan jpeg; selain itu gunakan PNG untuk transparansi
        const isJpeg = file.type === "image/jpeg" || file.type === "image/jpg";
        if (isJpeg) {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } else {
          resolve(canvas.toDataURL("image/png"));
        }
      };
      img.onerror = () => reject(new Error("Gagal membaca file gambar"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Gagal membuka file"));
    reader.readAsDataURL(file);
  });
}
