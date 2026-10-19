# AGENTS.md — Hermes Virtual Office Project Rules

This project operates strictly under the **Phase-Gated & Memory Bank Development Protocol** defined in `.agent/rules.md`.

## 3 HUKUM MUTLAK (ABSOLUTE LAWS)
1. **ZERO-GAP & NO PLACEHOLDER**:
   Dilarang keras menulis `// TODO`, `// ... rest of code`, stub kosong, mock palsu pada production path, atau fungsi tanpa implementasi nyata. Semua koneksi antar-layer (Database -> Repository -> Service -> Route -> Shared Schema -> Frontend Store -> UI) harus 100% utuh dan type-safe.
2. **STRICT SINGLE SUB-TASK**:
   Berdasarkan `.agent/workflows/process-task-list.md`, kerjakan HANYA SATU sub-task pada satu waktu. Setelah selesai, verifikasi dengan `npm run typecheck`, `npm test`, dan `npm run gap-check`. Centang `[x]`, perbarui Memory Bank, lalu **BERHENTI (STOP)** dan tunggu persetujuan/instruksi user.
3. **MEMORY SYNC**:
   Selalu baca seluruh file di `memory-bank/` di awal sesi, dan perbarui (`activeContext.md` serta `progress.md`) setiap kali menyelesaikan satu sub-task / sub-fase.

## WORKFLOWS & WORKSPACE STRUCTURE
- Workflows directory: `.agent/workflows/` (`create-prd.md`, `generate-tasks.md`, `process-task-list.md`, `memory-bank-rules.md`)
- Memory Bank directory: `memory-bank/` (`projectbrief.md`, `systemPatterns.md`, `activeContext.md`, `progress.md`)
- Detailed Rules: Refer to [rules.md](file:///d:/Workspace%20Virtual/VPS%20Mini%20App/.agent/rules.md)
