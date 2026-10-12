/**
 * Deterministic SOUL.md & Hiring Package Generator (Rule REQ-083, REQ-084 & Section 8)
 * Generates official Hermes Agent SOUL.md with 9 standard sections
 * and verified VPS CLI commands based on Phase 0 facts.
 */

import type { Department } from './constants.js';

export interface RoleTemplate {
  id: string;
  name: string;
  role: string;
  department: Department;
  avatar: string;
  mission: string;
  tone: string;
  responsibilities: string[];
  allowed_tools: string[];
  boundaries: string[];
  approval_actions: string[];
  reporting_cadence: string;
}

export interface AgentHiringSpec {
  name: string;
  role: string;
  department: Department;
  avatar?: string;
  mission: string;
  tone: string;
  responsibilities: string[];
  allowed_tools: string[];
  boundaries: string[];
  approval_actions: string[];
  reporting_cadence: string;
}

export interface HiringPackage {
  slug: string;
  soul_md: string;
  commands_md: string;
  checklist: string[];
  suggested_port: number;
  api_key_env: string;
}

export {
  DEFAULT_APPROVAL_ACTIONS,
  DEFAULT_BOUNDARIES,
  RECRUITMENT_TEMPLATES,
} from './soul-templates.js';

/**
 * Generates deterministic SOUL.md with exactly 9 standard sections.
 * Rule REQ-083 & Phase 6 Acceptance Criteria.
 */
export function generateSoulMarkdown(spec: AgentHiringSpec): string {
  const toolsFormatted = spec.allowed_tools.length > 0
    ? spec.allowed_tools.join(', ')
    : 'standard_chat, task_runner';

  const responsibilitiesFormatted = spec.responsibilities.length > 0
    ? spec.responsibilities.map((r) => `- ${r}`).join('\n')
    : '- Menjalankan arahan dan tugas dari CEO kantor virtual.';

  const boundariesFormatted = spec.boundaries.length > 0
    ? spec.boundaries.map((b) => `- ${b}`).join('\n')
    : '- Dilarang membocorkan data rahasia perusahaan.\n- Dilarang menjalankan aksi destruktif tanpa izin.';

  const approvalFormatted = spec.approval_actions.length > 0
    ? spec.approval_actions.map((a) => `- ${a}`).join('\n')
    : '- Transaksi keuangan dan pengeluaran uang\n- Publikasi konten resmi ke publik';

  return `# SOUL: ${spec.name}

## 1. Identity
- **Name**: ${spec.name}
- **Role**: ${spec.role}
- **Department**: ${spec.department}

## 2. Mission
${spec.mission.trim()}

## 3. Responsibilities
${responsibilitiesFormatted}

## 4. Tone & Style
${spec.tone.trim()}

## 5. Operating Rules
- Selalu bertindak secara profesional dan mematuhi arahan CEO Hermes Virtual Office.
- Gunakan alat bantu yang telah diizinkan secara eksplisit: ${toolsFormatted}.
- Berikan status tugas dan umpan balik secara transparan melalui jalur dispatcher.

## 6. Boundaries
${boundariesFormatted}

## 7. Approval Policy
- Agen WAJIB mengajukan permintaan persetujuan (human-in-the-loop approval) sebelum menjalankan:
${approvalFormatted}

## 8. Output Format
- Gunakan format Markdown standar untuk seluruh ringkasan dan tanggapan.
- Gunakan poin-poin terstruktur atau tabel untuk kemudahan pembacaan eksekutif.
- Hindari jargon yang berbelit-belit; dahulukan fakta dan angka terverifikasi.

## 9. Reporting Cadence
${spec.reporting_cadence.trim()}
`;
}

/**
 * Creates the complete Hiring Package with verified Phase 0 commands (Rule REQ-084 & REQ-092).
 * Commands verified in Phase 0:
 * - hermes profile create <name> [--description "..."]
 * - SOUL.md placed in ~/.hermes/profiles/<name>/SOUL.md
 * - Profile .env port setting API_SERVER_PORT and API_SERVER_KEY
 * - hermes -p <name> gateway &
 */
export function generateHiringCommands(
  spec: AgentHiringSpec,
  slug: string,
  suggestedPort: number,
  soulMd: string
): string {
  return `# Paket Penerimaan VPS — Agen: ${spec.name} (${spec.role})

> **PENTING**: Jalankan perintah berikut melalui sesi terminal/SSH di VPS tempat Hermes berjalan.
> Seluruh perintah CLI di bawah ini telah diverifikasi dari dokumentasi resmi Hermes Agent (Phase 0).

### Langkah 1: Buat Profil Agen di Hermes
\`\`\`bash
hermes profile create ${slug} --description "${spec.role} - Departemen ${spec.department}"
\`\`\`

### Langkah 2: Tempatkan Berkas SOUL.md
Salin seluruh teks SOUL.md di bawah ini ke berkas konfigurasi profil:
\`\`\`bash
cat << 'EOF' > ~/.hermes/profiles/${slug}/SOUL.md
${soulMd.trim()}
EOF
\`\`\`

### Langkah 3: Konfigurasi Port API Server & Secret Key (.env)
Buka dan tambahkan port dedicated untuk gateway agen ini di profilnya:
\`\`\`bash
cat << 'EOF' >> ~/.hermes/profiles/${slug}/.env
API_SERVER_ENABLED=true
API_SERVER_PORT=${suggestedPort}
API_SERVER_KEY=$(openssl rand -hex 16)
EOF
\`\`\`

### Langkah 4: Jalankan Gateway Agen
Jalankan proses gateway khusus untuk profil agen ini di VPS:
\`\`\`bash
# Menjalankan gateway profil di background
hermes -p ${slug} gateway &
\`\`\`

### Catatan Pengawasan & Layanan Otomatis (Opsional):
\`\`\`bash
# // TODO(verify): Jika ingin menjalankan agen sebagai systemd service permanen di VPS:
# sudo systemctl enable --now hermes-${slug}.service
\`\`\`
`;
}

export function generateHiringChecklist(slug: string, suggestedPort: number): string[] {
  return [
    `Buat profil Hermes: 'hermes profile create ${slug}'`,
    `Tulis isi SOUL.md ke '~/.hermes/profiles/${slug}/SOUL.md'`,
    `Setel API_SERVER_PORT=${suggestedPort} di '~/.hermes/profiles/${slug}/.env'`,
    `Jalankan gateway: 'hermes -p ${slug} gateway &'`,
    `Daftarkan agen ke Hermes Virtual Office melalui formulir di bawah`,
  ];
}

/**
 * Creates the complete Hiring Package with verified Phase 0 commands (Rule REQ-084 & REQ-092).
 * Server/test side package containing suggested server environment key name.
 */
export function generateHiringPackage(spec: AgentHiringSpec): HiringPackage {
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-agent';
  const soulMd = generateSoulMarkdown(spec);

  const hash = slug.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const suggestedPort = 8650 + (hash % 40);
  const apiKeyEnv = `HERMES_KEY_${slug.toUpperCase().replace(/-/g, '_')}`;

  const commandsMd = generateHiringCommands(spec, slug, suggestedPort, soulMd);
  const checklist = generateHiringChecklist(slug, suggestedPort);

  return {
    slug,
    soul_md: soulMd,
    commands_md: commandsMd,
    checklist,
    suggested_port: suggestedPort,
    api_key_env: apiKeyEnv,
  };
}
