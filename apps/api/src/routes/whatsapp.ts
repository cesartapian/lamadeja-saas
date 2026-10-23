import { config } from '../lib/config.js';
import { saveWebhook } from '../lib/webhookInbox.js';
import { webhookRouter } from './webhookRouter.js';
export const whatsappRouter = webhookRouter(config.META_APP_SECRET, config.META_VERIFY_TOKEN, saveWebhook);
