#!/usr/bin/env node

function describeHandle(handle) {
  const ctor = handle?.constructor?.name || typeof handle;
  const fd = typeof handle?.fd === "number" ? ` fd=${handle.fd}` : "";
  return `${ctor}${fd}`;
}

function isStdioHandle(handle) {
  if (!handle) return false;
  if (handle === process.stdin || handle === process.stdout || handle === process.stderr) return true;
  return typeof handle.fd === "number" && [0, 1, 2].includes(handle.fd);
}

function getActiveHandles() {
  const getter = process._getActiveHandles;
  if (typeof getter !== "function") return [];
  return getter.call(process).filter((handle) => !isStdioHandle(handle));
}

function getActiveRequests() {
  const getter = process._getActiveRequests;
  if (typeof getter !== "function") return [];
  return getter.call(process);
}

export function getNodeRuntimeActivitySnapshot() {
  const handles = getActiveHandles();
  const requests = getActiveRequests();
  return {
    activeHandles: handles.length,
    activeRequests: requests.length,
    handleSummary: handles.map(describeHandle),
    requestSummary: requests.map((request) => request?.constructor?.name || typeof request)
  };
}

export function assertNodeRuntimeSettled(label, logger = console.log) {
  const snapshot = getNodeRuntimeActivitySnapshot();
  logger(
    `NODE_RUNTIME_SETTLED_CHECK label=${label} active_handles=${snapshot.activeHandles} active_requests=${snapshot.activeRequests}`
  );
  if (snapshot.activeHandles !== 0 || snapshot.activeRequests !== 0) {
    if (snapshot.handleSummary.length) {
      logger(`NODE_RUNTIME_SETTLED_HANDLES label=${label} handles=${snapshot.handleSummary.join(",")}`);
    }
    if (snapshot.requestSummary.length) {
      logger(`NODE_RUNTIME_SETTLED_REQUESTS label=${label} requests=${snapshot.requestSummary.join(",")}`);
    }
    throw new Error(`NODE_RUNTIME_NOT_SETTLED label=${label} handles=${snapshot.activeHandles} requests=${snapshot.activeRequests}`);
  }
}
