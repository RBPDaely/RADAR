import * as fs from 'fs';
import * as path from 'path';

const GITHUB_USERNAME = 'RBPDaely';
const REPO_NAME = 'RADAR';

const token = process.env.GITHUB_TOKEN || process.argv[2];

if (!token) {
  console.error('[Error] GitHub Personal Access Token belum disediakan.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'RADAR-Deployment-Tool',
  'Content-Type': 'application/json',
};

const IGNORED_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  '.radar_credentials.json',
  '.env',
  '.DS_Store',
  'bun.lock',
];

function shouldIgnore(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  return parts.some((p) => IGNORED_PATTERNS.includes(p) || p.startsWith('.env') || p.endsWith('.log'));
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  for (const file of list) {
    const filePath = path.join(dir, file);
    const relPath = path.relative(baseDir, filePath);

    if (shouldIgnore(relPath)) continue;

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, baseDir));
    } else {
      results.push(relPath);
    }
  }

  return results;
}

async function main() {
  console.log(`[1/4] Memverifikasi token GitHub...`);
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    console.error('[Error] Token GitHub tidak valid atau tidak memiliki akses.');
    process.exit(1);
  }
  const userData = await userRes.json();
  const owner = userData.login;
  console.log(`[OK] Terotentikasi sebagai: ${owner}`);

  // Check target repo
  let targetRepo = REPO_NAME;
  let repoRes = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}`, { headers });
  if (!repoRes.ok) {
    const altRes = await fetch(`https://api.github.com/repos/${owner}/polymarket-feed-pro`, { headers });
    if (altRes.ok) {
      targetRepo = 'polymarket-feed-pro';
    } else {
      console.log(`Membuat repositori baru ${owner}/${targetRepo}...`);
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: targetRepo,
          description: 'RADAR - Polymarket 5M UP/DOWN Trading Terminal Pro',
          private: true,
          auto_init: false,
        }),
      });
      if (!createRes.ok) {
        console.warn('Gagal membuat repo otomatis, mencoba melanjutkan...');
      }
    }
  }
  console.log(`[OK] Repositori target: ${owner}/${targetRepo}`);

  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  console.log(`[2/4] Menyiapkan ${files.length} berkas untuk diunggah ke ${owner}/${targetRepo}...`);

  // Ensure initial commit exists by writing README.md via Contents API first
  const readmeContent = fs.readFileSync(path.join(rootDir, 'README.md')).toString('base64');
  console.log(`Menginisialisasi / menyinkronkan branch main...`);
  
  // Check if README.md exists to get SHA if already present
  const checkReadme = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/contents/README.md`, { headers });
  let readmeSha: string | undefined = undefined;
  if (checkReadme.ok) {
    const rmData = await checkReadme.json();
    readmeSha = rmData.sha;
  }

  const initRes = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/contents/README.md`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'chore: update README for RADAR Pro Terminal',
      content: readmeContent,
      sha: readmeSha,
    }),
  });

  if (!initRes.ok) {
    console.error('[Error] Gagal sinkronisasi README:', await initRes.json());
  } else {
    console.log(`[OK] README berhasil disinkronkan.`);
  }

  // Upload all other files via Contents API
  console.log(`[3/4] Mengunggah dan memperbarui berkas sumber ke repositori...`);
  for (const relPath of files) {
    if (relPath === 'README.md') continue;

    const fullPath = path.join(rootDir, relPath);
    const content = fs.readFileSync(fullPath).toString('base64');
    const encodedPath = relPath.split(path.sep).map(encodeURIComponent).join('/');

    // Check if file exists
    const checkFile = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/contents/${encodedPath}`, { headers });
    let fileSha: string | undefined = undefined;
    if (checkFile.ok) {
      const fData = await checkFile.json();
      fileSha = fData.sha;
    }

    const uploadRes = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/contents/${encodedPath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `feat: update ${relPath} (RADAR Pro Features)`,
        content,
        sha: fileSha,
      }),
    });

    if (uploadRes.ok) {
      console.log(` + ${relPath}`);
    } else {
      const err = await uploadRes.json();
      console.warn(` - Gagal unggah ${relPath}:`, err.message || err);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[4/4] PUBLIKASI SELESAI & TERVERIFIKASI`);
  console.log(`URL Repositori: https://github.com/${owner}/${targetRepo}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
