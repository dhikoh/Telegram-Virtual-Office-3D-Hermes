import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { runMigrations } from './db/migrator.js';
import { AgentRepository, coalesce as agentCoalesce } from './db/repositories/agents.js';
import { TaskRepository, coalesce as taskCoalesce } from './db/repositories/tasks.js';
import { ProjectRepository, coalesce as projectCoalesce } from './db/repositories/projects.js';

describe('Repository Updates & Coalesce (C4 Audit)', () => {
  let db: BetterSqlite3.Database;
  let agentRepo: AgentRepository;
  let taskRepo: TaskRepository;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db);
    agentRepo = new AgentRepository(db);
    taskRepo = new TaskRepository(db);
    projectRepo = new ProjectRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('coalesce helper', () => {
    it('returns current value when incoming is undefined', () => {
      expect(agentCoalesce(undefined, 'current')).toBe('current');
      expect(taskCoalesce(undefined, 'current')).toBe('current');
      expect(projectCoalesce(undefined, 'current')).toBe('current');
    });

    it('returns null when incoming is explicitly null', () => {
      expect(agentCoalesce(null, 'current')).toBe(null);
      expect(taskCoalesce(null, 'current')).toBe(null);
      expect(projectCoalesce(null, 'current')).toBe(null);
    });

    it('returns incoming when incoming is defined', () => {
      expect(agentCoalesce('new', 'current')).toBe('new');
      expect(taskCoalesce('new', 'current')).toBe('new');
      expect(projectCoalesce('new', 'current')).toBe('new');
    });
  });

  describe('AgentRepository.update', () => {
    it('does not overwrite existing fields with undefined (C4)', () => {
      const now = Date.now();
      agentRepo.create({
        id: 'agent_test_c4',
        name: 'Original Name',
        role: 'Original Role',
        department: 'engineering',
        avatar: '🤖',
        soul_summary: 'Test summary',
        hermes_base_url: 'http://localhost:8642',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
        is_system: 0,
      });

      // Update only role with name as undefined
      agentRepo.update('agent_test_c4', {
        role: 'Ketua',
        name: undefined,
      });

      const updated = agentRepo.getById('agent_test_c4');
      expect(updated).not.toBeNull();
      expect(updated?.role).toBe('Ketua');
      expect(updated?.name).toBe('Original Name');
      expect(updated?.department).toBe('engineering');
      expect(updated?.avatar).toBe('🤖');
    });
  });

  describe('TaskRepository.update', () => {
    it('does not overwrite existing fields like agent_id with undefined (C4)', () => {
      const now = Date.now();
      agentRepo.create({
        id: 'agent_for_task',
        name: 'Task Agent',
        role: 'Worker',
        department: 'engineering',
        avatar: '🤖',
        soul_summary: 'Test summary',
        hermes_base_url: 'http://localhost:8642',
        api_key_env: 'KEY',
        hermes_profile: 'default',
        active: 1,
        hired_at: now,
        created_at: now,
        is_system: 0,
      });

      taskRepo.create({
        id: 'task_test_c4',
        title: 'Original Title',
        description: 'Original Description',
        agent_id: 'agent_for_task',
        priority: 'normal',
        status: 'backlog',
        created_by: 123456789,
        created_at: now,
        updated_at: now,
        run_id: null,
        result_md: null,
        due_at: null,
      });

      // Update only status with agent_id as undefined
      taskRepo.update('task_test_c4', {
        status: 'done',
        agent_id: undefined,
        description: undefined,
      });

      const updated = taskRepo.getById('task_test_c4');
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('done');
      expect(updated?.agent_id).toBe('agent_for_task');
      expect(updated?.title).toBe('Original Title');
      expect(updated?.description).toBe('Original Description');
    });
  });

  describe('ProjectRepository.update', () => {
    it('does not overwrite existing fields with undefined (C4)', () => {
      const now = Date.now();
      projectRepo.create({
        id: 'project_test_c4',
        title: 'Original Project Title',
        goal: 'Original Goal',
        status: 'draft',
        created_by: 123456789,
        created_at: now,
        completed_at: null,
        summary: 'Original Summary',
        decompose_error: null,
      });

      // Update status only with title and goal as undefined
      projectRepo.update('project_test_c4', {
        status: 'running',
        title: undefined,
        goal: undefined,
      });

      const updated = projectRepo.getById('project_test_c4');
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('running');
      expect(updated?.title).toBe('Original Project Title');
      expect(updated?.goal).toBe('Original Goal');
      expect(updated?.summary).toBe('Original Summary');
    });
  });

  describe('AgentRepository.updateProvisionState', () => {
    it('initializes agent with default unprovisioned state and updates through provisioning lifecycle', () => {
      const now = Date.now();
      agentRepo.create({
        id: 'agent_provision_test',
        name: 'Provision Test Agent',
        role: 'Tester',
        department: 'analytics',
        avatar: '📊',
        soul_summary: 'Test summary',
        hermes_base_url: 'http://localhost:8642',
        api_key_env: 'KEY',
        hermes_profile: 'analytics_tester',
        active: 1,
        hired_at: now,
        created_at: now,
      });

      const initial = agentRepo.getById('agent_provision_test');
      expect(initial?.provision_state).toBe('unprovisioned');
      expect(initial?.provision_error).toBeNull();
      expect(initial?.provisioned_at).toBeNull();

      // Transition to provisioning
      agentRepo.updateProvisionState('agent_provision_test', 'provisioning');
      const provisioning = agentRepo.getById('agent_provision_test');
      expect(provisioning?.provision_state).toBe('provisioning');
      expect(provisioning?.provision_error).toBeNull();

      // Transition to ready (auto sets provisioned_at if not provided)
      agentRepo.updateProvisionState('agent_provision_test', 'ready');
      const ready = agentRepo.getById('agent_provision_test');
      expect(ready?.provision_state).toBe('ready');
      expect(ready?.provision_error).toBeNull();
      expect(typeof ready?.provisioned_at).toBe('number');
      expect(ready!.provisioned_at!).toBeGreaterThan(0);

      // Transition to failed with error message
      agentRepo.updateProvisionState('agent_provision_test', 'failed', 'Network timeout while writing SOUL.md');
      const failed = agentRepo.getById('agent_provision_test');
      expect(failed?.provision_state).toBe('failed');
      expect(failed?.provision_error).toBe('Network timeout while writing SOUL.md');
      // Previous provisioned_at is preserved
      expect(failed?.provisioned_at).toBe(ready?.provisioned_at);
    });
  });
});
