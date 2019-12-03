const { cssColor, rgb2hsv, hsv2hex } = require('color-functions');

// number of different colours used in floor tiles
const MAX_TERRAIN_COLOURS = 256;

const terrainColours = {
    integer: new Int32Array(MAX_TERRAIN_COLOURS),
    rgb: []
};

function rgbToInt(r, g, b) {
    return -1 - ((r / 8) | 0) * 1024 - ((g / 8) | 0) * 32 - ((b / 8) | 0);
}

for (let i = 0; i < 64; i += 1) {
    const r = 255 - i * 4;
    const g = 255 - ((i * 1.75) | 0);
    const b = 255 - i * 4 ;

    terrainColours.rgb.push(`rgb(${r}, ${g}, ${b})`);
    terrainColours.integer[i] = rgbToInt(r, b, g);
}

for (let i = 0; i < 64; i += 1) {
    const r = i * 3;
    const g = 144;
    const b = 0;

    terrainColours.rgb.push(`rgb(${r}, ${g}, ${b})`);
    terrainColours.integer[i + 64] = rgbToInt(r, g, b);
}

for (let i = 0; i < 64; i += 1) {
    const r = 192 - ((i * 1.5) | 0);
    const g = 144 - ((i * 1.5) | 0);
    const b = 0;

    terrainColours.rgb.push(`rgb(${r}, ${g}, ${b})`);
    terrainColours.integer[i + 128] = rgbToInt(r, g, b);
}

for (let l = 0; l < 64; l++) {
    const r = 96 - ((l * 1.5) | 0);
    const g = 48 + ((l * 1.5) | 0);
    const b = 0;

    terrainColours.rgb.push(`rgb(${r}, ${g}, ${b})`);
    terrainColours.integer[l + 192] = rgbToInt(r, g, b);
}

// terrainColours are generated in the same manner as the client, but the client
// applies lighting which darkens them. comparing with the original map,
// halving the lightness (in HSL) results in the same colours as the
// minimap/world map.
terrainColours.rgb = terrainColours.rgb.map(css => {
    const rgb = cssColor(css);
    const hsv = rgb2hsv(rgb.r, rgb.g, rgb.b);
    hsv.v = Math.floor(hsv.v / 2);

    return hsv2hex(hsv.h, hsv.s, hsv.v);
});

module.exports = terrainColours;
