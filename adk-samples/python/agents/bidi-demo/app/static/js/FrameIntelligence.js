/**
 * FrameIntelligence.js
 * @param {HTMLCanvasElement} canvas  - The canvas with current video frame drawn on it
 * @returns {FrameMeta} metadata object
 */
export function analyzeFrame(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const width = canvas.width;
  const height = canvas.height;

  // Sample a grid of pixels (not all pixels — too slow at 1fps)
  // We use a 64×36 sampling grid for speed
  const SAMPLE_W = 64;
  const SAMPLE_H = 36;
  const stepX = Math.floor(width / SAMPLE_W);
  const stepY = Math.floor(height / SAMPLE_H);

  // Get pixel data at reduced resolution for speed
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // ── 1. Brightness & Luminance analysis ──────────────────────────────────
  let totalLuma = 0;
  let sampleCount = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  // Grid for composition (rule of thirds zones)
  // Divide into 3x3 grid, track luminance per zone
  const zones = Array(9).fill(0).map(() => ({ luma: 0, count: 0 }));

  // ── 2. Color collection for dominant color analysis ─────────────────────
  // We bucket hues into 12 segments (30° each)
  const hueHistogram = new Array(12).fill(0);
  const colorSamples = [];

  for (let sy = 0; sy < SAMPLE_H; sy++) {
    for (let sx = 0; sx < SAMPLE_W; sx++) {
      const px = sx * stepX;
      const py = sy * stepY;
      const idx = (py * width + px) * 4;

      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      // Luminance (perceptual)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuma += luma;
      sampleCount++;

      if (luma < 60) darkPixels++;
      if (luma > 200) brightPixels++;

      // Composition zone (0-8, 3x3 grid)
      const zoneX = Math.floor(sx / (SAMPLE_W / 3));
      const zoneY = Math.floor(sy / (SAMPLE_H / 3));
      const zoneIdx = zoneY * 3 + zoneX;
      zones[zoneIdx].luma += luma;
      zones[zoneIdx].count++;

      // Hue analysis for dominant colors
      const { h, s } = rgbToHsl(r, g, b);
      if (s > 0.15) { // Only count reasonably saturated colors
        const hueBucket = Math.floor(h / 30) % 12;
        hueHistogram[hueBucket]++;
        if (colorSamples.length < 500) {
          colorSamples.push({ r, g, b, h, s });
        }
      }
    }
  }

  const avgLuma = totalLuma / sampleCount;
  const brightnessPercent = Math.round((avgLuma / 255) * 100);
  const darkRatio = darkPixels / sampleCount;
  const brightRatio = brightPixels / sampleCount;

  // ── 3. Composition Score ─────────────────────────────────────────────────
  // Rule of thirds: ideally main subject at zone intersections (1,3,5,7)
  // Score based on contrast between edge zones and center vs corners
  const cornerLumas = [zones[0], zones[2], zones[6], zones[8]].map(z => z.luma / z.count);
  const ruleOfThirdsZones = [zones[1], zones[3], zones[5], zones[7]].map(z => z.luma / z.count);
  const centerLuma = zones[4].luma / zones[4].count;

  const avgCorner = cornerLumas.reduce((a, b) => a + b, 0) / 4;
  const avgRot = ruleOfThirdsZones.reduce((a, b) => a + b, 0) / 4;

  // Good composition = subject (bright/contrasty) at RoT points, not just center
  const rotContrast = Math.abs(avgRot - avgCorner);
  const centerContrast = Math.abs(centerLuma - avgCorner);
  const compositionScore = Math.min(100, Math.round(
    50 + (rotContrast - centerContrast) * 0.5
  ));

  // ── 4. Sharpness / Blur detection (Laplacian variance) ──────────────────
  // Sample center region only (edges are often blurry in portraits)
  const centerX = Math.floor(width * 0.25);
  const centerW = Math.floor(width * 0.5);
  const centerY = Math.floor(height * 0.25);
  const centerH = Math.floor(height * 0.5);
  const sharpness = estimateSharpness(pixels, width, centerX, centerY, centerW, centerH);

  // ── 5. Dominant Colors ───────────────────────────────────────────────────
  const dominantColors = extractDominantColors(hueHistogram, colorSamples);

  // ── 6. Horizon / Tilt estimation ─────────────────────────────────────────
  // Estimate using edge detection on top third vs bottom third luminance symmetry
  const tiltEstimate = estimateTilt(pixels, width, height);

  // ── 7. Scene Category Detection ──────────────────────────────────────────
  const sceneCategory = detectSceneCategory(brightnessPercent, dominantColors, compositionScore);

  return {
    brightness: brightnessPercent,
    brightnessLabel: getBrightnessLabel(brightnessPercent),
    composition: compositionScore,
    compositionLabel: getCompositionLabel(compositionScore),
    sharpness: sharpness,
    sharpnessLabel: getSharpnessLabel(sharpness),
    dominantColors: dominantColors,
    tiltDegrees: tiltEstimate,
    darkRatio: Math.round(darkRatio * 100),
    brightRatio: Math.round(brightRatio * 100),
    sceneCategory: sceneCategory,
    width: width,
    height: height,
    aspectRatio: (width / height).toFixed(2),
  };
}


/**
 * Build the enriched WebSocket payload.
 * The metadata is injected as an invisible text prefix that the AI reads
 * as structured context BEFORE seeing the image.
 *
 * @param {string} base64Image - JPEG frame as base64
 * @param {Object} meta - Output of analyzeFrame()
 * @param {string} mimeType - Image MIME type
 * @returns {Object} enriched payload ready for JSON.stringify + ws.send()
 */
export function buildEnrichedPayload(base64Image, meta, mimeType = 'image/jpeg') {
  // Build the secret metadata tag — invisible to user, powerful for the AI
  const metaTag = buildMetaTag(meta);

  return {
    type: "video_frame",
    data: base64Image,
    mimeType: mimeType,
    // Injected frame intelligence — the AI reads this as structured context
    frameIntelligence: metaTag,
    // Raw meta for debugging (can be removed in production)
    _debug: {
      brightness: meta.brightness,
      composition: meta.composition,
      sharpness: meta.sharpness,
      tilt: meta.tiltDegrees,
      colors: meta.dominantColors,
      scene: meta.sceneCategory,
    }
  };
}


/**
 * Build the compact metadata tag string injected with each frame.
 * Formatted to be easily parsed by the LLM.
 */
function buildMetaTag(meta) {
  const colorStr = meta.dominantColors.slice(0, 3).join(', ');
  const tiltStr = meta.tiltDegrees !== null
    ? `${meta.tiltDegrees > 0 ? '+' : ''}${meta.tiltDegrees.toFixed(1)}°`
    : 'unknown';

  const warnings = [];
  if (meta.brightness < 30) warnings.push('DARK_FRAME');
  if (meta.brightness > 85) warnings.push('OVEREXPOSED');
  if (meta.sharpness < 30) warnings.push('BLURRY');
  if (Math.abs(meta.tiltDegrees || 0) > 8) warnings.push('TILTED');
  if (meta.composition < 40) warnings.push('POOR_COMPOSITION');

  return [
    `[FRAME_META]`,
    `brightness:${meta.brightness}% (${meta.brightnessLabel})`,
    `composition:${meta.composition}/100 (${meta.compositionLabel})`,
    `sharpness:${meta.sharpness}/100 (${meta.sharpnessLabel})`,
    `dominant_colors:[${colorStr}]`,
    `tilt:${tiltStr}`,
    `scene_type:${meta.sceneCategory}`,
    `frame_size:${meta.width}x${meta.height}`,
    warnings.length > 0 ? `flags:[${warnings.join(',')}]` : null,
    `[/FRAME_META]`,
  ].filter(Boolean).join(' | ');
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function rgbToColorName(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l < 0.15) return 'deep-black';
  if (l > 0.85) return 'bright-white';
  if (s < 0.12) return l < 0.4 ? 'charcoal' : l < 0.6 ? 'medium-gray' : 'light-gray';

  const hueNames = [
    [15, 'red'], [45, 'orange'], [75, 'yellow'],
    [105, 'yellow-green'], [150, 'green'], [185, 'teal'],
    [210, 'cyan'], [240, 'sky-blue'], [275, 'blue'],
    [300, 'purple'], [330, 'magenta'], [360, 'red']
  ];

  const prefix = s > 0.7 ? 'vivid-' : s < 0.35 ? 'muted-' : '';
  const shade = l < 0.35 ? 'dark-' : l > 0.65 ? 'light-' : '';

  for (const [threshold, name] of hueNames) {
    if (h <= threshold) return `${shade}${prefix}${name}`;
  }
  return 'unknown';
}

function extractDominantColors(hueHistogram, colorSamples) {
  // Find top 3 hue buckets
  const indexed = hueHistogram.map((count, i) => ({ count, hue: i * 30 }));
  indexed.sort((a, b) => b.count - a.count);
  const topHues = indexed.slice(0, 3).filter(h => h.count > 0);

  if (colorSamples.length === 0) return ['neutral-gray'];

  return topHues.map(({ hue }) => {
    // Find a representative sample near this hue
    const matching = colorSamples.filter(s => Math.abs(s.h - hue) < 30);
    if (matching.length === 0) return `hue-${hue}°`;
    const sample = matching[Math.floor(matching.length / 2)];
    return rgbToColorName(sample.r, sample.g, sample.b);
  });
}

function estimateSharpness(pixels, width, startX, startY, regionW, regionH) {
  // Sample Laplacian-like variance on luminance
  let variance = 0;
  let count = 0;
  const step = 4; // Sample every 4th pixel for speed

  for (let y = startY; y < startY + regionH - step; y += step) {
    for (let x = startX; x < startX + regionW - step; x += step) {
      const getL = (px, py) => {
        const i = (py * width + px) * 4;
        return 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
      };

      const center = getL(x, y);
      const right = getL(x + step, y);
      const down = getL(x, y + step);

      const diff = Math.abs(center - right) + Math.abs(center - down);
      variance += diff;
      count++;
    }
  }

  if (count === 0) return 50;
  const avgVariance = variance / count;
  // Map to 0-100: very low variance = blurry (0), high = sharp (100)
  return Math.min(100, Math.round(avgVariance * 3));
}

function estimateTilt(pixels, width, height) {
  // Compare left-half vs right-half brightness in horizontal strips
  // to detect camera tilt (horizon deviation)
  const stripHeight = Math.floor(height * 0.1);
  const centerY = Math.floor(height * 0.45);

  let leftLuma = 0, rightLuma = 0;
  let count = 0;

  for (let y = centerY; y < centerY + stripHeight; y++) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * pixels[i] + 0.587 * pixels[i+1] + 0.114 * pixels[i+2];
      if (x < width / 2) leftLuma += luma;
      else rightLuma += luma;
      count++;
    }
  }

  // Very rough tilt estimate based on luminance asymmetry
  const halfCount = count / 2;
  const diff = ((leftLuma / halfCount) - (rightLuma / halfCount)) / 255;
  // Scale to degrees: 0.1 luminance difference ≈ 3° tilt (rough approximation)
  return parseFloat((diff * 30).toFixed(1));
}

function detectSceneCategory(brightness, dominantColors, composition) {
  const colorStr = dominantColors.join(' ').toLowerCase();

  if (colorStr.includes('sky-blue') || colorStr.includes('white') && brightness > 60) {
    return 'outdoor-sky';
  }
  if (colorStr.includes('green') && brightness > 40) {
    return 'nature-outdoor';
  }
  if (brightness < 35) {
    return 'low-light-indoor';
  }
  if (colorStr.includes('gray') || colorStr.includes('charcoal') || colorStr.includes('white')) {
    return 'indoor-neutral';
  }
  if (colorStr.includes('orange') || colorStr.includes('yellow')) {
    return 'warm-indoor';
  }
  return 'general';
}

function getBrightnessLabel(pct) {
  if (pct < 20) return 'very-dark';
  if (pct < 40) return 'dark';
  if (pct < 60) return 'good';
  if (pct < 75) return 'bright';
  return 'overexposed';
}

function getCompositionLabel(score) {
  if (score < 30) return 'poor';
  if (score < 50) return 'fair';
  if (score < 70) return 'good';
  return 'excellent';
}

function getSharpnessLabel(score) {
  if (score < 25) return 'blurry';
  if (score < 50) return 'soft';
  if (score < 75) return 'sharp';
  return 'very-sharp';
}