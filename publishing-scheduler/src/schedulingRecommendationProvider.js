// schedulingRecommendationProvider.js — §14 del encargo: interfaz
// preparada para que una fase FUTURA de Creative Intelligence recomiende
// día/hora/plataforma/frecuencia/tipo de contenido. NO IMPLEMENTADO en
// esta fase -- ninguna lógica de predicción, ningún motor de estrategia de
// horarios, ninguna llamada a IA externa. PublishingScheduler no importa
// ni depende de este archivo -- existe solo como contrato para conectar
// después, sin forzar ningún cambio a lo ya construido en esta fase.

export class SchedulingRecommendationProvider {
  /**
   * @param {{productId?:string, platform?:string, contentType?:string}} context
   * @returns {Promise<{dayOfWeek:string, time:string, platform:string, frequency:string, contentType:string}[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async recommend(context) {
    throw new Error('SchedulingRecommendationProvider.recommend() no está implementado en esta fase -- interfaz preparada para una fase futura de Creative Intelligence, sin predicción de horarios todavía (§14).');
  }
}
