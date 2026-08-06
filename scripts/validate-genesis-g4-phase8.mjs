import fs from 'node:fs';
const must = (file, terms) => { const text=fs.readFileSync(file,'utf8'); for (const term of terms) if (!text.includes(term)) throw new Error(`${file} missing ${term}`); };
must('supabase/migrations/0041_genesis_g4_phase8_learning_versioning.sql',['engagement_learning_records','engagement_model_versions','run_engagement_learning_builder','EngagementLearningRecorded','engagement_learning_metrics','LEARNING_SNAPSHOT_CREATED']);
must('lib/pipeline/scheduler.ts',['buildEngagementLearning','engagementLearning']);
must('lib/learning/repository.ts',['run_engagement_learning_builder','getEngagementLearningRecord']);
console.log('Genesis G4 Phase 8 passed');
