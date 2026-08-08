import { NextResponse } from 'next/server';
import { startJobWorker } from '@/services/job-worker';

// This route is called to start the background job worker
// It's designed to be called once when the app starts
let initialized = false;

export async function GET() {
  if (!initialized) {
    startJobWorker();
    initialized = true;
    return NextResponse.json({ status: 'Worker started' });
  }
  return NextResponse.json({ status: 'Worker already running' });
}

export async function POST() {
  return GET();
}
