import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, roleMayChangeStatus } from './workflow.js';

test('submitted complaint may enter review or be rejected', () => {
  assert.equal(canTransition('SUBMITTED', 'UNDER_REVIEW'), true);
  assert.equal(canTransition('SUBMITTED', 'CLOSED'), false);
});

test('department role cannot reject complaints', () => {
  assert.equal(roleMayChangeStatus('DEPARTMENT', 'IN_PROGRESS', 'REJECTED', true), false);
});

test('assigned department may resolve an in-progress complaint', () => {
  assert.equal(roleMayChangeStatus('DEPARTMENT', 'IN_PROGRESS', 'RESOLVED', true), true);
  assert.equal(roleMayChangeStatus('DEPARTMENT', 'IN_PROGRESS', 'RESOLVED', false), false);
});
