require('dotenv').config();
const Agent = require('../src/agent');

(async () => {
  try {
    const agentInstance = Agent.getAgent();
    await agentInstance.initialize();
    const res = await agentInstance.reindexProjectByName('process');
    console.log('REINDEX RESULT:', res);
  } catch (err) {
    console.error('ERR:', err);
    console.error('ERR stack:', err && err.stack);
  }
})();
