/** RUT chileno: cuerpo numérico + dígito verificador (módulo 11). */
export function cleanRut(value: string) {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function rutCheckDigit(body: string) {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function validateRut(value: string) {
  const c = cleanRut(value);
  if (c.length < 2) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d{1,8}$/.test(body) || Number(body) === 0) return false;
  return rutCheckDigit(body) === dv;
}

/** Forma almacenada: 12345678-5 (igual que app.normalize_rut en la base de datos). */
export function normalizeRut(value: string) {
  const c = cleanRut(value);
  return c.length < 2 ? c : `${c.slice(0, -1)}-${c.slice(-1)}`;
}

/** Forma de presentación: 12.345.678-5 */
export function formatRut(value: string) {
  const c = cleanRut(value);
  if (c.length < 2) return c;
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${c.slice(-1)}`;
}
