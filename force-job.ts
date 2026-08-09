import { TaskOrchestrator } from './src/services/task-orchestrator';

async function run() {
  const orch = new TaskOrchestrator(7);
  console.log("Running GENERATING_IMAGE_PROMPTS for Task 7...");
  const result = await orch.executeStep('GENERATING_IMAGE_PROMPTS');
  console.log("Result:", result);
}

run().catch(console.error);
