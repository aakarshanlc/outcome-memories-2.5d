export class Controls {
    constructor() {
        this.schemes = {
            p1: { up: 'w', down: 's', left: 'a', right: 'd', ability1: 'q', ability2: 'e', m1: ' ' },
            p2: { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', ability1: '/', ability2: '.', m1: 'enter' }
        };
        this.load();
    }

    load() {
        try {
            const saved = localStorage.getItem('om_25d_controls');
            if (saved) this.schemes = JSON.parse(saved);
        } catch (e) { console.error("Failed to load controls", e); }
    }

    save() {
        localStorage.setItem('om_25d_controls', JSON.stringify(this.schemes));
    }

    getScheme(playerId) {
        return this.schemes[playerId];
    }
}