export const KillerVariables = {
    'Tripwire': {
        speed: 1.3,
        size: 4,
        m1: {
            cooldown: 60,
            windup: 30,
            duration: 10,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1'
        },
        abilities: {
            grapple: {
                cooldown: 360,
                range: 60,
                damage: 10,
                dragDuration: 30,
                dragSpeed: 5
            },
            bomb: {
                cooldown: 300,
                windup: 30,
                explodeRadius: 15,
                proximityDamage: 20,
                impactDamage: 15,
                aoeDamage: 10,
                lockonRange: 80,
                trackingSpeed: 1.5,
                lifetime: 900
            }
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    },
    '2011X': {
        speed: 1.5,
        size: 4,
        m1: {
            cooldown: 30,
            windup: 30,
            attackDuration: 12,
            hitCount: 6,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1_2011x',
            applyBleed: true,
            bleedDuration: 180 // 3s
        },
        abilities: {
            teleport: {
                cooldown: 900, // 15s
                windup: 120, // 2s
                arriveRadius: 15,
                bleedDuration: 120 // 2s
            },
            gods_trickery: {
                cooldown: 1080, // 18s
                duration: 60, // 1s
                hitboxCount: 5,
                hitboxSpacing: 5,
                hitboxWidth: 10,
                hitboxDepth: 10,
                invertDuration: 300 // 5s
            }
        },
        rush: {
            stunThreshold: 6,
            duration: 540, // 9s
            speedMultiplier: 1.5
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    },
    'Starved': {
        speed: 1.1,
        size: 4,
        m1: {
            cooldown: 60,
            windup: 30,
            duration: 10,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'starved_m1'
        },
        projectile: {
            speed: 3.5,
            damage: 4,
            stunDuration: 12
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    }
};