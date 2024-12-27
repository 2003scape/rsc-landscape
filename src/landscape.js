const MapPainter = require('./map-painter');
const Sector = require('./sector');
const { JagArchive, hashFilename } = require('@2003scape/rsc-archiver');

const MAX_X_SECTORS = 65;
const MAX_Y_SECTORS = 56;

// ground, first floor, second floor, dungeon/basement
const MAX_PLANES = 4;

class Landscape {
    constructor() {
        this.width = MAX_X_SECTORS;
        this.height = MAX_Y_SECTORS;
        this.depth = MAX_PLANES;

        this.minRegionX = 48;
        this.minRegionY = 37;
        this.maxRegionX = null;
        this.maxRegionY = null;

        this.landArchives = [];
        this.mapArchives = [];

        this.initSectors();
    }

    // initialize the multidimensional sector array
    initSectors() {
        this.sectors = [];

        for (let i = 0; i < MAX_X_SECTORS; i += 1) {
            this.sectors.push([]);

            for (let j = 0; j < MAX_Y_SECTORS; j += 1) {
                this.sectors[i].push([]);

                for (let k = 0; k < MAX_PLANES; k += 1) {
                    this.sectors[i][j].push(null);
                }
            }
        }
    }

    loadArchive(landBuffer, mapBuffer, members = false) {
        // TODO JagArchive.fromArchive?
        const landArchive = new JagArchive();
        landArchive.readArchive(landBuffer);

        const mapArchive = new JagArchive();
        mapArchive.readArchive(mapBuffer);

        this.landArchives.push({ archive: landArchive, members });
        this.mapArchives.push({ archive: mapArchive, members });
    }

    loadJmJag(mapBuffer) {
        this.jmJag = true;

        const mapArchive = new JagArchive();
        mapArchive.readArchive(mapBuffer);

        this.mapArchives.push({ archive: mapArchive, members: false });
    }

    // load f2p maps
    loadJag(landBuffer, mapBuffer) {
        this.jmJag = false;
        this.loadArchive(landBuffer, mapBuffer, false);
    }

    // load p2p maps
    loadMem(landBuffer, mapBuffer) {
        this.jmJag = false;
        this.loadArchive(landBuffer, mapBuffer, true);
    }

    // populate our internal structures
    parseArchives() {
        for (let plane = 0; plane < MAX_PLANES; plane += 1) {
            for (let y = this.minRegionY; y < MAX_Y_SECTORS; y += 1) {
                for (let x = this.minRegionX; x < MAX_X_SECTORS; x += 1) {
                    const sector = new Sector({ x, y, plane });
                    const entry = sector.getEntryName();

                    if (this.jmJag) {
                        const hash = hashFilename(`${entry}.jm`);

                        for (const { members, archive } of this.mapArchives) {
                            if (archive.entries.has(hash)) {
                                sector.parseJm(archive.getEntry(`${entry}.jm`));
                                sector.members = members;
                            }
                        }
                    } else {
                        for (const { members, archive } of this.landArchives) {
                            const hash = hashFilename(`${entry}.hei`);

                            if (archive.entries.has(hash)) {
                                sector.parseHei(
                                    archive.getEntry(`${entry}.hei`)
                                );

                                sector.members = members;
                            }
                        }

                        for (const { members, archive } of this.mapArchives) {
                            const datHash = hashFilename(`${entry}.dat`);

                            if (archive.entries.has(datHash)) {
                                sector.parseDat(
                                    archive.getEntry(`${entry}.dat`)
                                );

                                sector.members = members;
                            }

                            const locHash = hashFilename(`${entry}.loc`);

                            if (archive.entries.has(locHash)) {
                                sector.parseLoc(
                                    archive.getEntry(`${entry}.loc`)
                                );
                            }
                        }
                    }

                    sector.populateTiles();

                    if (!sector.empty) {
                        this.sectors[x][y][plane] = sector;

                        if (x > this.maxRegionX) {
                            this.maxRegionX = x;
                        }

                        if (y > this.maxRegionY) {
                            this.maxRegionY = y;
                        }
                    }
                }
            }
        }
    }

    // get any sector with any non-zero attributes
    *getPopulatedSectors() {
        for (let i = this.minRegionX; i < this.maxRegionX; i += 1) {
            for (let j = this.minRegionY; j < this.maxRegionY; j += 1) {
                for (let k = 0; k < MAX_PLANES; k += 1) {
                    const sector = this.sectors[i][j][k];

                    if (sector && !sector.empty) {
                        yield sector;
                    }
                }
            }
        }
    }

    // grab the NESW sectors of another sector (if they exist). used for
    // superior world map antialiasing.
    getSectorNeighbours(x, y, plane) {
        let [north, east, south, west] = [null, null, null, null];

        if (y - 1 >= 0) {
            north = this.sectors[x][y - 1][plane];
        }

        if (x - 1 >= 0) {
            east = this.sectors[x - 1][y][plane];
        }

        if (y + 1 < this.sectors[x].length) {
            south = this.sectors[x][y + 1][plane];
        }

        if (x + 1 < this.sectors.length) {
            west = this.sectors[x + 1][y][plane];
        }

        return [north, east, south, west];
    }

    // convert game coordinates to tile
    getTileAtGameCoords(x, y) {
        let plane = 0;

        if (y >= 0 && y <= 1007) {
            plane = 0; // overworld
        } else if (y >= 1007 && y <= 1007 + 943) {
            plane = 1; // first floor
            y -= 943;
        } else if (y >= 1008 + 943 && y <= 1007 + 2 * 943) {
            plane = 2; // second floor
            y -= 943 * 2;
        } else {
            plane = 3; // dungeon
            y -= 943 * 3;
        }

        const sectorX = Math.floor(x / 48) + this.minRegionX;
        const sectorY = Math.floor(y / 48) + this.minRegionY;

        const sector = this.sectors[sectorX][sectorY][plane];
        const tile = sector.tiles[47 - (x % 48)][y % 48];

        return tile;
    }

    async toCanvas(options = {}) {
        const painter = new MapPainter(this, options);
        await painter.draw();

        return painter.canvas;
    }

    toString() {
        return (
            `[object ${this.constructor.name} ${this.width}x` +
            `${this.height}x${this.depth}]`
        );
    }
}

module.exports = Landscape;
