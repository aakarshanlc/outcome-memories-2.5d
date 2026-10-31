import * as THREE from 'three';
import { checkCircleCircleCollision } from '../engine/Collision.js';

// Projectiles are either survivor-fired (Tails' gun: stuns the killer) or
// killer-fired (Starved's snare: damages and roots the survivor). opts:
//   side:   'killer' (hits killers) | 'survivor' (hits survivors)
//   stun:   stun duration for killer hits
//   root:   root duration for survivor hits
//   damage: damage for survivor hits
export class Projectile {
    constructor(scene, x, z, dx, dz, owner, opts = {}) {
        this.scene = scene;
        this.x = x; this.z = z;
        this.dx = dx; this.dz = dz;
        this.owner = owner;
        this.side = opts.side || 'killer';
        this.stunDuration = opts.stun || 0;
        this.rootDuration = opts.root || 0;
        this.damage = opts.damage || 0;
        this.speed = opts.speed || 3.0;
        this.visualOnly = !!opts.visual;
        this.active = true;
        this.age = 0;

        const geo = new THREE.SphereGeometry(1.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: opts.color || 0xffff00 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 8, z);
        scene.add(this.mesh);
    }

    update(killers, players) {
        this.age++;
        this.x += this.dx * this.speed;
        this.z += this.dz * this.speed;
        this.mesh.position.x = this.x;
        this.mesh.position.z = this.z;
        this.mesh.rotation.x += 0.3;
        this.mesh.rotation.y += 0.2;

        if (Math.abs(this.x) > 100 || Math.abs(this.z) > 100 || this.age > 300) {
            this.destroy();
            return;
        }

        if (this.visualOnly) return;

        if (this.side === 'killer') {
            for (let k of killers) {
                if (checkCircleCircleCollision(this.x, this.z, 1.5, k.mesh.position.x, k.mesh.position.z, k.size)) {
                    k.stun(this.stunDuration);
                    this.destroy();
                    return;
                }
            }
        } else if (players) {
            for (let p of players) {
                if (p.health <= 0 || p.escaped) continue;
                if (checkCircleCircleCollision(this.x, this.z, 1.5, p.mesh.position.x, p.mesh.position.z, p.size)) {
                    if (this.damage > 0) p.takeDamage(this.damage, this.owner);
                    if (this.rootDuration > 0 && p.health > 0) p.rootTimer = Math.max(p.rootTimer || 0, this.rootDuration);
                    this.destroy();
                    return;
                }
            }
        }
    }

    destroy() {
        if (!this.active) return;
        this.active = false;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
