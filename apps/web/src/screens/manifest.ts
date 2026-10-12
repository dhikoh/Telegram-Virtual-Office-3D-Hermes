/**
 * Screen State Matrix Manifest (Section 8 & Rule C5 & Rule C3h)
 * Lists every screen of Section 8 and the six required state matrix representations:
 * - loading
 * - empty
 * - error
 * - offline
 * - success
 * - low-power
 */

export interface ScreenManifestEntry {
  id: string;
  name: string;
  componentPath: string;
  testPath: string;
  section: string;
  states: readonly ['loading', 'empty', 'error', 'offline', 'success', 'low-power'];
}

export const SCREEN_MANIFEST: readonly ScreenManifestEntry[] = [
  {
    id: 'office',
    name: 'Office (Home)',
    componentPath: 'apps/web/src/screens/Office.tsx',
    testPath: 'apps/web/src/screens/__tests__/Office.states.test.tsx',
    section: '8.1',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'tasks',
    name: 'Tasks (Kanban)',
    componentPath: 'apps/web/src/screens/Tasks.tsx',
    testPath: 'apps/web/src/screens/__tests__/Tasks.states.test.tsx',
    section: '8.3',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'inbox',
    name: 'Inbox (Approvals & Notifications)',
    componentPath: 'apps/web/src/screens/Inbox.tsx',
    testPath: 'apps/web/src/screens/__tests__/Inbox.states.test.tsx',
    section: '8.4',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'reports',
    name: 'Reports (KPIs & Intelligence)',
    componentPath: 'apps/web/src/screens/Reports.tsx',
    testPath: 'apps/web/src/screens/__tests__/Reports.states.test.tsx',
    section: '8.5',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'agents_registry',
    name: 'Agents Registry',
    componentPath: 'apps/web/src/components/more/AgentsRegistryModal.tsx',
    testPath: 'apps/web/src/screens/__tests__/AgentsRegistry.states.test.tsx',
    section: '8.6',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'recruitment_room',
    name: 'Recruitment Room',
    componentPath: 'apps/web/src/components/recruitment/RecruitmentWizard.tsx',
    testPath: 'apps/web/src/screens/__tests__/RecruitmentRoom.states.test.tsx',
    section: '8.6',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'audit_log',
    name: 'Audit Log',
    componentPath: 'apps/web/src/components/more/AuditLogModal.tsx',
    testPath: 'apps/web/src/screens/__tests__/AuditLog.states.test.tsx',
    section: '8.6',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'settings',
    name: 'Settings',
    componentPath: 'apps/web/src/screens/More.tsx',
    testPath: 'apps/web/src/screens/__tests__/Settings.states.test.tsx',
    section: '8.6',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
  {
    id: 'agent_sheet',
    name: 'Agent Sheet',
    componentPath: 'apps/web/src/components/agent-sheet/AgentSheet.tsx',
    testPath: 'apps/web/src/screens/__tests__/AgentSheet.states.test.tsx',
    section: '8.2',
    states: ['loading', 'empty', 'error', 'offline', 'success', 'low-power'],
  },
] as const;
