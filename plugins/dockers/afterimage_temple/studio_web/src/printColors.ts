import type { StudioRecipe } from './studio';

export type ColorSet = { name: string; colors: StudioRecipe['palette'] };
export function formColorRoles(recipe: StudioRecipe): string[] {
  const p = recipe.koneForm.parameters;
  if ((p.figureActive ?? 0) >= .5) {
    if ((p.symbolField ?? 0) >= 2) return ['Bodies', 'Ground', 'One', 'Background'];
    if ((p.symbolField ?? 0) >= .5 || (p.structureMode ?? 0) > 0) return ['Bodies 1', 'Bodies 2', 'Bodies 3', 'Background'];
    return ['Figure', 'Window 1', 'Contour / Line', 'Background'];
  }
  if ((p.knotActive ?? 0) >= .5) return ['Strand 1', 'Strand 2', 'Trace', 'Background'];
  if (recipe.koneForm.family === 'kone' && (p.printedFolds ?? 0) >= .5) return ['Body', 'Fold', 'Lines', 'Background'];
  return ['Body', 'Ribs / Ghost', 'Details', 'Background'];
}
export function formPaletteColors(recipe: StudioRecipe): StudioRecipe['palette'] {
  const p = recipe.koneForm.parameters, colors = [...recipe.palette] as StudioRecipe['palette'];
  if ((p.knotActive ?? 0) >= .5 && (p.knotTraceColor ?? -1) >= 0) colors[2] = p.knotTraceColor;
  return colors;
}
// Slots are Body, Fold, Lines, Background. Colors are authored interpretations.
export const printColorSets: ColorSet[] = [
  { name: 'Vermilion / cream / ink', colors: [0xe5dfc9, 0x22221e, 0x22221e, 0xc9402d] },
  { name: 'Mustard / blue / cream', colors: [0xe5dfc9, 0x31699b, 0x22221e, 0xdbb321] },
  { name: 'Hot pink / cream / ink', colors: [0xe5dfc9, 0xf2f0e9, 0x22221e, 0xd94fa2] },
];
export function swapColorRoles(colors: StudioRecipe['palette'], locks: readonly boolean[]): StudioRecipe['palette'] {
  const slots = [0, 1, 2, 3].filter(i => !locks[i]);
  const result = [...colors] as StudioRecipe['palette'];
  slots.forEach((slot, i) => { result[slot] = colors[slots[(i + 1) % slots.length]]; });
  return result;
}
