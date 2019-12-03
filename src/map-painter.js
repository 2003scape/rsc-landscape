// paint the final world map images, combining sector images

const key = require('./key');
const overlayColours = require('./overlay-colours');
const path = require('path');
const { Image, createCanvas } = require('canvas');

const TILE_SIZE = 3;

// the orange + symbol colour used to indicate game objects
const OBJECT_COLOUR = 'rgb(175, 95, 0)';
// only regular/evergreen trees outside of the wild are this colour
const TREE_COLOUR = 'rgb(0, 160, 0)';
// objects like dead trees and fungus are darker than rocks/signs in the wild
const WILD_TREE_COLOUR = 'rgb(112, 64, 0)';
// objects in the wild intended to be WILD_TREE_COLOUR
const WILD_SCENERY = [4, 38, 70, 205];

const FONT = 'Arial';

function inWilderness(x, y) {
    return x >= 1440 && x <= 2304 && y >= 286 && y <= 1286;
}

class MapPainter {
    constructor(landscape, options) {
        this.landscape = landscape;

        this.options = {};
        this.options.scale = isNaN(+options.scale) ? 1 : +options.scale;
        this.options.points = options.points && options.points.length ?
            options.points : [];
        this.options.objects = options.objects && options.objects.length ?
            options.objects : [];
        this.options.labels = options.labels && options.labels.length ?
            options.labels : [];

        const width = this.landscape.maxRegionX - this.landscape.minRegionX + 1;
        const height =
            (this.landscape.maxRegionY - this.landscape.minRegionY + 1) * 1;
            //this.landscape.depth;

        const firstSector = landscape.getPopulatedSectors().next().value;

        this.sectorWidth = firstSector.tiles.length;
        this.sectorHeight = firstSector.tiles[0].length;

        this.imageWidth = (this.sectorWidth * TILE_SIZE) * width;
        this.imageHeight = (this.sectorHeight * TILE_SIZE * height) +
            /*(this.landscape.depth * 240) - 96*/0;

        this.canvas = createCanvas(this.imageWidth, this.imageHeight);
        this.ctx = this.canvas.getContext('2d');
    }

    // load the key/legend images for points of interest
    async loadKeyImages() {
        this.keyImages = new Map();

        for (const type of key) {
            await (new Promise((resolve, reject) => {
                const img = new Image();
                img.onerror = reject;
                img.onload = resolve;
                img.src = path.resolve('res/key', `${type}.png`);
                this.keyImages.set(type, img);
            }));
        }
    }

    // render each sector (or water/black sector for empties) and plot them
    // on our map canvas
    drawSectors() {
        const maxX = this.landscape.maxRegionX;
        const minX = this.landscape.minRegionX;
        const maxY = this.landscape.maxRegionY;
        const minY = this.landscape.minRegionY;

        // absolute x/y position of the next sector
        let x = 0;
        let y = 0;

        //for (let i = 0; i < this.landscape.depth; i += 1) {
        for (let i = 0; i < 1; i += 1) {
            y = (i * this.sectorHeight * TILE_SIZE * (maxY - minY)) + (i * 240);

            for (let j = maxX; j >= minX; j -= 1) {
                for (let k = minY; k <= maxY; k += 1) {
                    const sector = this.landscape.sectors[j][k][i];

                    if (!sector || sector.empty) {
                        this.ctx.fillStyle =
                            overlayColours[i === 0 ? 'WATER' : 'BLACK'];
                        this.ctx.fillRect(x, y, this.sectorWidth * TILE_SIZE,
                            this.sectorHeight * TILE_SIZE);
                    } else {
                        const sectorCanvas = sector.toCanvas(this.options,
                            this.landscape.getSectorNeighbours(j, k, i));
                        this.ctx.drawImage(sectorCanvas, x, y);

                        /*const text = `${sector.x},${sector.y},${sector.plane}`;
                        this.ctx.fillStyle = '#000';
                        this.ctx.fillText(text, x + 2, y + 2);
                        this.ctx.fillStyle = '#fff';
                        this.ctx.fillText(text, x + 3, y + 3);*/
                    }

                    y += this.sectorHeight * TILE_SIZE;
                }

                x += this.sectorWidth * TILE_SIZE;
                y = (i * this.sectorHeight * TILE_SIZE * (maxY - minY)) +
                    (i * 240);
            }

            x = 0;
        }
    }

    // draw a + for each game object (and make them green if they're trees)
    drawObjects() {
        for (let { id, position: [x, y]} of this.options.objects) {
            x *= 3;
            x = this.imageWidth - x - 2;
            y *= 3;
            y -= 1;

            if (inWilderness(x, y)) {
                if (WILD_SCENERY.indexOf(id) > -1) {
                    this.ctx.fillStyle = WILD_TREE_COLOUR;
                } else {
                    this.ctx.fillStyle = OBJECT_COLOUR;
                }
            } else {
                this.ctx.fillStyle = id <= 1 ? TREE_COLOUR : OBJECT_COLOUR;
            }

            this.ctx.fillRect(x + 1, y, 1, 3);
            this.ctx.fillRect(x, y + 1, 3, 1);
        }
    }

    // draw the points of interest from the key/legend images
    async drawPoints() {
        await this.loadKeyImages();

        for (let { type, x, y } of this.options.points) {
            x -= this.landscape.minRegionX * this.sectorWidth * TILE_SIZE;
            y -= this.landscape.minRegionY * this.sectorHeight * TILE_SIZE;

            this.ctx.drawImage(this.keyImages.get(type), x, y);
        }
    }

    // draw labels for city, building, province, etc.
    drawLabels() {
        for (const label of this.options.labels) {
            let [x, y] = [label.x, label.y];

            x -= this.landscape.minRegionX * this.sectorWidth * TILE_SIZE;
            y -= this.landscape.minRegionY * this.sectorHeight * TILE_SIZE;

            let sizeInc = 3;

            if (label.bold) {
                sizeInc += 2;
            }

            label.size += sizeInc;
            y -= sizeInc;

            this.ctx.fillStyle = label.colour || '#fff';
            this.ctx.font =
                `${label.bold ? 'bold ' : ''} ${label.size}px ${FONT}`;
            this.ctx.textBaseline = 'top';

            if (label.align === 'center') {
                // split the text by \n, calculate width for each chunk, find
                // the largest and display the others centred relatively
                const chunks = label.text.split('\n');
                const chunkWidths = new Map();
                let widestChunk = 0;

                for (const text of chunks) {
                    const width = this.ctx.measureText(text).width;
                    chunkWidths.set(text, width);

                    if (width > widestChunk) {
                        widestChunk = width;
                    }
                }

                let yOff = 0;

                for (const [ text, width ] of chunkWidths) {
                    const xOff = (widestChunk / 2) - (width / 2);
                    this.ctx.fillText(text, x + xOff, y + yOff);
                    yOff += (label.size - sizeInc) +
                        Math.floor((label.size - sizeInc) / 2);
                }
            } else {
                this.ctx.fillText(label.text, x, y);
            }
        }
    }

    async draw() {
        this.drawSectors();
        this.drawObjects();
        await this.drawPoints();
        this.drawLabels();
    }
}

module.exports = MapPainter;
