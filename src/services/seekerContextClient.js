// B04 S3c2c: same-origin bearer-bound read-only seeker certification.
// Do not inherit x-tenant-id, dev-bypass headers or cookies. This endpoint
// alone cannot grant a membership or enable public registration.

export const fetchVerifiedSeekerBrowserContext = async ({
  expectedAuthId,
  fetchImpl = globalThis.fetch,
  getSession = null
} = {}) => {
  const denied = { verified: false, eligible: false };
  if (typeof expectedAuthId !== 'string' || !expectedAuthId.trim() ||
      typeof fetchImpl !== 'function' || typeof getSession !== 'function') {
    return denied;
  }

  try {
    const { data, error } = await getSession();
    const session = data?.session;
    if (error || !session?.access_token ||
        String(session.user?.id || '').toLowerCase() !== expectedAuthId.toLowerCase()) {
      return denied;
    }

    const response = await fetchImpl('/api/platform/auth/seeker-context', {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error'
    });
    if (!response?.ok) return denied;
    const context = (await response.json())?.data;
    // Fail closed: unknown, stale or malformed server projections cannot be
    // promoted into a client-visible seeker landing decision.
    if (context?.verified !== true || context?.eligible !== true ||
        context?.userType !== 'seeker' || context?.tenantId !== null) {
      return denied;
    }

    // A concurrent logout/sign-in must invalidate the in-flight response.
    const again = await getSession();
    if (again?.error || !again?.data?.session?.access_token ||
        again.data.session.access_token !== session.access_token ||
        String(again.data.session.user?.id || '').toLowerCase() !== expectedAuthId.toLowerCase()) {
      return denied;
    }
    return { verified: true, eligible: true };
  } catch {
    // This may be a 404 disabled API, 401, missing DB or a network error.
    return denied;
  }
};
