const fs = require('fs');
const { Landscape } = require('./src');

const landscape = new Landscape();

landscape.loadJag(fs.readFileSync('./land63.jag'),
    fs.readFileSync('./maps63.jag'));
landscape.loadMem(fs.readFileSync('./land63.mem'),
    fs.readFileSync('./maps63.mem'));

landscape.parseArchives();

const lumbridge = landscape.sectors[50][50][0];

const tile = lumbridge.tiles[0][0];
console.log(tile.colour, tile.getGameCoords());

const tile2 = landscape.getTileAtGameCoords(126, 1468);
console.log(tile2.getTileDef());

process.stdout.write(lumbridge.toString(true));
fs.writeFileSync(`./sector-lumbridge.png`, lumbridge.toCanvas().toBuffer());

(async () => {
    fs.writeFileSync('./worldmap.png', (await landscape.toCanvas({
        points: require('./map-points.json'),
        objects: require('./object-locs.json'),
        labels: require('./map-labels.json')
    })).toBuffer());
})();
