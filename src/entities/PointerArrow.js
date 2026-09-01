import * as THREE from 'three';

const COLOR = 0x00ffff;
const HOVER_Y = 13;
const BOB_AMPLITUDE = 1.2;
const BOB_SPEED = 0.1;
const PULSE_AMPLITUDE = 0.08;
const PULSE_SPEED = 0.2;
const TURN_SPEED = 0.15;
const TURN_SNAP = 0.01;
const FADE_START = 30;
const FADE_END = 12;

export class PointerArrow {
    constructor(scene) {
        this.scene = scene;
        this.time = 0;

        const shape = new THREE.Shape();
        shape.moveTo(0, -7);
        shape.lineTo(5.5, 5);
        shape.lineTo(0, 2);
        shape.lineTo(-5.5, 5);
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);

        const mat = new THREE.MeshBasicMaterial({
            color: COLOR,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            fog: false, // Stays crisp at the far end of the scene fog
        });
        this.mat = mat;

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = HOVER_Y;
        this.mesh.visible = false;
        scene.add(this.mesh);
    }

    update(playerPos, ringPos) {
        if (!ringPos) {
            this.mesh.visible = false;
            return;
        }

        const dx = ringPos.x - playerPos.x;
        const dz = ringPos.z - playerPos.z;
        const dist = Math.hypot(dx, dz);

        const fade = THREE.MathUtils.clamp((dist - FADE_END) / (FADE_START - FADE_END), 0, 1);
        this.mesh.visible = fade > 0;
        if (!this.mesh.visible) return;

        this.time++;
        this.mat.opacity = fade;
        this.mesh.position.set(
            playerPos.x,
            HOVER_Y + Math.sin(this.time * BOB_SPEED) * BOB_AMPLITUDE,
            playerPos.z
        );

        if (dist > 0.001) {
            const targetYaw = Math.atan2(dx, dz);
            let diff = targetYaw - this.mesh.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // Shortest arc
            this.mesh.rotation.y = Math.abs(diff) > TURN_SNAP
                ? this.mesh.rotation.y + diff * TURN_SPEED
                : targetYaw;
        }

        this.mesh.scale.setScalar(1 + Math.sin(this.time * PULSE_SPEED) * PULSE_AMPLITUDE);
    }

    destroy() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
