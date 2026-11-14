'use strict';
// Built-in show templates. Each builds cue lists with clearly named placeholders —
// add your media files and they're ready to run.
window.QP = window.QP || {};

QP.showTemplates = (newCue, uid) => {
  let n = 0;
  const num = () => String(++n);
  const C = (type, props = {}) => {
    const c = newCue(type, false);
    c.number = props.number === null ? '' : num();
    delete props.number;
    return Object.assign(c, props);
  };
  const G = (name, mode, children, props = {}) => C('group', { name, mode, children, ...props });
  const A = (name, props = {}) => C('audio', { name: `${name} (add file)`, ...props });
  const V = (name, props = {}) => C('video', { name: `${name} (add file)`, ...props });
  const T = (text, props = {}) => C('text', { text, ...props });
  const M = (name, notes = '') => C('memo', { name, notes });
  const list = (name, cues) => ({ id: uid(), name, cues, playheadId: null });
  const cart = (pads) => { const a = new Array(64).fill(null); pads.forEach((p, i) => { a[i] = p; }); return a; };
  const fadeOut = (target, duration = 4) => C('fade', { target: target.id, setLevel: true, level: -60, duration, stopWhenDone: true });
  const reset = () => { n = 0; };

  return [
    {
      id: 'blank', name: 'Blank show', icon: 'newdoc', desc: 'An empty cue list.',
      build: () => ({ lists: [list('Main', [])], cart: cart([]) }),
    },
    {
      id: 'theatre', name: 'Theatre / play', icon: 'memo', desc: 'Pre-show house music, phones announcement, acts, interval with countdown, curtain call and walk-out.',
      build: () => {
        reset();
        const house = G('House music', 'playlist', [A('House track 1'), A('House track 2'), A('House track 3')], { crossfade: 4, endAction: 'repeat', stopOnGo: true, stopOnGoFade: 6, color: '#6366f1', notes: 'Fades out on the first GO' });
        const phones = A('Phones & photography announcement', { duckOthers: true, duckAmount: 15, notes: 'Wait for house manager clearance' });
        const interval = G('Interval', 'all', [A('Interval music', { playCount: 0, fadeIn: 3 }), T('Act two begins in {countdown}', { countMode: 'duration', countFrom: 900, position: 'middle', size: 9 })], { color: '#f97316' });
        return {
          lists: [list('Show', [
            house, M('Doors open', 'House open — confirm with FOH'), phones,
            M('ACT ONE'), fadeOut(house, 6), A('Scene 1 — opening sound'), A('Scene 1 — SFX'), A('Scene 2 — underscore', { fadeIn: 2, fadeOut: 3 }), A('Scene 3 — SFX'),
            M('INTERVAL'), interval, A('Five-minute call announcement', { duckOthers: true }), fadeOut(interval, 5),
            M('ACT TWO'), A('Scene 4 — opening sound'), A('Scene 5 — underscore'), A('Finale'),
            A('Curtain call music', { color: '#34d399' }), G('Walk-out music', 'playlist', [A('Walk-out track 1'), A('Walk-out track 2')], { crossfade: 4 }),
          ])],
          cart: cart([A('Doorbell', { number: null }), A('Phone ring', { number: null }), A('Thunder', { number: null }), A('Applause', { number: null })]),
          script: { text: 'ACT ONE\n\nScene 1\n(Lights rise)\n\n…paste your script here and link cues to lines…\n\nINTERVAL\n\nACT TWO', links: {} },
          settings: { showStart: '19:30' },
        };
      },
    },
    {
      id: 'corporate', name: 'Corporate event / awards', icon: 'text', desc: 'Walk-in, voice-of-god announcements with ducking, opener video, award stings, nominee slideshow, lower thirds and walk-out.',
      build: () => {
        reset();
        const walkin = G('Walk-in music', 'shuffle', [A('Walk-in track 1'), A('Walk-in track 2'), A('Walk-in track 3')], { crossfade: 5, endAction: 'repeat', stopOnGo: true, stopOnGoFade: 5, color: '#6366f1' });
        const loop = V('Holding slide / logo loop', { playCount: 0, fadeIn: 1, layer: 1 });
        return {
          lists: [
            list('Event', [
              walkin, loop, A('VOG: please take your seats', { duckOthers: true, duckAmount: 18 }),
              V('Opener video', { fadeIn: 0.5, layer: 2, notes: 'Lights to black on GO' }), fadeOut(walkin, 3),
              A('MC walk-up music', { fadeOut: 2 }), T('MC NAME\nTitle', { position: 'lower', size: 5, align: 'left', bgOpacity: 60, fadeIn: 0.5, fadeOut: 0.5, duration: 8 }),
              M('AWARDS'), G('Nominees — Category 1', 'slideshow', [V('Nominee 1 photo'), V('Nominee 2 photo'), V('Nominee 3 photo')], { slideDuration: 5, crossfade: 1, color: '#f97316' }),
              A('Drumroll', { playCount: 0 }), A('Winner sting', { color: '#34d399' }), A('Walk-up music', { fadeOut: 3 }),
              M('CLOSE'), A('VOG: thank you & goodnight', { duckOthers: true }),
              G('Walk-out music', 'playlist', [A('Walk-out track 1'), A('Walk-out track 2')], { crossfade: 4, endAction: 'repeat' }),
            ]),
          ],
          cart: cart([A('Applause', { number: null }), A('Drumroll', { number: null, playCount: 0 }), A('Winner sting', { number: null }), A('Play-off music', { number: null }), A('Walk-up 1', { number: null }), A('Walk-up 2', { number: null })]),
        };
      },
    },
    {
      id: 'wedding', name: 'Wedding / party', icon: 'audio', desc: 'Guest arrival, ceremony moments, entrances, first dance, speeches mic and party playlist.',
      build: () => {
        reset();
        const arrival = G('Guest arrival music', 'shuffle', [A('Arrival track 1'), A('Arrival track 2'), A('Arrival track 3')], { crossfade: 5, endAction: 'repeat', stopOnGo: true, stopOnGoFade: 6, color: '#ec4899' });
        return {
          lists: [
            list('Ceremony', [arrival, A('Processional', { fadeIn: 2, notes: 'Wait for celebrant' }), A('Signing of the register', { fadeOut: 4 }), A('Recessional')]),
            list('Reception', [
              G('Pre-dinner music', 'shuffle', [A('Dinner track 1'), A('Dinner track 2')], { crossfade: 4, endAction: 'repeat', stopOnGo: true }),
              A('Couple entrance', { fadeOut: 3 }), C('mic', { name: 'Speeches microphone', duckOthers: true }), A('First dance'),
              G('Party playlist', 'shuffle', [A('Party track 1'), A('Party track 2'), A('Party track 3')], { crossfade: 3, endAction: 'repeat' }),
              A('Last dance'), A('Send-off'),
            ]),
          ],
          cart: cart([A('Fanfare', { number: null }), A('Applause', { number: null })]),
        };
      },
    },
    {
      id: 'band', name: 'Band / live music', icon: 'timecode', desc: 'Walk-in, intro video with timecode to the lighting desk, backing tracks per song and outro.',
      build: () => {
        reset();
        const song = (i) => G(`Song ${i}`, 'all', [A(`Song ${i} backing track`), C('timecode', { name: `Song ${i} timecode`, startTC: `0${i}:00:00:00`.slice(-11), fps: '25', tcMode: 'mtc' })], { color: '#22d3ee', notes: 'Wait for count-in' });
        return {
          lists: [list('Set', [
            G('Walk-in music', 'playlist', [A('Walk-in track 1'), A('Walk-in track 2')], { crossfade: 4, stopOnGo: true, stopOnGoFade: 4 }),
            G('Intro', 'all', [V('Intro video'), C('timecode', { name: 'Intro timecode', startTC: '00:59:50:00', fps: '25', tcMode: 'mtc' })], { color: '#d946ef' }),
            song(1), song(2), song(3), M('Encore break'), song(4), A('Outro music'),
          ])],
          cart: cart([A('Crowd FX', { number: null }), A('Interlude', { number: null })]),
        };
      },
    },
    {
      id: 'sports', name: 'Sports / polo event', icon: 'wait', desc: 'Anthem, period countdown on screen, horns and goal stings on the cart, sponsor slideshow loop.',
      build: () => {
        reset();
        return {
          lists: [list('Match', [
            G('Arrival music', 'shuffle', [A('Arrival track 1'), A('Arrival track 2')], { crossfade: 4, endAction: 'repeat', stopOnGo: true }),
            A('VOG: welcome', { duckOthers: true }), A('National anthem', { notes: 'Wait for teams' }),
            G('Sponsor slideshow', 'slideshow', [V('Sponsor logo 1'), V('Sponsor logo 2'), V('Sponsor logo 3')], { slideDuration: 8, crossfade: 1, endAction: 'repeat', color: '#f97316' }),
            T('{countdown}', { countMode: 'duration', countFrom: 420, size: 22, bold: true, name: 'Period clock (7:00)' }),
            M('Half-time'), G('Half-time music', 'playlist', [A('Half-time track 1'), A('Half-time track 2')], { crossfade: 3 }),
            A('Presentation music'),
          ])],
          cart: cart([A('Horn — start / end of period', { number: null, color: '#f43f5e' }), A('Goal sting 1', { number: null, color: '#34d399' }), A('Goal sting 2', { number: null, color: '#34d399' }), A('Crowd cheer', { number: null })]),
        };
      },
    },
    {
      id: 'install', name: 'Installation / museum loop', icon: 'group', desc: 'Starts every morning, loops all day (ambient audio + slideshow), fades down every evening.',
      build: () => {
        reset();
        const day = G('Daytime loop', 'all', [A('Ambient soundscape', { playCount: 0, fadeIn: 5 }), G('Gallery slideshow', 'slideshow', [V('Image 1'), V('Image 2'), V('Image 3')], { slideDuration: 10, crossfade: 2, endAction: 'repeat' })], { todTrigger: '09:00', color: '#34d399', notes: 'Starts automatically at 09:00' });
        return {
          lists: [list('Schedule', [day, C('stop', { name: 'Evening fade-down', action: 'stop', fadeTime: 10, todTrigger: '17:00', notes: 'Fades everything out at 17:00' }), A('Closing announcement', { todTrigger: '16:50', duckOthers: true })])],
          cart: cart([]),
        };
      },
    },
    {
      id: 'church', name: 'Church / service', icon: 'text', desc: 'Pre-service slideshow, welcome, lyrics stepped on GO, sermon mic, offering and post-service music.',
      build: () => {
        reset();
        return {
          lists: [list('Service', [
            G('Pre-service', 'all', [G('Announcement slides', 'slideshow', [V('Slide 1'), V('Slide 2')], { slideDuration: 10, crossfade: 1, endAction: 'repeat' }), G('Pre-service music', 'shuffle', [A('Track 1'), A('Track 2')], { crossfade: 4, endAction: 'repeat' })], { stopOnGo: true, stopOnGoFade: 5 }),
            A('Welcome video / countdown'),
            G('Song 1 lyrics', 'step', [T('Verse 1 lyrics…', { size: 6 }), T('Chorus lyrics…', { size: 6 }), T('Verse 2 lyrics…', { size: 6 })], { crossfade: 0.4, color: '#6366f1', notes: 'GO advances each slide' }),
            C('mic', { name: 'Sermon microphone', duckOthers: false }),
            G('Offering music', 'playlist', [A('Offering track')], { crossfade: 3 }),
            A('Benediction'), G('Post-service music', 'shuffle', [A('Track 1'), A('Track 2')], { crossfade: 4, endAction: 'repeat' }),
          ])],
          cart: cart([]),
        };
      },
    },
    {
      id: 'broadcast', name: 'Livestream / broadcast', icon: 'video', desc: 'On-screen countdown, intro sting, lower thirds, VT rolls, break bumper and outro.',
      build: () => {
        reset();
        return {
          lists: [list('Running order', [
            T('Starting in {countdown}', { countMode: 'duration', countFrom: 300, size: 9 }),
            V('Intro sting'), T('PRESENTER NAME\nRole', { position: 'lower', align: 'left', size: 5, bgOpacity: 70, duration: 8 }),
            V('VT 1'), V('VT 2'), V('Break bumper'), V('VT 3'), V('Outro'),
          ])],
          cart: cart([A('Sting', { number: null }), A('Applause', { number: null }), A('Transition whoosh', { number: null })]),
        };
      },
    },
  ];
};
