/** GET /api/ortu/po/jendela — apakah PO buka + menu yang bisa dipesan (F-48/F-49). */
import { ok, tangani } from "@/server/http";
import { jendelaPO } from "@/server/portal";
import { wajibLogin } from "@/server/sesi";
export const GET = tangani(async (req) => { await wajibLogin(req); return ok(await jendelaPO()); });
