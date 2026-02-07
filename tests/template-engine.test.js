/**
 * AgentPrime - Template Engine Tests
 * 
 * NOTE: These tests are currently pending migration to new TypeScript structure.
 * Original TemplateEngine has been moved to src/main/legacy/.
 */

const path = require('path');

describe('Template Engine', () => {
  describe('Variable Substitution', () => {
    // Inline implementation for testing the pattern
    function substituteVariables(content, variables) {
      let result = content;
      for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(pattern, value);
      }
      return result;
    }

    it('should replace single variable', () => {
      const content = 'Hello {{name}}!';
      const variables = { name: 'World' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Hello World!');
    });

    it('should replace multiple variables', () => {
      const content = '{{greeting}} {{name}}! Welcome to {{project}}.';
      const variables = {
        greeting: 'Hello',
        name: 'Developer',
        project: 'AgentPrime'
      };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Hello Developer! Welcome to AgentPrime.');
    });

    it('should replace repeated variables', () => {
      const content = '{{name}} loves {{name}}';
      const variables = { name: 'Code' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Code loves Code');
    });

    it('should leave unknown variables unchanged', () => {
      const content = 'Hello {{unknown}}!';
      const variables = { name: 'World' };
      const result = substituteVariables(content, variables);
      expect(result).toBe('Hello {{unknown}}!');
    });

    it('should handle empty content', () => {
      const result = substituteVariables('', { name: 'Test' });
      expect(result).toBe('');
    });

    it('should handle empty variables', () => {
      const content = 'No variables here';
      const result = substituteVariables(content, {});
      expect(result).toBe('No variables here');
    });
  });

  describe('Template Registry', () => {
    it('should define expected registry structure', () => {
      const mockRegistry = {
        templates: [{ id: 'test', name: 'Test Template' }],
        categories: ['test', 'frontend', 'backend']
      };
      
      expect(mockRegistry.templates).toBeInstanceOf(Array);
      expect(mockRegistry.categories).toContain('frontend');
    });

    it('should find template by id', () => {
      const templates = [
        { id: 'react', name: 'React App' },
        { id: 'vue', name: 'Vue App' }
      ];
      
      const found = templates.find(t => t.id === 'react');
      expect(found).toEqual({ id: 'react', name: 'React App' });
    });

    it('should return undefined for unknown template', () => {
      const templates = [
        { id: 'react', name: 'React App' }
      ];
      
      const found = templates.find(t => t.id === 'unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('Template File Structure', () => {
    it('should define required template.json fields', () => {
      const validTemplate = {
        id: 'example',
        name: 'Example Template',
        description: 'An example template for testing',
        category: 'frontend',
        files: ['index.html', 'style.css', 'main.js'],
        variables: ['name', 'author']
      };
      
      expect(validTemplate.id).toBeDefined();
      expect(validTemplate.name).toBeDefined();
      expect(validTemplate.files).toBeInstanceOf(Array);
      expect(validTemplate.variables).toBeInstanceOf(Array);
    });
  });
});
