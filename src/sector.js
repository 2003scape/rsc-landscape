const SectorPainter = require('./sector-painter');
const Tile = require('./tile');

const SECTOR_WIDTH = 48;
const SECTOR_HEIGHT = 48;

// number of tiles in each sector
const MAX_TILES = SECTOR_WIDTH * SECTOR_HEIGHT;

// encode the height/colour buffers so we can store 0-255 within 0-127
function encodeBuffer(buffer, lastVal) {
    const encoded = new Int8Array(MAX_TILES);

    for (let tileY = 0; tileY < SECTOR_HEIGHT; tileY++) {
        for (let tileX = 0; tileX < SECTOR_WIDTH; tileX++) {
            const index = tileX * SECTOR_WIDTH + tileY;
            const enc = (buffer[index] & 0xff) / 2 - (lastVal & 0x7f);
            encoded[index] = enc & 0x7f;
            lastVal += enc;
        }
    }

    return encoded;
}

// compress an encoded buffer to use numbers > 128 to indicate repeat count
// of the number at the previous index
function compressBuffer(buffer, lastVal = -1) {
    const compressed = [];

    let valCountIdx = 0;

    for (let i = 0; i < MAX_TILES; i += 1) {
        const val = buffer[i];

        if (val !== lastVal) {
            valCountIdx = compressed.push(val);
            lastVal = val;
        } else {
            const countExists = compressed.length - 1 >= valCountIdx;

            if (countExists && compressed[valCountIdx] >= 255) {
                valCountIdx = compressed.push(129) - 1;
            } else if (!countExists) {
                compressed.push(129);
            } else {
                compressed[valCountIdx] += 1;
            }
        }
    }

    return new Int8Array(compressed);
}

// similar to the compress above, except we only store repeat counts for zero
// so there's no need to store which value is being repeated if buffer[index] >
// 128 - it always indicates an amount of zeroes!
function compressZeroBuffer(buffer) {
    const compressed = [];

    let lastZeroCount = -1;
    let lastZeroIdx = -1;

    for (let i = 0; i < MAX_TILES; i += 1) {
        const val = buffer[i] & 0xff;

        if (val !== 0) {
            compressed.push(val);
            lastZeroCount = -1;
        } else {
            if (lastZeroCount >= 0 && lastZeroCount < 127) {
                lastZeroCount += 1;
                compressed[lastZeroIdx] = lastZeroCount + 128;
            } else {
                lastZeroIdx = compressed.push(129) - 1;
                lastZeroCount = 1;
            }
        }
    }

    return new Int8Array(compressed);
}

// used in jm maps
function compressDeltaBuffer(buffer) {
    const compressed = new Int8Array(buffer.length);
    compressed[0] = buffer[0];

    for (let i = 1; i < buffer.length; i++) {
        compressed[i] = buffer[i] - buffer[i - 1];
    }

    return compressed;
}

class Sector {
    constructor({ x, y, plane, members, tiles }) {
        this.x = x;
        this.y = y;
        this.plane = plane;
        this.members = !!members;

        this.width = SECTOR_WIDTH;
        this.height = SECTOR_HEIGHT;
        this.empty = true;

        // elevation of each tile from 0-255
        this.terrainHeight = new Int8Array(MAX_TILES);

        // colour of each tile from terrain-colours.js palette
        this.terrainColour = new Int8Array(MAX_TILES);

        // the direction objects should face
        this.tileDirection = new Int8Array(MAX_TILES);

        // the overlay textures
        this.tileDecoration = new Int8Array(MAX_TILES);

        // if > 0, the overlay
        this.wallsVertical = new Int8Array(MAX_TILES);
        this.wallsHorizontal = new Int8Array(MAX_TILES);
        this.wallsRoof = new Int8Array(MAX_TILES);

        // 0-12000 is /, 12000-48000 is \, 48000+ is an object ID
        this.wallsDiagonal = new Int32Array(MAX_TILES);

        if (tiles && Array.isArray(tiles)) {
            this.tiles = [];

            for (let tileX = 0; tileX < SECTOR_WIDTH; tileX++) {
                this.tiles.push([]);

                for (let tileY = 0; tileY < SECTOR_HEIGHT; tileY++) {
                    const tile = tiles[tileX][tileY];
                    this.tiles[tileX].push(new Tile({ sector: this, ...tile }));
                }
            }

            this.populateBuffers();
        }
    }

    // parse the .jm file in the map archives
    parseJm(mapData) {
        let offset = 0;
        let lastVal = 0;

        for (let tile = 0; tile < MAX_TILES; tile++) {
            lastVal = lastVal + (mapData[offset++] & 0xff);
            this.terrainHeight[tile] = lastVal;
        }

        lastVal = 0;

        for (let tile = 0; tile < MAX_TILES; tile++) {
            lastVal = lastVal + (mapData[offset++] & 0xff);
            this.terrainColour[tile] = lastVal;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.wallsVertical[tile] = mapData[offset++] & 0xff;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.wallsHorizontal[tile] = mapData[offset++] & 0xff;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.wallsDiagonal[tile] =
                (mapData[offset] << 8) | mapData[offset + 1];

            offset += 2;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.wallsRoof[tile] = mapData[offset++] & 0xff;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.tileDecoration[tile] = mapData[offset++] & 0xff;
        }

        for (let tile = 0; tile < MAX_TILES; tile++) {
            this.tileDirection[tile] = mapData[offset++] & 0xff;
        }

        this.empty = false;
    }

    // parse the .hei file in the land archives
    parseHei(mapData) {
        let offset = 0;
        let lastVal = 0;

        // a form of rle compression. if data[offset] < 128, then it sets tile
        // at index to that value. however, if data[offset] is > 128, it takes
        // the last value that was < 128 and applies it from index to
        // index + (value - 128)
        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.terrainHeight[tile++] = val & 0xff;
                lastVal = val;
            }

            if (val >= 128) {
                for (let i = 0; i < val - 128; i++) {
                    this.terrainHeight[tile++] = lastVal & 0xff;
                }
            }
        }

        lastVal = 64;

        for (let tileY = 0; tileY < SECTOR_HEIGHT; tileY++) {
            for (let tileX = 0; tileX < SECTOR_WIDTH; tileX++) {
                const index = tileX * SECTOR_WIDTH + tileY;

                lastVal = this.terrainHeight[index] + (lastVal & 0x7f);
                this.terrainHeight[index] = (lastVal * 2) & 0xff;

                if (this.terrainHeight[index] > 0) {
                    this.empty = false;
                }
            }
        }

        lastVal = 0;

        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.terrainColour[tile++] = val & 0xff;
                lastVal = val;
            }

            if (val >= 128) {
                for (let i = 0; i < val - 128; i++) {
                    this.terrainColour[tile++] = lastVal & 0xff;
                }
            }
        }

        lastVal = 35;

        for (let tileY = 0; tileY < SECTOR_HEIGHT; tileY++) {
            for (let tileX = 0; tileX < SECTOR_WIDTH; tileX++) {
                const index = tileX * SECTOR_WIDTH + tileY;

                lastVal = (this.terrainColour[index] + lastVal) & 0x7f;
                this.terrainColour[index] = (lastVal * 2) & 0xff;

                if (this.terrainColour[index] > 0) {
                    this.empty = false;
                }
            }
        }
    }

    // parse the .dat files in the map archives
    parseDat(mapData) {
        let offset = 0;

        // TODO
        const version = 2;

        if (version === 0) {
            for (let tile = 0; tile < MAX_TILES; tile++) {
                this.wallsVertical[tile] = mapData[offset++] & 0xff;

                if (this.wallsVertical[tile] > 0) {
                    this.empty = false;
                }
            }

            for (let tile = 0; tile < MAX_TILES; tile++) {
                this.wallsHorizontal[tile] = mapData[offset++] & 0xff;

                if (this.wallsHorizontal[tile] > 0) {
                    this.empty = false;
                }
            }

            for (let tile = 0; tile < MAX_TILES; tile++) {
                this.wallsDiagonal[tile] = mapData[offset++] & 0xff;

                if (this.wallsDiagonal[tile] > 0) {
                    this.empty = false;
                }
            }

            for (let tile = 0; tile < MAX_TILES; tile++) {
                let val = mapData[offset++] & 0xff;

                if (val > 0) {
                    this.wallsDiagonal[tile] = val + Tile.NW_SE_OFFSET;
                }

                if (this.wallsDiagonal[tile] > 0) {
                    this.empty = false;
                }
            }
        } else if (version === 1) {
            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 192) {
                    this.wallsVertical[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 192; i++) {
                        this.wallsVertical[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 192) {
                    this.wallsHorizontal[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 192; i++) {
                        this.wallsHorizontal[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 192) {
                    this.wallsDiagonal[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 192; i++) {
                        this.wallsDiagonal[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 192) {
                    this.wallsDiagonal[tile++] = val + Tile.NW_SE_OFFSET;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    tile += val - 192;
                }
            }
        } else if (version === 2) {
            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 128) {
                    this.wallsVertical[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 128; i++) {
                        this.wallsVertical[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 128) {
                    this.wallsHorizontal[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 128; i++) {
                        this.wallsHorizontal[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 128) {
                    this.wallsDiagonal[tile++] = val;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    for (let i = 0; i < val - 128; i++) {
                        this.wallsDiagonal[tile++] = 0;
                    }
                }
            }

            for (let tile = 0; tile < MAX_TILES; ) {
                const val = mapData[offset++] & 0xff;

                if (val < 128) {
                    this.wallsDiagonal[tile++] = val + Tile.NW_SE_OFFSET;

                    if (val > 0) {
                        this.empty = false;
                    }
                } else {
                    tile += val - 128;
                }
            }
        }

        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.wallsRoof[tile++] = val & 0xff;
            } else {
                for (let i = 0; i < val - 128; i++) {
                    this.wallsRoof[tile++] = 0;
                }
            }
        }

        let lastVal = 0;

        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.tileDecoration[tile++] = val & 0xff;
                lastVal = val;
            } else {
                for (let i = 0; i < val - 128; i++) {
                    this.tileDecoration[tile++] = lastVal;
                }
            }
        }

        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.tileDirection[tile++] = val & 0xff;
            } else {
                for (let i = 0; i < val - 128; i++) {
                    this.tileDirection[tile++] = 0;
                }
            }
        }
    }

    // parse the .loc files in map archives. these appear to hold the object IDs
    // and locations for the sectors shown in login.
    parseLoc(mapData) {
        if (mapData === null || mapData.length < 1) {
            return;
        }

        let offset = 0;

        for (let tile = 0; tile < MAX_TILES; ) {
            let val = mapData[offset++] & 0xff;

            if (val < 128) {
                this.wallsDiagonal[tile++] = val + Tile.OBJECT_OFFSET;
            } else {
                tile += val - 128;
            }
        }
    }

    // creates a 48x48 array with sane Tile objects from the buffers recovered
    // from archives
    populateTiles() {
        this.tiles = [];

        for (let i = 0; i < SECTOR_WIDTH; i += 1) {
            this.tiles.push([]);

            for (let j = 0; j < SECTOR_HEIGHT; j += 1) {
                const tile = new Tile({ sector: this, x: i, y: j });
                tile.populate();
                this.tiles[i].push(tile);
            }
        }

        this.tiles.reverse();
    }

    // if we edit tiles, repopulate the appropriate buffers for re-compression
    populateBuffers() {
        for (let tileY = 0; tileY < SECTOR_HEIGHT; tileY++) {
            for (let tileX = 0; tileX < SECTOR_WIDTH; tileX++) {
                const index = tileX * SECTOR_WIDTH + tileY;
                const tile = this.tiles[SECTOR_WIDTH - 1 - tileX][tileY];
                const diagonal = tile.wall ? tile.wall.diagonal : null;

                this.terrainHeight[index] = tile.elevation;
                this.terrainColour[index] = tile.colour;

                this.wallsVertical[index] = tile.wall.vertical || 0;
                this.wallsHorizontal[index] = tile.wall.horizontal || 0;
                this.wallsRoof[index] = tile.wall.roof || 0;

                if (diagonal && diagonal.direction === '/') {
                    this.wallsDiagonal[index] = diagonal.overlay;
                } else if (diagonal && diagonal.direction === '\\') {
                    this.wallsDiagonal[index] =
                        diagonal.overlay + Tile.NW_SE_OFFSET;
                }

                if (tile.objectId) {
                    this.wallsDiagonal[index] =
                        tile.objectId + Tile.OBJECT_OFFSET + 1;
                } else if (tile.itemId) {
                    this.wallsDiagonal[index] =
                        tile.itemId + Tile.ITEM_OFFSET + 1;
                } else if (tile.npcId) {
                    this.wallsDiagonal[index] =
                        tile.npcId + Tile.NPC_OFFSET + 1;
                }

                this.tileDecoration[index] = tile.overlay || 0;
                this.tileDirection[index] = tile.direction || 0;
            }
        }
    }

    // convert sector to the filename used in the archives
    getEntryName() {
        return (
            'm' +
            this.plane +
            Math.floor(this.x / 10) +
            (this.x % 10) +
            Math.floor(this.y / 10) +
            (this.y % 10)
        );
    }

    // convert Tile objects back into a `.hei` file for land archives
    toHei() {
        const encodedElevation = encodeBuffer(this.terrainHeight, 64);
        const encodedColour = encodeBuffer(this.terrainColour, 35);

        const compressedElevation = compressBuffer(encodedElevation, 0);
        const compressedColour = compressBuffer(encodedColour, 0);

        const mapData = new Int8Array(
            compressedElevation.length + compressedColour.length
        );

        mapData.set(compressedElevation, 0);
        mapData.set(compressedColour, compressedElevation.length);

        return mapData;
    }

    // convert Tile objects to `.dat` file for map archives
    toDat() {
        const mapData = [];

        mapData.push(...this.wallsVertical);
        mapData.push(...this.wallsHorizontal);

        // add / first
        mapData.push(
            ...this.wallsDiagonal.map((diagonal) => {
                return diagonal < Tile.NW_SE_OFFSET ? diagonal : 0;
            })
        );

        // then add \
        mapData.push(
            ...this.wallsDiagonal.map((diagonal) => {
                return diagonal >= Tile.NW_SE_OFFSET
                    ? diagonal - Tile.NW_SE_OFFSET
                    : 0;
            })
        );

        mapData.push(...compressZeroBuffer(this.wallsRoof));
        mapData.push(...compressBuffer(this.tileDecoration, 0));
        mapData.push(...compressZeroBuffer(this.tileDirection));

        return new Int8Array(mapData);
    }

    // convert Tile objects back into a `.loc` file for map archives, or null
    // if no objectIds are stored
    toLoc() {
        let empty = true;

        const compressedObjects = compressZeroBuffer(
            this.wallsDiagonal.map((val) => {
                val = val >= Tile.OBJECT_OFFSET ? val - Tile.OBJECT_OFFSET : 0;

                if (val !== 0) {
                    empty = false;
                }

                return val;
            })
        );

        return empty ? null : compressedObjects;
    }

    toJm() {
        let offset = 0;

        // 7 int8 fields, 1 int16 field
        const jmData = new Int8Array(7 * MAX_TILES + 2 * MAX_TILES);

        jmData.set(compressDeltaBuffer(this.terrainHeight), offset);
        offset += MAX_TILES;

        jmData.set(compressDeltaBuffer(this.terrainColour), offset);
        offset += MAX_TILES;

        jmData.set(this.wallsVertical, offset);
        offset += MAX_TILES;

        jmData.set(this.wallsHorizontal, offset);
        offset += MAX_TILES;

        for (let i = 0; i < MAX_TILES; i++) {
            const value = this.wallsDiagonal[i];
            jmData[offset] = (value >> 8) & 0xff;
            jmData[offset + 1] = value & 0xff;

            offset += 2;
        }

        jmData.set(this.wallsRoof, offset);
        offset += MAX_TILES;

        jmData.set(this.tileDecoration, offset);
        offset += MAX_TILES;

        jmData.set(this.tileDirection, offset);

        return jmData;
    }

    toCanvas(options = {}, neighbours = []) {
        const painter = new SectorPainter(this, options, neighbours);
        painter.draw();

        return painter.canvas;
    }

    toString(terminal = false, colourLevel = -1) {
        if (!terminal) {
            return (
                `[object ${this.constructor.name} ${this.getEntryName()} ` +
                `${this.width}x${this.height}]`
            );
        }

        const painter = new SectorPainter(this);

        return painter.write(colourLevel);
    }

    toJSON() {
        return {
            x: this.x,
            y: this.y,
            plane: this.plane,
            members: this.members,
            tiles: this.tiles
        };
    }
}

module.exports = Sector;
