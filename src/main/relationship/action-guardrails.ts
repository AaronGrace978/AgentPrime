/**
 * ActionGuardrails - Safety system for Matrix Agent
 * 
 * "I can only show you the door. You're the one that has to walk through it."
 * ...unless it's a dangerous door, then I'll definitely ask first.
 */

import type { 
  GuardrailResult, 
  ActionRisk, 
  TrustLevel,
  UserMood 
} from './types';
import { TrustLevel as TL } from './types';
import { getUserProfileManager } from './user-profile';

/**
 * Action classification rules
 */
interface ActionRule {
  patterns: RegExp[];
  risk: ActionRisk;
  description: string;
  neverAutoExecute?: boolean;  // Even at Neo level, ask first
}

const ACTION_RULES: ActionRule[] = [
  // Critical - Never auto-execute
  {
    patterns: [/delete.*file/i, /rm\s+-rf/i, /remove.*all/i, /format.*disk/i],
    risk: 'critical',
    description: 'File/data deletion',
    neverAutoExecute: true
  },
  {
    patterns: [/password/i, /credential/i, /secret/i, /api.?key/i, /token/i],
    risk: 'critical',
    description: 'Credential handling',
    neverAutoExecute: true
  },
  {
    patterns: [/bank/i, /payment/i, /credit.?card/i, /paypal/i, /venmo/i],
    risk: 'critical',
    description: 'Financial operations',
    neverAutoExecute: true
  },
  {
    patterns: [/sudo/i, /admin/i, /root/i, /system32/i, /registry/i],
    risk: 'critical',
    description: 'System administration',
    neverAutoExecute: true
  },
  
  // High risk
  {
    patterns: [/login/i, /sign.?in/i, /authenticate/i],
    risk: 'high',
    description: 'Authentication'
  },
  {
    patterns: [/download/i, /install/i, /execute/i, /run.*script/i],
    risk: 'high',
    description: 'Software installation/execution'
  },
  {
    patterns: [/email/i, /send.*message/i, /post.*to/i, /share/i],
    risk: 'high',
    description: 'Communication/sharing'
  },
  {
    patterns: [/modify.*settings/i, /change.*config/i, /update.*system/i],
    risk: 'high',
    description: 'System configuration'
  },
  
  // Medium risk
  {
    patterns: [/open.*url/i, /browse.*to/i, /navigate.*to/i, /go.*to.*http/i],
    risk: 'medium',
    description: 'Web navigation'
  },
  {
    patterns: [/type/i, /enter.*text/i, /fill.*form/i],
    risk: 'medium',
    description: 'Text input'
  },
  {
    patterns: [/click/i, /press.*button/i, /select/i],
    risk: 'medium',
    description: 'UI interaction'
  },
  {
    patterns: [/open.*app/i, /launch/i, /start.*program/i],
    risk: 'medium',
    description: 'Application launch'
  },
  
  // Low risk
  {
    patterns: [/scroll/i, /move.*mouse/i, /hover/i],
    risk: 'low',
    description: 'Navigation'
  },
  {
    patterns: [/focus.*window/i, /switch.*to/i, /alt.?tab/i],
    risk: 'low',
    description: 'Window management'
  },
  {
    patterns: [/screenshot/i, /capture.*screen/i, /take.*picture/i],
    risk: 'low',
    description: 'Screen capture'
  },
  
  // Safe
  {
    patterns: [/search/i, /find/i, /look.*for/i, /what.*is/i],
    risk: 'safe',
    description: 'Information lookup'
  },
  {
    patterns: [/show/i, /display/i, /list/i, /read/i],
    risk: 'safe',
    description: 'Read-only display'
  }
];

/**
 * Trust level permissions matrix
 */
const TRUST_PERMISSIONS: Record<TrustLevel, ActionRisk[]> = {
  [TL.GUARDIAN]: ['safe'],  // Only safe actions without asking
  [TL.OPERATOR]: ['safe', 'low'],  // Safe and low risk
  [TL.ARCHITECT]: ['safe', 'low', 'medium'],  // Up to medium
  [TL.NEO]: ['safe', 'low', 'medium', 'high']  // Everything except critical
};

/**
 * ActionGuardrails - The safety system
 */
export class ActionGuardrails {
  constructor() {
    console.log('🛡️ [Matrix] Action guardrails activated');
  }

  /**
   * Check if an action is allowed
   */
  checkAction(
    action: string,
    actionType: string,
    trustLevel: TrustLevel,
    mood?: UserMood
  ): GuardrailResult {
    // Classify the action
    const risk = this.classifyRisk(action, actionType);
    
    // Check if this action type has been approved before
    const profileManager = getUserProfileManager();
    const previouslyApproved = profileManager.hasApprovedActionType(actionType);
    
    // Check against trust permissions
    const allowedRisks = TRUST_PERMISSIONS[trustLevel];
    const canAutoExecute = allowedRisks.includes(risk);
    
    // Check for never-auto-execute rules
    const rule = this.findMatchingRule(action, actionType);
    const neverAuto = rule?.neverAutoExecute || false;
    
    // Determine if confirmation is needed
    let requiresConfirmation = false;
    let reason = '';
    
    if (neverAuto) {
      requiresConfirmation = true;
      reason = `This is a critical action (${rule?.description}). Always requires confirmation.`;
    } else if (!canAutoExecute) {
      requiresConfirmation = true;
      reason = `Action risk level (${risk}) exceeds current trust level permissions.`;
    } else if (previouslyApproved) {
      requiresConfirmation = false;
      reason = `Previously approved action type.`;
    } else if (risk === 'medium' && trustLevel < TL.ARCHITECT) {
      requiresConfirmation = true;
      reason = `Medium-risk action requires higher trust level.`;
    }
    
    // Mood adjustments
    if (mood === 'rushed' && risk === 'low') {
      // User is in a hurry, skip confirmation for low-risk
      requiresConfirmation = false;
      reason += ' (User mood: rushed - skipping low-risk confirmation)';
    }
    
    if (mood === 'frustrated' && risk !== 'safe') {
      // User is frustrated, be more careful
      if (risk === 'medium' || risk === 'high') {
        requiresConfirmation = true;
        reason += ' (User mood: frustrated - extra caution)';
      }
    }
    
    // Generate confirmation prompt
    const suggestedPrompt = requiresConfirmation 
      ? this.generateConfirmationPrompt(action, actionType, risk, rule?.description)
      : undefined;
    
    return {
      allowed: !neverAuto || trustLevel === TL.NEO, // Critical actions need Neo level
      requiresConfirmation,
      reason,
      riskLevel: risk,
      suggestedPrompt
    };
  }

  /**
   * Classify action risk level
   */
  private classifyRisk(action: string, actionType: string): ActionRisk {
    const combined = `${action} ${actionType}`.toLowerCase();
    
    for (const rule of ACTION_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(combined)) {
          return rule.risk;
        }
      }
    }
    
    // Default based on action type
    switch (actionType) {
      case 'screenshot':
      case 'wait':
        return 'safe';
      case 'scroll':
      case 'focus_window':
        return 'low';
      case 'click':
      case 'type':
      case 'open_url':
        return 'medium';
      case 'hotkey':
      case 'login':
        return 'high';
      default:
        return 'medium';
    }
  }

  /**
   * Find matching rule for action
   */
  private findMatchingRule(action: string, actionType: string): ActionRule | undefined {
    const combined = `${action} ${actionType}`.toLowerCase();
    
    for (const rule of ACTION_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(combined)) {
          return rule;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Generate Matrix-style confirmation prompt
   */
  private generateConfirmationPrompt(
    action: string,
    actionType: string,
    risk: ActionRisk,
    description?: string
  ): string {
    const riskEmoji = {
      'safe': '✅',
      'low': '🟢',
      'medium': '🟡',
      'high': '🟠',
      'critical': '🔴'
    };
    
    const emoji = riskEmoji[risk];
    const truncatedAction = action.length > 50 ? action.substring(0, 50) + '...' : action;
    
    if (risk === 'critical') {
      return `${emoji} **Red Pill Alert**\n` +
        `This is a critical operation: ${description || actionType}\n` +
        `Action: ${truncatedAction}\n\n` +
        `⚠️ This action cannot be undone. Do you want to proceed?`;
    }
    
    if (risk === 'high') {
      return `${emoji} **Operator Confirmation Required**\n` +
        `High-risk action detected: ${description || actionType}\n` +
        `Action: ${truncatedAction}\n\n` +
        `Should I proceed?`;
    }
    
    return `${emoji} **Quick Check**\n` +
      `${description || actionType}: ${truncatedAction}\n` +
      `Proceed?`;
  }

  /**
   * Get risk level for display
   */
  getRiskDisplay(risk: ActionRisk): string {
    const displays: Record<ActionRisk, string> = {
      'safe': '✅ Safe',
      'low': '🟢 Low Risk',
      'medium': '🟡 Medium Risk',
      'high': '🟠 High Risk',
      'critical': '🔴 Critical'
    };
    return displays[risk];
  }

  /**
   * Check if action matches any critical patterns
   */
  isCriticalAction(action: string, actionType: string): boolean {
    const combined = `${action} ${actionType}`.toLowerCase();
    
    for (const rule of ACTION_RULES) {
      if (rule.risk === 'critical') {
        for (const pattern of rule.patterns) {
          if (pattern.test(combined)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Emergency block - immediately stop an action
   */
  emergencyBlock(reason: string): GuardrailResult {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `🛑 EMERGENCY BLOCK: ${reason}`,
      riskLevel: 'critical',
      suggestedPrompt: undefined
    };
  }
}

// Singleton
let _guardrails: ActionGuardrails | null = null;

export function getActionGuardrails(): ActionGuardrails {
  if (!_guardrails) {
    _guardrails = new ActionGuardrails();
  }
  return _guardrails;
}
