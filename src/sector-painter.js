// paint a 2d map of an individual landscape sector

const chalk = require('chalk');
const overlayColours = require('./overlay-colours');
const overlays = require('./overlays');
const terrainColours = require('./terrain-colours');
const { createCanvas } = require('canvas');
const { cssColor, rgb2hex } = require('color-functions');

chalk.level = 3;

// size of a square tile in pixels
const TILE_SIZE = 3;

const [NORTH, EAST, SOUTH, WEST] = [0, 1, 2, 3];
const SURROUNDED = [true, true, true, true];

const OVERLAY_COLOURS = {};

for (const [name, colour] of Object.entries(overlayColours)) {
    OVERLAY_COLOURS[overlays[name]] = colour;
}

const FLOOR_TILES = [
    'BROWN_FLOOR', 'STONE_FLOOR', 'MAROON_FLOOR', 'BLACK_FLOOR','BLUE_FLOOR',
    'PURPLE_FLOOR', 'LIGHT_STONE_FLOOR', 'SAND_FLOOR', 'MUD_FLOOR'
].map(name => overlays[name]);

const BRIDGE_TILES = [
    'BRIDGE', 'BRIDGE_2', 'LOG', 'LOG_2'
].map(name => overlays[name]);

const ANTIALIAS_OVERLAYS = [
    'ROAD', 'WATER', 'SWAMP_WATER', 'MOUNTAIN', 'LAVA'
].map(name => overlays[name]);

class SectorPainter {
    constructor(sector, options = {}, neighbours = []) {
        this.sector = sector;
        this.options = options;
        this.neighbours = neighbours;

        this.imageWidth = sector.width * TILE_SIZE;
        this.imageHeight = sector.height * TILE_SIZE;

        this.canvas = createCanvas(this.imageWidth, this.imageHeight);
        this.ctx = this.canvas.getContext('2d');
    }

    // draw a wall from north to south
    drawVerticalWall(x, y) {
        this.ctx.fillStyle = OVERLAY_COLOURS[9];
        this.ctx.fillRect(x + 2, y, 1, TILE_SIZE);
    }

    // draw a wall wall from east to west
    drawHorizontalWall(x, y) {
        this.ctx.fillStyle = OVERLAY_COLOURS[9];
        this.ctx.fillRect(x, y, TILE_SIZE, 1);
    }

    // draw a diagonal wall, "/" signifying  northwest to southeast, "\"
    // signifying northeast to southwest
    drawDiagonalWall(direction, x, y) {
        if (direction === '/') {
            this.ctx.fillStyle = OVERLAY_COLOURS[9];
            this.ctx.fillRect(x + 2, y, 1, 1);
            this.ctx.fillRect(x + 1, y + 1, 1, 1);
            this.ctx.fillRect(x, y + 2, 1, 1);
        } else if (direction === '\\') {
            this.ctx.fillStyle = OVERLAY_COLOURS[9];
            this.ctx.fillRect(x, y, 1, 1);
            this.ctx.fillRect(x + 1, y + 1, 1, 1);
            this.ctx.fillRect(x + 2, y + 2, 1, 1);
        }
    }

    // draw a coloured tile
    drawTile(colour, x, y) {
        this.ctx.fillStyle = colour;
        this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }

    // draw an anti-aliased overlay tile on top of a coloured tile, the last
    // argument is an array of booleans describing whether or not each cardinal
    // direction contains a matching overlay
    drawOverlay(overlay, x, y, [ north, east, south, west ]) {
        const overlayColour = OVERLAY_COLOURS[overlay];

        if (!overlayColour) {
            return;
        }

        this.ctx.fillStyle = overlayColour;

        // the order of these matter for accuracy
        if (!north && !east && !south && !west) {
            // alone (usually stairwells)
            this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        } else if (!south && !west) {
            // bottom right
            this.ctx.fillRect(x + 2, y, 1, 3);
            this.ctx.fillRect(x + 1, y, 1, 2);
            this.ctx.fillRect(x, y, 1, 1);
        } else if (!north && !east) {
            // top right
            this.ctx.fillRect(x, y + 1, 1, 2);
            this.ctx.fillRect(x + 1, y + 2, 1, 1);
        } else if (!south && !east) {
            // bottom left
            this.ctx.fillRect(x, y, 1, 3);
            this.ctx.fillRect(x + 1, y, 1, 2);
            this.ctx.fillRect(x + 2, y, 1, 1);
        } else if (!north && !west) {
            // top left
            this.ctx.fillRect(x + 2, y + 1, 1, 2);
            this.ctx.fillRect(x + 1, y + 2, 1, 1);
        } else {
            this.ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
    }

    // get NESW neighbours of a tile on our sector, checking neighbouring
    // sectors if it's an edge tile
    getTileNeighbours(x, y) {
        let [north, east, south, west] = [null, null, null, null];

        if (y - 1 >= 0) {
            north = this.sector.tiles[x][y - 1];
        } else if (y - 1 === -1 && this.neighbours[NORTH]) {
            north = this.neighbours[NORTH].tiles[x][this.sector.height - 1];
        }

        if (x + 1 < this.sector.width) {
            east = this.sector.tiles[x + 1][y];
        } else if (x + 1 >= this.sector.width && this.neighbours[EAST]) {
            east = this.neighbours[EAST].tiles[0][y];
        }

        if (y + 1 < this.sector.height) {
            south = this.sector.tiles[x][y + 1];
        } else if (y + 1 === this.sector.height && this.neighbours[SOUTH]) {
            south = this.neighbours[SOUTH].tiles[x][0];
        }

        if (x - 1 >= 0) {
            west = this.sector.tiles[x - 1][y];
        } else if (x - 1 === -1 && this.neighbours[WEST]) {
            west = this.neighbours[WEST].tiles[this.sector.width - 1][y];
        }

        return [north, east, south, west];
    }

    // draw each tile in a grid, antialiasing accordingly.
    draw() {
        let x = 0;
        let y = 0;

        for (let i = 0; i < this.sector.width; i += 1) {
            for (let j = 0; j < this.sector.height; j += 1) {
                const tile = this.sector.tiles[i][j];

                // TRBL/NESW
                const neighbours = this.getTileNeighbours(i, j);

                const colour = terrainColours.rgb[tile.colour];

                if (this.sector.plane === 0 || this.sector.plane === 3) {
                    this.drawTile(colour, x, y);
                } else {
                    this.drawTile('#000', x, y);
                }

                let overlay = tile.overlay;
                const diagonal = tile.wall.diagonal;

                // add extra bridge tiles on land
                if (overlay !== overlays.WATER &&
                    BRIDGE_TILES.indexOf(overlay) === -1) {
                    for (const neighbour of neighbours) {
                        if (neighbour &&
                            BRIDGE_TILES.indexOf(neighbour.overlay) >= 0) {
                            overlay = neighbour.overlay;
                            break;
                        }
                    }
                }

                if (overlay !== 0) {
                    let overlayNeighbours = SURROUNDED.slice();

                    if (diagonal && FLOOR_TILES.indexOf(overlay) > -1) {
                        overlayNeighbours = neighbours.map(neighbour => {
                            return !!neighbour &&
                                FLOOR_TILES.indexOf(neighbour.overlay) > -1;
                        });
                    } else if (diagonal ||
                        ANTIALIAS_OVERLAYS.indexOf(overlay) > -1) {
                        overlayNeighbours = neighbours.map(neighbour => {
                            return !!neighbour && (
                                neighbour.overlay === overlays.HOLE ||
                                neighbour.overlay === overlay);
                        });
                    }

                    if (overlay === overlays.WATER) {
                        // if water is touching a bridge or log, don't antialias
                        neighbours.forEach((neighbour, direction) => {
                            if (neighbour &&
                                BRIDGE_TILES.indexOf(neighbour.overlay) >= 0) {
                                overlayNeighbours[direction] = true;
                            }
                        });
                    }

                    this.drawOverlay(overlay, x, y, overlayNeighbours);
                }

                if (diagonal) {
                    this.drawDiagonalWall(diagonal.direction, x, y);
                }

                if (tile.wall.vertical) {
                    this.drawVerticalWall(x, y);
                }

                if (tile.wall.horizontal) {
                    this.drawHorizontalWall(x, y);
                }

                if (diagonal === 48020) {
                    this.drawTile('#f0f', x, y);
                }

                y += TILE_SIZE;
            }

            y = 0;
            x += TILE_SIZE;
        }
    }

    // draw the map for in characters for terminals
    write() {
        const output = [];

        for (let tileY = 0; tileY < this.sector.height; tileY++) {
            output.push('');

            for (let tileX = 0; tileX < this.sector.width; tileX++) {
                const tile = this.sector.tiles[tileX][tileY];
                let colour = terrainColours.rgb[tile.colour];

                if (tile.overlay) {
                    const {r, g, b} = cssColor(OVERLAY_COLOURS[tile.overlay]);
                    colour = rgb2hex(r, g, b);
                }

                let c = '  ';

                if (tile.wall.vertical && tile.wall.horizontal) {
                    c = '‾|';
                } else if (tile.wall.vertical) {
                    c = ' |';
                } else if (tile.wall.horizontal) {
                    c = '‾‾';
                } else if (tile.wall.diagonal) {
                    if (tile.wall.diagonal.direction === '/') {
                        c = ' /';
                    } else {
                        c = ' \\';
                    }
                }

                output[output.length - 1] +=
                    chalk.rgb(97, 97, 97).bgHex(colour)(c);
            }
        }

        return output.join('\n');
    }
}

module.exports = SectorPainter;
