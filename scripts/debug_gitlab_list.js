const GitLabClient = require('../src/gitlab_client');

(async () => {
  try {
    const g = new GitLabClient();
    console.log('GitLabClient instantiated');
    const projects = await g.listGroupProjects();
    console.log('projects length=', projects.length);
    console.log(projects.slice(0,5));
  } catch (err) {
    console.error('ERR:', err);
    console.error('ERR stack:', err && err.stack);
    console.error('ERR message:', err && err.message);
  }
})();
