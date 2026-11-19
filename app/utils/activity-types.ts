export const QUESTION_TYPES = ["multiple_choice", "true_false", "open_question", "fill_blanks", "matching", "ordering"] as const;
export const FILE_TYPES = ["research", "practical", "file_upload", "group", "open_question"] as const;

/** Tipos de actividad que usan el constructor de preguntas. */
export function usesQuestions(type: string) {
  return (QUESTION_TYPES as readonly string[]).includes(type);
}
/** Tipos de actividad con respuesta escrita y archivos adjuntos. */
export function usesFiles(type: string) {
  return (FILE_TYPES as readonly string[]).includes(type);
}
