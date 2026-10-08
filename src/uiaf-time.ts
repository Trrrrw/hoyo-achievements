export const unknownTimestamp = 253402271999;

export function timestampToDate(timestamp: number): string {
  return timestamp === unknownTimestamp
    ? ""
    : new Date((timestamp + 8 * 3600) * 1000).toISOString().slice(0, 10);
}

export function dateToTimestamp(date: string): number {
  if (!date) return unknownTimestamp;
  const timestamp = Date.parse(`${date}T00:00:00+08:00`) / 1000;
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > unknownTimestamp ||
    timestampToDate(timestamp) !== date
  )
    throw new Error("完成日期无效，请修正后再导出 UIAF");
  return timestamp;
}
