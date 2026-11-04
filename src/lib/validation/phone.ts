export function normalizePhone(value: string) {
  let phone = value.replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  else if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
