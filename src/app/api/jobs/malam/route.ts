import { ok, tangani } from "@/server/http";
import { jobMalam, wajibCron } from "@/server/jobs";
export const POST = tangani(async (req) => { wajibCron(req); return ok(await jobMalam()); });
// Vercel Cron memanggil dengan GET + Authorization: Bearer $CRON_SECRET (otomatis bila env CRON_SECRET ada)
export const GET = POST;
