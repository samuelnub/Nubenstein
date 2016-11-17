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
        solidDoor: new LevelLegendElementCreator("D", 8),
        solidObjective: new LevelLegendElementCreator("O", 16), // that elevator at the end of a level
        openSpawn: new LevelLegendElementCreator("s", 1),
        openMiddle: new LevelLegendElementCreator(" ", 1),
        openDoor: new LevelLegendElementCreator("d", 8)
    };

    const levelWidth = 64;
    const levelHeight = 64;
    let levelNumber = 1;
    // array of chars corresponding to that legend
    let levelGrid = [];

    const prng = new PRNG((nubElement.getAttribute("seed") ? nubElement.getAttribute("seed") : Math.random() * (10000 - 1) + 1));

    // Main looping functions, logic and listener functions
    (function setup() {
        renderer.setSize(width, height);
        renderer.domElement.setAttribute("id", "nubensteinCanvas");
        renderer.domElement.setAttribute("tabindex", "0");
        renderer.domElement.focus();
        renderer.setClearColor(0XDEADBE, 1);
        nubElement.appendChild(renderer.domElement);

        renderer.domElement.addEventListener("keydown", function (event) {
            console.log(event.key);
        });

        createLevel();
    })();

    function createLevel() {
        const newLevelGrid = [];

        (function createCavities() {
            // Plonk some cavities, see if they overlap, if so, discard, if not, insert it into level
            const maxCavityCount = prng.nextInRangeRound(Math.min(levelWidth, levelHeight), Math.max(levelWidth, levelHeight)) * 2;
            const minCavityWH = 4;
            const maxCavityWH = 8; // exclusive
            const cavityHallwayW = 2;

            function Cavity(x, y, w, h) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.dirMoved; // refer to below's switch case. relative to last square in list. the first one in the array should be undefined
            }

            let levelCavities = [];

            for (let curCavityTry = 0; curCavityTry < maxCavityCount; curCavityTry++) {
                // These maps are pretty small, so fancy spatial partitioning isn't really needed
                const cavityTry = new Cavity(prng.nextInRangeRound(levelWidth / 2 - minCavityWH, levelWidth / 2 + minCavityWH), prng.nextInRangeRound(levelWidth / 2 - minCavityWH, levelWidth / 2 + minCavityWH), prng.nextInRangeRound(minCavityWH, maxCavityWH), prng.nextInRangeRound(minCavityWH, maxCavityWH));
                if (levelCavities.length === 0) {
                    levelCavities.push(cavityTry);
                    continue;
                }

                // shift this cavity to north, south, west, east of the last inserted cavity
                const lastCavityRef = levelCavities[levelCavities.length-1];
                cavityTry.x = lastCavityRef.x;
                cavityTry.y = lastCavityRef.y;
                let directionTry;
                do{
                    directionTry = prng.nextInRangeFloor(0,4);
                } 
                while(directionTry === lastCavityRef.dirMoved);
                cavityTry.dirMoved = directionTry;

                switch (directionTry) { // TODO: clamp values
                    case 0:
                        placeNewCavity(lastCavityRef, cavityTry, "x", "y", true, "w", "h");
                        break;
                    case 1:
                        placeNewCavity(lastCavityRef, cavityTry, "x", "y", false, "w", "h");
                        break;
                    case 2:
                        placeNewCavity(lastCavityRef, cavityTry, "y", "x", true, "h", "w");
                        break;
                    case 3:
                        placeNewCavity(lastCavityRef, cavityTry, "y", "x", false, "h", "w");
                        break;
                    default:
                        console.log("apparently numbers don't work properly in this alternate universe " + directionTry);
                        break;
                }
            }

            // fill the grid with the corresponding legend
            for (levelCavity of levelCavities) {
                const cavityVariant = prng.nextInRangeRound(0, levelLegend.openMiddle.variants);
                for (let x = 0; x < levelCavity.w; x++) {
                    for (let y = 0; y < levelCavity.h; y++) {
                        newLevelGrid[(x + levelCavity.x) + levelWidth * (y + levelCavity.y)] = levelLegend.openMiddle.create(cavityVariant);
                    }
                }
            }

            function placeNewCavity(relToCavity, ourCavity, majorAxis /*string, pass it "x" for example*/, minorAxis /*the one to just offset it to give randomness*/, isPlus /*bool*/, majorLength, minorLength /*string of either W or H*/) {
                let newMajorValue = prng.nextInRangeRound(ourCavity[majorLength], ourCavity[majorLength] * 4);
                let newMinorValue = prng.nextInRangeRound(Math.ceil(-relToCavity[minorLength] / 4), Math.ceil(relToCavity[minorLength] / 2));
                
                ourCavity[majorAxis] += (isPlus ? newMajorValue : -newMajorValue);
                ourCavity[minorAxis] += newMinorValue;

                ourCavity[majorAxis] = clamp(ourCavity[majorAxis], 0, (majorAxis === "x" ? levelWidth : levelHeight)-ourCavity[majorLength]);
                ourCavity[minorAxis] = clamp(ourCavity[minorAxis], 0, (minorAxis === "y" ? levelHeight : levelWidth)-ourCavity[minorLength]);

                // TODO: check if intersects
                levelCavities.push(ourCavity);
            }

            // Since all our "cavities" 
        })();

        (function createSpawnObjective() {

        })();

        (function createWallFiller() {
            for (let i = 0; i < levelWidth * levelHeight; i++) {
                if (!newLevelGrid[i]) {
                    newLevelGrid[i] = levelLegend.solidMiddle.create(0);
                }
            }
        })();

        function printGrid(aspect) {
            // little test to print out how our cavities are positioned atm
            let strings = [];
            for (let i = 0; i < levelHeight; i++) {
                strings[i] = "";
                for (let x = 0; x < levelWidth; x++) {
                    strings[i] += newLevelGrid[x + levelWidth * i][aspect] + newLevelGrid[x + levelWidth * i][aspect];
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
        // printGrid("variant");

        levelGrid = newLevelGrid.slice();
    }

    function setFov(newFov) {
        fov = (typeof (newFov) === "number" ? newFov : this.fov);
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
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

        this.nextInRangeFloor = function(min, max) {
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

        renderer.render(scene, camera);
    })();
};

window.onload = nubenstein;