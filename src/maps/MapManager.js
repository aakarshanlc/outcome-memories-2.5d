import * as THREE from 'three';

export class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.obstacles = [];
    }

    loadMap(mapName) {
        // Clear previous map
        this.obstacles.forEach(obs => this.scene.remove(obs.mesh));
        this.obstacles = [];

        // Floor
        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        if (mapName === 'Box Arena') {
            this.addWall(0, 0, 20, 20);
            this.addWall(40, 40, 20, 20);
        } else {
            // Default Open Field with boundary walls
            this.addWall(-100, -100, 200, 5); // North
            this.addWall(-100, 95, 200, 5);  // South
            this.addWall(-100, -100, 5, 200); // West
            this.addWall(95, -100, 5, 200);  // East
        }
    }

    addWall(x, z, w, d) {
        const geo = new THREE.BoxGeometry(w, 20, d);
        const mat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x + w/2, 10, z + d/2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        
        this.obstacles.push({
            x: x, z: z, w: w, d: d, // Using Z instead of Y for 3D space
            mesh: mesh
        });
    }
}