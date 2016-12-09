(function () {
    if (typeof THREE != "undefined") {
        return;
    }

    let threejsElement = document.createElement("script");
    threejsElement.type = "text/javascript";
    threejsElement.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r82/three.js";
    document.head.appendChild(threejsElement);
})();

function Nubenstein() {
    // Setting up consts and other variables
    const nubElement = document.getElementById("nubenstein");
    if (!nubElement) {
        console.log("Couldn't find any element with an id of \"nubenstein\" in your DOM!");
        return;
    }

    const game = {};
    // curse you, semantics-of-the-"this"-context-in-javascript!
    {
        game.debug = true;
        game.width = (nubElement.getAttribute("width") ? nubElement.getAttribute("width") : 800);
        game.height = (nubElement.getAttribute("height") ? nubElement.getAttribute("height") : 600);
        game.renderer = new THREE.WebGLRenderer();
        game.scene = new THREE.Scene(); // camera within self scene is handled by Player class
        game.sceneHUD = new THREE.Scene(); // ortho camera within self is gonna be handled by HUD class
        game.states = {
            inGame: false
        };
        game.totalScore = 0;
        game.levelScore = 0;
        game.levelNumber = -1;
        game.levelSeeds = [];
        game.levelLegend = {
            solidMiddle: new LevelLegendElementCreator("M", 1),
            solidWall: new LevelLegendElementCreator("W", 16), // a wall has at least one side that is exposed to the open
            solidDoor: new LevelLegendElementCreator("D", 2), // orientation will be decided at scene-creation time
            solidObjective: new LevelLegendElementCreator("O", 16), // that elevator at the end of a level
            solidSpawn: new LevelLegendElementCreator("S", 16), // visual block
            openSpawn: new LevelLegendElementCreator("s", 1), // the place where the player will pop in
            openMiddle: new LevelLegendElementCreator(" ", 16), // 
            openDoor: new LevelLegendElementCreator("d", 2),
            openEnemySpawn: new LevelLegendElementCreator("e", 16),
            openPickup: new LevelLegendElementCreator("p", 16)
        };
        game.levelWidth = 48; // don't try and write to self you nincompoop
        game.levelHeight = 48; // don't write to self either you lobster
        game.levelGrid = [];
        game.levelGraphicalWallSize = 1.0;
        game.levelSpawnPos = new THREE.Vector3(0,0,0); // to be changed every new level
        game.collider = new Collider(); // "static" helper
        game.entities = new Entities();
        game.prng = new PRNG((nubElement.getAttribute("seed") ? nubElement.getAttribute("seed") : Math.random() * (10000 - 1) + 1));
        game.input = new Input();
        game.player = new Player();
    }

    // Main looping functions, logic and listener functions
    (function setup() {
        (function setupRenderer() {
            game.renderer.setPixelRatio(window.devicePixelRatio);
            game.renderer.setSize(game.width, game.height);
            game.renderer.setClearColor(0XDEADBE, 1);
            nubElement.appendChild(game.renderer.domElement);
        })();

        nextLevel();
    })();

    function nextLevel() {
        game.levelNumber++;
        game.levelSeeds[game.levelNumber] = game.prng.seed;
        createLevel();
    }

    function createLevel() {
        const newLevelGrid = [];

        (function createLevelGrid() {
            (function createRoomsAndHallways() {
                // Plonk some cavities, see if they overlap, if so, discard, if not, insert it into level
                const maxRoomCount = game.prng.nextInRangeRound(Math.min(game.levelWidth, game.levelHeight), Math.max(game.levelWidth, game.levelHeight)) * 0.8;
                const minRoomWH = 3;
                const maxRoomWH = 8; // exclusive
                const roomSpreadOutness = game.prng.nextInRangeRound(3, 8);
                const hallwaySize = 1; // "width" if its from your perspective

                let levelRooms = [];
                let levelHallways = [];

                for (let curRoomTry = 0; curRoomTry < maxRoomCount; curRoomTry++) {
                    // These maps are pretty small, so fancy spatial partitioning isn't really needed
                    const roomTry = new Box(game.prng.nextInRangeRound(game.levelWidth / 2 - minRoomWH, game.levelWidth / 2 + minRoomWH), game.prng.nextInRangeRound(game.levelWidth / 2 - minRoomWH, game.levelWidth / 2 + minRoomWH), game.prng.nextInRangeRound(minRoomWH, maxRoomWH), game.prng.nextInRangeRound(minRoomWH, maxRoomWH));
                    if (levelRooms.length === 0) {
                        levelRooms.push(roomTry);
                        continue;
                    }

                    // shift self cavity to north, south, west, east of the last inserted cavity
                    const lastRoomRef = levelRooms[levelRooms.length - 1];
                    roomTry.x = lastRoomRef.x;
                    roomTry.y = lastRoomRef.y;
                    let directionTry;
                    do {
                        directionTry = game.prng.nextInRangeFloor(0, 4);
                    }
                    while (directionTry === lastRoomRef.dirMoved);
                    roomTry.dirMoved = directionTry;

                    // positive x = >
                    // positive y = V
                    switch (directionTry) {
                        case 0:
                            placeNewRoomAndHallway(lastRoomRef, roomTry, "x", "y", true, "w", "h");
                            break;
                        case 1:
                            placeNewRoomAndHallway(lastRoomRef, roomTry, "x", "y", false, "w", "h");
                            break;
                        case 2:
                            placeNewRoomAndHallway(lastRoomRef, roomTry, "y", "x", true, "h", "w");
                            break;
                        case 3:
                            placeNewRoomAndHallway(lastRoomRef, roomTry, "y", "x", false, "h", "w");
                            break;
                        default:
                            console.log("apparently numbers don't work properly in self alternate universe " + directionTry);
                            break;
                    }
                }

                function placeNewRoomAndHallway(relToRoom, ourRoom, majorAxis /*string, pass it "x" for example*/, minorAxis /*the one to just offset it to give randomness*/, isPlus /*bool*/, majorLength, minorLength /*string of either W or H*/) {
                    let newMajorValue = game.prng.nextInRangeRound(ourRoom[majorLength], ourRoom[majorLength] * roomSpreadOutness + game.prng.nextInRangeRound(0, Math.min(game.levelWidth, game.levelHeight) * game.prng.nextInRange(0, 1)));
                    let newMinorValue = game.prng.nextInRangeRound(Math.ceil(-relToRoom[minorLength] / 4), Math.ceil(relToRoom[minorLength] / 2));

                    ourRoom[majorAxis] += (isPlus ? newMajorValue : -newMajorValue);
                    ourRoom[minorAxis] += newMinorValue;

                    ourRoom[majorAxis] = clamp(ourRoom[majorAxis], 1, (majorAxis === "x" ? game.levelWidth : game.levelHeight) - ourRoom[majorLength] - 1);
                    ourRoom[minorAxis] = clamp(ourRoom[minorAxis], 1, (minorAxis === "y" ? game.levelHeight : game.levelWidth) - ourRoom[minorLength] - 1);

                    // TODO: check if intersects
                    levelRooms.push(ourRoom);

                    // place hallway between em too! since we're here lol
                    if (!game.collider.doesBoxCollideBox(relToRoom, ourRoom)) {
                        const ourHallway = new Box();

                        ourHallway[majorAxis] = (!isPlus ? ourRoom[majorAxis] : ourRoom[majorAxis] - Math.abs(relToRoom[majorAxis] - ourRoom[majorAxis]));
                        ourHallway[minorAxis] = ourRoom[minorAxis] + Math.round(newMinorValue * 0.5);
                        ourHallway[majorLength] = Math.abs(relToRoom[majorAxis] - ourRoom[majorAxis]);
                        ourHallway[minorLength] = hallwaySize;

                        levelHallways.push(ourHallway);
                    }
                }

                (function fillOpenMiddlesAndSolidWallsAndDoors() {
                    for(room of levelRooms) {
                        for(let x = room.x; x < room.x + room.w; x++) {
                            for(let y = room.y; y < room.y + room.h; y++) {
                                newLevelGrid[x + game.levelWidth * y] = game.levelLegend.openMiddle.create(game.prng.nextInRangeFloor(0, game.levelLegend.openMiddle.variants));
                            }
                        }
                        surroundWithWalls(room);
                    }

                    let tempDoorSurrounderBlocks = []; // ensure that these have bricks, overwrite afterwards

                    for(hallway of levelHallways) {
                        surroundWithWalls(hallway); // has to be done before, cause door placement checks if left and right have walls
                        for(let x = hallway.x; x < hallway.x + hallway.w; x++) {
                            for(let y = hallway.y; y < hallway.y + hallway.h; y++) {
                                newLevelGrid[x + game.levelWidth * y] = game.levelLegend.openMiddle.create(game.prng.nextInRangeFloor(0, game.levelLegend.openMiddle.variants));
                                
                                if((x > 0 || x < game.levelWidth-1 || y > 0 || y < game.levelHeight-1) && ((hallway.w === hallwaySize && (y === hallway.y || y === hallway.y + hallway.h-1)) || (hallway.h === hallwaySize && (x === hallway.x || x === hallway.x + hallway.w-1)))) {
                                    if(hallway.w === hallwaySize && (newLevelGrid[(x-1) + game.levelWidth * y].icon === game.levelLegend.solidWall.icon && newLevelGrid[(x+1) + game.levelWidth * y].icon === game.levelLegend.solidWall.icon) && (newLevelGrid[x + game.levelWidth * (y-1)].icon !== game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * (y+1)].icon !== game.levelLegend.solidWall.icon)) {
                                        addDoorAndSurroundIt();
                                    }
                                    else if(hallway.h === hallwaySize && (newLevelGrid[x + game.levelWidth * (y-1)].icon === game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * (y+1)].icon === game.levelLegend.solidWall.icon) && (newLevelGrid[(x-1) + game.levelWidth * y].icon !== game.levelLegend.solidWall.icon && newLevelGrid[(x+1) + game.levelWidth * y].icon !== game.levelLegend.solidWall.icon)) {
                                        addDoorAndSurroundIt();
                                    }

                                    // nice function naming...
                                    function addDoorAndSurroundIt() {
                                        newLevelGrid[x + game.levelWidth * y] = game.levelLegend.solidDoor.create(game.prng.nextInRangeFloor(0, game.levelLegend.solidDoor.variants));
                                        tempDoorSurrounderBlocks[x + game.levelWidth * y] = newLevelGrid[x + game.levelWidth * y];
                                        tempDoorSurrounderBlocks[(x+1) + game.levelWidth * y] = newLevelGrid[(x+1) + game.levelWidth * y];
                                        tempDoorSurrounderBlocks[(x-1) + game.levelWidth * y] = newLevelGrid[(x-1) + game.levelWidth * y];
                                        tempDoorSurrounderBlocks[x + game.levelWidth * (y+1)] = newLevelGrid[x + game.levelWidth * (y+1)];
                                        tempDoorSurrounderBlocks[x + game.levelWidth * (y-1)] = newLevelGrid[x + game.levelWidth * (y-1)];
                                    }
                                }
                            }
                        }
                    }

                    // give each door a clear pair of blocks on each side
                    for(let x = 0; x < game.levelWidth; x++) {
                        for(let y = 0; y < game.levelHeight; y++) {
                            if(newLevelGrid[x + game.levelWidth * y] && newLevelGrid[x + game.levelWidth * y].icon === game.levelLegend.solidDoor.icon) {
                                newLevelGrid[x + game.levelWidth * y] = tempDoorSurrounderBlocks[x + game.levelWidth * y];
                                newLevelGrid[(x+1) + game.levelWidth * y] = tempDoorSurrounderBlocks[(x+1) + game.levelWidth * y];
                                newLevelGrid[(x-1) + game.levelWidth * y] = tempDoorSurrounderBlocks[(x-1) + game.levelWidth * y];
                                newLevelGrid[x + game.levelWidth * (y+1)] = tempDoorSurrounderBlocks[x + game.levelWidth * (y+1)];
                                newLevelGrid[x + game.levelWidth * (y-1)] = tempDoorSurrounderBlocks[x + game.levelWidth * (y-1)];
                            }
                        }
                    }

                    function surroundWithWalls(box) {
                        let wallVariant = game.prng.nextInRangeFloor(0, game.levelLegend.solidWall.variants);
                        for(let x = box.x-1; x < box.x + box.w+1; x++) {
                            for(let y = box.y-1; y < box.y + box.h+1; y++) {
                                if((x >= 0 && x < game.levelWidth) && (y >= 0 && y < game.levelHeight) && !newLevelGrid[x + game.levelWidth * y]) {
                                    newLevelGrid[x + game.levelWidth * y] = game.levelLegend.solidWall.create(wallVariant);
                                }
                            }
                        }
                    }

                    for(let x = 0; x < game.levelWidth; x++) {
                        for(let y = 0; y < game.levelHeight; y++) {
                            if(x === 0 || x === game.levelWidth-1 || y === 0 || y === game.levelHeight-1) {
                                newLevelGrid[x + game.levelWidth * y] = game.levelLegend.solidWall.create(0);
                            }
                        }
                    }
                })();
            })();

            (function createSolidMiddleFiller() {
                for (let i = 0; i < game.levelWidth * game.levelHeight; i++) {
                    if (!newLevelGrid[i]) {
                        newLevelGrid[i] = game.levelLegend.solidMiddle.create(0);
                    }
                }
            })();

            (function createSpawnObjective() {
                // TODO
            })();

            function printGrid(aspect) {
                // little test to print out how our cavities are positioned atm
                let strings = [];
                for (let i = 0; i < game.levelHeight; i++) {
                    strings[i] = "";
                    for (let x = 0; x < game.levelWidth; x++) {
                        strings[i] += newLevelGrid[x + game.levelWidth * i][aspect];
                    }
                    strings[i] += i.toString();
                    console.log(strings[i]);
                }
                let legendString = "";
                for (legendElement in game.levelLegend) {
                    // TODO: it looks more like a square on chrome's console when i do it twice
                    legendString += legendElement + "'s icon: " + game.levelLegend[legendElement].icon + "'  ";
                }
                console.log("Legend:");
                console.log(legendString);
            }
            printGrid("icon");
            printGrid("variant");
        })();

        (function createLevelScene() {
            // ooh, actual "3d" stuff
            (function clearScene() {
                for (let i = game.scene.children.length - 1; i >= 0; i--) {
                    console.log("The scene contains:");
                    console.log(game.scene.children[i]);
                    // removes everything, including camera!
                    // you could do an if statement here to see if its the camera object
                    if (game.scene.children[i] !== game.player.camera) {
                        //scene.children.remove(scene.children[i]);
                    }
                }
            })();

            function createTextures() {
                const texSize = 64;
                const maxColourDiff = 16; // colour values can go +- up to self amount

                // I really don't know why I'm using RGBA for smack-dab opaque bricks...
                function ColourRGBA(r, g, b, a) {
                    const self = this;
                    self.r = r;
                    self.g = g;
                    self.b = b;
                    self.a = a; // 0 to 255, surprisingly, and not from 0-1 since its - well an array of uints
                }

                function createWallTextures() {
                    let wallTexture;
                    let wallData = new Uint8Array(texSize * texSize * 4 * game.levelLegend.solidWall.variants); // 4 for rgba components

                    for (let variant = 0; variant < game.levelLegend.solidWall.variants * texSize; variant += texSize) {
                        // TODO: make colour themes prettier
                        const colourTheme = new ColourRGBA(game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 8), game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 8), game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 8), 255);

                        const brickWidth = game.prng.nextInRangeRound(3, 8) * 2 - 1;
                        const brickHeight = 4;
                        const fillerSize = 1;
                        const fillerColour = new ColourRGBA(clamp(colourTheme.r - maxColourDiff * 4, maxColourDiff * 2, 255), clamp(colourTheme.g - maxColourDiff * 4, maxColourDiff * 2, 255), clamp(colourTheme.b - maxColourDiff * 4, maxColourDiff * 2, 255), 255);

                        const bricks = [];

                        let startMidway = false;
                        for (let brickY = 0; brickY < texSize; brickY += (brickHeight + fillerSize)) {
                            for (let brickX = 0; brickX < texSize; brickX += (brickWidth + fillerSize)) {
                                bricks.push(new Box(
                                    (brickX === 0 ? brickX : (startMidway ? brickX - Math.floor((brickWidth + fillerSize) / 2) : brickX)),
                                    brickY,
                                    (startMidway ? (brickX === 0 ? Math.floor(brickWidth / 2) : (brickX + brickWidth + fillerSize < texSize ? brickWidth : (texSize - brickX) + Math.ceil((brickWidth + fillerSize) / 2))) : (brickX + brickWidth + fillerSize < texSize ? brickWidth : texSize - (brickX + fillerSize))),
                                    brickHeight
                                ));

                                bricks[bricks.length - 1].colour = new ColourRGBA(game.prng.nextInRangeRound(colourTheme.r - maxColourDiff, colourTheme.r + maxColourDiff), game.prng.nextInRangeRound(colourTheme.g - maxColourDiff, colourTheme.g + maxColourDiff), game.prng.nextInRangeRound(colourTheme.b - maxColourDiff, colourTheme.b - maxColourDiff), colourTheme.a);
                            }
                            startMidway = !startMidway;
                        }

                        for (brick of bricks) {
                            for (let x = brick.x; x < brick.x + brick.w; x++) {
                                for (let y = brick.y + variant; y < brick.y + brick.h + variant; y++) {
                                    wallData[4 * (x + texSize * y) + 0] = brick.colour.r + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 1] = brick.colour.g + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 2] = brick.colour.b + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 3] = brick.colour.a;
                                }
                            }
                        }

                        for (let x = 0; x < texSize; x++) {
                            for (let y = variant; y < texSize + variant; y++) {
                                if (!wallData[4 * (x + texSize * y) + 0] || !wallData[4 * (x + texSize * y) + 1] || !wallData[4 * (x + texSize * y) + 2] || !wallData[4 * (x + texSize * y) + 3]) {
                                    wallData[4 * (x + texSize * y) + 0] = fillerColour.r + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 1] = fillerColour.g + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 2] = fillerColour.b + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 3] = fillerColour.a;
                                }
                            }
                        }
                    }
                    wallTexture = new THREE.DataTexture(wallData, texSize, texSize * game.levelLegend.solidWall.variants, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.UVMapping);
                    wallTexture.needsUpdate = true;
                    return wallTexture;
                }

                // Textures are as follows:
                // one texture per block type, and each block type will likely have variants. textures are stacked downward
                // So for UV coords, divide the y component (1.0) by the variants and multiply by that level cell's variant
                return {
                    walls: createWallTextures()
                };
            }
            const textures = createTextures();

            (function texTest() {
                let geometry = new THREE.PlaneBufferGeometry(1, 16);

                let mat = new THREE.MeshBasicMaterial({ map: textures.walls, side: THREE.DoubleSide, transparent: true });
                mat.needsUpdate = true;
                var mesh = new THREE.Mesh(geometry, mat);
                mesh.name = "texTest";
                game.scene.add(mesh);
                console.log(geometry);

                let textSprite = createTextSprite("hello? is it me you're looking for?");

                game.scene.add(textSprite);

            })();

            (function createLevelGeometry() {
                // custom vbos here we go buddy https://threejs.org/docs/#Reference/Core/BufferGeometry
                // so doors (which have moving geometry) will not be part of self whole thing
                // https://scottbyrns.atlassian.net/wiki/display/THREEJS/Working+with+BufferGeometry
                const levelGeometry = new THREE.BufferGeometry();

                const posAttribSize = 3;
                const normAttribSize = 3;
                const uvAttribSize = 2;

                // each cell can has 4 possible sides (ooh, a pillar block technically)
                let positions = [];
                let normals = [];
                let uvs = [];
                let indices = [];

                // TODO: run through map grid, push back geometry into each corresponding type, then make meshes outta each with each corresponding texture/mat
                for (let x = 0; x < game.levelWidth; x++) {
                    for (let y = 0; y < game.levelHeight; y++) {
                        // graphically, treat y as the z axis
                        // for every block in self level grid, let's see how we can shove self into a mesh
                        switch (newLevelGrid[x + game.levelWidth * y].icon) {
                            case game.levelLegend.solidWall.icon:
                                (function pushWallGeometry() {
                                    // check each side, north/south/west/east if its open middle
                                    if (x !== game.levelWidth - 1 && newLevelGrid[(x + 1) + game.levelWidth * y].icon !== game.levelLegend.solidMiddle.icon) {
                                        positions = positions.concat([
                                            0 + x + game.levelGraphicalWallSize, game.levelGraphicalWallSize, 0 + y,
                                            0 + x + game.levelGraphicalWallSize, game.levelGraphicalWallSize, game.levelGraphicalWallSize + y,
                                            0 + x + game.levelGraphicalWallSize, 0, 0 + y,
                                            0 + x + game.levelGraphicalWallSize, 0, game.levelGraphicalWallSize + y
                                        ]);
                                        normals = normals.concat([
                                            1, 0, 0,
                                            1, 0, 0,
                                            1, 0, 0,
                                            1, 0, 0
                                        ]);
                                        concatUVsIndices();
                                    }
                                    if (x !== 0 && newLevelGrid[(x - 1) + game.levelWidth * y].icon !== game.levelLegend.solidMiddle.icon) {
                                        positions = positions.concat([
                                            0 + x, game.levelGraphicalWallSize, 0 + y,
                                            0 + x, game.levelGraphicalWallSize, game.levelGraphicalWallSize + y,
                                            0 + x, 0, 0 + y,
                                            0 + x, 0, game.levelGraphicalWallSize + y
                                        ]);
                                        normals = normals.concat([
                                            -1, 0, 0,
                                            -1, 0, 0,
                                            -1, 0, 0,
                                            -1, 0, 0
                                        ]);
                                        concatUVsIndices();
                                    }
                                    if (y !== game.levelHeight - 1 && newLevelGrid[x + game.levelWidth * (y + 1)].icon !== game.levelLegend.solidMiddle.icon) {
                                        positions = positions.concat([
                                            game.levelGraphicalWallSize + x, game.levelGraphicalWallSize, 0 + y + game.levelGraphicalWallSize,
                                            0 + x, game.levelGraphicalWallSize, 0 + y + game.levelGraphicalWallSize,
                                            game.levelGraphicalWallSize + x, 0, 0 + y + game.levelGraphicalWallSize,
                                            0 + x, 0, 0 + y + game.levelGraphicalWallSize
                                        ]);
                                        normals = normals.concat([
                                            0, 0, 1,
                                            0, 0, 1,
                                            0, 0, 1,
                                            0, 0, 1
                                        ]);
                                        concatUVsIndices();
                                    }
                                    if (y !== 0 && newLevelGrid[x + game.levelWidth * (y - 1)].icon !== game.levelLegend.solidMiddle.icon) {
                                        positions = positions.concat([
                                            game.levelGraphicalWallSize + x, game.levelGraphicalWallSize, 0 + y,
                                            0 + x, game.levelGraphicalWallSize, 0 + y,
                                            game.levelGraphicalWallSize + x, 0, 0 + y,
                                            0 + x, 0, 0 + y
                                        ]);
                                        normals = normals.concat([
                                            0, 0, -1,
                                            0, 0, -1,
                                            0, 0, -1,
                                            0, 0, -1
                                        ]);
                                        concatUVsIndices();
                                    }

                                    function concatUVsIndices() {
                                        // should be called after you concatenate your positions
                                        uvs = uvs.concat([
                                            0, (1 / game.levelLegend.solidWall.variants) * newLevelGrid[x + game.levelWidth * y].variant,
                                            1, (1 / game.levelLegend.solidWall.variants) * newLevelGrid[x + game.levelWidth * y].variant,
                                            0, (1 / (game.levelLegend.solidWall.variants) * (newLevelGrid[x + game.levelWidth * y].variant + 1)),
                                            1, (1 / (game.levelLegend.solidWall.variants) * (newLevelGrid[x + game.levelWidth * y].variant + 1))
                                        ]);
                                        const indexOffset = (positions.length / posAttribSize) - 4; // 4 vertices
                                        indices = indices.concat([
                                            indexOffset + 0,
                                            indexOffset + 2,
                                            indexOffset + 1,
                                            indexOffset + 2,
                                            indexOffset + 3,
                                            indexOffset + 1
                                        ]);
                                    }
                                })();
                                break;
                            default:
                                break;
                        }
                    }
                }

                levelGeometry.addAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), posAttribSize));
                levelGeometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), normAttribSize));
                levelGeometry.addAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), uvAttribSize));
                levelGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

                // TODO: idk if i did the culling order wrong, probably did lol, so now i have to succumb to double sided rendering
                let mat = new THREE.MeshBasicMaterial({ map: textures.walls, side: THREE.DoubleSide, transparent: true });
                mat.needsUpdate = true;
                var mesh = new THREE.Mesh(levelGeometry, mat);
                game.scene.add(mesh);
                console.log(mesh);
                console.log(game.scene);

            })();

            // TODO: remember to give your eventual meshes a name!

        })();

        game.levelGrid = newLevelGrid.slice();
    }

    function createTextSprite(message, parameters) {
        if (parameters === undefined) parameters = {};
        let fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "Arial";
        let fontsize = parameters.hasOwnProperty("fontsize") ? parameters["fontsize"] : 18;
        let borderThickness = parameters.hasOwnProperty("borderThickness") ? parameters["borderThickness"] : 4;
        let borderColor = parameters.hasOwnProperty("borderColor") ? parameters["borderColor"] : { r: 0, g: 0, b: 0, a: 1.0 };
        let backgroundColor = parameters.hasOwnProperty("backgroundColor") ? parameters["backgroundColor"] : { r: 255, g: 255, b: 255, a: 1.0 };
        let textColor = parameters.hasOwnProperty("textColor") ? parameters["textColor"] : { r: 0, g: 0, b: 0, a: 1.0 };

        let canvas = document.createElement('canvas');
        let context = canvas.getContext('2d');
        context.font = fontsize + "px " + fontface;
        let metrics = context.measureText(message);
        let textWidth = metrics.width;

        context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
        context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";

        context.lineWidth = borderThickness;

        context.fillStyle = "rgba(" + textColor.r + ", " + textColor.g + ", " + textColor.b + ", 1.0)";
        context.fillText(message, borderThickness, fontsize + borderThickness);

        let texture = new THREE.Texture(canvas, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
        texture.needsUpdate = true;

        let spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        let sprite = new THREE.Sprite(spriteMaterial);
        //sprite.scale.set(0.5 * fontsize, 0.25 * fontsize, 0.75 * fontsize);
        return sprite;
    }

    function clamp(num, min, max) {
        return num <= min ? min : num >= max ? max : num;
    }
    
    function Box(x, y, w, h) {
        const self = this;
        self.x = x;
        self.y = y;
        self.w = w;
        self.h = h;
    }

    function Circle(x, y, r) {
        const self = this;
        self.x = x;
        self.y = y;
        self.r = r;
    }

    function LevelLegendElementCreator(icon, variants) {
        const self = this;
        self.icon = icon; // letter from "game.levelLegend"
        self.variants = variants; // numeric variant total if you wanna spiff things up

        // create an instance. self is the function you should be using
        // variant should be 0 indexed, so 1 less than the total variants
        self.create = function (variant) {
            return {
                icon: self.icon,
                variant: (variant < variants && variant >= 0 ? variant : 0)
            };
        };
    }

    function PRNG(initialSeed) {
        const self = this;
        self.seed = (initialSeed ? initialSeed : 420);

        self.next = function () {
            let x = Math.sin(self.seed++) * 10000;
            return x - Math.floor(x);
        };

        self.nextInRange = function (min, max) {
            return self.next() * (max - min) + min;
        };

        self.nextInRangeFloor = function (min, max) {
            return Math.floor(self.nextInRange(min, max));
        };

        self.nextInRangeRound = function (min, max) {
            return Math.round(self.nextInRange(min, max));
        };
    }

    function Input() {
        const self = this;

        self.config = {
            walkForward: "w",
            walkBackward: "s",
            walkLeft: "a",
            walkRight: "d",
            lookSensitivity: 0.004
        };

        const keysHeld = [];
        const buttonsHeld = [];
        const mouseMove = {
            x: 0,
            y: 0
        };

        let pointerLocked = false;

        const time = {
            clock: new THREE.Clock(),
            delta: 0,
            total: 0
        };

        (function init() {
            const element = game.renderer.domElement;

            element.setAttribute("id", "nubensteinCanvas");
            element.setAttribute("tabindex", "0");
            element.focus();

            element.addEventListener("mousedown", function (event) {
                buttonsHeld[event.button] = true;
            });

            element.addEventListener("mouseup", function (event) {
                buttonsHeld[event.button] = false;
            });

            element.addEventListener("keydown", function (event) {
                keysHeld[event.key] = true;
            });

            element.addEventListener("keyup", function (event) {
                keysHeld[event.key] = false;
            });

            element.addEventListener("focus", function (event) {
                element.requestPointerLock = element.requestPointerLock || element.mozRequestPointerLock || element.webkitRequestPointerLock;
                element.requestPointerLock();

                element.addEventListener("mousemove", mousemoveCallback);
            });

            element.addEventListener("blur", function (event) {
                document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
                document.exitPointerLock();

                element.removeEventListener("mousemove", mousemoveCallback);
            });

            (function setupPointerLockChange() {
                document.addEventListener('pointerlockchange', changeCallback, false);
                document.addEventListener('mozpointerlockchange', changeCallback, false);
                document.addEventListener('webkitpointerlockchange', changeCallback, false);

                function changeCallback() {
                    if (document.pointerLockElement === element ||
                        document.mozPointerLockElement === element ||
                        document.webkitPointerLockElement === element) {
                        pointerLocked = true;
                    }
                    else {
                        pointerLocked = false;
                    }
                }
            })();

            function mousemoveCallback(event) {
                mouseMove.x = event.movementX || 0;
                mouseMove.y = event.movementY || 0;
            }
        })();

        self.isButtonHeld = function (key) {
            return buttonsHeld[key];
        };

        self.isKeyHeld = function (key) {
            return keysHeld[key];
        };

        self.mouseMoved = function () {
            return mouseMove;
        };

        self.isPointerLocked = function () {
            return pointerLocked;
        };

        self.getTimeDelta = function () {
            return time.delta;
        };

        self.getTimeTotal = function () {
            // calling getElapsedTime just before getDelta() can invalidate getDelta, as it uses getDelta lol, making it return 0 often times
            // https://github.com/mrdoob/three.js/issues/5696
            return time.total;
        };

        self.tick = function () {
            time.delta = time.clock.getDelta();
            time.total = time.clock.getElapsedTime();

            mouseMove.x = 0;
            mouseMove.y = 0;
        };
    }

    function Collider() {
        // you see comrade, when we of having badass name like "large hadron collider", enemy of thinks that we are stronk, but in real life, we are indeed weak like twigs
        // helper class. i could use a const collider = ()(); for a "static" class, but heck, i dont want to put self definition at the front of the file
        // this class; for now, just does collision in 2d :( so the 2d x and y becomes the 3d x and z
        const self = this;

        self.doesBoxCollideBox = function (boxA, boxB) {
            return (Math.abs(boxA.x - boxB.x) * 2 <= (boxA.w + boxB.w)) && (Math.abs(boxA.y - boxB.y) * 2 <= (boxA.h + boxB.h));
        }

        self.doesCircleCollideCircle = function(circleA, circleB) {
            let dist = Math.sqrt(
                (circleA.x - circleB.x) * (circleA.x - circleB.x) +
                (circleA.y - circleB.y) * (circleA.y - circleB.y)
            );

            return dist < (circleA.r + circleB.r);
        };

        self.doesCircleCollideBox = function (circle, box /*should be graphical position of box you wanna check collision with*/) {
            // http://stackoverflow.com/questions/401847/circle-rectangle-collision-detection-intersection
            let cirDist = {
                x: Math.abs(circle.x - box.x),
                y: Math.abs(circle.y - box.y)
            };

            if(cirDist.x > (box.w/2 + circle.r)) {
                console.log("collision false 1");
                return false;
            }
            if(cirDist.y > (box.h/2 + circle.r)) {
                console.log("collision false 2");
                return false;
            }
            if(cirDist.x <= (box.w/2)) {
                console.log("collision true 1");
                return true;
            }
            if(cirDist.y <= (box.h/2)) {
                console.log("collision true 2");
                return true;
            }
            console.log("collision final");
            let cornerDistSq = Math.pow(cirDist.x - box.w/2,2) + Math.pow(cirDist.y - box.h/2,2);
            return (cornerDistSqrt <= Math.pow(circle.r,2));
        };
    }

    function Entities() {
        // a singleton and factory class
        const self = this;

        let entityCount = 0;

        const entities = {};

        self.entityEntityCollision = false; // would be pretty performance intensive

        // elements that will need collision checking
        self.solidLevelElements = [
            game.levelLegend.solidWall,
            game.levelLegend.solidSpawn,
            game.levelLegend.solidObjective,
            game.levelLegend.solidMiddle,
            game.levelLegend.solidDoor
        ];

        (function init() {

        })();

        self.create = function(params) {
            let entity = new Entity(params);
            
            entities[entity.name] = entity;
            game.scene.add(entities[entity.name].renderable);
            return entities[entity.name];
        };

        self.getByName = function(name) {
            return entities[name];
        };

        function Entity(params) {
            const self = this; // nested this context works! yay

            // visual things pertaining to the renderable will be stored in the THREE Object3D, since it already has the stuff we need. extra aspects are added on and wrapped in this class
            self.name = params.hasOwnProperty("name") ? params["name"] : "ent-" + (++entityCount).toString();
            self.id = params.hasOwnProperty("id") ? params["id"] : entityCount;
            self.health = params.hasOwnProperty("health") ? params["health"] : 100;
            self.renderable = params.hasOwnProperty("renderable") ? params["renderable"] : createTextSprite(self.name);
            self.hitRadius = params.hasOwnProperty("hitRadius") ? params["hitRadius"] : 0.1; // circular collision detection
            self.heightPlane = params.hasOwnProperty("heightPlane") ? params["heightPlane"] : 0.5; // since our collision is just 2D, where should we lock the Y position of our renderable?

            self.renderable.position = params.hasOwnProperty("spawnPos") ? params["spawnPos"] : game.levelSpawnPos;
            if (params.hasOwnProperty("spawnLookAt")) {
                self.renderable.lookAt(params["spawnLookAt"]);
            }

            self.move = function(vec, collide, lockHeightPlane) {
                if(collide) {
                    let curMat = self.renderable.matrix.clone();
                    curMat.makeTranslation(vec.x, vec.y, vec.z);
                    let newPos = new THREE.Vector3();
                    curMat.decompose(newPos, new THREE.Quaternion(), new THREE.Matrix4());

                    let curCellX = Math.floor(self.renderable.position.x)/game.levelGraphicalWallSize;
                    let curCellY = Math.floor(self.renderable.position.z)/game.levelGraphicalWallSize;

                    let solidBoxes = [];
                    for(let x = -1; x <= 1; x++) {
                        for(let y = -1; y <= 1; y++) {
                            if(x === 0 && y === 0) {
                                break;
                            }
                            if(game.levelGrid[(curCellX + x) + game.levelWidth * (curCellY + y)]) {
                                for (possibleElement of game.entities.solidLevelElements) {
                                    if(game.levelGrid[(curCellX + x) + game.levelWidth * (curCellY + y)].icon === possibleElement.icon) {
                                        solidBoxes.push(new Box((curCellX + x)*game.levelGraphicalWallSize, (curCellY + y)*game.levelGraphicalWallSize, game.levelGraphicalWallSize, game.levelGraphicalWallSize));
                                    }
                                }
                            }
                        }
                    }
                    for(box of solidBoxes) {
                        console.log(solidBoxes[solidBoxes.length-1]);
                        if(!game.collider.doesCircleCollideBox(new Circle(newPos.x, newPos.z, self.hitRadius), box)) {
                            // TODO: pretty messed up here lol
                            console.log("collided!");
                            return;
                        }
                    }
                    self.move(vec, false, lockHeightPlane);
                    return;
                }
                else {
                    self.renderable.translateX(vec.x);
                    self.renderable.translateY(vec.y);
                    self.renderable.translateZ(vec.z);

                    if(lockHeightPlane) {
                        self.renderable.position.y = self.heightPlane;
                    }
                }
            };

            self.look = function(axis, rads, lock /*lock to world axis, good for yaw-ing with a camera*/) {
                if(lock) {
                    let rotMatWorld = new THREE.Matrix4();
                    rotMatWorld.makeRotationAxis(axis.normalize(), rads);
                    rotMatWorld.multiply(self.renderable.matrix);
                    self.renderable.matrix = rotMatWorld;
                    self.renderable.rotation.setFromRotationMatrix(self.renderable.matrix);
                }
                else {
                    self.renderable.rotateOnAxis(axis, rads);
                }
            };
        }
    }

    function Player() {
        const self = this;

        // don't write to self externally, just a simple getter. set by using the func'
        self.fov = 75.0;
        self.camera = game.entities.create({
            name: "player-camera",
            renderable: new THREE.PerspectiveCamera(self.fov, game.width / game.height, 0.01, 1000),
            spawnPos: new THREE.Vector3(0,0,-1) // TODO: doesnt work :((
        });

        self.camera.renderable.position.z = 1;

        self.setFov = function (newFov) {
            self.fov = (typeof newFov === "number" ? newFov : self.fov);
            self.camera.renderable.fov = self.fov;
            self.camera.renderable.updateProjectionMatrix();
            return newFov;
        };

        self.tick = function () {
            (function doMovement() {
                if (!game.input.isPointerLocked()) {
                    return;
                }

                // TODO: use collider class to handle translation collisions with the levelGrid
                if (game.input.isKeyHeld(game.input.config.walkForward)) {
                    self.camera.move(new THREE.Vector3(0,0,-10*game.input.getTimeDelta()), !game.debug, !game.debug);
                }
                if (game.input.isKeyHeld(game.input.config.walkBackward)) {
                    self.camera.move(new THREE.Vector3(0,0,10*game.input.getTimeDelta()), !game.debug, !game.debug);
                }
                if (game.input.isKeyHeld(game.input.config.walkLeft)) {
                    self.camera.move(new THREE.Vector3(-10*game.input.getTimeDelta(),0,0), !game.debug, !game.debug);
                }
                if (game.input.isKeyHeld(game.input.config.walkRight)) {
                    self.camera.move(new THREE.Vector3(10*game.input.getTimeDelta(),0,0), !game.debug, !game.debug);
                }

                if (game.input.isKeyHeld("i")) {
                    console.log(self.camera.renderable.rotation.x);
                    console.log(self.camera.renderable.position);
                    console.log(self.camera.renderable.roataion);
                    console.log(typeof self.camera);
                    console.log(game.input.getTimeDelta());
                    console.log("Debug state: " + game.debug);
                }

                if(game.input.isKeyHeld("o")) {
                    game.debug = !game.debug;
                }

                self.camera.look(new THREE.Vector3(0.0, 1.0, 0.0), -game.input.mouseMoved().x * game.input.config.lookSensitivity, true);
                self.camera.look(new THREE.Vector3(1.0, 0, 0.0), -game.input.mouseMoved().y * game.input.config.lookSensitivity, false);
            })();
        };
    }

    (function render() {
        requestAnimationFrame(render);

        game.player.tick();

        // TODO: just a test
        game.scene.getObjectByName("texTest").rotation.y += 0.01;

        game.input.tick(); // self clears the mouse moved state to 0, so it has to be done once all other objects have queried its stuff

        game.renderer.render(game.scene, game.player.camera.renderable);
    })();
};

window.onload = Nubenstein;