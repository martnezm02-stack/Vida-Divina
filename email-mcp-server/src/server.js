#!/usr/bin/env node
// server.js — Servidor MCP real (stdio) de correo de Vida Divina.
//
// send_email: legado, SMTP/nodemailer real (ver .env.example).
// Gmail API real (FASE "Hermes ADMIN + Gmail MCP completo", 2026-09-04),
// sobre tienda.vivevidadivina@gmail.com, vía OAuth2 (ver gmailClient.js
// para el detalle real de scopes/credenciales -- nunca SQL ni comandos
// arbitrarios, cada tool llama a UNA función real y parametrizada de
// gmailService.js):
//   searchEmails, readEmail, summarizeEmails   -- lectura
//   createDraft, updateDraft, trashEmail        -- gestión (nunca borrado permanente)
//   sendApprovedEmail                           -- envío real de un borrador YA existente
//
// La autorización ADMIN-only de estas tools NO vive aquí -- vive en la capa
// de tools de hermes-kit (src/lib/tools/gmail.ts), igual que el resto de
// tools administrativas (identity.ts). Este servidor MCP es un ejecutor
// puro de acciones reales de Gmail, sin lógica de negocio ni de permisos.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import nodemailer from 'nodemailer';
import { gmailConfigured } from './gmailClient.js';
import {
  searchGmailMessages, readGmailMessage, createGmailDraft, updateGmailDraft,
  getGmailDraftSummary, trashGmailMessage, sendApprovedGmailDraft,
} from './gmailService.js';

// Carga real de email-mcp-server/.env en el propio proceso -- necesario
// porque este servidor se invoca como "node src/server.js" (spawn directo
// vía stdio desde hermes-kit/src/lib/vidaDivina/emailMcpClient.ts, no via
// "npm start"), así que no basta con que las variables existan en el
// archivo: hay que cargarlas en process.env del proceso hijo real antes de
// que gmailClient.js/nodemailer las lean. Mecanismo nativo de Node
// (process.loadEnvFile, sin dependencia dotenv) -- soportado en la versión
// de Node de este proyecto (v24). Nunca imprime ni loguea el contenido.
const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function handleSendEmail({ to, subject, text }) {
  const destinatario = to || process.env.ADMIN_EMAIL;
  if (!smtpConfigured()) {
    return { isError: true, content: [{ type: 'text', text: 'SMTP no está configurado en este entorno (falta SMTP_HOST/SMTP_USER/SMTP_PASS) -- no se envió ningún correo real.' }] };
  }
  if (!destinatario) {
    return { isError: true, content: [{ type: 'text', text: 'Falta destinatario real: no se pasó "to" y ADMIN_EMAIL no está configurado.' }] };
  }
  try {
    const info = await buildTransport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: destinatario, subject, text });
    return { content: [{ type: 'text', text: `Correo real enviado. messageId: ${info.messageId}` }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Fallo real enviando el correo: ${err.message}` }] };
  }
}

function gmailErrorGuard() {
  if (!gmailConfigured()) {
    return { isError: true, content: [{ type: 'text', text: 'Gmail no está configurado en este entorno (falta OAuth real -- ejecuta "npm run authorize" en email-mcp-server/ una vez).' }] };
  }
  return null;
}

async function withGmailErrorHandling(fn) {
  const guard = gmailErrorGuard();
  if (guard) return guard;
  try {
    const resultado = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Fallo real de Gmail API: ${err.message}` }] };
  }
}

const TOOLS = [
  {
    name: 'send_email',
    description: 'Envía un correo real por SMTP (legado). Requiere SMTP_HOST/SMTP_USER/SMTP_PASS -- si no, error real, nunca simula el envío.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, text: { type: 'string' } }, required: ['subject', 'text'] },
  },
  {
    name: 'searchEmails',
    description: 'Busca mensajes REALES en Gmail (sintaxis de búsqueda real de Gmail, ej. "is:unread from:cliente@x.com"). Solo lectura.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: [] },
  },
  {
    name: 'readEmail',
    description: 'Lee el cuerpo REAL completo de un mensaje de Gmail por su id real. Solo lectura.',
    inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] },
  },
  {
    name: 'summarizeEmails',
    description: 'Trae metadata real (remitente, asunto, fecha, snippet) de varios mensajes que coincidan con una búsqueda real -- para que quien llame (Hermes) componga el resumen en lenguaje natural a partir de datos reales, nunca inventados. Solo lectura.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, maxResults: { type: 'number' } }, required: [] },
  },
  {
    name: 'createDraft',
    description: 'Crea un borrador REAL en Gmail. NUNCA lo envía. Si se omite "to", usa ADMIN_EMAIL del entorno.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['subject', 'body'] },
  },
  {
    name: 'updateDraft',
    description: 'Reemplaza el contenido REAL de un borrador ya existente por su id real. NUNCA lo envía.',
    inputSchema: { type: 'object', properties: { draftId: { type: 'string' }, to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['draftId', 'to', 'subject', 'body'] },
  },
  {
    name: 'trashEmail',
    description: 'Mueve un mensaje real a la papelera de Gmail. NUNCA borrado permanente.',
    inputSchema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] },
  },
  {
    name: 'getDraftSummary',
    description: 'Devuelve destinatario + asunto reales de un borrador (para mostrar antes de pedir confirmación de envío).',
    inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  },
  {
    name: 'sendApprovedEmail',
    description: 'Envía REALMENTE un borrador ya existente (drafts.send) -- irreversible. Quien llama (hermes-kit) es responsable de haber confirmado explícitamente con el administrador real antes de invocar esto.',
    inputSchema: { type: 'object', properties: { draftId: { type: 'string' } }, required: ['draftId'] },
  },
];

const HANDLERS = {
  send_email: (args) => handleSendEmail(args),
  searchEmails: (args) => withGmailErrorHandling(() => searchGmailMessages(args)),
  readEmail: (args) => withGmailErrorHandling(() => readGmailMessage(args.messageId)),
  summarizeEmails: (args) => withGmailErrorHandling(() => searchGmailMessages(args)),
  createDraft: (args) => withGmailErrorHandling(() => createGmailDraft({ ...args, to: args.to || process.env.ADMIN_EMAIL })),
  updateDraft: (args) => withGmailErrorHandling(() => updateGmailDraft(args.draftId, args)),
  trashEmail: (args) => withGmailErrorHandling(() => trashGmailMessage(args.messageId)),
  getDraftSummary: (args) => withGmailErrorHandling(() => getGmailDraftSummary(args.draftId)),
  sendApprovedEmail: (args) => withGmailErrorHandling(() => sendApprovedGmailDraft(args.draftId)),
};

const server = new Server(
  { name: 'email-mcp-server', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = HANDLERS[request.params.name];
  if (!handler) throw new Error(`email-mcp-server: tool desconocida "${request.params.name}".`);
  return handler(request.params.arguments ?? {});
});

const transport = new StdioServerTransport();
await server.connect(transport);
