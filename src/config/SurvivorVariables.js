export const SurvivorVariables = {
    'Sonic': {
        speed: 0.99,
        maxHealth: 100,
        size: 3,
        abilities: {
            dash: {
                cooldown: 180,
                duration: 30,
                multiplier: 3.0
            }
        }
    },
    'Tails': {
        speed: 0.85,
        maxHealth: 100,
        size: 3,
        abilities: {
            gun: {
                cooldown: 600,
                damage: 5,
                stunDuration: 60,
                projectileSpeed: 3.0
            },
            fly: {
                cooldown: 540,
                duration: 60,
                flyHeight: 50
            }
        }
    },
    'Knuckles': {
        speed: 0.8,
        maxHealth: 125,
        size: 3,
        abilities: {
            parry: {
                cooldown: 720,
                duration: 60, 
                stunDuration: 60,
                speedBoostDuration: 120
            },
            punch: {
                cooldown: 1080,
                windupDuration: 25,
                activeDuration: 10,
                multiplier: 3.0,
                stunDuration: 75,
                knockback: 15,
                hitboxWidth: 15, // Changed to square
                hitboxDepth: 15
            }
        }
    }
};