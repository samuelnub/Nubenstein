(function () {
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
    const width = (nubElement.getAttribute("width") ? nubElement.getAttribute("width") : 800);
    const height = (nubElement.getAttribute("height") ? nubElement.getAttribute("height") : 600);

    let fov = 75.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 1000);

    const sceneHUD = new THREE.Scene();
    const cameraHUD = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 0.01, 1000);

    const renderer = new THREE.WebGLRenderer();

    const controls = {
        walkForward: "w",
        walkBackward: "s",
        walkLeft: "a",
        walkRight: "d"
    };

    let score = 0;

    // Legend, both for displaying simply as text, and also for reference
    // the variant here is the total variants that'll be available to tinker with
    // just for concention: capital letter is solid, lower case is "pass-through-able"
    const levelLegend = {
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

    // webgl 1.0 only has a max index count of an ebo to be a ushort (65535) :(
    const levelWidth = 32;
    const levelHeight = 32;
    let levelNumber = -1; // 0 indexed, starts out at -1, then nextLevel will make it 0
    // array of chars corresponding to that legend
    let levelGrid = [];

    const prng = new PRNG((nubElement.getAttribute("seed") ? nubElement.getAttribute("seed") : Math.random() * (10000 - 1) + 1));

    const levelSeeds = [];

    // Main looping functions, logic and listener functions
    (function setup() {
        (function setupRenderer() {
            renderer.setSize(width, height);
            renderer.domElement.setAttribute("id", "nubensteinCanvas");
            renderer.domElement.setAttribute("tabindex", "0");
            renderer.domElement.focus();
            renderer.setClearColor(0XDEADBE, 1);
            nubElement.appendChild(renderer.domElement);
        })();

        renderer.domElement.addEventListener("keydown", function (event) {
            console.log(event.key);
        });

        nextLevel();
    })();

    function nextLevel() {
        levelNumber++;
        levelSeeds[levelNumber] = prng.seed;
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
            const maxRoomCount = prng.nextInRangeRound(Math.min(levelWidth, levelHeight), Math.max(levelWidth, levelHeight)) * 1.5;
            const minRoomWH = 2;
            const maxRoomWH = 6; // exclusive
            const roomSpreadOutness = prng.nextInRangeRound(2, 8);
            const hallwaySize = 1; // "width" if its from your perspective

            let levelRooms = [];
            let levelHallways = [];

            for (let curRoomTry = 0; curRoomTry < maxRoomCount; curRoomTry++) {
                // These maps are pretty small, so fancy spatial partitioning isn't really needed
                const roomTry = new Box(prng.nextInRangeRound(levelWidth / 2 - minRoomWH, levelWidth / 2 + minRoomWH), prng.nextInRangeRound(levelWidth / 2 - minRoomWH, levelWidth / 2 + minRoomWH), prng.nextInRangeRound(minRoomWH, maxRoomWH), prng.nextInRangeRound(minRoomWH, maxRoomWH));
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
                    directionTry = prng.nextInRangeFloor(0, 4);
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
                    const cavityVariant = prng.nextInRangeRound(0, levelLegend.openMiddle.variants);
                    for (let x = 0; x < cavity.w; x++) {
                        for (let y = 0; y < cavity.h; y++) {
                            newLevelGrid[(x + cavity.x) + levelWidth * (y + cavity.y)] = levelLegend[legendType].create(cavityVariant);
                        }
                    }
                }
            }
            fillGrid(levelHallways, "openHallway");
            fillGrid(levelRooms, "openMiddle");

            console.log(levelHallways);

            function placeNewRoomAndHallway(relToRoom, ourRoom, majorAxis /*string, pass it "x" for example*/, minorAxis /*the one to just offset it to give randomness*/, isPlus /*bool*/, majorLength, minorLength /*string of either W or H*/) {
                let newMajorValue = prng.nextInRangeRound(ourRoom[majorLength], ourRoom[majorLength] * roomSpreadOutness + prng.nextInRangeRound(0, Math.min(levelWidth, levelHeight) * prng.nextInRange(0, 1)));
                let newMinorValue = prng.nextInRangeRound(Math.ceil(-relToRoom[minorLength] / 4), Math.ceil(relToRoom[minorLength] / 2));

                ourRoom[majorAxis] += (isPlus ? newMajorValue : -newMajorValue);
                ourRoom[minorAxis] += newMinorValue;

                ourRoom[majorAxis] = clamp(ourRoom[majorAxis], 1, (majorAxis === "x" ? levelWidth : levelHeight) - ourRoom[majorLength] - 1);
                ourRoom[minorAxis] = clamp(ourRoom[minorAxis], 1, (minorAxis === "y" ? levelHeight : levelWidth) - ourRoom[minorLength] - 1);

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
            for (let i = 0; i < levelWidth * levelHeight; i++) {
                if (!newLevelGrid[i]) {
                    newLevelGrid[i] = levelLegend.solidMiddle.create(0);
                }
            }
        })();

        (function createWalls() {
            // not all cells may be initialised, so just to keep it safe, i'll use a classic for loop instead of a for of loop
            // TODO: make it prettier by making each wall have similar variations
            for (let x = 0; x < levelWidth; x++) {
                let createdWall = levelLegend.solidWall.create(prng.nextInRangeRound(0, levelLegend.solidWall.variants));
                for (let y = 0; y < levelHeight; y++) {
                    if (x === 0 || y === 0 || x === levelWidth - 1 || y === levelHeight - 1) {
                        // sometimes the hallway can poke out of the "boundary", leaking into the void, just seal up the flipping box
                        newLevelGrid[x + levelWidth * y] = createdWall;
                    }
                    else if (newLevelGrid[x + levelWidth * y].icon === levelLegend.openMiddle.icon || newLevelGrid[x + levelWidth * y].icon === levelLegend.openHallway.icon) {
                        // for some reason, if i put all those 4 cases into one switch statement, it just won't work properly lol
                        // TODO: too lazy to make this a bunch of if's instead of this monstrosity
                        switch (levelLegend.solidMiddle.icon) {
                            case newLevelGrid[(x + 1) + levelWidth * y].icon:
                                newLevelGrid[(x + 1) + levelWidth * y] = createdWall;
                                break;
                        }
                        switch (levelLegend.solidMiddle.icon) {
                            case newLevelGrid[(x - 1) + levelWidth * y].icon:
                                newLevelGrid[(x - 1) + levelWidth * y] = createdWall;
                                break;
                        }
                        switch (levelLegend.solidMiddle.icon) {
                            case newLevelGrid[x + levelWidth * (y + 1)].icon:
                                newLevelGrid[x + levelWidth * (y + 1)] = createdWall;
                                break;
                        }
                        switch (levelLegend.solidMiddle.icon) {
                            case newLevelGrid[x + levelWidth * (y - 1)].icon:
                                newLevelGrid[x + levelWidth * (y - 1)] = createdWall;
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

            for (let chunkX = 0; chunkX < levelWidth; chunkX += chunkSize) {
                for (let chunkY = 0; chunkY < levelHeight; chunkY += chunkSize) {
                    for (let x = chunkX; x < chunkX + chunkSize; x++) {
                        for (let y = chunkY; y < chunkY + chunkSize; y++) {
                            if (x === 0 || y === 0 || x === levelWidth - 1 || y === levelHeight - 1) {
                                break;
                            }
                            // if left and right are walls, and top and bottom not a wall, and current is a hallway
                            if (newLevelGrid[(x + 1) + levelWidth * y].icon === levelLegend.solidWall.icon && newLevelGrid[(x - 1) + levelWidth * y].icon === levelLegend.solidWall.icon && newLevelGrid[x + levelWidth * (y + 1)].icon !== levelLegend.solidWall.icon && newLevelGrid[x + levelWidth * (y - 1)].icon !== levelLegend.solidWall.icon && newLevelGrid[x + levelWidth * y].icon === levelLegend.openHallway.icon) {
                                // even number, so variant total/2 - get random from that range, and multiply by 2
                                newLevelGrid[x + levelWidth * y] = levelLegend.solidDoor.create(prng.nextInRangeRound(0, levelLegend.solidDoor.variants * 0.5) * 2);
                                x = levelWidth; // cheap way to break out of nested loop
                                y = levelHeight;
                            }
                            else if (newLevelGrid[x + levelWidth * (y + 1)].icon === levelLegend.solidWall.icon && newLevelGrid[x + levelWidth * (y - 1)].icon === levelLegend.solidWall.icon && newLevelGrid[(x + 1) + levelWidth * y].icon !== levelLegend.solidWall.icon && newLevelGrid[(x - 1) + levelWidth * y].icon !== levelLegend.solidWall.icon && newLevelGrid[x + levelWidth * y].icon === levelLegend.openHallway.icon) {
                                newLevelGrid[x + levelWidth * y] = levelLegend.solidDoor.create(prng.nextInRangeFloor(1, levelLegend.solidDoor.variants * 0.5) * 2 - 1);
                                x = levelWidth;
                                y = levelHeight;
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
            for (let i = 0; i < levelHeight; i++) {
                strings[i] = "";
                for (let x = 0; x < levelWidth; x++) {
                    strings[i] += newLevelGrid[x + levelWidth * i][aspect];
                }
                strings[i] += i.toString();
                console.log(strings[i]);
            }
            let legendString = "";
            for (legendElement in levelLegend) {
                // TODO: it looks more like a square on chrome's console when i do it twice
                legendString += legendElement + "'s icon: " + levelLegend[legendElement].icon + "'  ";
            }
            console.log("Legend:");
            console.log(legendString);
        }
        printGrid("icon");
        printGrid("variant");

        (function createScene() {
            // ooh, actual "3d" stuff
            (function clearScene() {
                for (let i = scene.children.length - 1; i >= 0; i--) {
                    // removes everything, including camera!
                    // you could do an if statement here to see if its the camera object
                    if (scene.children[i] !== camera) {
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

                const colourTheme = new ColourRGBA(prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), prng.nextInRangeRound(maxColourDiff * 2, 255 - maxColourDiff * 4), 255);

                function createWallTextures() {
                    // will return an array containing already-complete threejs textures
                    const brickWidth = prng.nextInRangeRound(3, 6) * 2 - 1;
                    const brickHeight = 4;
                    const fillerSize = 1;
                    const fillerColour = new ColourRGBA(16, 16, 16, 255);
                    
                    const wallTextures = [];

                    for(let variant = 0; variant < levelLegend.solidWall.variants; variant++) {
                        let wallData = new Uint8Array(texSize * texSize * 4); // 4 for rgba components
                        
                        const bricks = [];

                        let startMidway = false;
                        for(let brickY = 0; brickY < texSize; brickY+=(brickHeight+fillerSize)) {
                            for(let brickX = 0; brickX < texSize; brickX+=(brickWidth+fillerSize)) {
                                bricks.push(new Box(
                                    (brickX === 0 ? brickX : (startMidway ? brickX - Math.floor((brickWidth+fillerSize)/2) : brickX)),
                                    brickY,
                                    (startMidway ? (brickX === 0 ? Math.floor(brickWidth / 2) : (brickX+brickWidth+fillerSize < texSize ? brickWidth : (texSize-brickX)+Math.ceil((brickWidth+fillerSize)/2))) : (brickX+brickWidth+fillerSize < texSize ? brickWidth : texSize-(brickX+fillerSize))),
                                    brickHeight
                                ));

                                bricks[bricks.length-1].colour = new ColourRGBA(prng.nextInRangeRound(colourTheme.r-maxColourDiff, colourTheme.r+maxColourDiff), prng.nextInRangeRound(colourTheme.g-maxColourDiff, colourTheme.g+maxColourDiff), prng.nextInRangeRound(colourTheme.b-maxColourDiff, colourTheme.b-maxColourDiff), colourTheme.a);
                            }
                            startMidway = !startMidway;
                        }

                        for(brick of bricks) {
                            for(let x = brick.x; x < brick.x+brick.w; x++) {
                                for(let y = brick.y; y < brick.y+brick.h; y++) {
                                    wallData[4 * (x + texSize * y) + 0] = brick.colour.r;
                                    wallData[4 * (x + texSize * y) + 1] = brick.colour.g;
                                    wallData[4 * (x + texSize * y) + 2] = brick.colour.b;
                                    wallData[4 * (x + texSize * y) + 3] = brick.colour.a;
                                }
                            }
                        }

                        for(let x = 0; x < texSize; x++) {
                            for(let y = 0; y < texSize; y++) {
                                if(!wallData[4 * (x + texSize * y) + 0] || !wallData[4 * (x + texSize * y) + 1] || !wallData[4 * (x + texSize * y) + 2] || !wallData[4 * (x + texSize * y) + 3]) {
                                    wallData[4 * (x + texSize * y) + 0] = fillerColour.r;
                                    wallData[4 * (x + texSize * y) + 1] = fillerColour.g;
                                    wallData[4 * (x + texSize * y) + 2] = fillerColour.b;
                                    wallData[4 * (x + texSize * y) + 3] = fillerColour.a;
                                }
                            }
                        }

                        wallTextures.push(new THREE.DataTexture(wallData, texSize, texSize, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.UVMapping));
                        wallTextures[wallTextures.length-1].needsUpdate = true;
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
                scene.add(mesh);
                camera.position.z = 1;

            })();

            (function createWallGeometry() {
                // custom vbos here we go buddy https://threejs.org/docs/#Reference/Core/BufferGeometry
                // so doors (which have moving geometry) will not be part of this whole thing
                // https://scottbyrns.atlassian.net/wiki/display/THREEJS/Working+with+BufferGeometry
                const levelGeometry = new THREE.BufferGeometry();

                const levelPositions = new Float32Array([]);
                const levelNormals = new Float32Array([]);
                const levelUVs = new Float32Array([]);
                const levelIndices = new Float32Array([]);
                for (let x = 0; x < levelWidth; x++) {
                    for (let y = 0; y < levelHeight; y++) {
                        if (newLevelGrid[x + levelWidth * y].icon === levelLegend.solidWall.icon) {
                            // can't really just use "if this block is === open middle and open hallway, cause the open spawnpint and other stuff will conflict
                            if (x !== levelWidth - 1 && (newLevelGrid[(x + 1) + levelWidth * y].icon !== levelLegend.solidWall.icon || newLevelGrid[(x + 1) + levelWidth * y].icon !== levelLegend.solidWall.icon)) {

                            }
                        }
                    }
                }
            })();

            // TODO: remember to give your eventual mesh a name!

        })();

        levelGrid = newLevelGrid.slice();
    }

    function setFov(newFov) {
        fov = (typeof (newFov) === "number" ? newFov : this.fov);
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
        return newFov;
    }

    function createTextSprite(message, fontsize, colour /*pass in an object with an r,g,b,a component*/, font) {
        let ctx;
        let texture;
        let sprite;
        let spriteMat;
        let canvas = document.createElement("canvas");

        ctx = canvas.getContext("2d");
        ctx.font = fontsize + "px " + (font ? font : "Courier");

        canvas.width = ctx.measureText(message).width;
        canvas.height = fontsize * 2; // can be any multiplier, 2 seems reasonable

        ctx.font = fontsize + "px " + (font ? font : "Courier"); // not very DRY :(
        ctx.fillStyle = "rgba(" + colour.r + "," + colour.g + "," + colour.b + "," + colour.a + ")";
        ctx.fillText(message, 0, fontsize);

        texture = new THREE.Texture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        spriteMat = new THREE.SpriteMaterial({ map: texture });
        sprite = new THREE.Sprite(spriteMat);
        return sprite;
    }

    function LevelLegendElementCreator(icon, variants) {
        this.icon = icon; // letter from "levelLegend"
        this.variants = variants; // numeric variant total if you wanna spiff things up

        // create an instance. this is the function you should be using
        // variant should be 0 indexed, so 1 less than the total variants
        this.create = function (variant) {
            return {
                icon: this.icon,
                variant: (variant < variants && variant >= 0 ? variant : 0)
            };
        }
    }

    function PRNG(initialSeed) {
        this.seed = (initialSeed ? initialSeed : 420);

        this.next = function () {
            let x = Math.sin(this.seed++) * 10000;
            return x - Math.floor(x);
        }

        this.nextInRange = function (min, max) {
            return this.next() * (max - min) + min;
        }

        this.nextInRangeFloor = function (min, max) {
            return Math.floor(this.nextInRange(min, max));
        }

        this.nextInRangeRound = function (min, max) {
            return Math.round(this.nextInRange(min, max));
        }
    }

    function clamp(num, min, max) {
        return num <= min ? min : num >= max ? max : num;
    }

    (function render() {
        requestAnimationFrame(render);

        // TODO: just a test
        scene.getObjectByName("texTest").rotation.y += 0.01;

        renderer.render(scene, camera);
    })();
};

window.onload = nubenstein;