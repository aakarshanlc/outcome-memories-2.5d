import * as THREE from 'three';

export class Ring {
    constructor(scene, x, z) {
        this.scene = scene;
        const geo = new THREE.TorusGeometry(5, 1.5, 8, 24);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 5, z);
        this.mesh.rotation.x = Math.PI / 2; // Lay flat
        scene.add(this.mesh);
    }

    update() {
        this.mesh.rotation.z += 0.05; // Spin
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}