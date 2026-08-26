export class AudioManager {
    constructor() {
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.load();
    }

    load() {
        this.musicVolume = parseFloat(localStorage.getItem('om_music_vol')) || 0.5;
        this.sfxVolume = parseFloat(localStorage.getItem('om_sfx_vol')) || 0.8;
    }

    save() {
        localStorage.setItem('om_music_vol', this.musicVolume);
        localStorage.setItem('om_sfx_vol', this.sfxVolume);
    }

    playSfx(soundName) {
        // Base for future SFX. e.g., if (soundName === 'hit') new Audio('sfx/hit.mp3').play();
        console.log(`Playing SFX: ${soundName}`);
    }
}