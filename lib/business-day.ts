export type BusinessDayConfig = {
  timezone: string;
  startHour: number;
  startMinute: number;
};

export function getHotelBusinessDay(now: Date, config: BusinessDayConfig) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");

  const beforeCutoff = hour < config.startHour || (hour === config.startHour && minute < config.startMinute);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (beforeCutoff) base.setUTCDate(base.getUTCDate() - 1);

  return {
    key: base.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat("ar-SA", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(base),
    beforeCutoff
  };
}
