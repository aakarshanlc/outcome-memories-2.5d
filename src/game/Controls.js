export class Controls {
    constructor() {
        // Default schemes
        this.schemes = {
            p1: { up: 'w', down: 's', left: 'a', right: 'd', ability1: 'q', ability2: 'e', m1: ' ' },
            p2: { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', ability1: '/', ability2: '.', m1: 'enter' },
            p3: { up: 't', down: 'g', left: 'f', right: 'h', ability1: 'r', ability2: 'y', m1: 'v' },
            p4: { up: 'i', down: 'k', left: 'j', right: 'l', ability1: 'u', ability2: 'o', m1: 'p' }
        };
        this.load();
    }

    load() {
        try {
            const saved = JSON.parse(localStorage.getItem('om_25d_controls'));
            if (saved) {
                // Merge saved controls with defaults so missing players (p3, p4) are added safely
                this.schemes.p1 = saved.p1 || this.schemes.p1;
                this.schemes.p2 = saved.p2 || this.schemes.p2;
                this.schemes.p3 = saved.p3 || this.schemes.p3;
                this.schemes.p4 = saved.p4 || this.schemes.p4;
            }
        } catch (e) { 
            console.error("Failed to load controls", e); 
        }
    }

    save() {
        localStorage.setItem('om_25d_controls', JSON.stringify(this.schemes));
    }

    getScheme(playerId) {
        return this.schemes[playerId];
    }
}