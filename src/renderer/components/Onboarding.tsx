import React from 'react';

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🚀 Welcome to AgentPrime!</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="onboarding-content">
            <div className="onboarding-step">
              <h4>🧠 Meet Your AI Assistant</h4>
              <p>AgentPrime combines the power of multiple AI models with intelligent project management.</p>
            </div>

            <div className="onboarding-step">
              <h4>🎯 Key Features</h4>
              <ul>
                <li><strong>AI Composer:</strong> Natural language project creation</li>
                <li><strong>Smart Completions:</strong> Context-aware code suggestions</li>
                <li><strong>Mirror Intelligence:</strong> Learns from your coding patterns</li>
                <li><strong>Dino Buddy:</strong> Your friendly AI companion</li>
              </ul>
            </div>

            <div className="onboarding-step">
              <h4>⌨️ Quick Start</h4>
              <p>Try these commands:</p>
              <ul>
                <li><code>Ctrl+K</code> - Open command palette</li>
                <li><code>Ctrl+Shift+P</code> - AI Composer</li>
                <li><code>Ctrl+Shift+M</code> - Mirror Intelligence</li>
              </ul>
            </div>

            <div className="onboarding-actions">
              <button className="btn-primary" onClick={onClose}>
                Get Started! 🎉
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;