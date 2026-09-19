// cleanup_crm_test_data.mjs — script de un solo uso, preparado por Claude
// Code (fase "Dashboard: limpieza de datos de prueba", 2026-09-19) pero NO
// ejecutado: el auto mode classifier lo bloqueó dos veces con motivo
// "[Cloud Storage Mass Delete]". Queda aquí listo para que el usuario lo
// ejecute manualmente (`node cleanup_crm_test_data.mjs` desde crm/) o
// conceda el permiso correspondiente.
//
// Elimina, dentro de UNA transacción, exactamente los customers (y todo lo
// que cuelga de ellos por FK) que cumplen el criterio ya verificado por
// inspección manual:
//   a) customer_channels.identificador_externo contiene una letra
//      (imposible en un número real de WhatsApp), O
//   b) conversations.source = 'TEST' (marcador de código YA existente en
//      crmClient.ts#HERMES_SOURCE, reutilizado tal cual, nunca inventado).
// Respeta el mismo orden de borrado que crm/test/helpers/db.js#resetDatabase.
// Imprime conteos antes/después. Idempotente: una segunda ejecución no debe
// encontrar nada que borrar (0 filas afectadas).
import fs from "node:fs";
import pg from "pg";

const texto = fs.readFileSync(".env", "utf-8");
const get = (name) => {
  const line = texto.split(/\r?\n/).find((l) => l.trim().startsWith(name + "="));
  if (!line) throw new Error(`${name} no encontrada en crm/.env`);
  return line.slice(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
};
const pool = new pg.Pool({ connectionString: get("DATABASE_URL") });

async function contar(client, tabla, where = "") {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${tabla} ${where}`);
  return rows[0].n;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== ANTES (PRODUCCIÓN: vida_divina_crm) ===");
    const antes = {
      customers: await contar(client, "customers"),
      conversations: await contar(client, "conversations"),
      opportunities: await contar(client, "opportunities"),
      handoffs: await contar(client, "handoffs"),
      handoffsSinResolver: await contar(client, "handoffs", "WHERE resuelto_en IS NULL"),
      messages: await contar(client, "messages"),
      orders: await contar(client, "orders"),
      payments: await contar(client, "payments"),
    };
    console.log(antes);

    await client.query("BEGIN");

    await client.query(`
      CREATE TEMP TABLE _test_customers AS
      SELECT DISTINCT c.customer_id
      FROM customers c
      JOIN customer_channels cc ON cc.customer_id = c.customer_id
      LEFT JOIN conversations conv ON conv.customer_id = c.customer_id
      WHERE cc.identificador_externo !~ '^[0-9]+$'
         OR conv.source = 'TEST'
    `);

    const { rows: sel } = await client.query("SELECT COUNT(*)::int AS n FROM _test_customers");
    console.log("customers identificados para borrar:", sel[0].n);

    await client.query(`DELETE FROM payments WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM inventory_movements WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM orders WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    await client.query(`DELETE FROM offers_log WHERE opportunity_id IN (SELECT opportunity_id FROM opportunities WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM follow_ups WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM state_transitions WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`UPDATE conversations SET handoff_pendiente_id = NULL WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    await client.query(`DELETE FROM handoffs WHERE conversation_id IN (SELECT conversation_id FROM conversations WHERE customer_id IN (SELECT customer_id FROM _test_customers))`);
    await client.query(`DELETE FROM opportunities WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    await client.query(`DELETE FROM conversations WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    await client.query(`DELETE FROM customer_channels WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    const del = await client.query(`DELETE FROM customers WHERE customer_id IN (SELECT customer_id FROM _test_customers)`);
    console.log("customers eliminados:", del.rowCount);

    await client.query("COMMIT");

    console.log("=== DESPUES ===");
    const despues = {
      customers: await contar(client, "customers"),
      conversations: await contar(client, "conversations"),
      opportunities: await contar(client, "opportunities"),
      handoffs: await contar(client, "handoffs"),
      handoffsSinResolver: await contar(client, "handoffs", "WHERE resuelto_en IS NULL"),
      messages: await contar(client, "messages"),
      orders: await contar(client, "orders"),
      payments: await contar(client, "payments"),
    };
    console.log(despues);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ROLLBACK -- error real:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

main().then(() => pool.end()).catch(() => { pool.end(); process.exit(1); });
