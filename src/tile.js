const terrainColours = require('./terrain-colours');
const tileOverlays = require('../res/tile-overlays');

const BLACK = 'rgb(0, 0, 0)';

const PLANE_HEIGHT = 944;

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
            diagonal: tile.wall ? tile.wall.diagonal || null : null,
            horizontal: tile.wall ? tile.wall.horizontal || null : null,
            roof: tile.wall ? tile.wall.roof || null : null,
            vertical: tile.wall ? tile.wall.vertical || null : null
        };
        this.objectId =
            typeof tile.objectId === 'undefined' ? null : tile.objectId;
        this.itemId = typeof tile.itemId === 'undefined' ? null : tile.itemId;
        this.npcId = typeof tile.npcId === 'undefined' ? null : tile.npcId;
    }

    // read the appropriate buffers in Sector and set our internal variables
    populate() {
        let diagonal = this.sector.wallsDiagonal[this.index];

        if (diagonal > 48000) {
            this.objectId = diagonal - 48001;
            diagonal = null;
        } else if (diagonal > 36000) {
            this.itemId = diagonal - 36001;
            diagonal = null;
        } else if (diagonal > 24000) {
            this.npcId = diagonal - 24001;
            diagonal = null;
        } else if (diagonal > 12000) {
            diagonal = {
                direction: '\\',
                overlay: diagonal - 12000
            };
        } else if (diagonal > 0) {
            diagonal = {
                direction: '/',
                overlay: diagonal
            };
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

    // return the map colour for this tile
    getTerrainColour() {
        const plane = this.sector.plane;

        if (plane === 0 || plane === 3) {
            return terrainColours.rgb[this.colour];
        } else {
            return BLACK;
        }
    }

    // get the overlay tile def
    getTileDef() {
        return tileOverlays[this.overlay] || {};
    }

    // return the {x, y} the game would use for this tile
    getGameCoords() {
        const x = this.x + (this.sector.x - 48) * 48;
        const y =
            (this.sector.y - 36) * 48 +
            this.y +
            96 -
            144 +
            this.sector.plane * PLANE_HEIGHT;

        return { x, y };
    }

    toJSON() {
        return {
            colour: this.colour,
            elevation: this.elevation,
            direction: this.direction,
            overlay: this.overlay,
            wall: this.wall,
            objectId: this.objectId,
            itemId: this.itemId,
            npcId: this.npcId
        };
    }

    toString() {
        return (
            `[object ${this.constructor.name} ` +
            `${this.sector.getEntryName()} ${this.index}]`
        );
    }
}

module.exports = Tile;
