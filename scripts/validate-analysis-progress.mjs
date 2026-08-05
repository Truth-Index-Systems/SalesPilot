import fs from 'node:fs';

const wizard = fs.readFileSync('components/campaign-wizard.tsx', 'utf8');
const css = fs.readFileSync('app/globals.css', 'utf8');

const requiredWizard = [
  'ANALYSIS_STAGES',
  'Understanding your business',
  'Reading your website',
  'Finding your ideal buyers',
  'Building your Business DNA',
  'Designing outbound sales campaigns',
  'Preparing recommendations',
  'analysis-progress',
  'analysisComplete',
  'SalesPilot only analyses information that is publicly available on your website.',
];

for (const token of requiredWizard) {
  if (!wizard.includes(token)) throw new Error(`Missing analysis progress token: ${token}`);
}

for (const token of ['.analysis-track', '.analysis-stage.active', '@keyframes analysis-pulse', 'prefers-reduced-motion']) {
  if (!css.includes(token)) throw new Error(`Missing analysis progress CSS: ${token}`);
}

console.log('Live business-analysis progress validation passed');
