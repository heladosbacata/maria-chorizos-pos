import type { NextApiRequest, NextApiResponse } from "next";

function buildIdServidor(): string {
  return (
    process.env.NEXT_PUBLIC_POS_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.POS_BUILD_ID ||
    "unknown"
  );
}

/** GET: id de build desplegado (para auto-refresh del POS tras cobrar). */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(200).json({
    ok: true,
    buildId: buildIdServidor(),
  });
}
