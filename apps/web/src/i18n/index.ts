/**
 * Internationalization Configuration (Rule REQ-099)
 * Default: Indonesian (id). Selectable: English (en).
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {
  id: {
    translation: {
      app: {
        title: 'Hermes Virtual Office',
        tagline: 'Kantor Virtual 2D untuk Pemilik & Agen AI',
      },
      nav: {
        office: 'Kantor',
        tasks: 'Tugas',
        inbox: 'Kotak Masuk',
        reports: 'Laporan',
        more: 'Lainnya',
      },
      hud: {
        activeRuns: 'Tugas Jalan',
        pendingApprovals: 'Persetujuan',
        errors: 'Galat',
        agentsOnline: 'Agen Online',
        ticker: 'Aktivitas Langsung',
        tickerWaiting: 'Menunggu aktivitas agen...',
        connected: 'Online',
        disconnected: 'Terputus',
      },
      rooms: {
        command: 'Pusat Komando',
        social: 'Studio Sosial',
        sales: 'Lantai Sales',
        finance: 'Ruang Finansial',
        marketing: 'Lab Pemasaran',
        analytics: 'Pusat Analitik',
        support: 'Meja Support',
        hr: 'Ruang Rekrutmen',
        lounge: 'Ruang Istirahat',
        approvalGate: 'Gerbang Persetujuan',
        all: 'Semua Ruang',
      },
      status: {
        idle: 'Santai',
        thinking: 'Berpikir',
        working: 'Bekerja',
        waiting_approval: 'Menunggu Persetujuan',
        error: 'Galat',
        offline: 'Offline',
      },
      office: {
        askOffice: 'Tanya Kantor',
        demoBadge: 'DEMO',
        emptyTitle: 'Kantor Virtual Masih Kosong',
        emptyDesc: 'Belum ada agen AI yang aktif di kantor ini. Muat kantor demo untuk melihat simulasi penempatan agen di seluruh divisi.',
        loadDemo: 'Muat Kantor Demo',
        loadingDemo: 'Menyiapkan agen demo...',
        orchestratorTitle: 'Orkestrator Kantor',
        orchestratorDesc: 'Kirim instruksi langsung ke Kepala Komando.',
        rooms: {
          command: 'Pusat Komando',
          social: 'Studio Sosial',
          sales: 'Lantai Sales',
          finance: 'Ruang Finansial',
          marketing: 'Lab Pemasaran',
          analytics: 'Pusat Analitik',
          support: 'Meja Support',
          hr: 'Ruang Rekrutmen',
          lounge: 'Ruang Istirahat',
          approvalGate: 'Gerbang Persetujuan',
          all: 'Semua Ruang',
        },
      },
      power: {
        label: 'Mode Hemat Daya',
        active: 'Hemat Daya Aktif (Animasi Dinonaktifkan)',
        toggle: 'Alihkan Hemat Daya',
      },
      tasks: {
        filterAll: 'Semua',
        filterManual: 'Langsung',
        filterChat: 'Dari Chat',
        badgeChat: 'Chat Auto-Task',
        badgeDirect: 'Direct',
        toolCalls: 'tool',
        toolCallsPlural: 'tools',
        tabResult: 'Hasil Output',
        tabEvents: 'Timeline Run',
        noEvents: 'Belum ada riwayat aktivitas run tercatat.',
        noResult: 'Belum ada hasil tertulis untuk tugas ini.',
        loadingEvents: 'Memuat timeline run...',
        close: 'Tutup',
        viewResult: 'Hasil',
        viewTimeline: 'Timeline',
        runNow: 'Jalankan',
        running: 'Menjalankan...',
        statusRunning: 'Berjalan',
        needsApproval: 'Persetujuan',
        empty: 'Kosong',
        createTask: 'Buat Tugas',
      },
      cron: {
        title: 'Jadwal Otomatis',
        tabBoard: 'Papan Tugas',
        tabCron: 'Jadwal Cron',
        empty: 'Belum ada jadwal tugas otomatis yang terdaftar di gateway.',
        active: 'Aktif',
        paused: 'Dijeda',
        lastRun: 'Terakhir dijalankan',
        nextRun: 'Jadwal berikutnya',
        assignedTo: 'Penanggung Jawab',
        schedule: 'Jadwal Rutin',
        skills: 'Keahlian Terkait',
      },
      lang: {
        switch: 'Ganti Bahasa',
        id: 'Bahasa Indonesia',
        en: 'English',
      },
    },
  },
  en: {
    translation: {
      app: {
        title: 'Hermes Virtual Office',
        tagline: '2D Virtual Office for CEO & AI Agents',
      },
      nav: {
        office: 'Office',
        tasks: 'Tasks',
        inbox: 'Inbox',
        reports: 'Reports',
        more: 'More',
      },
      hud: {
        activeRuns: 'Active Runs',
        pendingApprovals: 'Approvals',
        errors: 'Errors',
        agentsOnline: 'Online Agents',
        ticker: 'Live Stream',
        tickerWaiting: 'Waiting for agent events...',
        connected: 'Online',
        disconnected: 'Disconnected',
      },
      rooms: {
        command: 'Command Center',
        social: 'Social Studio',
        sales: 'Sales Floor',
        finance: 'Finance Vault',
        marketing: 'Marketing Lab',
        analytics: 'Analytics Hub',
        support: 'Support Desk',
        hr: 'Recruitment Room',
        lounge: 'Lounge',
        approvalGate: 'Approval Gate',
        all: 'All Rooms',
      },
      status: {
        idle: 'Idle',
        thinking: 'Thinking',
        working: 'Working',
        waiting_approval: 'Needs Approval',
        error: 'Error',
        offline: 'Offline',
      },
      office: {
        askOffice: 'Ask Office',
        demoBadge: 'DEMO',
        emptyTitle: 'Virtual Office is Empty',
        emptyDesc: 'No AI agents are currently active in this office. Load demo office to preview agents across all departments.',
        loadDemo: 'Load Demo Office',
        loadingDemo: 'Setting up demo agents...',
        orchestratorTitle: 'Office Orchestrator',
        orchestratorDesc: 'Send instructions directly to Command Chief.',
        rooms: {
          command: 'Command Center',
          social: 'Social Studio',
          sales: 'Sales Floor',
          finance: 'Finance Vault',
          marketing: 'Marketing Lab',
          analytics: 'Analytics Hub',
          support: 'Support Desk',
          hr: 'Recruitment Room',
          lounge: 'Lounge',
          approvalGate: 'Approval Gate',
          all: 'All Rooms',
        },
      },
      power: {
        label: 'Low Power Mode',
        active: 'Low Power Active (Animations Paused)',
        toggle: 'Toggle Low Power',
      },
      tasks: {
        filterAll: 'All',
        filterManual: 'Direct',
        filterChat: 'From Chat',
        badgeChat: 'Chat Auto-Task',
        badgeDirect: 'Direct',
        toolCalls: 'tool',
        toolCallsPlural: 'tools',
        tabResult: 'Result Output',
        tabEvents: 'Run Timeline',
        noEvents: 'No run timeline events recorded yet.',
        noResult: 'No written result for this task yet.',
        loadingEvents: 'Loading run timeline...',
        close: 'Close',
        viewResult: 'Result',
        viewTimeline: 'Timeline',
        runNow: 'Run',
        running: 'Running...',
        statusRunning: 'Running',
        needsApproval: 'Needs Approval',
        empty: 'Empty',
        createTask: 'Create Task',
      },
      cron: {
        title: 'Scheduled Tasks',
        tabBoard: 'Task Board',
        tabCron: 'Cron Schedules',
        empty: 'No automated cron schedules registered in gateway.',
        active: 'Active',
        paused: 'Paused',
        lastRun: 'Last executed',
        nextRun: 'Next run',
        assignedTo: 'Assigned Agent',
        schedule: 'Schedule',
        skills: 'Required Skills',
      },
      lang: {
        switch: 'Switch Language',
        id: 'Bahasa Indonesia',
        en: 'English',
      },
    },
  },
};

const savedLang = typeof localStorage !== 'undefined' ? localStorage.getItem('hermes_lang') || 'id' : 'id';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang,
    fallbackLng: 'id',
    interpolation: {
      escapeValue: false,
    },
  });

export function changeLanguage(lang: 'id' | 'en'): void {
  i18n.changeLanguage(lang);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('hermes_lang', lang);
  }
}

export default i18n;
