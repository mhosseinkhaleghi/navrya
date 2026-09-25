import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { listTeachJobs, getTeachJob, proposalSize, subscribeTeachJobs } from './analysisProfileTeachJobs.js';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// What the trader SEES of the teaching jobs in analysisProfileTeachJobs.js (ARCHITECTURE.md §7.25): the hooks that read them, the "the engine
// is learning" animation, and the header bar that follows the trader through every tab of the profile.
//
// The animation is an ACTIVITY signal, not a progress bar: the model call has no measurable progress, so nothing here counts up towards a
// made-up finish. It shows that a request is in flight (pulsing orb, sweeping line, bouncing dots) next to the one real number that exists -
// how long it has actually been running. The motion is CSS (teach-activity.css) and stops under prefers-reduced-motion.

// The jobs of one profile, re-read whenever any of them changes.
export function useTeachJobs(profileId) {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => subscribeTeachJobs((job) => { if (!job || job.profileId === profileId) bump(); }), [profileId]);
  return listTeachJobs(profileId);
}
export function useTeachJob(profileId, key) {
  useTeachJobs(profileId);
  return getTeachJob(profileId, key);
}

// Whole seconds since `startedAt`, ticking once a second while `active`. This is a real clock - the only number a running request has.
export function useElapsedSeconds(startedAt, active) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// The pulsing orb - shared by the card / panel indicator and the bar row.
function LearningOrb() {
  return (
    <span className="nv-learn-orb" aria-hidden="true">
      <span className="nv-learn-ring"></span><span className="nv-learn-ring nv-learn-ring--late"></span><span className="nv-learn-core"></span>
    </span>
  );
}
// "0:42 elapsed" - a real clock, ticking only while the job runs.
function ElapsedText({ lang, job }) {
  const seconds = useElapsedSeconds(job.startedAt, job.phase === 'working');
  return <span className="navrya-tabular" data-learning-elapsed="true">{trt(lang, 'learnElapsed', { time: trDigits(lang, formatElapsed(seconds)) })}</span>;
}

// The animated "learning" indicator for a WORKING job: orb, sweeping line, the real elapsed time and what the trader is free to do meanwhile.
export function LearningActivity({ lang, job }) {
  return (
    <div className="nv-learn" role="status" aria-live="polite" data-learning="working">
      <LearningOrb />
      <span className="nv-learn-body">
        <span className="nv-learn-title">
          {trt(lang, 'learnWorkingTitle')}
          <span className="nv-learn-dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </span>
        <span className="nv-learn-line" aria-hidden="true"></span>
        <span className="nv-learn-meta">
          <ElapsedText lang={lang} job={job} />
          <span>{trt(lang, 'learnWorkingHint')}</span>
        </span>
      </span>
    </div>
  );
}

// One row of the bar. Working jobs animate; a finished one says what to do next, and Open takes the trader to the tab that holds the review.
function BarRow({ lang, job, onOpen }) {
  const title = String(job.title || '').slice(0, 60);
  if (job.phase === 'working') {
    return (
      <div className="nv-teachbar-row nv-teachbar-row--working" data-teach-job={job.key} data-teach-phase="working">
        <LearningOrb />
        <span className="nv-teachbar-text">{trt(lang, 'learnBarWorking', { title })}</span>
        <span className="nv-teachbar-elapsed"><ElapsedText lang={lang} job={job} /></span>
      </div>
    );
  }
  const ready = job.phase === 'review';
  return (
    <div className={'nv-teachbar-row nv-teachbar-row--' + (ready ? 'ready' : 'failed')} data-teach-job={job.key} data-teach-phase={job.phase}>
      <span className="nv-teachbar-icon" aria-hidden="true"><Icon name={ready ? 'check' : 'close'} size={15} /></span>
      <span className="nv-teachbar-text">
        {ready ? trt(lang, 'learnBarReady', { title, n: trDigits(lang, proposalSize(job)) }) : trt(lang, 'learnBarFailed', { title })}
      </span>
      <Button variant={ready ? 'primary' : 'ghost'} size="sm" onClick={() => onOpen(job)}>{trt(lang, ready ? 'learnReviewBtn' : 'learnBarOpen')}</Button>
    </div>
  );
}

// Shown above every tab of a profile, so a request the trader started (and then walked away from) is still visible - and its finished result
// is one click away - wherever they are in the profile. Renders nothing when there is nothing to say.
export function TeachActivityBar({ lang, profileId, onOpen }) {
  const jobs = useTeachJobs(profileId);
  if (!jobs.length) return null;
  const shown = jobs.slice(0, 3);
  return (
    <div className="nv-teachbar" data-teach-bar="true" role="region" aria-label={trt(lang, 'learnBarLabel')}>
      {shown.map((job) => <BarRow key={job.key} lang={lang} job={job} onOpen={onOpen} />)}
      {jobs.length > shown.length && <span className="nv-teachbar-more">{trt(lang, 'learnBarMore', { n: trDigits(lang, jobs.length - shown.length) })}</span>}
    </div>
  );
}
