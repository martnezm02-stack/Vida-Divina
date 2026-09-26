// index.ts — Punto de entrada de Content Qualification.
export * from "./types";
export { evaluateContentQualification } from "./qualificationEngine";
export {
  QUALIFICATION_SIGNAL_TYPE,
  recordQualificationSignal,
  getQualificationByItemId,
} from "./qualificationRecorder";
