import { createTV } from "tailwind-variants";
export type { VariantProps } from "tailwind-variants";

// Classes are merged with the app’s typography-aware cx helper at render time.
export const tv = createTV({ twMerge: false });
