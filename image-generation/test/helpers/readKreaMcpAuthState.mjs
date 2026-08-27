// readKreaMcpAuthState.mjs — helper real de test: proceso hijo real
// independiente que solo importa kreaMcpAuthStore.js real y reporta si hay
// tokens reales persistidos -- usado para probar real que la persistencia
// SOBREVIVE un reinicio real del proceso (Paso 13 del encargo), no solo
// dentro del mismo proceso de test real.
import { hasPersistedKreaMcpTokens } from '../../src/kreaMcpAuthStore.js';
process.stdout.write(String(hasPersistedKreaMcpTokens()));
