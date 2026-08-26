// Import the audio files directly so Vite can resolve their paths
import menuTrack from '../assets/music/menu1.mp3';
import tripwireTrack from '../assets/music/Tripwirechase.mp3';
import x2011Track from '../assets/music/2011Xchase.mp3';
import tailsLmsTrack from '../assets/music/Tailslms.mp3';
import knucklesLmsTrack from '../assets/music/Knuckleslms.mp3';
import defaultLmsTrack from '../assets/music/Eternal Hope, Eternal Fight.mp3';

export class AudioManager {
    constructor() {
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.currentTrack = null;
        this.audioElement = new Audio();
        this.audioElement.loop = true;
        
        // Map imported tracks to logical game events
        this.tracks = {
            menu: menuTrack,
            Tripwire: tripwireTrack,
            '2011X': x2011Track,
            Tails_lms: tailsLmsTrack,
            Knuckles_lms: knucklesLmsTrack,
            default_lms: defaultLmsTrack
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
        console.log(`Playing SFX: ${soundName}`);
    }
}