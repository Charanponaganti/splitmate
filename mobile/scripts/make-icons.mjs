// Renders the SplitMate app icons into assets/images. Run with: node scripts/make-icons.mjs
// Uses `sharp` from the web project's node_modules.
import sharp from 'sharp';
import path from 'node:path';

const out = (name) => path.join(import.meta.dirname, '..', 'assets', 'images', name);
const GREEN = '#047857';

// A coin split into two halves that drift apart. Coordinates are on a 1024 canvas;
// `scale` shrinks the mark around the center so it fits the adaptive-icon safe zone.
function mark(color, scale) {
  const r = 240;
  const halves = `
    <path d="M512 ${512 - r} A${r} ${r} 0 0 0 512 ${512 + r} Z" transform="translate(-30 -18)" fill="${color}"/>
    <path d="M512 ${512 - r} A${r} ${r} 0 0 1 512 ${512 + r} Z" transform="translate(30 18)" fill="${color}" fill-opacity="0.82"/>`;
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${halves}</g>`;
}

const svg = (body, background) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${
      background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''
    }${body}</svg>`,
  );

await Promise.all([
  sharp(svg(mark('#ffffff', 1.25), GREEN)).png().toFile(out('icon.png')),
  sharp(svg(mark('#ffffff', 0.95))).png().toFile(out('android-icon-foreground.png')),
  sharp(svg(mark('#ffffff', 0.95))).png().toFile(out('android-icon-monochrome.png')),
  sharp(svg('', GREEN)).png().toFile(out('android-icon-background.png')),
  sharp(svg(mark('#ffffff', 1.6))).resize(512, 512).png().toFile(out('splash-icon.png')),
  sharp(svg(mark('#ffffff', 1.25), GREEN)).resize(48, 48).png().toFile(out('favicon.png')),
]);
console.log('Icons written to assets/images');
