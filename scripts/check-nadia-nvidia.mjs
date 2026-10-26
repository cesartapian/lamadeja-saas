import { generateNadiaReply, NadiaInferenceError } from '../apps/api/dist/lib/nadiaNim.js';
// Explicit one-request diagnostic. Never logs credentials or model content.
if (process.env.NADIA_RUN_REAL_NIM !== '1' || !process.env.NVIDIA_API_KEY || !process.env.NADIA_MODEL) {
  console.error('BLOCKED: requires explicit NADIA_RUN_REAL_NIM=1, secure NVIDIA_API_KEY and an approved NADIA_MODEL.');
  process.exitCode = 1;
} else {
  try {
    const result = await generateNadiaReply({ apiKey: process.env.NVIDIA_API_KEY, model: process.env.NADIA_MODEL,
      firstContact: true, timeoutMs: 30000, messages: [{ role: 'user', content: 'Hola. ¿Puedes ayudarme a elegir una lana sin inventar precios ni inventario?' }] });
    console.info(JSON.stringify({ real_nvidia_request: true, first_contact_identity: result.text.startsWith('Soy Nadia, asistente virtual con inteligencia artificial.'), response_characters: result.text.length, whatsapp_sent: false }));
  } catch (error) {
    console.error(`FAIL: real NVIDIA diagnostic (${error instanceof NadiaInferenceError ? error.category : 'provider'}).`);
    process.exitCode = 1;
  }
}
