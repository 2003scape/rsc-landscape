const fs = require('fs');
const { Landscape } = require('./src');

const landscape = new Landscape();

landscape.loadJag(fs.readFileSync('./land63.jag'),
    fs.readFileSync('./maps63.jag'));
landscape.loadMem(fs.readFileSync('./land63.mem'),
    fs.readFileSync('./maps63.mem'));

landscape.parseArchives();

const lumbridge = landscape.sectors[50][50][0];
process.stdout.write(lumbridge.toString(true));
fs.writeFileSync(`./sector-lumbridge.png`, lumbridge.toCanvas().toBuffer());

(async () => {
    fs.writeFileSync(`./worldmap.png`, (await landscape.toCanvas({
        points: require('./map-points.json'),
        objects: require('./object-locs.json'),
        labels: require('./map-labels.json')
    })).toBuffer());
})();
