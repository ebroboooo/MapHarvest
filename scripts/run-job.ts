/**
 * Optional standalone worker:
 *   npx tsx scripts/run-job.ts <jobId>
 * Prefer the in-app API which already runs harvestMaps.
 */
import { getJob } from "../src/lib/jobs";

const id = process.argv[2];
if (!id) {
  console.error("Usage: tsx scripts/run-job.ts <jobId>");
  process.exit(1);
}
const job = getJob(id);
console.log(job ? `${job.status} ${job.leads.length}/${job.maxResults}` : "missing");
