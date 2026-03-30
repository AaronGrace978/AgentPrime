const fs = require('fs');
const path = require('path');

const templatesDir = path.resolve(__dirname, '../templates');
const registryPath = path.join(templatesDir, 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

describe('Template Engine Contract', () => {
  it('registry templates should map to existing template folders', () => {
    for (const template of registry.templates) {
      const templateDir = path.join(templatesDir, template.id);
      const templateJsonPath = path.join(templateDir, 'template.json');

      expect(fs.existsSync(templateDir)).toBe(true);
      expect(fs.existsSync(templateJsonPath)).toBe(true);
    }
  });

  it('every template.json should align with registry metadata', () => {
    for (const template of registry.templates) {
      const templateJsonPath = path.join(templatesDir, template.id, 'template.json');
      const definition = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'));

      expect(definition.id).toBe(template.id);
      expect(definition.name).toBe(template.name);
      expect(Array.isArray(definition.files)).toBe(true);
      expect(definition.files.length).toBeGreaterThan(0);
      expect(definition.postCreate || []).toEqual(template.postCreate || []);
      expect(definition.requirements || []).toEqual(template.requirements || []);
    }
  });

  it('should only reference source files that exist on disk', () => {
    for (const template of registry.templates) {
      const templateDir = path.join(templatesDir, template.id);
      const definition = JSON.parse(fs.readFileSync(path.join(templateDir, 'template.json'), 'utf-8'));

      for (const file of definition.files) {
        const sourcePath = path.join(templateDir, file.template);
        expect(fs.existsSync(sourcePath)).toBe(true);
      }
    }
  });

  it('should keep categories in sync with template metadata', () => {
    const categoryIds = new Set(registry.categories.map((category) => category.id));

    for (const template of registry.templates) {
      expect(categoryIds.has(template.category)).toBe(true);
    }
  });
});
