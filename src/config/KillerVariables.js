export const KillerVariables = {
    'Tripwire': {
        speed: 1.3,
        size: 4,
        m1: {
            cooldown: 60,
            windup: 30, // 0.5s delay
            duration: 10,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1'
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
            windup: 30, // 0.5s delay
            attackDuration: 12,
            hitCount: 6,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1_2011x',
            applyBleed: true
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
            windup: 30, // 0.5s delay
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