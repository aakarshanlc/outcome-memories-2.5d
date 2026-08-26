export class AudioManager {
    constructor() {
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.currentTrack = null;
        this.audioElement = new Audio();
        this.audioElement.loop = true;
        
        // Map your exact filenames to logical game events
        this.tracks = {
            menu: '/music/menu1.mp3',
            Tripwire: '/music/Tripwirechase.mp3',
            '2011X': '/music/2011Xchase.mp3',
            // Starved: '/music/starved.mp3', // Add later when you have it
            Tails_lms: '/music/Tailslms.mp3',
            Knuckles_lms: '/music/Knuckleslms.mp3',
            default_lms: '/music/Eternal Hope, Eternal Fight.mp3'
        };

        this.load();
        this.applyVolume();
    }

    load() {
        const mVol = localStorage.getItem('om_music_vol');
        this.musicVolume = mVol !== null ? parseFloat(mVol) : 0.5;
        const sVol = localStorage.getItem('om_sfx_vol');
        this.sfxVolume = sVol !== null ? parseFloat(sVol) : 0.8;
    }

    save() {
        localStorage.setItem('om_music_vol', this.musicVolume);
        localStorage.setItem('om_sfx_vol', this.sfxVolume);
    }

    applyVolume() {
        this.audioElement.volume = this.musicVolume;
    }

    playMusic(trackName) {
        const url = this.tracks[trackName];
        // Don't restart if it's already playing
        if (!url || this.currentTrack === trackName) return;
        
        this.audioElement.src = url;
        this.applyVolume();
        this.audioElement.play().catch(e => console.log("Audio play prevented by browser until user clicks."));
        this.currentTrack = trackName;
    }

    stopMusic() {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.currentTrack = null;
    }

    playSfx(soundName) {
        // Base for future SFX. 
        console.log(`Playing SFX: ${soundName}`);
    }
}