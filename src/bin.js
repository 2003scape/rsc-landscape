#!/usr/bin/env node

const fs = require('fs').promises;
const mkdirp = require('mkdirp-promise');
const path = require('path');
const pkg = require('../package');
const yargs = require('yargs');
const { JagArchive } = require('@2003scape/rsc-archiver');
const { Landscape, Sector } = require('./');

async function parseArchives(argv, landscape) {
    let landMem, mapsMem, landJag, mapsJag;

    for (const filename of argv.archives) {
        if (/^land(\d+)\.jag$/i.test(filename)) {
            landJag = filename;
        } else if (/maps(\d+)\.jag$/i.test(filename)) {
            mapsJag = filename;
        } else if (/land(\d+)\.mem$/i.test(filename)) {
            landMem = filename;
        } else if (/maps(\d+)\.mem$/i.test(filename)) {
            mapsMem = filename;
        }
    }

    if (!(landMem && mapsMem) && !(landJag && mapsJag)) {
        process.exitCode = 1;
        console.error('provide at least one maps and land archive ' +
            'combination');
        return;
    }

    if (landJag && mapsJag) {
        landJag = await fs.readFile(landJag);
        mapsJag = await fs.readFile(mapsJag);

        landscape.loadJag(landJag, mapsJag);
    }

    if (landMem && mapsMem) {
        landMem = await fs.readFile(landMem);
        mapsMem = await fs.readFile(mapsMem);

        landscape.loadMem(landMem, mapsMem);
    }

    landscape.parseArchives();
}

yargs
    .scriptName('rsc-landscape')
    .version(pkg.version)
    .command(
        'generate-map <archives..>',
        'generate world map png',
        yargs => {
            yargs.positional('archives', {
                description: 'landscape and map .jag and .mem archives',
                type: 'array'
            });

            yargs.option('plane', {
                alias: 'z',
                description: 'change map depth (0 = overworld, 1 = upstairs, ' +
                    'etc.)',
                type: 'number',
                default: 0
            });

            yargs.option('objects', {
                alias: 'O',
                description: 'JSON file with object locations',
                type: 'string'
            });

            yargs.option('points', {
                alias: 'p',
                description: 'JSON file with point-of-interest locations',
                type: 'string'
            });

            yargs.option('labels', {
                alias: 'l',
                description: 'JSON file with map labels',
                type: 'string'
            });

            yargs.option('output', {
                alias: 'o',
                description: 'filename to write the PNG to',
                type: 'string',
                default: './worldmap.png'
            });
        },
        async argv => {
            const landscape = new Landscape();

            try {
                await parseArchives(argv, landscape);

                const options = { points: [], objects: [], labels: [] };

                for (const option of Object.keys(options)) {
                    const filename = argv[option];

                    if (filename) {
                        const file = await fs.readFile(filename);

                        if (file) {
                            options[option] = JSON.parse(file.toString());
                        }
                    }
                }

                options.plane = argv.plane;

                const canvas = await landscape.toCanvas(options);
                await fs.writeFile(argv.output, canvas.toBuffer());
            } catch (e) {
                process.exitCode = 1;
                console.error(e);
            }
        })
    .command(
        'dump-json <archives..>',
        'dump JSON files of each sector',
        yargs => {
            yargs.positional('archives', {
                description: 'landscape and map .jag and .mem archives',
                type: 'array'
            });

            yargs.option('pretty', {
                alias: 'p',
                description: 'pretty-print JSON files',
                type: 'boolean',
                default: false
            });

            yargs.option('output', {
                alias: 'o',
                description: 'directory to dump sector files (will attempt ' +
                    'creation)',
                type: 'string',
                default: './sectors-json/'
            });
        },
        async argv => {
            const landscape = new Landscape();

            try {
                await mkdirp(argv.output);
                await parseArchives(argv, landscape);

                for (const sector of landscape.getPopulatedSectors()) {
                    const json =
                        JSON.stringify(sector, null, argv.pretty ? '    ' : '');

                    await fs.writeFile(
                        path.join(argv.output,
                        `${sector.getEntryName()}.json`),
                        json);
                }
            } catch (e) {
                console.error(e);
                process.exitCode = 1;
            }
        })
    .command(
        'pack-json <directory>',
        'generate land and maps archives from directory of JSON files',
        yargs => {
            yargs.positional('directory', {
                description: 'directory of JSON sectors',
                type: 'string'
            });

            yargs.option('vers', {
                alias: 'v',
                description: 'version to label the archives',
                type: 'number',
                default: 64
            });

            yargs.option('output', {
                alias: 'o',
                description: 'directory to dump archive files',
                type: 'string',
                default: './sectors-jag/'
            });
        },
        async argv => {
            const writeArchive = async (archive, filename) => {
                if (archive.entries.size > 0) {
                    await fs.writeFile(path.join(argv.output, filename),
                        archive.toArchive(false));
                }
            };

            const landJag = new JagArchive();
            const landMem = new JagArchive();
            const mapsJag = new JagArchive();
            const mapsMem = new JagArchive();

            try {
                await mkdirp(argv.output);

                const jsonSectors = await fs.readdir(argv.directory);

                for (const filename of jsonSectors) {
                    const file = await fs.readFile(
                        path.join(argv.directory, filename));

                    const jsonSector = JSON.parse(file.toString());
                    const sector = new Sector(jsonSector);
                    const entry = sector.getEntryName();

                    const landArchive = sector.members ? landMem : landJag;
                    const mapsArchive = sector.members ? mapsMem : mapsJag;

                    if (sector.plane === 0 || sector.plane === 3) {
                        landArchive.putEntry(`${entry}.hei`,
                            Buffer.from(sector.toHei()));
                    }

                    mapsArchive.putEntry(`${entry}.dat`,
                        Buffer.from(sector.toDat()));

                    const loc = sector.toLoc();

                    if (loc) {
                        mapsArchive.putEntry(`${entry}.loc`,
                            Buffer.from(loc));
                    }
                }

                await writeArchive(landJag, `land${argv.vers}.jag`);
                await writeArchive(mapsJag, `maps${argv.vers}.jag`);
                await writeArchive(landMem, `land${argv.vers}.mem`);
                await writeArchive(mapsMem, `maps${argv.vers}.mem`);
            } catch (e) {
                console.error(e);
                process.exitCode = 1;
            }
        })
    .command(
        'print-sector <archives..>',
        'print coloured sector to terminal',
        yargs => {
            yargs.positional('archives', {
                description: 'landscape and map .jag and .mem archives',
                type: 'array'
            });

            yargs.option('x', {
                type: 'number',
                default: 50
            });

            yargs.option('y', {
                type: 'number',
                default: 50
            });

            yargs.option('plane', {
                alias: 'z',
                type: 'number',
                default: 0
            });

            yargs.option('colours', {
                alias: 'c',
                description: 'amount of colours to use, or -1 to autodetect',
                type: 'number',
                default: -1
            });
        },
        async argv => {
            const landscape = new Landscape();

            try {
                await parseArchives(argv, landscape);
                const sector = landscape.sectors[argv.x][argv.y][argv.plane];
                process.stdout.write(sector.toString(true, argv.colours) +
                    '\n');
            } catch (e) {
                process.exitCode = 1;
                console.error(e);
            }
        })
    .demandCommand()
    .argv;
