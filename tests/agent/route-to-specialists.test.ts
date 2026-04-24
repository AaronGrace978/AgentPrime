import { routeToSpecialists } from '../../src/main/agent/specialized-agents';

describe('routeToSpecialists', () => {
  it('does not add pipeline_specialist for generic build wording on simple static sites', () => {
    const roles = routeToSpecialists('Build a simple marketing website for my store');
    expect(roles).toContain('tool_orchestrator');
    expect(roles).toContain('javascript_specialist');
    expect(roles).not.toContain('pipeline_specialist');
  });

  it('still adds pipeline_specialist for framework builds', () => {
    const roles = routeToSpecialists('Build a React dashboard with npm and CI');
    expect(roles).toContain('pipeline_specialist');
  });

  it('still adds pipeline_specialist when docker or deploy is mentioned on a simple site', () => {
    const roles = routeToSpecialists('Build a simple website and dockerize it for deploy');
    expect(roles).toContain('pipeline_specialist');
  });
});
