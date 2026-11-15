// Units for German text. The game counts in feet, miles and pounds like the English rules;
// the German editions use metres, kilometres and kilograms.

/** A number the German way: 1,5 instead of 1.5. */
export const deNum = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
/** Feet in metres as the German rulebooks count them: 5 feet are 1,5 m. */
export const feetToMetres = (ft: number) => deNum(ft * 0.3);

/**
 * The German editions measure in metres, kilometres and kilograms (5 ft = 1,5 m, 1 mile = 1,5 km,
 * 1 lb = 0,5 kg). The game counts in feet, so German text is converted on its way out.
 */
export function metric(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?) ?(?:ft|Fuss|Fuß)(?![\wäöü])/g, (_, a: string, b: string) => `${feetToMetres(Number(a.replace(',', '.')))}/${feetToMetres(Number(b.replace(',', '.')))} m`)
    .replace(/(\d+(?:[.,]\d+)?) ?(?:ft|Fuss|Fuß)(?![\wäöü])/g, (_, a: string) => `${feetToMetres(Number(a.replace(',', '.')))} m`)
    .replace(/(\d+(?:[.,]\d+)?) Meilen?(?![\wäöü])/g, (_, a: string) => `${deNum(Number(a.replace(',', '.')) * 1.5)} km`)
    .replace(/\beiner Meile\b/g, '1,5 km')
    .replace(/(\d+(?:[.,]\d+)?) Pfd\./g, (_, a: string) => `${deNum(Number(a.replace(',', '.')) * 0.5)} kg`);
}
