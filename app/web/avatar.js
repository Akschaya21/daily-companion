// Daily Companion — mood avatars, drawn as SVG layers (viewBox 0 0 100 100).
// If you export your own Memoji stickers, drop PNGs named <mood>.png into
// ~/Library/Application Support/DailyCompanion/Memoji/ and they replace these.
(function (root) {
  const SKIN = '#F3C6A0', HAIR = '#4B2A1A', HAIR2 = '#66391F', INK = '#2A1712', SHIRT = '#2C2540';
  const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
  const star = (cx, cy, R, r) => {
    let d = '';
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      d += (i ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2);
    }
    return d + 'Z';
  };
  const heart = (x, y, s) => `M${x} ${y + s * 0.9}C${x - s * 1.6} ${y - s * 0.1} ${x - s * 0.9} ${y - s * 1.3} ${x} ${y - s * 0.45}C${x + s * 0.9} ${y - s * 1.3} ${x + s * 1.6} ${y - s * 0.1} ${x} ${y + s * 0.9}Z`;

  const MOODS = [
    { id: 'happy', label: 'Happy', tint: '#FFC86B' },
    { id: 'calm', label: 'Calm', tint: '#8FE0C8' },
    { id: 'focused', label: 'Focused', tint: '#B794F6' },
    { id: 'grateful', label: 'Grateful', tint: '#FFB38A' },
    { id: 'energised', label: 'Energised', tint: '#FFE066' },
    { id: 'tired', label: 'Tired', tint: '#9DB0E8' },
    { id: 'anxious', label: 'Anxious', tint: '#8FD3FF' },
    { id: 'sad', label: 'Sad', tint: '#7FA3D9' },
    { id: 'hopeful', label: 'Hopeful', tint: '#FF8FB8' }
  ];

  function layers(mood) {
    const L = [];
    const f = (d, fill) => L.push({ d, fill, stroke: 'none', sw: 0 });
    const s = (d, stroke, sw) => L.push({ d, fill: 'none', stroke, sw: sw || 2.4 });
    // base
    f('M17 56C13 26 31 9 51 9C72 9 89 26 85 56C84 74 91 86 83 98L19 98C10 86 18 72 17 56Z', HAIR);
    f('M26 100C28 86 38 81 50 81C62 81 72 86 74 100Z', SHIRT);
    f('M44 70H56V84H44Z', '#E3B08A');
    f(circ(26.5, 54, 4.5), SKIN); f(circ(73.5, 54, 4.5), SKIN);
    f(circ(26, 60.5, 1.7), '#E8C46A'); f(circ(74, 60.5, 1.7), '#E8C46A');
    f(ell(50, 52, 23.5, 26.5), SKIN);
    f('M26 47C25 25 39 15 53 16C68 17 79 29 76 49C71 37 62 30 51 31C42 32 33 38 26 47Z', HAIR2);
    f(ell(36.5, 62, 4.6, 3), 'rgba(240,110,100,.32)'); f(ell(63.5, 62, 4.6, 3), 'rgba(240,110,100,.32)');

    const openEyes = (dy) => {
      [40, 60].forEach(x => {
        f(ell(x, 53, 4.3, 4.7), '#FFFFFF');
        f(circ(x + 0.3, 53.6 + (dy || 0), 3), '#3B2416');
        f(circ(x + 1.2, 52.3 + (dy || 0), 0.95), '#FFFFFF');
      });
    };
    const upEyes = () => { s('M35.5 54.5Q40 48.5 44.5 54.5', INK, 2.6); s('M55.5 54.5Q60 48.5 64.5 54.5', INK, 2.6); };
    const downEyes = () => { s('M35.5 52.5Q40 57 44.5 52.5', INK, 2.4); s('M55.5 52.5Q60 57 64.5 52.5', INK, 2.4); };
    const worried = () => { s('M35 46.5L44 44', HAIR, 2.2); s('M56 44L65 46.5', HAIR, 2.2); };
    const M = {
      big: () => { f('M41 64Q50 76 59 64Z', '#7A2230'); f('M42 64.3H58Q57.4 66.6 50 67.1Q42.6 66.6 42 64.3Z', '#FFFFFF'); },
      smile: () => s('M42.5 65Q50 71.5 57.5 65', INK, 2.4),
      soft: () => s('M44.5 66.5Q50 69.8 55.5 66.5', INK, 2.2),
      frown: () => s('M43.5 69.5Q50 64.5 56.5 69.5', INK, 2.2),
      wavy: () => s('M42.5 67.5Q46.25 64.5 50 67.5Q53.75 70.5 57.5 67.5', INK, 2.2),
      o: () => f(ell(50, 67.5, 2.6, 3.3), '#7A2230')
    };

    switch (mood) {
      case 'happy': upEyes(); M.big(); break;
      case 'calm': downEyes(); M.soft(); break;
      case 'focused':
        openEyes(); M.soft();
        s(circ(40, 53, 7.2), '#1E1410', 1.9); s(circ(60, 53, 7.2), '#1E1410', 1.9); s('M47.2 52.5H52.8', '#1E1410', 1.9);
        break;
      case 'grateful':
        downEyes(); M.smile();
        f('M43.5 99C41 88 44.5 78 50 74C55.5 78 59 88 56.5 99Z', SKIN); s('M50 76V98', '#D9A27F', 1.2);
        break;
      case 'energised':
        f(star(40, 53, 6.4, 2.8), '#FFC93C'); f(star(60, 53, 6.4, 2.8), '#FFC93C'); M.big();
        break;
      case 'tired':
        s('M35.5 54H44.5', INK, 2.4); s('M55.5 54H64.5', INK, 2.4); M.o();
        s('M72 22H80L72 30H80', '#7FA8FF', 2.4); s('M83 11H88.5L83 16.5H88.5', '#7FA8FF', 2);
        break;
      case 'anxious':
        openEyes(); worried(); M.wavy();
        f('M76 34C76 34 71.8 39.6 71.8 42.2A4.2 4.2 0 0 0 80.2 42.2C80.2 39.6 76 34 76 34Z', '#8FD3FF');
        break;
      case 'sad':
        openEyes(1); worried(); M.frown();
        f('M37 60C37 60 34.4 64 34.4 65.6A2.6 2.6 0 0 0 39.6 65.6C39.6 64 37 60 37 60Z', '#7CC4FF');
        break;
      case 'hopeful':
        openEyes(-1.2); M.smile(); f(heart(79, 64, 6), '#FF4D6D');
        break;
      default:
        openEyes(); M.soft();
    }
    return L;
  }

  function svg(mood, size) {
    const body = layers(mood).map(l =>
      `<path d="${l.d}" fill="${l.fill}" stroke="${l.stroke}" stroke-width="${l.sw}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const label = (MOODS.find(m => m.id === mood) || { label: 'Neutral' }).label;
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label} avatar">${body}</svg>`;
  }

  root.DCAvatar = { MOODS, layers, svg };
})(typeof window !== 'undefined' ? window : globalThis);
