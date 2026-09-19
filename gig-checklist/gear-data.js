/* ─────────────────────────────────────────────────────────────────────────
   Gig checklist — gear inventory + cable rules.

   This file is the thing you actually edit. It's plain data: add a gear
   item, add a cable rule, change a quantity formula. app.js just reads
   this and renders it — no logic worth touching lives there unless you're
   changing how the app *works*, not what it knows about your gear.

   This is a completely separate inventory from catalog.js at the repo
   root (the one powering the public gear-builder page, gear.html). That
   one is "what a client can request." This one is "what's actually in
   the truck, and what it takes to wire it up" — including gear you own
   but don't offer on the public site, like the OMNIS-DUO.
   ───────────────────────────────────────────────────────────────────── */

// ── Gear inventory, grouped the same way the public builder does ─────────
window.GIG_GEAR = {
  speakers: {
    title: 'Speakers',
    items: [
      { id: 'k10-2', name: 'QSC K10.2', sub: 'Powered main', max: 4 },
      { id: 'ks112', name: 'QSC KS112', sub: 'Subwoofer', max: 4 },
      { id: 'cp8', name: 'QSC CP8', sub: 'Monitor / fill', max: 2 },
      { id: 'dj-booth', name: 'DJ Booth', sub: 'Truss facade', max: 1 },
    ],
  },
  djequip: {
    title: 'DJ Equipment',
    items: [
      { id: 'euphonia', name: 'Alpha Theta Euphonia', sub: 'Rotary mixer', max: 1 },
      { id: 'omnis-duo', name: 'AlphaTheta OMNIS-DUO', sub: 'All-in-one system', max: 1 },
      { id: 'rb7000', name: 'Reloop RB7000-MK2', sub: 'Direct-drive turntable', max: 2 },
      { id: 'cdj3000', name: 'Pioneer CDJ-3000', sub: 'Media player', max: 2 },
    ],
  },
  lighting: {
    title: 'Lighting',
    items: [
      { id: 'wired-par', name: 'Wired PAR Light', sub: 'RGBW LED fixture', max: 6 },
      { id: 'batt-par', name: 'Battery PAR Light', sub: 'Wireless RGBW fixture', max: 4 },
      { id: 'mini-usb-light', name: 'Mini USB DJ Light', sub: 'USB-powered effect light', max: 6 },
      { id: 'derby-bar', name: 'Derby / Strobe Bar', sub: 'All-in-one effect bar', max: 1 },
    ],
  },
  shelter: {
    title: 'Shelter',
    items: [
      { id: 'tent-10x10', name: '10×10 Pop-up Tent', sub: 'EZ canopy, black', max: 1 },
      { id: 'tent-12x12', name: '12×12 Pop-up Tent', sub: 'EZ canopy, black', max: 1 },
      { id: 'hexa-tent', name: '12×12 Hexagon Tent', sub: 'Mesh-wall gazebo', max: 1 },
    ],
  },
};

/* ── Cable rules ────────────────────────────────────────────────────────

   Each rule fires off ONE source item being selected (the "brain" of the
   signal chain — a mixer or all-in-one unit) and looks at what else is
   selected (and in what quantity) to decide what cables that implies.

   A rule is:
     {
       need:    short label for what this run is
       fixed:   a single definite cable type/spec               -- OR --
       options: an array of 2+ cable specs, when the real answer
                depends on which physical jack the *other* piece of gear
                happens to have that day. The app lists these as a choice
                to make and check off, not a guess.
       when(qty)  -> should this line appear at all, given current counts?
       count(qty) -> how many of this cable, given current counts?
     }

   `qty(id)` inside a rule is a lookup: how many of that gear id are
   currently checked in. Undefined/0 both mean "none selected."
*/
window.GIG_CABLE_RULES = [
  {
    sourceId: 'euphonia',
    sourceName: 'Alpha Theta Euphonia',
    cables: [
      {
        need: 'Monitor run (mixer → CP8 wedges)',
        options: [
          '1/4" TS male – 1/4" TS male (if the wedge takes 1/4")',
          '1/4" TS male – XLR male (if the wedge takes XLR)',
        ],
        when: (qty) => qty('cp8') > 0,
        count: (qty) => qty('cp8'),
      },
      {
        need: 'Main out (mixer → K10.2 mains)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('k10-2') > 0,
        count: (qty) => qty('k10-2'),
      },
      {
        need: 'Main → Sub link (K10.2 → KS112)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('ks112') > 0,
        count: (qty) => Math.min(qty('k10-2'), qty('ks112')) || qty('ks112'),
      },
      {
        need: 'Sub → Sub link (running more than one sub per side — the bigger rig)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('ks112') > 1,
        count: (qty) => qty('ks112') - 1,
      },
      {
        need: 'Digital cable, mixer → each CDJ-3000',
        fixed: 'Digital (coaxial) link cable',
        when: (qty) => qty('cdj3000') > 0,
        count: (qty) => qty('cdj3000'),
      },
      {
        need: 'Pro DJ Link network (CDJs ↔ each other / switch)',
        fixed: 'Ethernet (Cat5e/6) cable',
        when: (qty) => qty('cdj3000') > 1,
        count: (qty) => qty('cdj3000'),
      },
    ],
  },
  {
    sourceId: 'omnis-duo',
    sourceName: 'AlphaTheta OMNIS-DUO',
    cables: [
      {
        need: 'Main out (Omnis → K10.2 mains)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('k10-2') > 0,
        count: (qty) => qty('k10-2'),
      },
      {
        need: 'Main → Sub link (K10.2 → KS112)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('ks112') > 0,
        count: (qty) => Math.min(qty('k10-2'), qty('ks112')) || qty('ks112'),
      },
      {
        need: 'Sub → Sub link (running more than one sub per side)',
        fixed: 'XLR male – XLR male',
        when: (qty) => qty('ks112') > 1,
        count: (qty) => qty('ks112') - 1,
      },
      {
        need: 'Monitor run (Omnis RCA out → CP8 wedges)',
        options: [
          'RCA – XLR male (if the wedge takes XLR)',
          'RCA – 1/4" TS (if the wedge takes 1/4")',
        ],
        when: (qty) => qty('cp8') > 0,
        count: (qty) => qty('cp8'),
      },
    ],
  },
];

/* ── Non-cable notes: things worth flagging that aren't a "bring this
   cable" line, but still belong on a prep checklist. Same when()/count()
   shape isn't needed here — these are just conditional reminders. */
window.GIG_NOTES = [
  {
    text: 'Both the Euphonia and the OMNIS-DUO are selected — you almost certainly only need one main source. Double-check before packing both.',
    when: (qty) => qty('euphonia') > 0 && qty('omnis-duo') > 0,
  },
  {
    text: 'Reloop RB7000-MK2 selected — no cable rule defined yet for turntable phono/ground connections. Add one in gear-data.js if you want it tracked here.',
    when: (qty) => qty('rb7000') > 0,
  },
  {
    text: 'CDJ-3000s selected with no mixer/source picked — pick the Euphonia or OMNIS-DUO above to see the digital/Ethernet cable run.',
    when: (qty) => qty('cdj3000') > 0 && qty('euphonia') === 0 && qty('omnis-duo') === 0,
  },
];
