(function () {
    if (typeof THREE != "undefined") {
        return;
    }

    let threejsElement = document.createElement("script");
    threejsElement.type = "text/javascript";
    threejsElement.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r82/three.js";
    document.head.appendChild(threejsElement);
})();

function nubenstein() {
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
        game.scene = new THREE.Scene(), // camera within this scene is handled by Player class
            game.sceneHUD = new THREE.Scene(), // ortho camera within this is gonna be handled by HUD class
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
            solidDoor: new LevelLegendElementCreator("D", 2), // 2 variants, even numbers (eg 0, 2) will be horizontal (slides open along x) and odds will be vertical variants
            solidObjective: new LevelLegendElementCreator("O", 16), // that elevator at the end of a level
            solidSpawn: new LevelLegendElementCreator("S", 16), // visual block
            openSpawn: new LevelLegendElementCreator("s", 1), // the place where the player will pop in
            openMiddle: new LevelLegendElementCreator(" ", 16), // 
            openDoor: new LevelLegendElementCreator("d", 2),
            openHallway: new LevelLegendElementCreator("'", 1),
            openEnemySpawn: new LevelLegendElementCreator("e", 16),
            openPickup: new LevelLegendElementCreator("p", 16)
        };
        game.levelWidth = 32, // don't try and write to this you nincompoop
            game.levelHeight = 32, // don't write to this either you lobster
            game.levelGrid = [];
        game.transformer = new Transformer(); // "static" helper
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

        function Box(x, y, w, h) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
            // this.dirMoved; // refer to below's switch case. relative to last square in list. the first one in the array should be undefined
        }

        (function createRoomsAndHallways() {
            // Plonk some cavities, see if they overlap, if so, discard, if not, insert it into level
            const maxRoomCount = game.prng.nextInRangeRound(Math.min(game.levelWidth, game.levelHeight), Math.max(game.levelWidth, game.levelHeight)) * 1.5;
            const minRoomWH = 2;
            const maxRoomWH = 6; // exclusive
            const roomSpreadOutness = game.prng.nextInRangeRound(2, 8);
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

                // shift this cavity to north, south, west, east of the last inserted cavity
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
                        console.log("apparently numbers don't work properly in this alternate universe " + directionTry);
                        break;
                }
            }

            function fillGrid(cavities, legendType) {
                for (cavity of cavities) {
                    const cavityVariant = game.prng.nextInRangeRound(0, game.levelLegend.openMiddle.variants);
                    for (let x = 0; x < cavity.w; x++) {
                        for (let y = 0; y < cavity.h; y++) {
                            newLevelGrid[(x + cavity.x) + game.levelWidth * (y + cavity.y)] = game.levelLegend[legendType].create(cavityVariant);
                        }
                    }
                }
            }
            fillGrid(levelHallways, "openHallway");
            fillGrid(levelRooms, "openMiddle");

            console.log(levelHallways);

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
                if (!doRoomsTouch(relToRoom, ourRoom)) {
                    const ourHallway = new Box();

                    ourHallway[majorAxis] = (!isPlus ? ourRoom[majorAxis] : ourRoom[majorAxis] - Math.abs(relToRoom[majorAxis] - ourRoom[majorAxis]));
                    ourHallway[minorAxis] = ourRoom[minorAxis] + Math.round(newMinorValue * 0.5);
                    ourHallway[majorLength] = Math.abs(relToRoom[majorAxis] - ourRoom[majorAxis]) + 1;
                    ourHallway[minorLength] = hallwaySize;

                    levelHallways.push(ourHallway);
                }

                function doRoomsTouch(boxA, boxB) {
                    return (Math.abs(boxA.x - boxB.x) * 2 <= (boxA.w + boxB.w)) && (Math.abs(boxA.y - boxB.y) * 2 <= (boxA.h + boxB.h));
                }
            }
        })();

        (function createMiddleFiller() {
            for (let i = 0; i < game.levelWidth * game.levelHeight; i++) {
                if (!newLevelGrid[i]) {
                    newLevelGrid[i] = game.levelLegend.solidMiddle.create(0);
                }
            }
        })();

        (function createWalls() {
            // not all cells may be initialised, so just to keep it safe, i'll use a classic for loop instead of a for of loop
            // TODO: make it prettier by making each wall have similar variations
            for (let x = 0; x < game.levelWidth; x++) {
                let createdWall = game.levelLegend.solidWall.create(game.prng.nextInRangeRound(0, game.levelLegend.solidWall.variants));
                for (let y = 0; y < game.levelHeight; y++) {
                    if (x === 0 || y === 0 || x === game.levelWidth - 1 || y === game.levelHeight - 1) {
                        // sometimes the hallway can poke out of the "boundary", leaking into the void, just seal up the flipping box
                        newLevelGrid[x + game.levelWidth * y] = createdWall;
                    }
                    else if (newLevelGrid[x + game.levelWidth * y].icon === game.levelLegend.openMiddle.icon || newLevelGrid[x + game.levelWidth * y].icon === game.levelLegend.openHallway.icon) {
                        // for some reason, if i put all those 4 cases into one switch statement, it just won't work properly lol
                        // TODO: too lazy to make this a bunch of if's instead of this monstrosity
                        switch (game.levelLegend.solidMiddle.icon) {
                            case newLevelGrid[(x + 1) + game.levelWidth * y].icon:
                                newLevelGrid[(x + 1) + game.levelWidth * y] = createdWall;
                                break;
                        }
                        switch (game.levelLegend.solidMiddle.icon) {
                            case newLevelGrid[(x - 1) + game.levelWidth * y].icon:
                                newLevelGrid[(x - 1) + game.levelWidth * y] = createdWall;
                                break;
                        }
                        switch (game.levelLegend.solidMiddle.icon) {
                            case newLevelGrid[x + game.levelWidth * (y + 1)].icon:
                                newLevelGrid[x + game.levelWidth * (y + 1)] = createdWall;
                                break;
                        }
                        switch (game.levelLegend.solidMiddle.icon) {
                            case newLevelGrid[x + game.levelWidth * (y - 1)].icon:
                                newLevelGrid[x + game.levelWidth * (y - 1)] = createdWall;
                                break;
                        }
                    }
                }
            }
        })();

        (function createDoors() {
            // sees if both the left and right, or above and below blocks are walls, if so, place a door
            // i don't want too many doors lol, so let's just sample in chunks, like one door per 8x8
            const chunkSize = 8;

            for (let chunkX = 0; chunkX < game.levelWidth; chunkX += chunkSize) {
                for (let chunkY = 0; chunkY < game.levelHeight; chunkY += chunkSize) {
                    for (let x = chunkX; x < chunkX + chunkSize; x++) {
                        for (let y = chunkY; y < chunkY + chunkSize; y++) {
                            if (x === 0 || y === 0 || x === game.levelWidth - 1 || y === game.levelHeight - 1) {
                                break;
                            }
                            // if left and right are walls, and top and bottom not a wall, and current is a hallway
                            if (newLevelGrid[(x + 1) + game.levelWidth * y].icon === game.levelLegend.solidWall.icon && newLevelGrid[(x - 1) + game.levelWidth * y].icon === game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * (y + 1)].icon !== game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * (y - 1)].icon !== game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * y].icon === game.levelLegend.openHallway.icon) {
                                // even number, so variant total/2 - get random from that range, and multiply by 2
                                newLevelGrid[x + game.levelWidth * y] = game.levelLegend.solidDoor.create(game.prng.nextInRangeRound(0, game.levelLegend.solidDoor.variants * 0.5) * 2);
                                x = game.levelWidth; // cheap way to break out of nested loop
                                y = game.levelHeight;
                            }
                            else if (newLevelGrid[x + game.levelWidth * (y + 1)].icon === game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * (y - 1)].icon === game.levelLegend.solidWall.icon && newLevelGrid[(x + 1) + game.levelWidth * y].icon !== game.levelLegend.solidWall.icon && newLevelGrid[(x - 1) + game.levelWidth * y].icon !== game.levelLegend.solidWall.icon && newLevelGrid[x + game.levelWidth * y].icon === game.levelLegend.openHallway.icon) {
                                newLevelGrid[x + game.levelWidth * y] = game.levelLegend.solidDoor.create(game.prng.nextInRangeFloor(1, game.levelLegend.solidDoor.variants * 0.5) * 2 - 1);
                                x = game.levelWidth;
                                y = game.levelHeight;
                            }
                        }
                    }
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
                const maxColourDiff = 16; // colour values can go +- up to this amount

                // I really don't know why I'm using RGBA for smack-dab opaque bricks...
                function ColourRGBA(r, g, b, a) {
                    this.r = r;
                    this.g = g;
                    this.b = b;
                    this.a = a; // 0 to 255, surprisingly, and not from 0-1 since its - well an array of uints
                }

                const colourTheme = new ColourRGBA(game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), game.prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), 255);

                function createWallTextures() {
                    // will return an array containing already-complete threejs textures
                    const brickWidth = game.prng.nextInRangeRound(3, 8) * 2 - 1;
                    const brickHeight = 4;
                    const fillerSize = 1;
                    const fillerColour = new ColourRGBA(16, 16, 16, 255);

                    const wallTextures = [];

                    for (let variant = 0; variant < game.levelLegend.solidWall.variants; variant++) {
                        let wallData = new Uint8Array(texSize * texSize * 4); // 4 for rgba components

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
                                for (let y = brick.y; y < brick.y + brick.h; y++) {
                                    wallData[4 * (x + texSize * y) + 0] = brick.colour.r + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 1] = brick.colour.g + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 2] = brick.colour.b + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 3] = brick.colour.a;
                                }
                            }
                        }

                        for (let x = 0; x < texSize; x++) {
                            for (let y = 0; y < texSize; y++) {
                                if (!wallData[4 * (x + texSize * y) + 0] || !wallData[4 * (x + texSize * y) + 1] || !wallData[4 * (x + texSize * y) + 2] || !wallData[4 * (x + texSize * y) + 3]) {
                                    wallData[4 * (x + texSize * y) + 0] = fillerColour.r + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 1] = fillerColour.g + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 2] = fillerColour.b + game.prng.nextInRangeFloor(-maxColourDiff / 2, maxColourDiff / 2);
                                    wallData[4 * (x + texSize * y) + 3] = fillerColour.a;
                                }
                            }
                        }

                        wallTextures.push(new THREE.DataTexture(wallData, texSize, texSize, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.UVMapping));
                        wallTextures[wallTextures.length - 1].needsUpdate = true;
                    }
                    return wallTextures;
                }

                return {
                    walls: createWallTextures()
                };
            }
            const textures = createTextures();

            (function texTest() {
                let geometry = new THREE.PlaneGeometry(1, 1);
                let mat = new THREE.MeshBasicMaterial({ map: textures.walls[0], side: THREE.DoubleSide, transparent: true });
                mat.needsUpdate = true;
                var mesh = new THREE.Mesh(geometry, mat);
                mesh.name = "texTest";
                game.scene.add(mesh);

                let textSprite = createTextSprite("hello? is it me you're looking for?");

                game.scene.add(textSprite);

            })();

            (function createLevelGeometry() {
                // custom vbos here we go buddy https://threejs.org/docs/#Reference/Core/BufferGeometry
                // so doors (which have moving geometry) will not be part of this whole thing
                // https://scottbyrns.atlassian.net/wiki/display/THREEJS/Working+with+BufferGeometry
                // although it doesnt make the map draw calls into just 1 buffer, it should help a bit.
                const levelGeometries = {}; // put similar blocks (which have the same texture/material) into one corresponding buffergeometry

                (function setupGeometries() {
                    // just allocate a bunch of new threejs buffergeometries. don't matter if that legend element isn't even supposed to have a solid representation, we'll clear out the empty ones'
                    // TODO: ignore empty buffergeometries, dont make useless meshes out of them and dont add them to the scene
                    for (let levelLegendString in game.levelLegend) {
                        levelGeometries[levelLegendString] = []; // an array, a geometry for each variant
                        for (let variant = 0; variant < game.levelLegend[levelLegendString].variants; variant++) {
                            levelGeometries[levelLegendString].push(new THREE.BufferGeometry());
                        }
                    }
                })();

                // TODO: run through map grid, push back geometry into each corresponding type, then make meshes outta each with each corresponding texture/mat
                for (let x = 0; x < game.levelWidth; x++) {
                    for (let y = 0; y < game.levelHeight; y++) {
                        // for every block in this level grid, let's see how we can shove this into a mesh
                        switch (newLevelGrid[x + game.levelWidth * y].icon) {
                            
                            default:
                                break;
                        }
                    }
                }

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

    function LevelLegendElementCreator(icon, variants) {
        this.icon = icon; // letter from "game.levelLegend"
        this.variants = variants; // numeric variant total if you wanna spiff things up

        // create an instance. this is the function you should be using
        // variant should be 0 indexed, so 1 less than the total variants
        this.create = function (variant) {
            return {
                icon: this.icon,
                variant: (variant < variants && variant >= 0 ? variant : 0)
            };
        };
    }

    function PRNG(initialSeed) {
        this.seed = (initialSeed ? initialSeed : 420);

        this.next = function () {
            let x = Math.sin(this.seed++) * 10000;
            return x - Math.floor(x);
        };

        this.nextInRange = function (min, max) {
            return this.next() * (max - min) + min;
        };

        this.nextInRangeFloor = function (min, max) {
            return Math.floor(this.nextInRange(min, max));
        };

        this.nextInRangeRound = function (min, max) {
            return Math.round(this.nextInRange(min, max));
        };
    }

    function Input() {
        this.config = {
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
            date: new Date(),
            delta: 0,
            lastFrame: 0,
            total: 0
        };

        (function initInput() {
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

        this.isButtonHeld = function (key) {
            return buttonsHeld[key];
        };

        this.isKeyHeld = function (key) {
            return keysHeld[key];
        };

        this.mouseMoved = function () {
            return mouseMove;
        };

        this.isPointerLocked = function () {
            return pointerLocked;
        };

        this.getTimeDelta = function () {
            return time.delta;
        };

        this.getTimeTotal = function () {
            return time.total;
        };

        this.tick = function () {
            time.total = time.date.getTime();
            time.delta = time.total - time.lastFrame;
            time.lastFrame = time.total;

            mouseMove.x = 0;
            mouseMove.y = 0;
        };
    }

    function Transformer() {
        // helper class. i could use a const Transformer = ()(); for a "static" class, but heck, i dont want to put this definition at the front of the file
        const self = this;

        self.translateAddWorld = function (obj, vec) {
            if (typeof obj !== "object") {
                return;
            }
            // TODO: doohickeys
        }

        self.rotateAddWorld = function (obj, axis /*three vector3*/, rads /*very rad*/) {
            if (typeof obj !== "object") {
                return;
            }
            let rotMatWorld = new THREE.Matrix4();
            rotMatWorld.makeRotationAxis(axis.normalize(), rads);
            rotMatWorld.multiply(obj.matrix);
            obj.matrix = rotMatWorld;
            obj.rotation.setFromRotationMatrix(obj.matrix);
        }
    }

    function Player() {
        const self = this;

        // don't write to self externally, just a simple getter. set by using the func'
        self.fov = 75.0;
        self.camera = new THREE.PerspectiveCamera(self.fov, game.width / game.height, 0.01, 1000);
        game.scene.add(self.camera);

        self.camera.position.z = 1;

        self.setFov = function (newFov) {
            game.player.fov = (typeof newFov === "number" ? newFov : game.player.fov);
            game.player.camera.fov = game.player.fov;
            game.player.camera.updateProjectionMatrix();
            return newFov;
        }

        self.tick = function () {
            (function doMovement() {
                if (!game.input.isPointerLocked()) {
                    return;
                }

                // TODO: use transformer class to handle translation collisions with the levelGrid
                if (game.input.isKeyHeld(game.input.config.walkForward)) {
                    self.camera.translateZ(-0.1);
                }
                if (game.input.isKeyHeld(game.input.config.walkBackward)) {
                    self.camera.translateZ(0.1);
                }
                if (game.input.isKeyHeld(game.input.config.walkLeft)) {
                    self.camera.translateX(-0.1);
                }
                if (game.input.isKeyHeld(game.input.config.walkRight)) {
                    self.camera.translateX(0.1);
                }

                if (game.input.isKeyHeld("i")) {
                    console.log(self.camera.rotation.x);
                    console.log(typeof self.camera);
                }

                // yaw
                game.transformer.rotateAddWorld(self.camera, new THREE.Vector3(0.0, 1.0, 0.0), -game.input.mouseMoved().x * game.input.config.lookSensitivity);

                // pitch (shouldnt be in actual game)
                self.camera.rotateX(-game.input.mouseMoved().y * game.input.config.lookSensitivity);
            })();
        };
    }

    (function render() {
        requestAnimationFrame(render);

        game.player.tick();

        // TODO: just a test
        game.scene.getObjectByName("texTest").rotation.y += 0.01;

        game.input.tick(); // This clears the mouse moved state to 0, so it has to be done once all other objects have queried its stuff

        game.renderer.render(game.scene, game.player.camera);
    })();
};

window.onload = nubenstein;