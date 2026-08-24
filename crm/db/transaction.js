// transaction.js
// Helper de transacciones genérico — no sabe nada de repositories ni de
// entidades de negocio, solo maneja BEGIN/COMMIT/ROLLBACK/release sobre un
// pg.Pool. La composición con repositories vive en crm/index.js
// (withTransaction), que es la superficie pública real de este mecanismo.

/**
 * Ejecuta `work(client)` dentro de una transacción. Si `work` lanza, hace
 * ROLLBACK y vuelve a lanzar el mismo error (nunca lo enmascara). Siempre
 * libera el cliente al pool, ocurra lo que ocurra.
 *
 * @param {import('pg').Pool} pool
 * @param {(client: import('pg').PoolClient) => Promise<any>} work
 * @returns {Promise<any>}
 */
export async function runInTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await work(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // La conexión ya pudo haberse perdido (ej. el propio error fue de
      // red) — no hay nada más que revertir; se prioriza propagar el
      // error original, no el fallo secundario del ROLLBACK.
    }
    throw error;
  } finally {
    client.release();
  }
}
