import fs from 'node:fs';
import { execSync } from 'node:child_process';
const API = 'https://api.deadlock-api.com/v1/', OUT = new URL('../data/', import.meta.url), PAUSE = +process.env.PAUSE || 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u, tries = 12) {
  for (let k = 0, busy = 0; k < tries && busy < 90; k++) {
    try {
      const r = await fetch(API + u, { signal: AbortSignal.timeout(150000) });
      if (r.ok) { await sleep(PAUSE); return await r.json(); }
      console.log(r.status, u.slice(0, 90));
      if (r.status === 429) { k--; busy++; }
      await sleep(r.status === 429 ? Math.max(60, +r.headers.get('Retry-After') || 0) * 1000 : 15000);
    } catch (e) { console.log(String(e).slice(0, 80), u.slice(0, 90)); await sleep(15000); }
  }
  throw new Error('no answer: ' + u);
}
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const part = html.slice(html.indexOf('var hash='), html.indexOf('// the same text as shop()'));
const { hash, res, shop } = new Function(part.replace(/fetch\(/g, 'null(') + ';return {hash,res,shop}')();
const write = (n, o) => fs.writeFileSync(new URL(n, OUT), JSON.stringify(o));
fs.mkdirSync(OUT, { recursive: true });

const langs = ['english', 'russian', 'ukrainian', 'german', 'french', 'spanish', 'latam', 'portuguese', 'brazilian', 'polish', 'turkish', 'italian', 'czech', 'japanese', 'koreana', 'schinese', 'tchinese', 'thai', 'vietnamese', 'indonesian', 'hungarian', 'romanian', 'bulgarian', 'danish', 'dutch', 'finnish', 'norwegian', 'swedish', 'greek'];
const names = { v: 1, it: {} }, H = {};
let list = [];
for (const l of langs) {
  let a;
  try { a = await get('assets/items/by-type/upgrade?language=' + l, 3); } catch (e) { continue; }
  H[l] = {};
  for (const x of a) if (x.name && x.item_tier) {
    const same = H.english && H.english[x.id] === hash(x.name);
    if (!same) H[l][x.id] = hash(x.name);
    if (l === 'english') {
      const f = (x.shop_image || '').split('/').slice(-2).join('/').match(/^([wvs])\w+\/(\w+)\.\w+$/), sold = x.shopable && x.item_tier < 5;
      names.it[x.id] = [sold ? x.item_tier : 0, f ? f[1] + '-' + f[2] : '-', x.name.replace(/[^\w' -]/g, '').replace(/ /g, '_'), hash(x.name), res(x.properties || {})];
      list.push({ i: x.id, t: x.item_tier, e: H.english[x.id], l: '', r: res(x.properties || {}), s: sold, f: (x.shop_image || '').split('/').slice(-2).join('/'), n: x.name });
    }
  }
}
write('items.json', names);
for (const l in H) if (l !== 'english') write('names_' + l + '.json', H[l]);

try {
  const a = {};
  for (const x of await get('assets/items/by-type/ability?language=english')) { const f = (x.image || '').match(/\/images\/abilities\/(.+)\.png$/); if (f && x.name) a[x.id] = f[1]; }
  if (Object.keys(a).length > 150) write('abilities.json', { ...JSON.parse(fs.readFileSync(new URL('abilities.json', OUT))), ...a });
} catch (e) { console.log('abilities kept as they were'); }
const METRIC = ['kills', 'player_damage', 'net_worth', 'last_hits', 'assists', 'player_healing', 'boss_damage'], PCT = [1, 10, 25, 50, 75, 90, 99];
const metrics = async h => { const m = await get('analytics/player-stats/metrics' + (h ? '?hero_ids=' + h : '')); return METRIC.map(k => [...PCT.map(p => m[k]['percentile' + p]), m[k].avg].map(v => Math.round(v * 100) / 100).join()).join(); };
write('h0.json', { v: 1, q: await metrics(0) });

const heroes = (await get('assets/heroes?only_active=true')).map(h => h.id).sort((a, b) => a - b), only = process.argv.slice(2).map(Number);
const S = 'analytics/item-stats?min_matches=30';
const all = await get(S), foe = {};
for (const h of heroes) foe[h] = await get(S + '&enemy_hero_ids=' + h);
const BAND = { 0: '&max_average_badge=39', 1: '&min_average_badge=40&max_average_badge=59', 2: '&min_average_badge=60&max_average_badge=79', 3: '&min_average_badge=80&max_average_badge=99', 4: '&min_average_badge=100' };
const SINCE = '&min_unix_timestamp=' + (Math.floor(Date.now() / 864e5) - 14) * 86400;
const curve = async q => (await get('analytics/player-performance-curve?resolution=0' + q + SINCE, 4)).filter(x => x.game_time <= 3600).map(x => [x.game_time, x.net_worth_avg, x.kills_avg, x.deaths_avg, x.assists_avg]);
const pack = l => l.map(x => [x[0], Math.round(x[1]), ...x.slice(2).map(v => v.toFixed(2))].join()).join(';');
const every = await curve(''), ratio = {};
for (const b in BAND) try {
  const l = await curve(BAND[b]), by = Object.fromEntries(every.map(x => [x[0], x]));
  ratio[b] = Object.fromEntries(l.filter(x => by[x[0]]).map(x => [x[0], x.map((v, i) => i && by[x[0]][i] > 0 ? v / by[x[0]][i] : 1)]));
} catch (e) { console.log('no group', b); }
const keep = () => { if (process.env.CI) try { execSync('git add -A data && (git diff --cached --quiet || (git commit -q -m "Data ' + new Date().toISOString().slice(0, 10) + '" && git pull -q --rebase && git push -q))', { cwd: new URL('..', import.meta.url), shell: '/bin/bash' }); } catch (e) { console.log('not kept:', String(e).slice(0, 120)); } };
let done = 0;
for (const h of heroes) {
  if (only.length && !only.includes(h)) continue;
  if (process.env.PART && heroes.indexOf(h) % 12 !== +process.env.PART % 12 && fs.existsSync(new URL('h' + h + '.json', OUT))) continue;
  try {
    const own = await get(S + '&hero_ids=' + h), worth = await get(S + '&hero_ids=' + h + '&bucket=net_worth_by_5000'), versus = await get(S + '&hero_ids=' + h + '&bucket=enemy_hero');
    const d = { v: 1, day: Math.floor(Date.now() / 864e5), f: heroes, i: [], m: [], b: [], p: [], c: {}, q: await metrics(h) };
    const by = Object.fromEntries(list.map(x => [x.e, x.i]));
    for (const row of shop([list, own, worth, versus, all, ...heroes.map(x => foe[x])], heroes, 1).split(';')) {
      const c = row.split('.'), n = heroes.length;
      d.i.push(by[c[0]]); d.m.push(c.slice(3, 3 + n).map(Number)); d.b.push(c.slice(3 + n, 13 + n).map(Number)); d.p.push(c.slice(-10).map(Number));
    }
    try {
      const l = await curve('&hero_ids=' + h);
      if (l.length > 5) {
        d.c.a = pack(l);
        for (const b in ratio) d.c[b] = pack(l.map(x => x.map((v, i) => i && ratio[b][x[0]] ? v * ratio[b][x[0]][i] : v)));
      }
    } catch (e) { console.log('no curve', h); }
    write('h' + h + '.json', d);
    console.log('hero', h, d.i.length, 'items', Object.keys(d.c).length, 'curves');
    if (++done % 5 === 0) keep();
  } catch (e) { console.log('hero', h, 'kept as it was:', String(e).slice(0, 90)); }
}
keep();
console.log('done');
