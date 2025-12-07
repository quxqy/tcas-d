const CONFIG = {
    WORLD_WIDTH: 60000,
    VS_INCREMENT: 500, 
    
    RADAR: {
        WIDTH: 500,
        HEIGHT: 420,
        // Ranges: 10nm, 20nm, 40nm
        RANGES: [10, 20, 40],
        IMAGES: ['img/radar10.png', 'img/radar20.png', 'img/radar40.png']
    },
    
    // GLOBAL SCALING FACTOR FOR RADAR BLIPS
    // Increase this to make blips bigger overall
    BLIP_BASE_SIZE: 12, // Was 8

    IMAGES: {
        OWN_RIGHT: 'img/own-plane-right.png',
        OWN_LEFT: 'img/own-plane-left.png',
        CONTROL_RIGHT: 'img/control-plane-right.png',
        CONTROL_LEFT: 'img/control-plane-left.png',
        ENEMY_RIGHT: 'img/plane-right.png',
        ENEMY_LEFT: 'img/plane-left.png',
        VS_PLUS_OFF: 'img/vs-plus-off.png',
        VS_PLUS_ON: 'img/vs-plus-on.png',
        VS_MINUS_OFF:'img/vs-minus-off.png',
        VS_MINUS_ON: 'img/vs-minus-on.png',
        ATC_OFF: 'img/atc-ident-off.png',
        ATC_ON: 'img/atc-ident-on.png',
        KNOB_MODE: 'img/knob-mode.png'
    }
};
