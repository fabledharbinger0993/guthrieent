/* ─────────────────────────────────────────────────────────────
   Shared gear catalog — single source of truth for gear items.
   Used by: gear.html (selector UI), consult.html (email summary).
   When you add/rename gear, edit ONLY this file.
   ───────────────────────────────────────────────────────────── */

window.GEAR_CATALOG = {
  speakers: {
    eyebrow: 'Sound',
    title: 'Speakers',
    note: 'All power and XLR audio cables included in every build-out. 3-hour battery generator available for outdoor events.',
    items: [
      { id: 'ks112',   name: 'QSC KS112',  sub: 'Subwoofer',         max: 4 },
      { id: 'k102',    name: 'QSC K10.2',  sub: 'Powered main',      max: 4 },
      { id: 'cp8',     name: 'QSC CP8',    sub: 'Monitor / fill',    max: 2 },
      { id: 'djbooth', name: 'DJ Booth',   sub: 'Truss facade',      max: 1 },
    ],
  },
  djequip: {
    eyebrow: 'Sound',
    title: 'DJ Equipment',
    note: 'All power and audio cables included. 3-hour battery generator available for outdoor events.',
    items: [
      { id: 'euphonia', name: 'Alpha Theta Euphonia', sub: 'Rotary mixer',           max: 1 },
      { id: 'rb2000',   name: 'Reloop RB7000-MK2',   sub: 'Direct-drive turntable', max: 2 },
      { id: 'cdj3000',  name: 'Pioneer CDJ-3000',     sub: 'Media player',           max: 2 },
    ],
  },
  lighting: {
    eyebrow: 'Visual',
    title: 'Lighting',
    note: null,
    items: [
      { id: 'wiredpar', name: 'Wired PAR Light',    sub: 'RGBW LED fixture',         max: 6 },
      { id: 'battpar',  name: 'Battery PAR Light',  sub: 'Wireless RGBW fixture',    max: 4 },
      { id: 'miniusb',  name: 'Mini USB DJ Light',  sub: 'USB-powered effect light', max: 6 },
      { id: 'derbybar', name: 'Derby / Strobe Bar', sub: 'All-in-one effect bar',    max: 1 },
    ],
  },
  shelter: {
    eyebrow: 'Outdoor',
    title: 'Shelter',
    note: null,
    items: [
      { id: 'tent1010', name: '10×10 Pop-up Tent',  sub: 'EZ canopy, black', max: 1 },
      { id: 'tent1212', name: '12×12 Pop-up Tent',  sub: 'EZ canopy, black', max: 1 },
      { id: 'hexatent', name: '12×12 Hexagon Tent', sub: 'Mesh-wall gazebo', max: 1 },
    ],
  },
};
