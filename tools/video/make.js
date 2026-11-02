// Cuts the English YouTube Short (1080x1920, ~45 s) from clips/*.mp4, gfx/*.png and music.wav: node make.js <out.mp4>
const { execFileSync } = require('child_process');
const path = require('path');
const BIN = 'C:/Users/Asus ROG STRIX/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/';
const FF = BIN + 'ffmpeg.exe', FP = BIN + 'ffprobe.exe';
const D = __dirname, C = path.join(D, 'clips'), G = path.join(D, 'gfx'), S = path.join(D, 'segs');
require('fs').mkdirSync(S, { recursive: true });
const OUT = process.argv[2] || path.join(D, 'pizza_panic_trailer_en.mp4');
const XF = 0.3;
const dur = f => Number(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// [source, start (negative = from the end), length, caption]
const SCENES = [
  ['title.png', 0, 2.6, ''],
  ['c1_home', 0, 3.2, 'home'],
  ['c2_game', 0.5, 3.2, 'place'],
  ['c2_game', 3.6, 4.9, 'steal'],
  ['c2_game', 8.5, 4.8, 'burn'],
  ['c2_game', 13.3, 3.4, 'players'],
  ['c3_theme', 0.3, 2.8, 'theme'],
  ['c4_tutorial', 0.3, 5.0, 'tutorial'],
  ['c5_lang', 0.5, 7.2, 'lang'],
  ['c6_shop', 0.2, 3.2, 'shop'],
  ['c7_win', -4.3, 4.2, 'win'],
  ['end.png', 0, 3.8, ''],
];

const segs = [];
SCENES.forEach(([src, start, len, cap], i) => {
  const out = path.join(S, `seg_${String(i + 1).padStart(2, '0')}.mp4`);
  let args, fc;
  if (src.endsWith('.png')) {
    // Still card, slowly zooming in.
    args = ['-loop', '1', '-framerate', '30', '-t', String(len), '-i', path.join(G, src)];
    fc = `[0:v]scale=2160:3840,zoompan=z='1+0.05*on/(${len}*30)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,format=yuv420p[out]`;
  } else {
    const file = path.join(C, src + '.mp4');
    const s = start < 0 ? Math.max(0, dur(file) + start) : start;
    args = ['-ss', String(s), '-t', String(len), '-i', file, '-loop', '1', '-t', String(len), '-i', path.join(G, 'frame.png')];
    // Footage in the phone window, the frame (background with a rounded hole) on top.
    fc = `[0:v]fps=30,pad=1080:1920:161:250:color=D23E32[ph];[1:v]format=rgba[fr];[ph][fr]overlay=0:0:shortest=1[base]`;
    if (cap) {
      args.push('-loop', '1', '-t', String(len), '-i', path.join(G, `cap_${cap}.png`));
      fc += `;[2:v]format=rgba,fade=in:st=0.1:d=0.35:alpha=1[cap];[base][cap]overlay=0:0:shortest=1,format=yuv420p[out]`;
    } else fc += ';[base]format=yuv420p[out]';
  }
  execFileSync(FF, ['-v', 'error', '-y', ...args, '-filter_complex', fc, '-map', '[out]', '-an', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', out]);
  segs.push({ out, len: dur(out) });
  console.log('Abschnitt', i + 1, src, cap || '', segs[i].len.toFixed(2), 's');
});

// Chain with cross-fades, add music with fade in/out.
const inputs = [];
segs.forEach(s => inputs.push('-i', s.out));
let fc = '', prev = '[0:v]', t = segs[0].len;
for (let k = 1; k < segs.length; k++) {
  const lab = k === segs.length - 1 ? '[vout]' : `[x${k}]`;
  fc += `${prev}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${(t - XF).toFixed(3)}${lab};`;
  prev = `[x${k}]`;
  t += segs[k].len - XF;
}
const total = t.toFixed(2);
fc += `[${segs.length}:a]atrim=0:${total},afade=t=in:st=0:d=0.6,afade=t=out:st=${(t - 2.5).toFixed(2)}:d=2.5,volume=1.0[aout]`;
execFileSync(FF, ['-v', 'error', '-y', ...inputs, '-i', path.join(D, 'music.wav'), '-filter_complex', fc,
  '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT]);
console.log(`Video: ${OUT} (${total} s)`);
