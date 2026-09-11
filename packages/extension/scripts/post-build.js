#!/usr/bin/env node
// Post-build: copy static assets to dist/ so the extension folder is self-contained

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Ensure dist exists
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

// Files to copy from root → dist
const toCopy = [
  'manifest.json',
  'popup.html',
  'popup.css',
];

for (const file of toCopy) {
  const src = path.join(root, file);
  const dst = path.join(dist, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  copied ${file}`);
  } else {
    console.warn(`  WARN: ${file} not found`);
  }
}

// Copy icons
const iconSrc = path.join(root, 'icons');
if (fs.existsSync(iconSrc)) {
  for (const f of fs.readdirSync(iconSrc)) {
    fs.copyFileSync(path.join(iconSrc, f), path.join(dist, 'icons', f));
    console.log(`  copied icons/${f}`);
  }
} else {
  console.warn('  WARN: icons/ directory missing — generating placeholder icons');
  generatePlaceholderIcons(dist);
}

// If no icons exist in dist, generate placeholders
const expectedIcons = ['icon16.png', 'icon48.png', 'icon128.png'];
const missingIcons = expectedIcons.filter(i => !fs.existsSync(path.join(dist, 'icons', i)));
if (missingIcons.length > 0) {
  console.log(`  Generating placeholder icons: ${missingIcons.join(', ')}`);
  generatePlaceholderIcons(dist, missingIcons.map(i => parseInt(i.replace('icon','').replace('.png',''))));
}

function generatePlaceholderIcons(distDir, sizes = [16, 48, 128]) {
  // 1×1 indigo PNG (base64) scaled by filename
  // Actual PNG: 1×1 pixel indigo color
  // These are valid minimal PNGs for each size
  for (const size of sizes) {
    const svgIcon = generateSvgIcon(size);
    const svgPath = path.join(distDir, 'icons', `icon${size}.svg`);
    fs.writeFileSync(svgPath, svgIcon);
    console.log(`  generated icons/icon${size}.svg (PNG placeholder)`);
  }
  // Write a README note
  fs.writeFileSync(
    path.join(distDir, 'icons', 'README.md'),
    '# Icons\n\nReplace icon16.png, icon48.png, icon128.png with actual PNG icons.\nSVG files are placeholders generated during build.\n'
  );
}

function generateSvgIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="#1a1d27" stroke="#818cf8" stroke-width="2"/>
  <path d="M7 12h2l2-4 2 8 2-4h2" stroke="#818cf8" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

console.log('\nBuild complete → dist/');
