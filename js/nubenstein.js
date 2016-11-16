(function() {
    let threejsElement = document.createElement("script");
    threejsElement.type = "text/javascript";
    threejsElement.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r82/three.js";
    document.head.appendChild(threejsElement);
})();

function nubenstein() {
    // Setting up consts and other variables
    const nubElement = document.getElementById("nubenstein");
    if(!nubElement) {
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
        walkForward : "w",
        walkBackward : "s",
        walkLeft : "a",
        walkRight : "d"
    };

    let score = 0;
    const levelWidth = 128;
    const levelHeight = 64;
    let levelNumber = 1;
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

        renderer.domElement.addEventListener("keydown", function(event) {
            console.log(event.key);
        });

        createLevel();
    })();

    function createLevel() {
        const newLevelGrid = [];

        const maxRoomCount = prng.nextInRangeRound(32, 64);
        const minRoomWH = 4;
        const maxRoomWH = 16;

        function room(x, y, w, h) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }

        let levelRooms = [];
        
        for(let curRoomTry = 0; curRoomTry < maxRoomCount; curRoomTry++) {
            console.log("trying to see if we can plop a room down!");
            // These maps are pretty small, so fancy spatial partitioning isn't really needed
            const roomTry = new room(prng.nextInRangeRound(0, levelWidth), prng.nextInRangeRound(0, levelHeight), prng.nextInRangeRound(minRoomWH, maxRoomWH), prng.nextInRangeRound(minRoomWH, maxRoomWH));
            if(levelRooms.length === 0) {
                levelRooms.push(roomTry);
            }
            
            for(let i = 0; i < levelRooms.length; i++) {
                if(doRoomsIntersect(roomTry, levelRooms[i])) {
                    break;
                }
                else {
                    levelRooms.push(roomTry);
                    break;
                }
            }
        }
        
        (function test() {
            // little test to print out how our rooms are positioned atm
            let chars = [];
            for(let i = 0; i < levelRooms.length; i++) {
                for(let roomI = 0; roomI < levelRooms[i].w; roomI++) {
                    for(let roomJ = 0; roomJ < levelRooms[i].h; roomJ++) {
                        chars[(levelRooms[i].x + roomI) + levelWidth * (levelRooms[i].y + roomJ)] = "#";
                    }
                }
            }

            let strings = [];
            for(let i = 0; i < levelHeight; i++) {
                strings[i] = "";
                for(let x = 0; x < levelWidth; x++) {
                    strings[i] += (chars[x + levelWidth * i] === "#" ? "#" : " ");
                }
                console.log(strings[i]);
            }
        })();

        function doRoomsIntersect(boxA, boxB) {
            return (Math.abs(boxA.x - boxB.x) * 2 < (boxA.w + boxB.w)) && (Math.abs(boxA.y - boxB.y) * 2 < (boxA.h + boxB.h));
        }

        levelGrid = newLevelGrid.slice();
    }

    function setFov(newFov) {
        fov = (typeof(newFov) === "number" ? newFov : this.fov);
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
    }

    function PRNG(initialSeed) {
        this.seed = (initialSeed ? initialSeed : 420);

        this.next = function() {
            let x = Math.sin(this.seed++) * 10000;
            return x - Math.floor(x);
        }
        
        this.nextInRange = function(min, max) {
            return this.next() * (max - min) + min;
        }

        this.nextInRangeRound = function(min, max) {
            return Math.round(this.nextInRange(min, max));
        }
    }

    (function render() {
        requestAnimationFrame(render);

        renderer.render(scene, camera);
    })();
};

window.onload = nubenstein;