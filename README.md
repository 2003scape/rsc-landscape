# rsc-landscape
(de)serialize runescape classic landscape files. parse the original `land` and
`maps` archives into a tile objects, dump PNGs, make changes and encode +
compress them back to an original archive.

![](./doc/worldmap-final.png?raw=true)

*a world map generated with rsc-landscape*

![](./doc/map-comparison.gif?raw=true)
![](./doc/map-comparison2.gif?raw=true)
![](./doc/map-comparison3.gif?raw=true)

*comparison with jagex's world map*

the official world map generated by jagex contains less detail due to GIF
palette compression, as well as clipped object symbols between sectors. it's
also missing some areas compared to the latest revision (gertrude's house,
digsite, shilo village, etc.).

## install

    $ npm install @2003scape/rsc-landscape # -g for CLI program

## cli usage
```
rsc-landscape <command>

Commands:
  rsc-landscape generate-map <archives..>  generate world map png
  rsc-landscape dump-json <archives..>     dump JSON files of each sector
  rsc-landscape pack-json <directory>      generate land and maps archives from
                                           directory of JSON files
  rsc-landscape print-sector <archives..>  print coloured sector to terminal

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]
```

    $ rsc-landscape generate-map land* maps* -O object-locs.json \
        -p map-points.json -l map-labels.json # generate worldmap.png
    $ rsc-landscape generate-map land* maps* --plane 3 -o dungeons.png
    $ rsc-landscape print-sector land* maps* -x 50 -y 50 -z 0 -c 2 # lumbridge

## example
```javascript
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
```

## file formats
the runescape classic world is separated into sectors, each containing 48x48
(2304) tiles.
overworld and dungeon sectors contain both a `.hei` and `.dat` file, sectors
upstairs only contain `.dat` files, and any sector with object locations will
have a `.loc` file.
* `.hei` file in *land* archive which stores elevation and colour of tiles
* `.dat` file in *maps* archive which stores walls and object direction of tiles
* `.loc` file in *maps* archive which stores object IDs (used for the login
screen previews)

## api
### .terrainColours.integer
array of original, undarkened 256 colours client uses to colour tiles.

### .terrainColours.rgb
array of 256 map colours used for each tile, darkened by 50% and converted to
`rgb(r, g, b)` format.

### .tileOverlays
map of IDs to tile overlay information.

### tile = new Tile({ sector, x, y, ... })
create new sector tile. accepts all of the properties listed below.

### tile.colour
number from 0-255 corresponding to colour in `.terrainColours`.

### tile.elevation
number from 0-255 describing height of tile.

### tile.direction
number from 0-6 describing direction objects should face on tile.

### tile.overlay
overlay type index. corresponding names are stored in `.overlays`.

### tile.wall
object with following potential properties:

```javascript
{
    diagonal: {
        direction: '/' || '\\',
        overlay: overlay
    } || null,
    vertical: overlay || 0,
    horizontal: overlay || 0,
    roof: roofOverlay || 0
}
```

### tile.objectId
store object here for login screen previews.

### tile.populate()
read buffers from tile's sector and populate its properties.

### tile.getTerrainColour()
return base colour of this tile for maps.

### tile.getTileDef()
return  object describing attributes of tile's overlay (from
`./res/tile-overlays.json`):
```javascript
{
    name: 'road',
    blocked: false,
    bridge: false,
    indoors: false,
    antialias: true,
    colour: 'rgb(64, 64, 64)'
}
```

### tile.getGameCoords()
return `{ x, y }` game uses for this tile.

### sector = new Sector({ x, y, plane, members?, tiles? })
create new sector instance.

### sector.members
store in `.jag` or `.mem` file?

### sector.width
amount of tiles on x axis (48).

### sector.height
amount of tiles on y axis (48).

### sector.terrainHeight
### sector.terrainColour
### sector.wallsVertical
### sector.wallsHorizontal
### sector.wallsRoof
### sector.tileDecoration
### sector.tileDirection
Int8Array buffers populated from archive files with `sector.parse*` or from
sector's tile objects with `sector.populateBuffers()`. these buffers are
encoded + compressed into archives.

### sector.wallsDiagonal
Int32Array buffer, similar to above but 32-bit to store values > 255 (
potentially larger than 48000 if objects are stored).

### sector.tiles\[width\]\[height\]
2d array of tile objects. populate this field from the archive buffers with
`sector.populateTiles()`, or populate the future archive buffers with
`sector.populateBuffers()`.

### sector.parseHei(buffer)
populate `sector.terrainHeight` and `sector.terrainColour` from a `.hei` file.

### sector.parseDat(buffer)
populate `sector.walls*`, `sector.tileDecoration` and `sector.tileDirection`
from a `.dat` file.

### sector.parseLoc(buffer)
populate `sector.wallsDiagonal` with object IDs from a `.loc` file.

### sector.populateTiles()
populate `sector.tiles` with a 2d array (48x48) of tile objects based on buffers
we parsed from archived files.

### sector.populateBuffers()
populate future archive buffers (`sector.terrain*`, `sector.wall*`, etc.) with
`sector.tiles`.

### sector.getEntryName()
get the main portion of a landscape archive filename.

### sector.toHei()
get a `.hei` file buffer for this sector.

### sector.toDat()
get a `.dat` file buffer for this sector.

### sector.toLoc()
get a `.loc` file buffer for this sector (or null if no objects ID are stored).

### sector.toCanvas(options, [ north, east, south, west ])
render an individual sector to a canvas. the second argument is optional if you
want to antialias the edges properly using the neighbouring sectors (world map
generation does this automatically).

in node, you can turn this into a PNG
with [`.toBuffer()`](https://github.com/Automattic/node-canvas#canvastobuffer).

### sector.toString(terminal = false, colourLevel = -1)
if `terminal` is true, return a nethack-esque terminal rendering of the sector:

![](./doc/terminal.png?raw=true)

`colourLevel` describes the
[chalk level of colours to use](https://github.com/chalk/chalk#chalklevel).
`-1` automatically detects the maximum support.

...otherwise just return the name and size of the sector.

### landscape = new Landscape()
create new landscape (de)serializer instance.

### landscape.loadJag(landBuffer, mapBuffer)
### landscape.loadMem(landBuffer, mapBuffer)
prepare `.jag` and `.mem` buffers to be parsed. any sectors loaded with
`landscape.loadMem` will have `sector.members = true`.

### landscape.parseArchives()
populate `landscape.sectors` with loaded buffers.

### \*landscape.getPopulatedSectors()
return iterator of all the non-empty sectors.

### landscape.getSectorNeighbours(x, y, plane)
return neighbours to a sector position as `[north, east, south, west]`.

### landscape.getTileAtGameCoords(x, y)
get the tile at coordinates used in game.

### async landscape.toCanvas({ objects, points, labels })
create a world map image from all of the non-empty sectors.

* `objects` is an optional array of the following:
```javascript
{
    id: 1,
    position: [x, y]
}
```

its `x` and `y` are multipled by the tile size.

* `points` is an optional array of the following:
```javascript
{
    type: 'altar', // 'general-shop', 'dungeon' etc. see ./res/key/
    x, y
}
```

each point image is 15x15.

* `labels` is an optional array of the following:
```javascript
{
    text: 'label\nfor\nsomething',
    x, y,
    size: 10, // 8 is the smallest in use, while 14 is the largest
    align: 'center' || 'left',
    bold: true || undefined,
    colour: 'rgb(254, 165, 0)' || '#ff00ff' || undefined
}
```

## license
Copyright 2019  2003Scape Team

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the
Free Software Foundation, either version 3 of the License, or (at your option)
any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program. If not, see http://www.gnu.org/licenses/.
