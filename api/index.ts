import type { IncomingMessage, ServerResponse } from 'node:http';
// Vercel owns the HTTP server; this entry never starts listeners or workers.
process.env.PILOT_READ_ONLY = 'true';
const application = import('../apps/api/src/app.js');
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const { app } = await application;
  return app(request, response);
}
