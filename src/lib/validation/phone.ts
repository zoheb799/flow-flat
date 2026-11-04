export function normalizePhone(value: string) {
  let phone = value.replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  else if (/^91\d{10}$/.test(phone)) phone = `+${phone}`;
  return /^\+[1-9]\d{0,2}\d{10}$/.test(phone) ? phone : null;
}

export function normalizePhoneParts(countryCode: string, mobileNumber: string) {
  const normalizedCountryCode = countryCode.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{0,2}$/.test(normalizedCountryCode) || !/^\d{10}$/.test(mobileNumber)) {
    return null;
  }
  return `${normalizedCountryCode}${mobileNumber}`;
}
