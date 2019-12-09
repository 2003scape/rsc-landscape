// paint a 2d map of an individual landscape sector

const chalk = require('chalk');
const { createCanvas } = require('canvas');
const { cssColor, rgb2hex } = require('color-functions');

// size of a square tile in pixels
const TILE_SIZE = 3;

const [NORTH, EAST, SOUTH, WEST] = [0, 1, 2, 3];
const SURROUNDED = [true, true, true, true];

const WALL_COLOUR = 'rgb(97, 97, 97)';

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
        this.ctx.fillStyle = WALL_COLOUR;
        this.ctx.fillRect(x + 2, y, 1, TILE_SIZE);
    }

    // draw a wall wall from east to west
    drawHorizontalWall(x, y) {
        this.ctx.fillStyle = WALL_COLOUR;
        this.ctx.fillRect(x, y, TILE_SIZE, 1);
    }

    // draw a diagonal wall, "/" signifying  northwest to southeast, "\"
    // signifying northeast to southwest
    drawDiagonalWall(direction, x, y) {
        this.ctx.fillStyle = WALL_COLOUR;

        if (direction === '/') {
            this.ctx.fillRect(x + 2, y, 1, 1);
            this.ctx.fillRect(x + 1, y + 1, 1, 1);
            this.ctx.fillRect(x, y + 2, 1, 1);
        } else if (direction === '\\') {
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
    drawOverlay(colour, x, y, [ north, east, south, west ]) {
        this.ctx.fillStyle = colour;

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
                let tile = this.sector.tiles[i][j];
                let tileDef = tile.getTileDef();
                let overlay = tile.overlay;

                // TRBL/NESW
                const neighbours = this.getTileNeighbours(i, j);

                // add extra bridge tiles on land
                if (!/^(water|lava)$/.test(tileDef.name) && !tileDef.bridge) {
                    for (const neighbour of neighbours) {
                        if (neighbour && neighbour.getTileDef().bridge) {
                            overlay = neighbour.overlay;
                            tileDef = neighbour.getTileDef();
                            break;
                        }
                    }
                }

                const diagonal = tile.wall.diagonal;

                this.drawTile(tile.getTerrainColour(), x, y);

                if (overlay !== 0) {
                    let overlayNeighbours = SURROUNDED.slice();

                    if (diagonal && tileDef.indoors) {
                        // this fixes antialiasing for checkered-floor patterns
                        overlayNeighbours = neighbours.map(neighbour => {
                            return !!neighbour &&
                                neighbour.getTileDef().indoors;
                        });
                    } else if (diagonal || tileDef.antialias) {
                        overlayNeighbours = neighbours.map(neighbour => {
                            return !!neighbour && (
                                neighbour.getTileDef().name === 'hole' ||
                                neighbour.overlay === overlay);
                        });
                    }

                    // if water is touching a bridge or log, don't antialias
                    if (/^(water|lava)$/.test(tileDef.name)) {
                        neighbours.forEach((neighbour, direction) => {
                            if (neighbour && neighbour.getTileDef().bridge) {
                                overlayNeighbours[direction] = true;
                            }
                        });
                    }

                    // fix diagonal tiles surrounded by different overlays
                    if (diagonal) {
                        if (!overlayNeighbours[SOUTH] && neighbours[SOUTH]) {
                            this.drawTile(
                                neighbours[SOUTH].getTileDef().colour,
                                x, y);
                        } else if (!overlayNeighbours[NORTH] &&
                            neighbours[NORTH]) {
                            this.drawTile(
                                neighbours[NORTH].getTileDef().colour,
                                x, y);
                        }
                    }

                    this.drawOverlay(tileDef.colour, x, y, overlayNeighbours);
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

                y += TILE_SIZE;
            }

            y = 0;
            x += TILE_SIZE;
        }
    }

    // draw the map for in characters for terminals
    write(colourLevel = -1) {
        if (colourLevel !== -1) {
            chalk.level = colourLevel;
        }

        const output = [];

        for (let tileY = 0; tileY < this.sector.height; tileY++) {
            output.push('');

            for (let tileX = 0; tileX < this.sector.width; tileX++) {
                const tile = this.sector.tiles[tileX][tileY];
                let colour = tile.getTerrainColour();

                if (tile.overlay) {
                    const {r, g, b} = cssColor(tile.getTileDef().colour);
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
