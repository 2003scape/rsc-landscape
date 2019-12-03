/*const BLOCKED_OVERLAYS = [
    'WATER', 'SWAMP_WATER', 'MOUNTAIN', 'BLACK', 'LAVA', 'BLACK_2'
];*/

class Tile {
    constructor(tile) {
        this.sector = tile.sector;
        this.x = tile.x;
        this.y = tile.y;

        this.index = tile.x * this.sector.width + tile.y;

        this.colour = tile.colour || 0;
        this.elevation = tile.elevation || 0;
        this.direction = tile.direction || 0;
        this.overlay = tile.overlay || 0;
        this.wall = {
            diagonal: tile.wall ? (tile.wall.diagonal || null) : null,
            horizontal: tile.wall ? (tile.wall.horizontal || null) : null,
            roof: tile.wall ? (tile.wall.roof || null) : null,
            vertical: tile.wall ? (tile.wall.vertical || null) : null
        };
        this.objectId = tile.objectId || null;
    }

    // read the appropriate buffers in Sector and set our internal variables
    populate() {
        let diagonal = this.sector.wallsDiagonal[this.index];

        if (diagonal > 0 && diagonal < 12000) {
            diagonal = {
                direction: '/',
                overlay: diagonal
            };
        } else if (diagonal >= 12000 && diagonal < 48000) {
            diagonal = {
                direction: '\\',
                overlay: diagonal - 12000
            };
        } else if (diagonal >= 48000) {
            this.objectId = diagonal - 48001;
            diagonal = null;
        } else {
            diagonal = null;
        }

        this.colour = this.sector.terrainColour[this.index] & 0xff;
        this.elevation = this.sector.terrainHeight[this.index] & 0xff;
        this.direction = this.sector.tileDirection[this.index];
        this.overlay = this.sector.tileDecoration[this.index] & 0xff;
        this.wall = {
            diagonal,
            vertical: this.sector.wallsVertical[this.index] & 0xff || null,
            horizontal: this.sector.wallsHorizontal[this.index] & 0xff || null,
            roof: this.sector.wallsRoof[this.index] & 0xff || null
        };
    }

    toJSON() {
        return {
            colour: this.colour,
            elevation: this.elevation,
            direction: this.direction,
            overlay: this.overlay,
            wall: this.wall,
            objectId: this.objectId
        };
    }
}

module.exports = Tile;
