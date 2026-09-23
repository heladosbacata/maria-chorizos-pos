import type { NextApiRequest, NextApiResponse } from "next";
import { proxyPostHaciaWms } from "@/lib/pos-wms-proxy-post";

/** Proxy POST → WMS `/api/pos/turnos/sincronizar`. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await proxyPostHaciaWms(req, res, "/api/pos/turnos/sincronizar");
}
