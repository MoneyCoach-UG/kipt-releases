import { mkdir, writeFile } from 'node:fs/promises';
const repo = 'MoneyCoach-UG/kipt-releases';
const headers = { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
async function get(url, extra = {}) {
  const response = await fetch(url, { headers: { ...headers, ...extra }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return response;
}
let releases = [];
for (let page = 1; ; page++) {
  const batch = await (await get(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`)).json();
  if (!Array.isArray(batch)) throw new Error('Invalid releases response');
  releases.push(...batch);
  if (batch.length < 100) break;
}
const stable = releases.filter(r => r.draft === false && r.prerelease === false && /^voice-v\d+\.\d+\.\d+$/.test(r.tag_name));
stable.sort((a, b) => {
  const av = a.tag_name.slice(7).split('.').map(Number);
  const bv = b.tag_name.slice(7).split('.').map(Number);
  return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
});
let channel = { available: false };
for (const release of stable) {
  const installer = release.assets.find(a => a.name === 'KiPTVoice-Setup-x64.exe' && a.state === 'uploaded' && a.size > 1024);
  const checksum = release.assets.find(a => a.name === 'SHA256SUMS.txt' && a.state === 'uploaded');
  if (!installer || !checksum) continue;
  const sums = await (await get(checksum.url, { Accept: 'application/octet-stream' })).text();
  const match = /^([a-f0-9]{64})  KiPTVoice-Setup-x64\.exe\r?$/m.exec(sums);
  if (!match || installer.digest !== `sha256:${match[1]}`) throw new Error('Installer checksum does not match GitHub asset digest');
  const expected = `https://github.com/${repo}/releases/download/${release.tag_name}/KiPTVoice-Setup-x64.exe`;
  if (installer.browser_download_url !== expected) throw new Error('Unexpected installer URL');
  channel = { available: true, version: release.tag_name.slice(7), url: expected, sha256: match[1], size: installer.size };
  break;
}
await mkdir('channels/voice', { recursive: true });
await writeFile('channels/voice/windows.json', JSON.stringify(channel, null, 2) + '\n');
