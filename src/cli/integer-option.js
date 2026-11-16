export function parseIntegerOption(value, { name, min, max }) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`--${name} must be a whole number between ${min} and ${max}`);
  }

  return number;
}
