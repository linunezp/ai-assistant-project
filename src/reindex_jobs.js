const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const logger = require('winston');
const agentModule = require('./agent');

class ReindexJobs extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.queue = [];
    this.running = false;
    // arrancar worker
    this._processQueue().catch(err => logger.error('Error en worker de reindex_jobs:', err));
  }

  createJob(type, payload = {}) {
    const id = uuidv4();
    const job = {
      id,
      type,
      payload,
      status: 'pending',
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
      result: null
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    this.emit('job:created', job);
    return job;
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  async waitForCompletion(id, timeoutMs = 1000 * 60 * 2) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = this.getJob(id);
      if (!job) throw new Error('job_not_found');
      if (job.status === 'completed' || job.status === 'failed') return job;
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('wait_timeout');
  }

  async _processQueue() {
    if (this.running) return;
    this.running = true;
    while (true) {
      const jobId = this.queue.shift();
      if (!jobId) {
        // idle sleep
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const job = this.getJob(jobId);
      if (!job) continue;
      job.status = 'running';
      job.started_at = new Date().toISOString();
      this.emit('job:started', job);

      try {
        const agent = agentModule.getAgent();
        let result = null;
        if (job.type === 'project_reindex') {
          const { projectName, ref } = job.payload || {};
          result = await agent.reindexProjectByName(projectName, ref);
        } else if (job.type === 'group_reindex') {
          const { projects, ref, groupId } = job.payload || {};
          // If groupId provided, set it dynamically
          if (groupId && agent.gitlabClient && typeof agent.gitlabClient.setGroupId === 'function') {
            try { agent.gitlabClient.setGroupId(groupId); } catch (e) { logger.warn('No se pudo setGroupId en job:', e.message); }
          }
          result = await agent.reindexAllProjects({ projects, ref });
        } else {
          throw new Error('unknown_job_type');
        }

        job.status = 'completed';
        job.finished_at = new Date().toISOString();
        job.result = result;
        this.emit('job:completed', job);
      } catch (err) {
        job.status = 'failed';
        job.finished_at = new Date().toISOString();
        job.result = { success: false, reason: err.message || String(err) };
        logger.error(`Job ${jobId} failed:`, err && err.stack ? err.stack : err);
        this.emit('job:failed', job);
      }
    }
  }
}

const instance = new ReindexJobs();
module.exports = instance;
