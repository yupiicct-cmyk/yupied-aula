import { toCsv } from "~/utils/csv";

type Cell = string | number | null | undefined;

/** Descarga CSV (UTF-8 con BOM, compatible con Excel). */
export function downloadCsv(rows: Cell[][], fileName: string) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Descarga XLSX generado en el navegador (no consume CPU del Worker). */
export async function downloadXlsx(rows: Cell[][], fileName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data = rows.map((r, i) => r.map((v) => (v === null || v === undefined || v === "" ? null
    : { value: typeof v === "number" ? v : String(v), ...(i === 0 ? { fontWeight: "bold" as const } : {}) })));
  await writeXlsxFile(data).toFile(fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
