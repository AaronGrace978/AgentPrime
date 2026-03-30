const fs = require('fs');
const path = require('path');

describe('Template packaging configuration', () => {
  it('ships templates as extra resources', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')
    );

    const extraResources = packageJson.build?.extraResources || [];
    const templateResource = extraResources.find((resource) => resource.from === 'templates/');

    expect(templateResource).toBeTruthy();
    expect(templateResource.to).toBe('templates/');
  });

  it('looks up packaged templates from the resources directory', () => {
    const mainProcessSource = fs.readFileSync(
      path.resolve(__dirname, '../src/main/main.ts'),
      'utf-8'
    );

    expect(mainProcessSource).toContain("path.join(process.resourcesPath, 'templates')");
  });
});
