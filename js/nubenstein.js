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
        console.log("Couldn't find any element with an id of \"nubenstein\" on your DOM!");
    }
    const width = (nubElement.getAttribute("width") ? nubElement.getAttribute("width") : 800);
    const height = (nubElement.getAttribute("height") ? nubElement.getAttribute("height") : 600);

    // TODO: have a "setfov" function that not only sets three's perspective fov, but also sets this one too
    let fov = 75.0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    nubElement.appendChild(renderer.domElement);

			var geometry = new THREE.BoxGeometry( 1, 1, 1 );
			var material = new THREE.MeshBasicMaterial( { color: 0xDEADBE } );
			var cube = new THREE.Mesh( geometry, material );
			scene.add( cube );
            camera.position.z = 5;

    // Main looping functions, logic and listener functions
    (function render() {
        requestAnimationFrame(render);
        cube.rotation.x += 0.1;
        cube.rotation.y += 0.1;
        renderer.render(scene, camera);
    })();

};

window.onload = nubenstein;