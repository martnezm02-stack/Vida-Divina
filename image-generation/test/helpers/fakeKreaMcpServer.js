// fakeKreaMcpServer.js — servidor MCP real de prueba (Streamable HTTP
// real, SDK oficial real, sin red externa) que imita el contrato real de
// la tool "generate_image" de Krea -- usado SOLO por los tests reales de
// kreaMcpClient.js/kreaMcpImageProvider.js para ejercer conexión real/
// discovery real/tool-call real/timeout real SIN depender de la red real
// de api.krea.ai ni de una sesión OAuth real. Sin autenticación real (el
// flujo OAuth real ya se validó real por separado, ver
// experiments/krea-mcp-node-poc/ y scripts/authorize-krea-mcp.mjs) -- este
// servidor de prueba real solo ejercita transporte/discovery/tool-call
// reales.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * @param {(args: object) => Promise<object>|object} generateImageHandler — recibe {model, input, sync, timeoutSeconds} real, devuelve el objeto real que se serializa como texto real en el content de la tool.
 * @returns {Promise<{url:string, close:() => Promise<void>}>}
 */
function buildServer(generateImageHandler) {
  const server = new McpServer({ name: 'fake-krea-mcp', version: '0.0.1' });
  server.registerTool(
    'generate_image',
    {
      description: 'Fake real de generate_image para tests reales.',
      inputSchema: {
        model: z.string(),
        input: z.record(z.string(), z.any()),
        sync: z.boolean().optional(),
        timeoutSeconds: z.number().optional(),
      },
    },
    async (args) => {
      const resultado = await generateImageHandler(args);
      return { content: [{ type: 'text', text: JSON.stringify(resultado) }] };
    },
  );
  return server;
}

export async function startFakeKreaMcpServer(generateImageHandler) {
  // Una sesión MCP real real (server+transport reales) POR conexión real
  // real de cliente real -- el propio Client real de un KreaMcpClient real
  // abre una sesión real nueva cada vez (Fix B del POC), así que el
  // servidor real de prueba también debe soportar real múltiples sesiones
  // reales concurrentes/secuenciales reales, cada una con su propio
  // McpServer real (evita real "Server already initialized").
  const sesionesPorId = new Map();

  const httpServer = http.createServer(async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let sesion = sessionId ? sesionesPorId.get(sessionId) : undefined;
      if (!sesion) {
        const server = buildServer(generateImageHandler);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => { sesionesPorId.set(id, { server, transport }); },
        });
        await server.connect(transport);
        sesion = { server, transport };
      }
      await sesion.transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(err?.stack ?? err));
    }
  });

  await new Promise((resolve) => { httpServer.listen(0, '127.0.0.1', resolve); });
  const { port } = httpServer.address();

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: async () => {
      for (const { server } of sesionesPorId.values()) {
        // eslint-disable-next-line no-await-in-loop
        await server.close().catch(() => {});
      }
      await new Promise((resolve) => { httpServer.close(() => resolve()); });
    },
  };
}
