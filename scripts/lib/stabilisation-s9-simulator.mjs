import assert from "node:assert/strict";

export const JOB_STATES = [
  "QUEUED", "RUNNING", "COMPLETED", "NO_RESULTS", "EXHAUSTED",
  "PAUSED", "CANCELLED", "FAILED_RETRYABLE", "FAILED_TERMINAL",
];

export const TRANSITIONS = {
  QUEUED: ["RUNNING", "PAUSED", "CANCELLED"],
  RUNNING: ["COMPLETED", "NO_RESULTS", "EXHAUSTED", "PAUSED", "CANCELLED", "FAILED_RETRYABLE", "FAILED_TERMINAL"],
  COMPLETED: [], NO_RESULTS: [], EXHAUSTED: [],
  PAUSED: ["QUEUED", "CANCELLED"], CANCELLED: [],
  FAILED_RETRYABLE: ["QUEUED", "FAILED_TERMINAL", "CANCELLED"],
  FAILED_TERMINAL: [],
};

export const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = [1, 5, 30, 120];
const NO_RESULT_MINUTES = [30, 120, 720, 1440];

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function retryDelayMinutes(attemptCount, code) {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const base = RETRY_MINUTES[Math.min(Math.max(attemptCount - 1, 0), RETRY_MINUTES.length - 1)];
  return code === "RATE_LIMIT" ? Math.max(base, 5) : base;
}

export function noResultCooldownMinutes(emptyCycleCount) {
  return NO_RESULT_MINUTES[Math.min(Math.max(emptyCycleCount, 0), NO_RESULT_MINUTES.length - 1)];
}

export function deriveCampaignStage(f) {
  if (f.campaignArchived) return "ARCHIVED";
  if (f.campaignPaused) return "PAUSED";
  if (!f.businessAnalysisReady) return "BUSINESS_ANALYSIS";
  if (!f.campaignApproved) return "CAMPAIGN_REVIEW";
  if (f.opportunitiesCreated) return "OPPORTUNITIES";
  if (f.repliesReceived) return "REPLIES";
  if (f.outreachStarted) return "OUTREACH";
  if (f.approvedReachableContacts > 0 && f.contactsAwaitingReview === 0 && !f.contactDiscoveryActive) return "OUTREACH_READY";
  if (f.contactsAwaitingReview > 0) return "CONTACT_REVIEW";
  if (f.contactDiscoveryActive || f.approvedCompanies > 0) return "CONTACT_DISCOVERY";
  if (f.companiesAwaitingReview > 0) return "COMPANY_REVIEW";
  return "COMPANY_DISCOVERY";
}

function seededRandom(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export class PipelineSimulator {
  constructor({ seed = 42, maxAttempts = MAX_ATTEMPTS } = {}) {
    this.random = seededRandom(seed);
    this.maxAttempts = maxAttempts;
    this.now = 0;
    this.runSequence = 0;
    this.jobSequence = 0;
    this.schedulerLocked = false;
    this.jobs = [];
    this.timelineKeys = new Set();
    this.timeline = [];
    this.campaign = {
      id: "campaign-1",
      paused: false,
      archived: false,
      approvedCompanies: new Set(),
      pendingCompanies: 0,
      pendingContacts: 0,
      approvedReachableContacts: 0,
      companyCooldownUntil: 0,
      emptyCompanyCycles: 0,
    };
    this.metrics = {
      runs: 0, duplicateActiveJobs: 0, illegalTransitions: 0,
      duplicateTimelineEvents: 0, recoveredLeases: 0, terminalFailures: 0,
    };
  }

  activeJobs(type, scopeId = null) {
    return this.jobs.filter((j) => j.type === type && ["QUEUED", "RUNNING"].includes(j.state) && (!scopeId || j.scopeId === scopeId));
  }

  addTimeline(key, message) {
    if (this.timelineKeys.has(key)) {
      this.metrics.duplicateTimelineEvents += 1;
      return false;
    }
    this.timelineKeys.add(key);
    this.timeline.push({ key, message, at: this.now });
    return true;
  }

  createJob(type, scopeId = this.campaign.id) {
    const existing = this.activeJobs(type, scopeId);
    if (existing.length) return existing[0];
    const job = {
      id: `job-${++this.jobSequence}`, type, scopeId, state: "QUEUED",
      attemptCount: 0, leaseExpiresAt: null, nextRetryAt: null,
      progress: 0, emptyResult: false, retryQueued: false, createdAt: this.now,
    };
    this.jobs.push(job);
    return job;
  }

  transition(job, to) {
    if (!canTransition(job.state, to)) {
      this.metrics.illegalTransitions += 1;
      throw new Error(`illegal transition ${job.state}->${to}`);
    }
    job.state = to;
  }

  recoverExpiredLeases() {
    for (const job of this.jobs) {
      if (job.state === "RUNNING" && job.leaseExpiresAt != null && job.leaseExpiresAt <= this.now) {
        this.transition(job, "FAILED_RETRYABLE");
        job.progress = 0;
        job.nextRetryAt = this.now + (retryDelayMinutes(job.attemptCount, "WORKER_LEASE_EXPIRED") ?? 0);
        this.metrics.recoveredLeases += 1;
      }
    }
  }

  requeueDueRetries() {
    for (const job of this.jobs) {
      if (job.state === "FAILED_RETRYABLE" && job.nextRetryAt != null && job.nextRetryAt <= this.now) {
        if (job.attemptCount >= this.maxAttempts) {
          this.transition(job, "FAILED_TERMINAL");
          this.metrics.terminalFailures += 1;
        } else {
          this.transition(job, "QUEUED");
          job.retryQueued = true;
          job.nextRetryAt = null;
        }
      }
    }
  }

  prepareWork() {
    if (this.campaign.paused || this.campaign.archived) return;
    const companyPending = this.jobs.some((j) =>
      j.type === "COMPANY_DISCOVERY" && ["QUEUED", "RUNNING", "FAILED_RETRYABLE", "PAUSED"].includes(j.state)
    );
    if (!companyPending && this.campaign.pendingCompanies < 6 && this.now >= this.campaign.companyCooldownUntil) {
      const job = this.createJob("COMPANY_DISCOVERY");
      this.addTimeline(`company-cycle:${job.id}`, "Company discovery continuing");
    }
    for (const companyId of this.campaign.approvedCompanies) {
      const existing = this.jobs.some((j) =>
        j.type === "CONTACT_DISCOVERY" && j.scopeId === companyId &&
        ["QUEUED", "RUNNING", "FAILED_RETRYABLE", "PAUSED", "COMPLETED", "NO_RESULTS", "EXHAUSTED", "FAILED_TERMINAL"].includes(j.state)
      );
      if (!existing) this.createJob("CONTACT_DISCOVERY", companyId);
    }
  }

  claimOne(type) {
    const job = this.jobs.find((j) => j.type === type && j.state === "QUEUED" && !j.retryQueued)
      ?? this.jobs.find((j) => j.type === type && j.state === "QUEUED");
    if (!job) return null;
    this.transition(job, "RUNNING");
    job.attemptCount += 1;
    job.retryQueued = false;
    job.progress = 10;
    job.leaseExpiresAt = this.now + 5;
    return job;
  }

  execute(job, outcome) {
    if (!job) return;
    if (outcome === "SUCCESS") {
      job.progress = 100;
      this.transition(job, "COMPLETED");
      job.leaseExpiresAt = null;
      if (job.type === "COMPANY_DISCOVERY") {
        const found = 1 + Math.floor(this.random() * 5);
        this.campaign.pendingCompanies += found;
        this.campaign.emptyCompanyCycles = 0;
      } else {
        this.campaign.pendingContacts += 1;
      }
      return;
    }
    if (outcome === "NO_RESULTS") {
      job.progress = 100;
      this.transition(job, "NO_RESULTS");
      job.leaseExpiresAt = null;
      if (job.type === "COMPANY_DISCOVERY") {
        this.campaign.emptyCompanyCycles += 1;
        this.campaign.companyCooldownUntil = this.now + noResultCooldownMinutes(this.campaign.emptyCompanyCycles - 1);
      }
      return;
    }
    if (outcome === "INTERRUPT") {
      job.progress = 40;
      job.leaseExpiresAt = this.now;
      return;
    }
    const code = outcome === "RATE_LIMIT" ? "RATE_LIMIT" : "NETWORK";
    const delay = retryDelayMinutes(job.attemptCount, code);
    job.progress = 0;
    job.leaseExpiresAt = null;
    if (delay == null) {
      this.transition(job, "FAILED_TERMINAL");
      this.metrics.terminalFailures += 1;
    } else {
      this.transition(job, "FAILED_RETRYABLE");
      job.nextRetryAt = this.now + delay;
    }
  }

  chooseOutcome() {
    const r = this.random();
    if (r < 0.62) return "SUCCESS";
    if (r < 0.74) return "NO_RESULTS";
    if (r < 0.82) return "NETWORK";
    if (r < 0.89) return "RATE_LIMIT";
    if (r < 0.96) return "INTERRUPT";
    return "SUCCESS";
  }

  runScheduler({ forcedCompanyOutcome, forcedContactOutcome } = {}) {
    if (this.schedulerLocked) return { acquired: false };
    this.schedulerLocked = true;
    const runId = `run-${++this.runSequence}`;
    this.metrics.runs += 1;
    try {
      this.recoverExpiredLeases();
      this.requeueDueRetries();
      this.prepareWork();
      const company = this.claimOne("COMPANY_DISCOVERY");
      this.execute(company, forcedCompanyOutcome ?? this.chooseOutcome());
      const contact = this.claimOne("CONTACT_DISCOVERY");
      this.execute(contact, forcedContactOutcome ?? this.chooseOutcome());
      this.assertInvariants();
      return { acquired: true, runId, company, contact };
    } finally {
      this.schedulerLocked = false;
    }
  }

  assertInvariants() {
    const groups = new Map();
    for (const job of this.jobs.filter((j) => ["QUEUED", "RUNNING"].includes(j.state))) {
      const key = `${job.type}:${job.scopeId}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    for (const count of groups.values()) {
      if (count > 1) this.metrics.duplicateActiveJobs += 1;
      assert.ok(count <= 1, "duplicate active job detected");
    }
    for (const job of this.jobs) {
      if (job.state !== "RUNNING") assert.equal(job.progress === 40 && job.leaseExpiresAt != null, false, "false-running progress leaked");
      if (job.state === "RUNNING") assert.ok(job.leaseExpiresAt != null, "running job lacks lease");
    }
  }

  advance(minutes = 1) { this.now += minutes; }
}
