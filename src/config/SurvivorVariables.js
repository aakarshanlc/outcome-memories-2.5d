export const SurvivorVariables = {
    'Sonic': {
        speed: 1.1,
        maxHealth: 100,
        size: 3,
        abilities: {
            dash: {
                cooldown: 480,
                duration: 30,
                multiplier: 3.0
            }
        }
    },
    'Tails': {
        speed: 0.9,
        maxHealth: 100,
        size: 3,
        abilities: {
            gun: {
                cooldown: 600,
                damage: 5,
                stunDuration: 60,
                projectileSpeed: 3.0,
                maxCharge: 120
            },
            fly: {
                cooldown: 540,     // Cooldown when all 3 charges are used
                maxCharges: 3,
                chargeCooldown: 30, // 0.5s delay between dashes
                boost: 2.0,        // Upward velocity applied per charge
                duration: 20,      // How long the speed boost lasts
                multiplier: 1.5    // How fast he moves while flying
            }
        }
    },
    'Knuckles': {
        speed: 0.85,
        maxHealth: 125,
        size: 3,
        abilities: {
            parry: {
                cooldown: 840,
                duration: 60,
                stunDuration: 90,
                speedBoostDuration: 120
            },
            punch: {
                cooldown: 1080,
                windupDuration: 30,
                activeDuration: 10,
                multiplier: 3.0,
                stunDuration: 75,
                knockback: 20,
                hitboxWidth: 15,
                hitboxDepth: 15
            }
        }
    }
};