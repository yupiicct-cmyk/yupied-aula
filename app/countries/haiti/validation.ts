/**
 * Haití no tiene en YupiEd un identificador nacional validado: el NIF/CIN no se exige
 * y no se inventa un algoritmo de verificación. Se acepta vacío o texto libre corto.
 */
export function validateOptionalId(value: string) {
  return value.trim().length <= 40;
}
