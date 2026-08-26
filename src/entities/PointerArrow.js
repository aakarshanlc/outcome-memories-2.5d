import * as THREE from 'three';

export class PointerArrow {
    constructor(scene) {
        this.scene = scene;
        const geo = new THREE.ConeGeometry(2, 5, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.rotation.x = Math.PI / 2; // Point horizontally forward
        this.mesh.position.y = 12; // Hover above player
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    update(playerPos, ringPos) {
        if (!ringPos) {
            this.mesh.visible = false;
            return;
        }
        this.mesh.visible = true;
        this.mesh.position.x = playerPos.x;
        this.mesh.position.z = playerPos.z;
        // Calculate angle to ring
        const angle = Math.atan2(ringPos.x - playerPos.x, ringPos.z - playerPos.z);
        this.mesh.rotation.y = angle;
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}