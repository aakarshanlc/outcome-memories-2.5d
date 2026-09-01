import * as THREE from 'three';

export class PointerArrow {
    constructor(scene) {
        this.scene = scene;
        this.time = 0;

        // Single triangle dart. Geometry is pre-rotated to point along +Z at
        // yaw 0, so it is aimed with one rotation.y in update().
        const geo = new THREE.ConeGeometry(3.5, 9, 3);
        geo.rotateX(Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 13; // Hover above walls
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    update(playerPos, ringPos) {
        if (!ringPos) {
            this.mesh.visible = false;
            return;
        }
        this.time++;
        this.mesh.visible = true;

        this.mesh.position.x = playerPos.x;
        this.mesh.position.z = playerPos.z;
        this.mesh.position.y = 13 + Math.sin(this.time * 0.1) * 1.2;

        const dx = ringPos.x - playerPos.x;
        const dz = ringPos.z - playerPos.z;
        if (dx !== 0 || dz !== 0) {
            this.mesh.rotation.y = Math.atan2(dx, dz);
        }

        const pulse = 1 + Math.sin(this.time * 0.2) * 0.08;
        this.mesh.scale.setScalar(pulse);
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}
