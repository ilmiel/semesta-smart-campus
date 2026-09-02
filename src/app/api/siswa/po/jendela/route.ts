import { ok, tangani } from "@/server/http";
import { jendelaPO } from "@/server/portal";
import { wajibSiswa } from "@/server/sesi";
export const GET = tangani(async (req) => { await wajibSiswa(req); return ok(await jendelaPO()); });
