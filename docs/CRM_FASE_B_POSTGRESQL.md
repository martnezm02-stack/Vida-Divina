# Fase B — PostgreSQL Core Data Store (CRM / Customer 360)

[🏠 Índice de Documentación](./PROJECT_STATE.md)

> **Estado:** Implementado, validado contra PostgreSQL 18.6 real, y aislado. `npm run migrate` aplicó la migración inicial contra una base real; `npm test` corre 46/46 pruebas exitosas contra `TEST_DATABASE_URL` real, confirmado estable en 3 corridas consecutivas. La validación real encontró y corrigió 3 hallazgos genuinos — ver §7 (histórico del bloqueo inicial, ya resuelto) y §7bis (hallazgos de la validación real). No conectado todavía a `simulator/src/contextoStorage.js` ni a ningún módulo de negocio — ver §8.
>
> Fuente de verdad funcional/arquitectónica de este módulo: [`CRM_FASE_A_DATA_MODEL.md`](./CRM_FASE_A_DATA_MODEL.md).

---

## 1. Qué es `crm/`

La única puerta de acceso a PostgreSQL en todo el proyecto (Decisión Arquitectónica #6 — ver §5). Implementa exclusivamente las 10 entidades aprobadas en la Fase A: `customers`, `customer_channels`, `conversations`, `messages`, `state_transitions`, `opportunities`, `offers_log`, `follow_ups`, `handoffs`, `product_pricing`. **`orders` y `payments` no existen todavía** — bloqueadas por decisión de negocio pendiente ([`pago_y_pedido.md`](./proceso_de_venta/pago_y_pedido.md)).

Ningún otro módulo del proyecto importa `crm/` todavía. Este módulo es funcional de forma aislada, verificable por su propia suite de pruebas, sin ningún efecto sobre `simulator/`, `whatsapp-adapter/`, `decision-engine/`, `recommendation-engine/`, `content-strategy/`, `marketing-intelligence/`, `performance-learning-intelligence/` ni `website-intelligence/`.

---

## 2. Instalación de PostgreSQL

Este proyecto **no incluye ni instala PostgreSQL** — es responsabilidad del entorno donde se ejecute `crm/`. Opciones habituales (elegir una):

- **Instalador oficial (Windows):** https://www.postgresql.org/download/windows/ — instala el servicio de PostgreSQL localmente.
- **Docker** (si está disponible): `docker run --name vida-divina-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`
- **Un servicio administrado** (Railway, Render, Supabase, RDS, etc.) — cualquiera que exponga una cadena `postgres://...` sirve, sin cambiar nada de `crm/`.

Se necesitan **dos bases de datos distintas** (nunca la misma): una para desarrollo (`DATABASE_URL`) y otra exclusiva para tests (`TEST_DATABASE_URL`) — ver §7 sobre por qué los tests de `crm/` no son mocks y borran datos reales de la base a la que apunten.

---

## 3. Configuración

Copiar la plantilla y completar con credenciales reales (nunca versionar el resultado):

```
cp crm/.env.example crm/.env
```

Variables reconocidas (detalle completo, con su justificación, en `crm/.env.example`):

| Variable | Obligatoria | Propósito |
|---|---|---|
| `DATABASE_URL` | Sí, para runtime normal | Cadena de conexión `postgres://usuario:password@host:puerto/base` |
| `TEST_DATABASE_URL` | Sí, solo para correr tests | Base de datos separada, exclusiva para `crm/test/` |
| `CRM_DB_POOL_MAX` | No (default 10) | Máximo de conexiones simultáneas del pool |
| `CRM_DB_SSL` | No (default `false`) | `true` si el proveedor de PostgreSQL exige SSL |
| `CRM_DB_IDLE_TIMEOUT_MS` | No (default 30000) | — |
| `CRM_DB_CONNECTION_TIMEOUT_MS` | No (default 5000) | — |

`crm/config/env.js` valida esto en cuanto se usa — nunca asume una cadena de conexión por defecto ni la loguea en ningún punto (ver §6, Seguridad).

---

## 4. Estructura de `crm/`

```
crm/
  config/
    env.js                 → lee y valida process.env (DATABASE_URL, TEST_DATABASE_URL, etc.)
  db/
    pool.js                → único lugar que crea el pg.Pool del runtime normal (singleton)
    transaction.js          → runInTransaction() genérico (BEGIN/COMMIT/ROLLBACK)
    mapRow.js                → snake_case (SQL) -> camelCase (JS)
    migrate.js               → runner de migraciones versionadas (runMigrations/getStatus + CLI)
  migrations/
    0001_init_schema.sql     → migración inicial — las 10 tablas aprobadas
  repositories/
    customerRepository.js
    customerChannelRepository.js
    conversationRepository.js
    messageRepository.js          (append-only)
    stateTransitionRepository.js  (append-only)
    opportunityRepository.js
    offerLogRepository.js         (append-only)
    followUpRepository.js
    handoffRepository.js          (append-only para el hecho; resolución acotada — ver nota en el archivo)
    productPricingRepository.js   (upsert — no es historial)
  test/
    helpers/db.js            → pool de test real contra TEST_DATABASE_URL + reset entre casos
    config.test.js            → no requiere PostgreSQL
    appendOnly.test.js         → no requiere PostgreSQL (reflexión sobre exports)
    connection.test.js
    migrate.test.js
    repositories.test.js
    transaction.test.js
  index.js                  → API PÚBLICA — único punto de entrada para el resto del proyecto
  package.json               → única dependencia: "pg"
  .env.example
```

**Regla de acceso exclusivo:** ningún archivo fuera de `crm/` debe hacer `import ... from 'pg'` ni importar nada de `crm/db/`, `crm/repositories/` o `crm/config/` directamente. El único import válido desde fuera de este módulo es `import * as crm from '../crm/index.js'` (o equivalente), y hoy **ningún módulo del proyecto lo hace todavía** (ver §17 de auditoría de imports).

---

## 5. Decisión Arquitectónica #6 — dónde vive y qué cambió

La regla estaba definida en dos lugares, ambos actualizados en esta fase con el mismo texto de excepción:

- [`docs/ARCHITECTURE_v1.md`](./ARCHITECTURE_v1.md), §11 "Decisiones congeladas", punto 6.
- [`docs/PROJECT_STATE.md`](./PROJECT_STATE.md), §6 "Decisiones arquitectónicas congeladas", punto 6.

Redacción anterior: *"Node.js sin dependencias externas como runtime único [de todos los componentes de código]."*

Redacción actual (idéntica en ambos documentos): la regla se mantiene para todo el proyecto, **excepto el driver PostgreSQL (`pg`) utilizado exclusivamente por `crm/`**, con la aclaración explícita de que ningún otro módulo está autorizado a importarlo y que `crm/index.js` no expone el pool ni ninguna función de query genérica hacia afuera.

No se modificó ninguna otra decisión congelada, ni la tabla de "Componentes implementados"/"Estado Actual del Proyecto" de `PROJECT_STATE.md`/`CLAUDE.md` — ese registro más amplio queda fuera del alcance de esta fase (instrucción explícita: "no hagas cambios conceptuales adicionales a la arquitectura").

---

## 6. Seguridad

- Ninguna credencial vive en código, en migraciones ni en tests — todo viene de `process.env`, leído únicamente por `crm/config/env.js`.
- `crm/.env` está cubierto por `**/*.env` en el `.gitignore` de la raíz (ya existía esa regla, ahora también protege a `crm/.env`).
- `crm/.env.example` (versionado) solo contiene valores de ejemplo (`usuario:password@localhost...`), nunca credenciales reales.
- Ningún archivo de `crm/` hace `console.log`/`console.error` de `DATABASE_URL`, `TEST_DATABASE_URL` ni de ninguna cadena de conexión completa — los únicos mensajes de error citan el nombre de la variable faltante, nunca su valor.
- `crm/db/pool.js` registra únicamente `error.message` ante errores del pool — nunca la query en curso ni parámetros.
- Todo SQL en los repositories usa parámetros posicionales (`$1, $2, ...`) — cero interpolación de strings, cero superficie de SQL injection.

---

## 7. Bloqueo inicial — PostgreSQL no estaba disponible en este entorno (RESUELTO — ver §7bis)

Se verificó explícitamente antes de escribir cualquier código (comandos ejecutados y su resultado, documentados para que la siguiente sesión no repita esta verificación):

```
$ which psql       → no encontrado
$ which pg_ctl      → no encontrado
$ which docker       → no encontrado
$ Get-Service *postgres*   → ninguno
$ Test-Path "C:\Program Files\PostgreSQL"  → False
$ Test-Path "C:\Program Files\Docker\..."   → False
```

**No existe ninguna instancia de PostgreSQL ni de Docker en esta máquina.** Siguiendo la instrucción de la Fase B de no improvisar una solución externa, no se instaló nada — se construyó toda la infraestructura de código (schema, repositories, tests reales) y se dejó documentado exactamente qué falta para que el propietario complete este paso.

**Lo que sí se verificó funcionando sin necesidad de PostgreSQL** (`cd crm && npm test`):

- `crm/test/config.test.js` (9 casos) — pasa completo. Prueba `crm/config/env.js` sin tocar ninguna base de datos.
- `crm/test/appendOnly.test.js` (4 casos) — pasa completo. Prueba, por reflexión sobre los exports de cada repository, que `messages`/`state_transitions`/`offers_log` nunca exponen update/delete, y que `handoffs` solo expone la resolución acotada documentada.
- `npm install` dentro de `crm/` — se completó sin errores (14 paquetes, `pg@8.23.0`, sin dependencias de compilación nativa).

**Lo que falla, exactamente como debía fallar (mensaje claro, no un timeout críptico):**

```
$ cd crm && npm test
...
✖ el pool de test puede conectarse y ejecutar una query real
  Error: crm/config: falta TEST_DATABASE_URL en el entorno. Los tests de crm/
  requieren una base de datos PostgreSQL separada exclusiva para pruebas —
  define TEST_DATABASE_URL en crm/.env (copia crm/.env.example). Nunca debe
  apuntar a la misma base que DATABASE_URL.
```

### Para desbloquear (acción del propietario, fuera de este repositorio)

1. Instalar PostgreSQL localmente **o** levantar un contenedor **o** usar un servicio administrado (opciones en §2).
2. Crear dos bases vacías, ej.:
   ```sql
   CREATE DATABASE vida_divina_crm;
   CREATE DATABASE vida_divina_crm_test;
   ```
3. `cp crm/.env.example crm/.env` y completar `DATABASE_URL`/`TEST_DATABASE_URL` con las credenciales reales.
4. Verificar migraciones:
   ```
   cd crm
   npm run migrate:status   # debe listar 0001_init_schema como pendiente
   npm run migrate          # la aplica
   npm run migrate:status   # debe listar 0001_init_schema como aplicada
   ```
5. Ejecutar la suite completa:
   ```
   npm test
   ```
   Debería pasar completa (config + appendOnly + connection + migrate + repositories + transaction), incluyendo el criterio de aceptación #4 de esta fase (correr migraciones dos veces no rompe el schema — ya cubierto por `crm/test/migrate.test.js`).

No se requiere ninguna otra acción — el código ya está escrito y listo para correr contra esa instancia en cuanto exista.

---

## 7bis. Validación real contra PostgreSQL 18.6 — resultado y hallazgos corregidos

El propietario instaló PostgreSQL 18.6 (servicio de Windows `postgresql-x64-18`), creó `vida_divina_crm` y `vida_divina_crm_test`, y completó `crm/.env` directamente (sin que la contraseña pasara nunca por este chat). Con eso:

```
$ cd crm && npm run migrate
Migraciones aplicadas: 0001_init_schema

$ npm run migrate        # segunda corrida
Sin migraciones pendientes.
```

La primera corrida de `npm test` reveló **3 hallazgos reales**, todos dentro del alcance de `crm/` — ninguno oculto, los tres diagnosticados, corregidos y re-verificados:

**Hallazgo 1 — los scripts de `package.json` nunca cargaban `crm/.env`.** `npm run migrate` fallaba con "falta DATABASE_URL" pese a que el archivo existía, porque ningún script pasaba `--env-file`. Corregido agregando `--env-file-if-exists=.env` a los tres scripts (`migrate`, `migrate:status`, `test`) — se usa la variante `-if-exists` para que, si `crm/.env` no existe todavía (ej. justo después de clonar el repo), el error siga siendo el mensaje claro de `crm/config/env.js` en vez de un fallo de Node por archivo faltante. `engines.node` se ajustó a `>=20.6.0` (mínimo real para esta flag).

**Hallazgo 2 — condición de carrera en el runner de migraciones bajo ejecución concurrente real.** `node --test` corre cada archivo de test en un subproceso distinto; varios subprocesos llamando `runMigrations()`/`getStatus()` a la vez contra una base todavía sin migrar hacían que `CREATE TABLE IF NOT EXISTS schema_migrations` chocara en el catálogo interno de PostgreSQL (`23505` sobre `pg_type_typname_nsp_index`) — un problema real de PostgreSQL bajo estas condiciones, no un error de sintaxis. Corregido en `crm/db/migrate.js` con `pg_advisory_lock`/`pg_advisory_unlock` alrededor de todo el ciclo verificar-tabla + aplicar-pendientes, serializando cualquier llamada concurrente (mismo mecanismo que usan herramientas de migración establecidas como golang-migrate/Flyway).

**Hallazgo 3 — dos bugs de test, no de schema/repository.**
- El test de `ON DELETE RESTRICT` esperaba SQLSTATE `23503` (`foreign_key_violation`) pero PostgreSQL responde `23001` (`restrict_violation`) específicamente cuando un `DELETE` es bloqueado por `ON DELETE RESTRICT` — el comportamiento de la base ya era correcto, solo el assert tenía el código equivocado. Corregido en `crm/test/repositories.test.js`.
- Los archivos de test comparten una única base física de `TEST_DATABASE_URL`, y cada uno hace `DELETE` completo sobre las 10 tablas en su propio `beforeEach` — al correr en paralelo (comportamiento por defecto de `node --test`), un archivo podía borrar datos que otro acababa de crear a mitad de su test (visto en la práctica en `conversationRepository`). Corregido agregando `--test-concurrency=1` al script `test`, forzando ejecución serial de los archivos — el fix estándar para tests de integración contra una base compartida.

**Resultado final, verificado en 3 corridas consecutivas para descartar que fuera casualidad:**

```
$ npm test
ℹ tests 46
ℹ suites 13
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
exit code: 0
```

**Tablas confirmadas en `vida_divina_crm` (consulta real a `information_schema.tables`):** `customers`, `customer_channels`, `conversations`, `messages`, `state_transitions`, `opportunities`, `offers_log`, `follow_ups`, `handoffs`, `product_pricing`, `schema_migrations`. **`orders` y `payments` no aparecen** — confirmado, no implementadas.

---

## 8. Qué NO hace todavía esta fase (a propósito)

- No conecta con `simulator/src/contextoStorage.js` — sigue exactamente como estaba, sin una sola línea modificada.
- No migra ni toca `data/conversaciones/` (que además está vacío, según la auditoría previa).
- No modifica `whatsapp-adapter/`, `decision-engine/`, `recommendation-engine/`, `content-strategy/`, `marketing-intelligence/`, `performance-learning-intelligence/`, `website-intelligence/`.
- No crea `orders` ni `payments`.
- No implementa `getCustomer360()` como función de negocio — la infraestructura (repositories + `withTransaction`) que una implementación futura usaría ya existe, pero componerla en una sola consulta de agregación es explícitamente una fase posterior.
- No implementa ningún scheduler para `follow_ups` — solo el modelo de datos y la consulta base (`listPendingDueBy`).

---

## 9. Discrepancias encontradas entre Fase A y las instrucciones de Fase B (documentadas, no resueltas por decisión unilateral)

Instrucción explícita de la Fase B: ante una contradicción, no improvisar, documentarla, y conservar la especificación de Fase A salvo razón técnica crítica. Se encontró una:

**`handoffs` — "append-only" (Fase B §22) vs. campos `resuelto_en`/`resuelto_por` diseñados para completarse después (Fase A §15).** Ambos requisitos no pueden cumplirse literalmente a la vez. Interpretación aplicada, documentada en el propio `crm/repositories/handoffRepository.js`: los campos que describen el *hecho* del handoff (motivo, fuente, conversation_id, creado_en) nunca se reescriben — no existe `updateHandoff()` genérico. Se expone únicamente `resolveHandoff()`, acotado a completar `resuelto_en`/`resuelto_por` una sola vez (protegido con `WHERE resuelto_en IS NULL` en el propio SQL), que no es "un mecanismo de resolución automática" (prohibido explícitamente) sino la escritura manual que algún proceso todavía sin definir invocaría. Verificado con test dedicado (`crm/test/repositories.test.js`, describe "handoffRepository").

Ninguna otra discrepancia bloqueante entre Fase A y Fase B fue encontrada durante la implementación.

---

## 10. Decisiones de diseño no explícitas en ninguna de las dos fases (documentadas para no dejarlas implícitas)

- **UUID generado por la aplicación, no por PostgreSQL.** Todas las PK son `UUID PRIMARY KEY` sin `DEFAULT` — el repository correspondiente genera el valor con `node:crypto randomUUID()` antes del `INSERT`, el mismo mecanismo que ya usa `viral-content-intelligence/src/contentOpportunity.js`. Evita depender de la extensión `pgcrypto`/`uuid-ossp` para algo que la aplicación ya sabe hacer sin dependencias nuevas.
- **`estado_actual`/`estado` como `TEXT` libre, sin `CHECK`.** El vocabulario de `ESTADOS_VENTA_REAL` vive en `simulator/src/stateMachine.js`; duplicarlo como `CHECK` en SQL habría creado una segunda fuente de verdad que se desincroniza cada vez que el motor comercial agregue un estado. La validación de ese vocabulario es responsabilidad de la aplicación, no del schema.
- **`follow_ups.tipo/estado/resultado` sí llevan `CHECK`.** A diferencia de `ESTADOS_VENTA_REAL`, son un vocabulario cerrado que la propia Fase A/Sprint 5 fija explícitamente (no un espejo de una máquina de estados que vive y cambia en código).
- **Circularidad `conversations` ↔ `handoffs`.** Resuelta con el patrón estándar de PostgreSQL: `conversations.handoff_pendiente_id` se declara sin FK en el `CREATE TABLE`, y la FK se agrega con `ALTER TABLE` una vez que `handoffs` ya existe (ver comentarios en `crm/migrations/0001_init_schema.sql`).
- **`ON DELETE RESTRICT` en toda FK hacia una tabla histórica o hacia `customers`/`conversations`**, salvo `conversations.handoff_pendiente_id` (`ON DELETE SET NULL`, porque es un puntero de estado *actual*, no un hecho histórico). Ningún borrado en cascada existe en este schema.
- **Índices limitados estrictamente a los aprobados en Fase A §24.** Se detecta, sin corregirlo, que algunas columnas FK (`customer_channels.customer_id`, `opportunities.conversation_id`, `offers_log.opportunity_id`) no tienen un índice explícito aprobado — Postgres no indexa automáticamente el lado FK. Se deja así a propósito ("no agregues índices arbitrarios") y se señala aquí para una decisión explícita en una fase posterior.

---

## 11. Ejecutar migraciones (una vez que exista PostgreSQL)

```
cd crm
npm run migrate:status   # lista cada archivo de crm/migrations/ y si ya se aplicó
npm run migrate          # aplica las pendientes, cada una en su propia transacción
```

Ejecutar `npm run migrate` dos veces seguidas es seguro — la segunda vez no aplica nada (verificado por `crm/test/migrate.test.js`, que corre exactamente esa secuencia, y por la validación real de §7bis). Los tres scripts (`migrate`, `migrate:status`, `test`) cargan `crm/.env` automáticamente vía `--env-file-if-exists=.env` — no hace falta exportar las variables a mano en la shell.

## 12. Ejecutar y resetear la base de test

```
cd crm
npm test                  # aplica migraciones automáticamente sobre TEST_DATABASE_URL si hace falta, y corre todo
```

`npm test` corre con `--test-concurrency=1` (ver Hallazgo 3 en §7bis) — los archivos de test se ejecutan uno a la vez a propósito, porque todos comparten la misma base física de `TEST_DATABASE_URL` y cada uno borra sus propios datos en `beforeEach`; correrlos en paralelo produce colisiones intermitentes entre archivos, no un problema del schema.

No existe un comando de "reset" separado: cada archivo de test que toca datos llama `resetDatabase(pool)` en su propio `beforeEach` (ver `crm/test/helpers/db.js`), que borra las filas de las 10 tablas del CRM en el orden que sus foreign keys exigen. Para vaciar la base de test manualmente sin correr los tests: `node --env-file-if-exists=.env -e "import('./test/helpers/db.js').then(async m => { const p = await m.getTestPool(); await m.resetDatabase(p); await m.closeTestPool(); })"` desde `crm/`.

---
[🏠 Índice de Documentación](./PROJECT_STATE.md)
