export const SurvivorVariables = {
    'Sonic': {
        speed: 1,
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
                damage: 0,
                stunDuration: 60,
                projectileSpeed: 3.0,
                maxCharge: 120
            },
            fly: {
                cooldown: 540,
                maxCharges: 3,
                chargeCooldown: 30, // 0.5s delay between dashes
                boost: 1.5, // Upward velocity applied per charge
                duration: 20, // How long the speed boost lasts
                multiplier: 1.5 // How fast he moves while flying
            }
        }
    },
    'Knuckles': {
        speed: 0.85,
        maxHealth: 125,
        size: 3,
        abilities: {
            parry: {
                cooldown: 600,
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
                knockback: 10,
                hitboxWidth: 15,
                hitboxDepth: 15
            }
        }
    }
};