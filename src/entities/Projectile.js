import * as THREE from 'three';
import { checkCircleCircleCollision } from '../engine/Collision.js';

export class Projectile {
    constructor(scene, x, z, dx, dz, owner, damage, stunDuration, speed = 3.0) {
        this.scene = scene;
        this.x = x; this.z = z;
        this.dx = dx; this.dz = dz;
        this.owner = owner;
        this.damage = damage;
        this.stunDuration = stunDuration;
        this.speed = speed; // Use passed speed
        this.active = true;

        const geo = new THREE.SphereGeometry(1.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 8, z);
        scene.add(this.mesh);
    }

    update(killers) {
        this.x += this.dx * this.speed;
        this.z += this.dz * this.speed;
        this.mesh.position.x = this.x;
        this.mesh.position.z = this.z;

        if (Math.abs(this.x) > 100 || Math.abs(this.z) > 100) {
            this.destroy();
            return;
        }

        for (let k of killers) {
            if (checkCircleCircleCollision(this.x, this.z, 1.5, k.mesh.position.x, k.mesh.position.z, k.size)) {
                k.takeDamage(this.damage, this.owner);
                k.stun(this.stunDuration);
                this.destroy();
                break;
            }
        }
    }

    destroy() {
        this.active = false;
        this.scene.remove(this.mesh);
    }
}