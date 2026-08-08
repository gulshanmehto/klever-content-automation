/**
 * Fashion Prompt Builder for Flux-1-Schnell
 *
 * Flux-1-Schnell is a 4-step model. Without a highly descriptive prompt it will
 * lose micro-details. This builder wraps any LLM-generated prompt with a
 * structured set of guardrails drawn from real Pinterest-style reference images
 * to guarantee:
 *   1. Correct female anatomy, face, and hands
 *   2. Clear fabric / garment texture detail
 *   3. A photorealistic, magazine-quality look matching the reference aesthetic
 *   4. A background that matches the season / style of the outfit
 */

/**
 * Maps the user's chosen aspect ratio to optimal pixel dimensions for Flux-1-Schnell.
 * Flux-1-Schnell requires dimensions that are multiples of 8 and max 1024px on the longest side.
 */
export const RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9':  { width: 1024, height: 576  },  // Landscape
  '4:3':   { width: 1024, height: 768  },  // Standard
  '1:1':   { width: 1024, height: 1024 },  // Square
  '9:16':  { width: 576,  height: 1024 },  // Portrait (Pinterest/Instagram)
  '4:5':   { width: 819,  height: 1024 },  // Portrait (Instagram feed)
};

/** Returns pixel dimensions for a given aspect ratio string */
export function getRatioDimensions(aspectRatio?: string): { width: number; height: number } {
  if (!aspectRatio) return RATIO_DIMENSIONS['4:5'];
  return RATIO_DIMENSIONS[aspectRatio] || RATIO_DIMENSIONS['4:5'];
}


const POSITIVE_PREFIX =
  'Full-length commercial lifestyle fashion photography. ' +
  'Subject: a naturally beautiful American woman aged 28-38, healthy slim build, warm sun-kissed skin, ' +
  'long wavy brunette hair styled loosely, radiant natural make-up, warm confident smile, ' +
  'perfectly symmetrical face, large expressive brown eyes with detailed irises, ' +
  'correct human anatomy throughout, perfectly formed hands with exactly 5 fingers each. ';

/** Photography / lighting suffix appended after every prompt */
const PHOTO_SUFFIX =
  ' Shot on a full-frame DSLR camera, 85mm f/1.8 portrait lens, ' +
  'sharp crisp focus on the subject, natural soft-box or golden-hour daylight, ' +
  'cinematic depth of field with softly blurred background, ' +
  'professional colour grading, magazine editorial quality, ' +
  'highly photorealistic skin texture, 4K ultra-detail, no watermarks, no text overlays.';


/**
 * Background scene fragments keyed loosely by article style.
 * These give Flux the environmental context it needs to generate a cohesive scene.
 */
const BACKGROUND_SCENES: Record<string, string> = {
  street:
    'on a sunny upscale European-style pedestrian street, white-painted buildings with green climbing vines, warm midday sunlight, clean light-grey cobblestone pavement',
  coastal:
    'on a sunlit coastal promenade beside a calm turquoise sea, stone-paved walkway, soft sea breeze, golden-hour light',
  park:
    'in a lush green city park, dappled sunlight through tall oak trees, smooth paved path, soft bokeh green foliage background',
  indoor:
    'inside a bright minimalist café or boutique, large floor-to-ceiling arched windows flooding the space with natural light, warm neutral tones, potted indoor plants',
  garden:
    'in a sun-drenched cottage garden, blooming pastel flowers, white picket fence, golden afternoon light',
  default:
    'on a clean, bright outdoor lifestyle location, airy open sky, warm natural sunlight',
};

/** Choose a background scene based on simple keyword heuristics */
function pickBackground(prompt: string, style?: string): string {
  const lower = (prompt + ' ' + (style || '')).toLowerCase();
  if (lower.includes('beach') || lower.includes('coastal') || lower.includes('resort'))
    return BACKGROUND_SCENES.coastal;
  if (lower.includes('office') || lower.includes('café') || lower.includes('coffee') || lower.includes('indoor'))
    return BACKGROUND_SCENES.indoor;
  if (lower.includes('garden') || lower.includes('floral') || lower.includes('cottage'))
    return BACKGROUND_SCENES.garden;
  if (lower.includes('park') || lower.includes('nature') || lower.includes('green'))
    return BACKGROUND_SCENES.park;
  if (lower.includes('city') || lower.includes('urban') || lower.includes('street') || lower.includes('walk'))
    return BACKGROUND_SCENES.street;
  return BACKGROUND_SCENES.default;
}

/**
 * Wraps the raw LLM-generated prompt with production-grade Flux guardrails.
 * Always call this before hitting the Cloudflare API.
 */
export function buildFluxFashionPrompt(
  rawPrompt: string,
  style?: string,
  aspectRatio?: string,
): string {
  const background = pickBackground(rawPrompt, style);

  return (
    POSITIVE_PREFIX +
    rawPrompt.trim() +
    ` Background scene: ${background}.` +
    PHOTO_SUFFIX
  );
}
