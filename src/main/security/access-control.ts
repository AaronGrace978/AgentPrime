/**
 * AgentPrime - Access Control
 * Role-based access control (RBAC) system
 */

import { getEnterpriseSecurityManager } from './enterprise-security';

/**
 * Permission definition
 */
export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
}

/**
 * Role definition
 */
export interface Role {
  id: string;
  name: string;
  permissions: string[]; // Permission IDs
  inherits?: string[]; // Role IDs to inherit from
}

/**
 * Access Control - RBAC implementation
 */
export class AccessControl {
  private permissions: Map<string, Permission> = new Map();
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, string[]> = new Map(); // userId -> roleIds

  constructor() {
    this.initializeDefaultPermissions();
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default permissions
   */
  private initializeDefaultPermissions(): void {
    const defaultPermissions: Permission[] = [
      // Code permissions
      { id: 'code:read', name: 'Read Code', resource: 'code', action: 'read', description: 'Read code files' },
      { id: 'code:write', name: 'Write Code', resource: 'code', action: 'write', description: 'Write/modify code files' },
      { id: 'code:delete', name: 'Delete Code', resource: 'code', action: 'delete', description: 'Delete code files' },
      
      // AI permissions
      { id: 'ai:use', name: 'Use AI', resource: 'ai', action: 'use', description: 'Use AI features' },
      { id: 'ai:configure', name: 'Configure AI', resource: 'ai', action: 'configure', description: 'Configure AI settings' },
      
      // File permissions
      { id: 'files:read', name: 'Read Files', resource: 'files', action: 'read', description: 'Read files' },
      { id: 'files:write', name: 'Write Files', resource: 'files', action: 'write', description: 'Write files' },
      { id: 'files:delete', name: 'Delete Files', resource: 'files', action: 'delete', description: 'Delete files' },
      
      // Refactoring permissions
      { id: 'refactor:execute', name: 'Execute Refactoring', resource: 'refactor', action: 'execute', description: 'Execute refactoring operations' },
      { id: 'refactor:preview', name: 'Preview Refactoring', resource: 'refactor', action: 'preview', description: 'Preview refactoring changes' },
      
      // Admin permissions
      { id: 'admin:users', name: 'Manage Users', resource: 'admin', action: 'users', description: 'Manage users and roles' },
      { id: 'admin:settings', name: 'Manage Settings', resource: 'admin', action: 'settings', description: 'Manage system settings' },
      { id: 'admin:security', name: 'Manage Security', resource: 'admin', action: 'security', description: 'Manage security settings' }
    ];

    for (const perm of defaultPermissions) {
      this.permissions.set(perm.id, perm);
    }
  }

  /**
   * Initialize default roles
   */
  private initializeDefaultRoles(): void {
    const defaultRoles: Role[] = [
      {
        id: 'admin',
        name: 'Administrator',
        permissions: ['*'], // All permissions
        inherits: []
      },
      {
        id: 'developer',
        name: 'Developer',
        permissions: [
          'code:read',
          'code:write',
          'ai:use',
          'files:read',
          'files:write',
          'refactor:execute',
          'refactor:preview'
        ],
        inherits: []
      },
      {
        id: 'viewer',
        name: 'Viewer',
        permissions: [
          'code:read',
          'files:read'
        ],
        inherits: []
      }
    ];

    for (const role of defaultRoles) {
      this.roles.set(role.id, role);
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const userRoleIds = this.userRoles.get(userId) || ['developer']; // Default to developer
    const permissionId = `${resource}:${action}`;

    for (const roleId of userRoleIds) {
      const role = this.roles.get(roleId);
      if (!role) continue;

      // Check direct permissions
      if (role.permissions.includes('*') || role.permissions.includes(permissionId)) {
        return true;
      }

      // Check inherited roles
      if (role.inherits) {
        for (const inheritedRoleId of role.inherits) {
          const inheritedRole = this.roles.get(inheritedRoleId);
          if (inheritedRole && (inheritedRole.permissions.includes('*') || inheritedRole.permissions.includes(permissionId))) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Assign role to user
   */
  assignRole(userId: string, roleId: string): void {
    if (!this.roles.has(roleId)) {
      throw new Error(`Role ${roleId} does not exist`);
    }

    const currentRoles = this.userRoles.get(userId) || [];
    if (!currentRoles.includes(roleId)) {
      this.userRoles.set(userId, [...currentRoles, roleId]);
    }
  }

  /**
   * Remove role from user
   */
  removeRole(userId: string, roleId: string): void {
    const currentRoles = this.userRoles.get(userId) || [];
    this.userRoles.set(userId, currentRoles.filter(id => id !== roleId));
  }

  /**
   * Get user roles
   */
  getUserRoles(userId: string): Role[] {
    const roleIds = this.userRoles.get(userId) || ['developer'];
    return roleIds.map(id => this.roles.get(id)!).filter(Boolean);
  }

  /**
   * Create custom role
   */
  createRole(role: Role): void {
    if (this.roles.has(role.id)) {
      throw new Error(`Role ${role.id} already exists`);
    }

    // Validate permissions
    for (const permId of role.permissions) {
      if (permId !== '*' && !this.permissions.has(permId)) {
        throw new Error(`Permission ${permId} does not exist`);
      }
    }

    this.roles.set(role.id, role);
  }

  /**
   * Get all permissions
   */
  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  /**
   * Get all roles
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }
}

// Singleton instance
let accessControlInstance: AccessControl | null = null;

export function getAccessControl(): AccessControl {
  if (!accessControlInstance) {
    accessControlInstance = new AccessControl();
  }
  return accessControlInstance;
}

